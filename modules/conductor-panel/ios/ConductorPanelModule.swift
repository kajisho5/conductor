import ExpoModulesCore
import Foundation
import ImageIO
// IOKit は Swift のモジュールとして iOS の SDK に無いので、PanelDriverShared.h（IOKitLib.h を含む）経由で使う
import UIKit

/// kIOReturnNotPermitted（iokit_common_err(0x2e2)）。C のマクロは Swift に入らないので値で持つ
let panelIOReturnNotPermitted = IOReturn(bitPattern: 0xE000_02E2)

/// Stream Deck（SPEC 2.5）。メーカーの DriverKit ドライバ（「StreamDeckDriver」という名前の IOService）に IOKit でつなぎ、
/// キーの絵を送り、キーの押下を受け取る。ドライバとのやりとりの形は PanelDriverShared.h（MIT の公開 OSS、streamdeck-kit-ipad より）。
/// 手順は公開 OSS の StreamDeckClient / InternalStreamDeckSession と同じ：
///   IOServiceOpen → getDriverVersion（major 1）→ getDeviceInfo / getDeviceCapabilities → subscribeToKeyActions（非同期）
///   キーの絵は capabilities の transform をかけて JPEG（または BMP）にし、先頭 1 バイトにキー番号を付けて setKeyImage
public class ConductorPanelModule: Module {
  private var notificationPort: IONotificationPortRef?
  private var matchIterator: io_iterator_t = 0
  private var removeIterator: io_iterator_t = 0
  private var panels: [io_service_t: PanelDevice] = [:]
  private var started = false

  public func definition() -> ModuleDefinition {
    Name("ConductorPanel")

    Events("onPanelsChanged", "onKey", "onPanelError")

    OnDestroy {
      DispatchQueue.main.async { self.stopAll() }
    }

    /// iPad かどうか（iPhone では設定に出さない）
    Function("isSupported") { () -> Bool in
      return UIDevice.current.userInterfaceIdiom == .pad
    }

    /// メーカーの接続アプリが入っているか（URL スキームで確かめる）
    AsyncFunction("isDriverAppInstalled") { () -> Bool in
      guard let url = URL(string: "elgato-device-driver://") else { return false }
      return UIApplication.shared.canOpenURL(url)
    }.runOnQueue(.main)

    AsyncFunction("start") {
      self.startMatching()
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      self.stopAll()
    }.runOnQueue(.main)

    AsyncFunction("listPanels") { () -> [[String: Any]] in
      return self.panels.values.map { $0.summary }
    }.runOnQueue(.main)

    AsyncFunction("setKeys") { (id: String, keys: [PanelKey]) in
      guard let panel = self.panels.values.first(where: { $0.id == id }) else { return }
      panel.setKeys(keys)
    }.runOnQueue(.main)

    AsyncFunction("setBrightness") { (id: String, percent: Int) in
      guard let panel = self.panels.values.first(where: { $0.id == id }) else { return }
      panel.setBrightness(percent)
    }.runOnQueue(.main)
  }

  // MARK: - 見つける・外れる

  private func startMatching() {
    guard !started else { return }
    started = true
    guard let port = IONotificationPortCreate(kIOMainPortDefault) else {
      sendEvent("onPanelError", ["kind": "driver", "message": "通知の口を作れません"])
      return
    }
    notificationPort = port
    let source = IONotificationPortGetRunLoopSource(port).takeUnretainedValue()
    CFRunLoopAddSource(RunLoop.main.getCFRunLoop(), source, .defaultMode)

    let me = Unmanaged.passUnretained(self).toOpaque()
    let matched: IOServiceMatchingCallback = { context, iterator in
      guard let context = context else { return }
      let module = Unmanaged<ConductorPanelModule>.fromOpaque(context).takeUnretainedValue()
      module.attach(iterator)
    }
    let removed: IOServiceMatchingCallback = { context, iterator in
      guard let context = context else { return }
      let module = Unmanaged<ConductorPanelModule>.fromOpaque(context).takeUnretainedValue()
      module.detach(iterator)
    }
    let matcher = IOServiceNameMatching("StreamDeckDriver") as NSDictionary
    IOServiceAddMatchingNotification(port, kIOFirstMatchNotification, matcher, matched, me, &matchIterator)
    attach(matchIterator)
    IOServiceAddMatchingNotification(port, kIOTerminatedNotification, matcher, removed, me, &removeIterator)
    detach(removeIterator)
  }

