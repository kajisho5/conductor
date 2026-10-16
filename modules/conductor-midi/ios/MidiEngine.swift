import CoreMIDI
import Foundation

/// CoreMIDI の薄いラッパー（crosspoint SPEC §7-2 と同じ）。
/// - クライアントは 1 つだけ作り、モジュール生存中保持する
/// - 入力は MIDI 1.0 プロトコルの UMP（SysEx7）を受けて再結合し、F0…F7 の完全メッセージで通知する
/// - 出力は UMP SysEx7 に分割して MIDISendEventList で送る。直前送信から 20ms 未満なら待つ
/// - 端点の追加・削除・offline 変化を監視して通知する
final class MidiEngine {
  struct EndpointInfo {
    let uniqueId: Int32
    let sourceUniqueId: Int32
    let name: String
    let deviceName: String
    let transport: String   // "usb" | "ble" | "network" | "other"
    let online: Bool
    let driverOwner: String
  }

  enum EngineError: Error, LocalizedError {
    case clientCreate(OSStatus)
    case portCreate(OSStatus)
    case endpointNotFound(Int32)
    case connect(OSStatus)
    case send(OSStatus)
    case notOpen
    case badSysEx

    var errorDescription: String? {
      switch self {
      case .clientCreate(let s): return "MIDIClientCreate failed (\(s))"
      case .portCreate(let s): return "MIDIPortCreate failed (\(s))"
      case .endpointNotFound(let id): return "endpoint \(id) not found"
      case .connect(let s): return "MIDIPortConnectSource failed (\(s))"
      case .send(let s): return "MIDISendEventList failed (\(s))"
      case .notOpen: return "not open"
      case .badSysEx: return "SysEx must start with F0 and end with F7"
      }
    }
  }

  var onSysEx: (([UInt8]) -> Void)?
  var onEndpointsChanged: (() -> Void)?
  var onLinkLost: ((Int32) -> Void)?
  var onLog: ((String, String) -> Void)?   // level, message

  static let minSendIntervalSec: TimeInterval = 0.020

  private var client = MIDIClientRef()
  private var inPort = MIDIPortRef()
  private var outPort = MIDIPortRef()
  private var openDest: MIDIEndpointRef = 0
  private var openSrc: MIDIEndpointRef = 0
  private var openDestId: Int32 = 0
  private var openSrcId: Int32 = 0
  private let sendQueue = DispatchQueue(label: "com.seventhwell.conductor.midi.send")
  private let parseQueue = DispatchQueue(label: "com.seventhwell.conductor.midi.parse")
  private var lastSendAt: TimeInterval = 0
  private var sysexBuffer: [UInt8]? = nil

  // MARK: - ライフサイクル

  func start() throws {
    if client != 0 { return }
    let status = MIDIClientCreateWithBlock("conductor" as CFString, &client) { [weak self] notificationPtr in
      self?.handleNotification(notificationPtr.pointee)
    }
    guard status == noErr else { throw EngineError.clientCreate(status) }

    let inStatus = MIDIInputPortCreateWithProtocol(client, "conductor In" as CFString, ._1_0, &inPort) { [weak self] eventListPtr, _ in
      self?.handleEventList(eventListPtr)
    }
    guard inStatus == noErr else { throw EngineError.portCreate(inStatus) }

    let outStatus = MIDIOutputPortCreate(client, "conductor Out" as CFString, &outPort)
    guard outStatus == noErr else { throw EngineError.portCreate(outStatus) }
    log("debug", "MIDI client ready")
  }

  func stop() {
    close()
    if inPort != 0 { MIDIPortDispose(inPort); inPort = 0 }
    if outPort != 0 { MIDIPortDispose(outPort); outPort = 0 }
    if client != 0 { MIDIClientDispose(client); client = 0 }
  }

  // MARK: - 端点列挙

