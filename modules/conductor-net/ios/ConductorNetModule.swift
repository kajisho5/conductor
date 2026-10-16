import ExpoModulesCore
import Foundation
import Network

/// TCP / UDP（SPEC 7 章）。Network.framework の NWConnection を接続 ID ごとに 1 本持つ。
/// JS 側は modules/conductor-net/src/index.ts。送信の完了（TCP は書き込み完了、UDP は送信完了）で Promise を解決する。
public class ConductorNetModule: Module {
  private let queue = DispatchQueue(label: "conductor.net")
  private let lock = NSLock()
  private var connections: [String: NWConnection] = [:]

  public func definition() -> ModuleDefinition {
    Name("ConductorNet")

    Events("onState", "onData")

    OnDestroy {
      self.closeAll()
    }

    AsyncFunction("open") { (id: String, proto: String, host: String, port: Int, localPort: Int) in
      try self.open(id: id, proto: proto, host: host, port: port, localPort: localPort)
    }

    AsyncFunction("send") { (id: String, base64: String, promise: Promise) in
      guard let data = Data(base64Encoded: base64) else {
        promise.reject(NetSendException("送る内容が正しくありません"))
        return
      }
      guard let conn = self.connection(id) else {
        promise.reject(NetSendException("接続していません"))
        return
      }
      conn.send(content: data, completion: .contentProcessed { error in
        if let error = error {
          promise.reject(NetSendException(error.localizedDescription))
        } else {
          promise.resolve(nil)
        }
      })
    }

    AsyncFunction("close") { (id: String) in
      self.close(id)
    }

    AsyncFunction("closeAll") {
      self.closeAll()
    }
  }

  // MARK: - 接続

  private func open(id: String, proto: String, host: String, port: Int, localPort: Int) throws {
    close(id)
    guard port > 0, port <= 65535, let remotePort = NWEndpoint.Port(rawValue: UInt16(port)) else {
      throw NetOpenException("ポート番号が正しくありません（1〜65535）")
    }
    let trimmed = host.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else {
      throw NetOpenException("IP アドレスが空です")
    }
    let params: NWParameters
    if proto == "udp" {
      params = NWParameters.udp
    } else {
      let tcp = NWProtocolTCP.Options()
      tcp.noDelay = true
      tcp.connectionTimeout = 5
      tcp.enableKeepalive = true
      tcp.keepaliveIdle = 10
      params = NWParameters(tls: nil, tcp: tcp)
    }
    if localPort > 0, localPort <= 65535, let lp = NWEndpoint.Port(rawValue: UInt16(localPort)) {
      params.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.any), port: lp)
      params.allowLocalEndpointReuse = true
    }
    let conn = NWConnection(host: NWEndpoint.Host(trimmed), port: remotePort, using: params)
    conn.stateUpdateHandler = { [weak self] state in
      self?.handleState(id: id, conn: conn, state: state)
    }
    setConnection(id, conn)
    conn.start(queue: queue)
    if proto == "udp" {
      receiveMessage(id: id, conn: conn)
    } else {
      receiveStream(id: id, conn: conn)
    }
  }

  private func handleState(id: String, conn: NWConnection, state: NWConnection.State) {
    guard connection(id) === conn else { return }
    switch state {
    case .setup, .preparing:
      sendEvent("onState", ["id": id, "state": "connecting"])
    case .ready:
      sendEvent("onState", ["id": id, "state": "ready"])
    case .waiting(let error):
      sendEvent("onState", ["id": id, "state": "waiting", "error": error.localizedDescription])
    case .failed(let error):
      sendEvent("onState", ["id": id, "state": "failed", "error": error.localizedDescription])
      removeConnection(id, conn)
      conn.cancel()
    case .cancelled:
      sendEvent("onState", ["id": id, "state": "closed"])
    @unknown default:
      break
    }
  }

  private func receiveStream(id: String, conn: NWConnection) {
    conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
      guard let self = self else { return }
      if let data = data, !data.isEmpty {
        self.sendEvent("onData", ["id": id, "base64": data.base64EncodedString()])
      }
      if isComplete {
        // 相手が閉じた
        if self.connection(id) === conn {
          self.removeConnection(id, conn)
          self.sendEvent("onState", ["id": id, "state": "closed"])
          conn.cancel()
        }
        return
      }
      if error == nil, self.connection(id) === conn {
        self.receiveStream(id: id, conn: conn)
      }
    }
  }

  private func receiveMessage(id: String, conn: NWConnection) {
    conn.receiveMessage { [weak self] data, _, _, error in
      guard let self = self else { return }
      if let data = data, !data.isEmpty {
        self.sendEvent("onData", ["id": id, "base64": data.base64EncodedString()])
      }
      if error == nil, self.connection(id) === conn {
        self.receiveMessage(id: id, conn: conn)
      }
    }
  }

  private func close(_ id: String) {
    lock.lock()
    let conn = connections.removeValue(forKey: id)
    lock.unlock()
    conn?.cancel()
  }

  private func closeAll() {
    lock.lock()
    let all = Array(connections.values)
    connections.removeAll()
    lock.unlock()
    all.forEach { $0.cancel() }
  }

  // MARK: - 接続の表（複数のキューから触るのでロックする）

  private func connection(_ id: String) -> NWConnection? {
    lock.lock()
    defer { lock.unlock() }
    return connections[id]
  }

  private func setConnection(_ id: String, _ conn: NWConnection) {
    lock.lock()
    connections[id] = conn
    lock.unlock()
  }

  private func removeConnection(_ id: String, _ conn: NWConnection) {
    lock.lock()
    if connections[id] === conn {
      connections.removeValue(forKey: id)
    }
    lock.unlock()
  }
}

final class NetOpenException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "NET_OPEN_FAILED: \(param)" }
}

final class NetSendException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "NET_SEND_FAILED: \(param)" }
}