  private func attach(_ iterator: io_iterator_t) {
    var changed = false
    while case let service = IOIteratorNext(iterator), service != IO_OBJECT_NULL {
      let panel = PanelDevice(service: service)
      let ret = panel.open()
      if ret != kIOReturnSuccess {
        let kind = ret == panelIOReturnNotPermitted ? "entitlement" : "open"
        sendEvent("onPanelError", ["kind": kind, "message": String(format: "ボタン盤を開けません（0x%08X）", ret)])
        panel.close()
        continue
      }
      guard let version = panel.driverVersion() else {
        sendEvent("onPanelError", ["kind": "driver", "message": "ドライバの版を読めません"])
        panel.close()
        continue
      }
      if version.major != 1 {
        sendEvent("onPanelError", ["kind": "driver-version", "message": "ドライバの版（\(version.major).\(version.minor).\(version.patch)）に対応していません"])
        panel.close()
        continue
      }
      guard panel.readInfo() else {
        sendEvent("onPanelError", ["kind": "driver", "message": "ボタン盤の情報を読めません"])
        panel.close()
        continue
      }
      panel.onKey = { [weak self] index, pressed in
        self?.sendEvent("onKey", ["id": panel.id, "index": index, "pressed": pressed])
      }
      panel.onLost = { [weak self] in
        guard let self = self else { return }
        if self.panels.removeValue(forKey: service) != nil {
          panel.close()
          self.sendEvent("onPanelsChanged", ["panels": self.panels.values.map { $0.summary }])
        }
      }
      panel.subscribe()
      panels[service] = panel
      changed = true
    }
    if changed {
      sendEvent("onPanelsChanged", ["panels": panels.values.map { $0.summary }])
    }
  }

  private func detach(_ iterator: io_iterator_t) {
    var changed = false
    while case let service = IOIteratorNext(iterator), service != IO_OBJECT_NULL {
      if let panel = panels.removeValue(forKey: service) {
        panel.close()
        changed = true
      }
      IOObjectRelease(service)
    }
    if changed {
      sendEvent("onPanelsChanged", ["panels": panels.values.map { $0.summary }])
    }
  }

  private func stopAll() {
    for panel in panels.values { panel.close() }
    panels.removeAll()
    if matchIterator != 0 {
      IOObjectRelease(matchIterator)
      matchIterator = 0
    }
    if removeIterator != 0 {
      IOObjectRelease(removeIterator)
      removeIterator = 0
    }
    if let port = notificationPort {
      IONotificationPortDestroy(port)
      notificationPort = nil
    }
    started = false
  }
}

/// JS から渡す 1 キー分の表示
struct PanelKey: Record {
  @Field var index: Int = 0
  @Field var text: String = ""
  /// '#RRGGBB'
  @Field var textColor: String = "#FFFFFF"
  @Field var backgroundColor: String = "#000000"
  /// file:// の画像（無ければ空）
  @Field var imageUri: String = ""
  /// 'none' | 'pressing' | 'sent' | 'failed'
  @Field var state: String = "none"
  @Field var offline: Bool = false
  /// 0 なら大きさを自動で合わせる
  @Field var fontSize: Double = 0
  /// ボタンが無いマス
  @Field var empty: Bool = false
}

/// つないでいる 1 台
final class PanelDevice {
  private var service: io_service_t
  private var connection: io_connect_t = IO_OBJECT_NULL
  private var notificationPort: IONotificationPortRef?
  private let queue = DispatchQueue(label: "conductor.panel")
  private var lastKeyHash: [Int: Int] = [:]
  private var previousPress: UInt64 = 0
  private var retainedSelf: Unmanaged<PanelDevice>?

  var id = ""
  var product = ""
  var keyCount = 0
  var rows = 0
  var columns = 0
  var keySize = CGSize.zero
  var transform = CGAffineTransform.identity
  var imageFormat: UInt32 = 0
  var features: UInt64 = 0