  func listEndpoints() -> [EndpointInfo] {
    var sourcesByEntity: [MIDIEntityRef: [MIDIEndpointRef]] = [:]
    var looseSources: [MIDIEndpointRef] = []
    for i in 0..<MIDIGetNumberOfSources() {
      let src = MIDIGetSource(i)
      var entity = MIDIEntityRef()
      if MIDIEndpointGetEntity(src, &entity) == noErr, entity != 0 {
        sourcesByEntity[entity, default: []].append(src)
      } else {
        looseSources.append(src)
      }
    }

    var out: [EndpointInfo] = []
    for i in 0..<MIDIGetNumberOfDestinations() {
      let dest = MIDIGetDestination(i)
      var entity = MIDIEntityRef()
      var device = MIDIDeviceRef()
      let hasEntity = MIDIEndpointGetEntity(dest, &entity) == noErr && entity != 0
      if hasEntity { _ = MIDIEntityGetDevice(entity, &device) }

      let src: MIDIEndpointRef? = hasEntity ? sourcesByEntity[entity]?.first : looseSources.first { stringProp($0, kMIDIPropertyDisplayName) == stringProp(dest, kMIDIPropertyDisplayName) }
      let name = stringProp(dest, kMIDIPropertyDisplayName) ?? stringProp(dest, kMIDIPropertyName) ?? "MIDI \(i)"
      let deviceName = (device != 0 ? stringProp(device, kMIDIPropertyName) : nil) ?? (hasEntity ? stringProp(entity, kMIDIPropertyName) : nil) ?? name
      let driver = stringProp(dest, kMIDIPropertyDriverOwner)
        ?? (hasEntity ? stringProp(entity, kMIDIPropertyDriverOwner) : nil)
        ?? (device != 0 ? stringProp(device, kMIDIPropertyDriverOwner) : nil)
        ?? ""
      let offline = intProp(dest, kMIDIPropertyOffline) ?? 0
      out.append(EndpointInfo(
        uniqueId: intProp(dest, kMIDIPropertyUniqueID) ?? 0,
        sourceUniqueId: src.flatMap { intProp($0, kMIDIPropertyUniqueID) } ?? 0,
        name: name,
        deviceName: deviceName,
        transport: MidiEngine.classify(driverOwner: driver, name: name, deviceName: deviceName),
        online: offline == 0,
        driverOwner: driver
      ))
    }
    return out
  }

  /// driverOwner の文字列から経路を推定する（【推測】。判別不能なら other。生の値は driverOwner に残す）
  static func classify(driverOwner: String, name: String, deviceName: String) -> String {
    let d = driverOwner.lowercased()
    if d.contains("usb") { return "usb" }
    if d.contains("ble") || d.contains("bluetooth") { return "ble" }
    if d.contains("rtp") || d.contains("network") { return "network" }
    let n = (name + " " + deviceName).lowercased()
    if n.contains("bluetooth") { return "ble" }
    return "other"
  }

  // MARK: - 開閉

  func open(destUniqueId: Int32, srcUniqueId: Int32) throws {
    close()
    var destObj = MIDIObjectRef()
    var destType = MIDIObjectType.other
    guard MIDIObjectFindByUniqueID(destUniqueId, &destObj, &destType) == noErr, destType == .destination else {
      throw EngineError.endpointNotFound(destUniqueId)
    }
    var srcObj = MIDIObjectRef()
    var srcType = MIDIObjectType.other
    if srcUniqueId != 0 {
      guard MIDIObjectFindByUniqueID(srcUniqueId, &srcObj, &srcType) == noErr, srcType == .source else {
        throw EngineError.endpointNotFound(srcUniqueId)
      }
      let st = MIDIPortConnectSource(inPort, MIDIEndpointRef(srcObj), nil)
      guard st == noErr else { throw EngineError.connect(st) }
      openSrc = MIDIEndpointRef(srcObj)
      openSrcId = srcUniqueId
    }
    openDest = MIDIEndpointRef(destObj)
    openDestId = destUniqueId
    sysexBuffer = nil
    parseQueue.async { [weak self] in self?.rxDiagRemaining = 20 }
    log("debug", "opened dest=\(destUniqueId) src=\(srcUniqueId)")
  }

  func close() {
    if openSrc != 0 {
      MIDIPortDisconnectSource(inPort, openSrc)
      openSrc = 0
      openSrcId = 0
    }
    openDest = 0
    openDestId = 0
    sysexBuffer = nil
  }

  var isOpen: Bool { openDest != 0 }