  var onKey: ((Int, Bool) -> Void)?
  var onLost: (() -> Void)?

  init(service: io_service_t) {
    self.service = service
  }

  var summary: [String: Any] {
    return [
      "id": id,
      "product": product,
      "keyCount": keyCount,
      "rows": rows,
      "columns": columns,
      "keyWidth": Int(keySize.width),
      "keyHeight": Int(keySize.height),
    ]
  }

  func open() -> kern_return_t {
    return IOServiceOpen(service, mach_task_self_, 0, &connection)
  }

  func close() {
    onKey = nil
    onLost = nil
    if connection != IO_OBJECT_NULL {
      IOServiceClose(connection)
      IOObjectRelease(connection)
      connection = IO_OBJECT_NULL
    }
    if service != IO_OBJECT_NULL {
      IOObjectRelease(service)
      service = IO_OBJECT_NULL
    }
    if let port = notificationPort {
      IONotificationPortDestroy(port)
      notificationPort = nil
    }
    retainedSelf?.release()
    retainedSelf = nil
  }

  func driverVersion() -> (major: Int, minor: Int, patch: Int)? {
    var output = [UInt64](repeating: 0, count: 3)
    var count: UInt32 = 3
    let ret = output.withUnsafeMutableBufferPointer { ptr in
      IOConnectCallScalarMethod(connection, SDExternalMethod_getDriverVersion.rawValue, nil, 0, ptr.baseAddress, &count)
    }
    guard ret == kIOReturnSuccess, count >= 3 else { return nil }
    return (Int(output[0]), Int(output[1]), Int(output[2]))
  }

  private func getStruct<T>(_ method: SDExternalMethod, _ type: T.Type) -> T? {
    var size = MemoryLayout<T>.size
    let buffer = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: MemoryLayout<T>.alignment)
    defer { buffer.deallocate() }
    let ret = IOConnectCallStructMethod(connection, method.rawValue, nil, 0, buffer, &size)
    guard ret == kIOReturnSuccess else { return nil }
    return buffer.load(as: T.self)
  }

  private static func string<T>(_ value: T) -> String {
    var v = value
    return withUnsafeBytes(of: &v) { raw in
      let bytes = raw.prefix { $0 != 0 }
      return String(decoding: bytes, as: UTF8.self)
    }
  }

  func readInfo() -> Bool {
    guard let info = getStruct(SDExternalMethod_getDeviceInfo, SDDeviceInfo.self),
          let caps = getStruct(SDExternalMethod_getDeviceCapabilities, SDDeviceCapabilities.self)
    else { return false }
    let serial = PanelDevice.string(info.serialNumber)
    id = serial.isEmpty ? "panel-\(service)" : serial
    product = PanelDevice.string(info.product)
    keyCount = Int(caps.keyCount)
    rows = Int(caps.keyRows)
    columns = Int(caps.keyColumns)
    keySize = CGSize(width: Int(caps.keySize.width), height: Int(caps.keySize.height))
    let t = caps.imageTransform
    transform = CGAffineTransform(a: CGFloat(t.0), b: CGFloat(t.1), c: CGFloat(t.2), d: CGFloat(t.3), tx: CGFloat(t.4), ty: CGFloat(t.5))
    imageFormat = caps.imageFormat.rawValue
    features = caps.features
    return true
  }

  // MARK: - キーの押下

  func subscribe() {
    guard notificationPort == nil, let port = IONotificationPortCreate(kIOMainPortDefault) else { return }
    notificationPort = port
    let source = IONotificationPortGetRunLoopSource(port).takeUnretainedValue()
    CFRunLoopAddSource(RunLoop.main.getCFRunLoop(), source, .defaultMode)
    let machPort = IONotificationPortGetMachPort(port)

    let callback: IOAsyncCallback = { context, result, args, argsCount in
      guard let context = context else { return }
      let panel = Unmanaged<PanelDevice>.fromOpaque(context).takeUnretainedValue()
      guard result == kIOReturnSuccess else {
        // 外れた・ドライバが止まった。呼び出しの中で閉じないよう、次の回で片付ける
        DispatchQueue.main.async { panel.onLost?() }
        return
      }
      guard argsCount > 0, let args = args else { return }
      let event = UnsafeMutablePointer<SDInputEvent>(OpaquePointer(args)).pointee
      panel.handle(event)
    }
    let retained = Unmanaged.passRetained(self)
    retainedSelf = retained
    var asyncRef = [io_user_reference_t](repeating: 0, count: 8)
    asyncRef[Int(kIOAsyncCalloutFuncIndex)] = unsafeBitCast(callback, to: io_user_reference_t.self)
    asyncRef[Int(kIOAsyncCalloutRefconIndex)] = io_user_reference_t(UInt(bitPattern: retained.toOpaque()))
    let ret = IOConnectCallAsyncScalarMethod(
      connection,
      SDExternalMethod_subscribeToKeyActions.rawValue,
      machPort,
      &asyncRef,
      UInt32(kIOAsyncCalloutCount),
      nil, 0, nil, nil
    )
    if ret != kIOReturnSuccess {
      DispatchQueue.main.async { [weak self] in self?.onLost?() }
    }
  }

  private func handle(_ event: SDInputEvent) {
    guard UInt32(event.eventType) == SDInputEventType_KeyPress.rawValue else { return }
    let current = event.keys.press
    let previous = previousPress
    previousPress = current
    for key in 0 ..< Int(event.keys.keyCount) {
      let mask: UInt64 = 1 << UInt64(key)
      if previous & mask == 0, current & mask != 0 {
        onKey?(key, true)
      } else if previous & mask != 0, current & mask == 0 {
        onKey?(key, false)
      }
    }
  }

  // MARK: - 明るさ・キーの絵

  func setBrightness(_ percent: Int) {
    let value = UInt64(max(0, min(100, percent)))
    let conn = connection
    queue.async {
      var args = [value]
      _ = IOConnectCallScalarMethod(conn, SDExternalMethod_setBrightness.rawValue, &args, 1, nil, nil)
    }
  }

  func setKeys(_ keys: [PanelKey]) {
    guard keySize.width > 0, keySize.height > 0 else { return }
    for key in keys where key.index >= 0 && key.index < keyCount {
      var hasher = Hasher()
      hasher.combine(key.text)
      hasher.combine(key.textColor)
      hasher.combine(key.backgroundColor)
      hasher.combine(key.imageUri)
      hasher.combine(key.state)
      hasher.combine(key.offline)
      hasher.combine(key.fontSize)
      hasher.combine(key.empty)
      let h = hasher.finalize()
      if lastKeyHash[key.index] == h { continue }
      lastKeyHash[key.index] = h
      let image = KeyRenderer.render(key, size: keySize)
      guard let data = encode(image) else { continue }
      let conn = connection
      let index = key.index
      queue.async {
        var payload = Data([UInt8(index)])
        payload.append(data)
        _ = payload.withUnsafeBytes { raw in
          IOConnectCallStructMethod(conn, SDExternalMethod_setKeyImage.rawValue, raw.baseAddress, raw.count, nil, nil)
        }
      }
    }
  }

  /// 機器の向きに合わせて回す・反転し、JPEG / BMP にする（公開 OSS の transform と同じ手順）
  private func encode(_ image: UIImage) -> Data? {
    var outSize = CGRect(origin: .zero, size: keySize).applying(transform).size
    outSize.width = floor(abs(outSize.width))
    outSize.height = floor(abs(outSize.height))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: outSize, format: format)
    let size = keySize
    let t = transform
    let draw: UIGraphicsImageRenderer.DrawingActions = { ctx in
      ctx.cgContext.translateBy(x: outSize.width / 2, y: outSize.height / 2)
      ctx.cgContext.concatenate(t)
      ctx.cgContext.translateBy(x: -size.width / 2, y: -size.height / 2)
      UIColor.black.setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    if imageFormat == SDImageFormat_JPEG.rawValue {
      return renderer.jpegData(withCompressionQuality: 0.85, actions: draw)
    }
    if imageFormat == SDImageFormat_BMP.rawValue {
      let img = renderer.image(actions: draw)
      guard let cg = img.cgImage else { return nil }
      let data = NSMutableData()
      guard let dest = CGImageDestinationCreateWithData(data as CFMutableData, "com.microsoft.bmp" as CFString, 1, nil) else { return nil }
      CGImageDestinationAddImage(dest, cg, [kCGImagePropertyHasAlpha: false] as CFDictionary)
      CGImageDestinationFinalize(dest)
      return data as Data
    }
    return nil
  }
}