  // MARK: - 送信（UMP SysEx7）

  func sendSysEx(_ bytes: [UInt8], completion: @escaping (Error?) -> Void) {
    guard bytes.count >= 2, bytes.first == 0xF0, bytes.last == 0xF7 else { return completion(EngineError.badSysEx) }
    let dest = openDest
    guard dest != 0 else { return completion(EngineError.notOpen) }
    let words = MidiEngine.sysexToUmp(Array(bytes[1..<(bytes.count - 1)]))
    sendQueue.async { [weak self] in
      guard let self = self else { return }
      let now = Date().timeIntervalSince1970
      let wait = self.lastSendAt + MidiEngine.minSendIntervalSec - now
      if wait > 0 { Thread.sleep(forTimeInterval: wait) }
      let status = self.sendWords(words, to: dest)
      self.lastSendAt = Date().timeIntervalSince1970
      completion(status == noErr ? nil : EngineError.send(status))
    }
  }

  private func sendWords(_ words: [UInt32], to dest: MIDIEndpointRef) -> OSStatus {
    // UMP SysEx7 は 2 ワードで 1 メッセージ。MIDIEventListAdd は「1 回 = 1 メッセージ」なので 2 ワードずつ追加する
    // （複数メッセージを 1 回で渡すと先頭以外が捨てられることがある）。パケットヘッダ分も含めて余裕を持って確保する
    let messageCount = (words.count + 1) / 2
    let byteCount = MemoryLayout<MIDIEventList>.size + messageCount * (MemoryLayout<MIDIEventPacket>.size + 16)
    let raw = UnsafeMutableRawPointer.allocate(byteCount: byteCount, alignment: MemoryLayout<MIDIEventList>.alignment)
    defer { raw.deallocate() }
    let listPtr = raw.bindMemory(to: MIDIEventList.self, capacity: 1)
    var packet: UnsafeMutablePointer<MIDIEventPacket>? = MIDIEventListInit(listPtr, ._1_0)
    var index = 0
    while index < words.count {
      let message = Array(words[index..<min(index + 2, words.count)])
      guard let current = packet else { return OSStatus(-1) }
      packet = message.withUnsafeBufferPointer { buf in
        MIDIEventListAdd(listPtr, byteCount, current, 0, buf.count, buf.baseAddress!)
      }
      if packet == nil {
        log("error", "MIDIEventListAdd overflow at word \(index)/\(words.count)")
        return OSStatus(-1)
      }
      index += message.count
    }
    return MIDISendEventList(outPort, dest, listPtr)
  }

  /// F0/F7 を除いたペイロード → UMP SysEx7（group 0）。crosspoint の core/codec/ump.ts と同じ規則
  static func sysexToUmp(_ payload: [UInt8]) -> [UInt32] {
    var out: [UInt32] = []
    let chunks = max(1, (payload.count + 5) / 6)
    for c in 0..<chunks {
      let start = c * 6
      let end = min(start + 6, payload.count)
      let chunk = start < payload.count ? Array(payload[start..<end]) : []
      let status: UInt32 = chunks == 1 ? 0 : (c == 0 ? 1 : (c == chunks - 1 ? 3 : 2))
      var b = chunk.map { UInt32($0 & 0x7F) }
      while b.count < 6 { b.append(0) }
      let word0: UInt32 = (0x3 << 28) | (status << 20) | (UInt32(chunk.count) << 16) | (b[0] << 8) | b[1]
      let word1: UInt32 = (b[2] << 24) | (b[3] << 16) | (b[4] << 8) | b[5]
      out.append(word0)
      out.append(word1)
    }
    return out
  }

  // MARK: - 受信（UMP → SysEx 再結合）

  /// 開いてから受信した UMP の先頭いくつかを診断ログに出す（実機確認：本体から何か届いているかの確認）
  private var rxDiagRemaining = 0