/// キー 1 つの絵（背景色・画像・文字・押下表現）。アプリの ButtonFace と同じ考え方
enum KeyRenderer {
  static func color(_ hex: String, fallback: UIColor) -> UIColor {
    var s = hex.trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return fallback }
    return UIColor(
      red: CGFloat((v >> 16) & 0xFF) / 255,
      green: CGFloat((v >> 8) & 0xFF) / 255,
      blue: CGFloat(v & 0xFF) / 255,
      alpha: 1
    )
  }

  static func render(_ key: PanelKey, size: CGSize) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
      let rect = CGRect(origin: .zero, size: size)
      UIColor.black.setFill()
      ctx.fill(rect)
      if key.empty { return }
      color(key.backgroundColor, fallback: .darkGray).setFill()
      ctx.fill(rect)
      if !key.imageUri.isEmpty, let url = URL(string: key.imageUri), let img = UIImage(contentsOfFile: url.path) {
        let scale = max(size.width / img.size.width, size.height / img.size.height)
        let w = img.size.width * scale
        let h = img.size.height * scale
        img.draw(in: CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h))
      }
      if !key.text.isEmpty {
        drawText(key, in: rect.insetBy(dx: size.width * 0.06, dy: size.height * 0.06))
      }
      if key.offline {
        UIColor(white: 0, alpha: 0.5).setFill()
        ctx.fill(rect)
      }
      let line = max(3, size.width * 0.05)
      switch key.state {
      case "pressing":
        UIColor(white: 1, alpha: 0.18).setFill()
        ctx.fill(rect)
        stroke(rect, color: .white, width: line)
      case "sent":
        stroke(rect, color: UIColor(white: 1, alpha: 0.7), width: line * 0.8)
      case "failed":
        stroke(rect, color: .systemOrange, width: line)
        let mark = "⚠" as NSString
        let attrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: size.height * 0.2, weight: .bold),
          .foregroundColor: UIColor.systemOrange,
        ]
        mark.draw(at: CGPoint(x: size.width * 0.72, y: size.height * 0.04), withAttributes: attrs)
      default:
        break
      }
    }
  }

  private static func stroke(_ rect: CGRect, color: UIColor, width: CGFloat) {
    let path = UIBezierPath(rect: rect.insetBy(dx: width / 2, dy: width / 2))
    path.lineWidth = width
    color.setStroke()
    path.stroke()
  }

  /// 文字を真ん中に。大きさ 0 は枠に収まる一番大きい文字（最大は高さの 30%）
  private static func drawText(_ key: PanelKey, in box: CGRect) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping
    let textColor = color(key.textColor, fallback: .white)
    var size = key.fontSize > 0 ? CGFloat(key.fontSize) : box.height * 0.3
    var attributed = NSAttributedString()
    var bounds = CGRect.zero
    while true {
      let attrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: size, weight: .bold),
        .foregroundColor: textColor,
        .paragraphStyle: paragraph,
        .shadow: {
          let s = NSShadow()
          s.shadowColor = UIColor(white: 0, alpha: 0.6)
          s.shadowBlurRadius = 2
          s.shadowOffset = CGSize(width: 0, height: 1)
          return s
        }(),
      ]
      attributed = NSAttributedString(string: key.text, attributes: attrs)
      bounds = attributed.boundingRect(
        with: CGSize(width: box.width, height: .greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        context: nil
      )
      if key.fontSize > 0 || (bounds.height <= box.height && bounds.width <= box.width) || size <= 8 { break }
      size -= 1
    }
    let y = box.minY + max(0, (box.height - bounds.height) / 2)
    attributed.draw(with: CGRect(x: box.minX, y: y, width: box.width, height: bounds.height), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
  }
}