  private func handleEventList(_ listPtr: UnsafePointer<MIDIEventList>) {
    // CoreMIDI のリアルタイムスレッド。ワードをコピーしてから別キューで処理する
    var words: [UInt32] = []
    for packet in listPtr.unsafeSequence() {
      var p = packet.pointee
      let count = Int(p.wordCount)
      withUnsafePointer(to: &p.words) { ptr in
        ptr.withMemoryRebound(to: UInt32.self, capacity: count) { w in
          for i in 0..<count { words.append(w[i]) }
        }
      }
    }
    parseQueue.async { [weak self] in
      guard let self = self else { return }
      if self.rxDiagRemaining > 0, !words.isEmpty {
        self.rxDiagRemaining -= 1
        let hex = words.prefix(8).map { String(format: "%08X", $0) }.joined(separator: " ")
        self.log("debug", "rx UMP \(words.count) words: \(hex)\(words.count > 8 ? " …" : "")")
      }
      self.consume(words)
    }
  }

  /// UMP のメッセージタイプごとの語数（MIDI 2.0 仕様の表）
  private static func wordCount(forType t: UInt32) -> Int {
    switch t {
    case 0x0, 0x1, 0x2, 0x6, 0x7: return 1
    case 0x3, 0x4, 0x8, 0x9, 0xA: return 2
    case 0xB, 0xC: return 3
    case 0x5, 0xD, 0xE, 0xF: return 4
    default: return 1
    }
  }

  private func consume(_ words: [UInt32]) {
    var i = 0
    while i < words.count {
      let w0 = words[i]
      let type = (w0 >> 28) & 0xF
      let n = MidiEngine.wordCount(forType: type)
      if type == 0x3, i + 1 < words.count {
        let w1 = words[i + 1]
        let status = (w0 >> 20) & 0xF
        let count = Int(min(6, (w0 >> 16) & 0xF))
        let data: [UInt8] = [
          UInt8((w0 >> 8) & 0x7F), UInt8(w0 & 0x7F),
          UInt8((w1 >> 24) & 0x7F), UInt8((w1 >> 16) & 0x7F), UInt8((w1 >> 8) & 0x7F), UInt8(w1 & 0x7F),
        ]
        let chunk = Array(data.prefix(count))
        switch status {
        case 0:
          sysexBuffer = nil
          emit([0xF0] + chunk + [0xF7])
        case 1:
          sysexBuffer = chunk
        case 2:
          sysexBuffer?.append(contentsOf: chunk)
        case 3:
          if var buf = sysexBuffer {
            buf.append(contentsOf: chunk)
            sysexBuffer = nil
            emit([0xF0] + buf + [0xF7])
          }
        default:
          break
        }
      }
      i += n
    }
  }

  private func emit(_ sysex: [UInt8]) {
    onSysEx?(sysex)
  }

  // MARK: - 通知

  private func handleNotification(_ n: MIDINotification) {
    switch n.messageID {
    case .msgObjectAdded, .msgObjectRemoved, .msgSetupChanged:
      checkOpenEndpointStillPresent()
      onEndpointsChanged?()
    case .msgPropertyChanged:
      // offline の変化だけ拾う
      checkOpenEndpointStillPresent()
      onEndpointsChanged?()
    default:
      break
    }
  }

  private func checkOpenEndpointStillPresent() {
    guard openDestId != 0 else { return }
    var obj = MIDIObjectRef()
    var type = MIDIObjectType.other
    let found = MIDIObjectFindByUniqueID(openDestId, &obj, &type) == noErr && type == .destination
    let offline = found ? (intProp(MIDIEndpointRef(obj), kMIDIPropertyOffline) ?? 0) : 1
    if !found || offline != 0 {
      let id = openDestId
      log("warn", "open endpoint \(id) lost (found=\(found) offline=\(offline))")
      close()
      onLinkLost?(id)
    }
  }

  // MARK: - プロパティ

  private func stringProp(_ obj: MIDIObjectRef, _ key: CFString) -> String? {
    var value: Unmanaged<CFString>?
    guard MIDIObjectGetStringProperty(obj, key, &value) == noErr, let v = value?.takeRetainedValue() else { return nil }
    return v as String
  }

  private func intProp(_ obj: MIDIObjectRef, _ key: CFString) -> Int32? {
    var value: Int32 = 0
    guard MIDIObjectGetIntegerProperty(obj, key, &value) == noErr else { return nil }
    return value
  }

  private func log(_ level: String, _ msg: String) {
    onLog?(level, msg)
  }
}
