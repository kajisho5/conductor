import CoreAudioKit
import ExpoModulesCore
import UIKit

/// Expo Modules API（conductor SPEC 8.5。kajisho5/crosspoint の crosspoint-midi を元にした）。JS 側は modules/conductor-midi/src/index.ts。
public class ConductorMidiModule: Module {
  private let engine = MidiEngine()
  private var pickerPromise: Promise?

  public func definition() -> ModuleDefinition {
    Name("ConductorMidi")

    Events("onSysEx", "onEndpointsChanged", "onLinkLost", "onLog")

    OnCreate {
      self.engine.onSysEx = { [weak self] bytes in
        self?.sendEvent("onSysEx", ["bytes": bytes.map { Int($0) }, "ts": Date().timeIntervalSince1970 * 1000])
      }
      self.engine.onEndpointsChanged = { [weak self] in
        guard let self = self else { return }
        self.sendEvent("onEndpointsChanged", ["endpoints": self.engine.listEndpoints().map(Self.toDict)])
      }
      self.engine.onLinkLost = { [weak self] id in
        self?.sendEvent("onLinkLost", ["uniqueId": Int(id)])
      }
      self.engine.onLog = { [weak self] level, msg in
        self?.sendEvent("onLog", ["level": level, "msg": msg])
      }
    }

    OnDestroy {
      self.engine.stop()
    }

    AsyncFunction("listEndpoints") { () throws -> [[String: Any]] in
      try self.engine.start()
      return self.engine.listEndpoints().map(Self.toDict)
    }

    AsyncFunction("open") { (destUniqueId: Int, srcUniqueId: Int) throws in
      try self.engine.start()
      do {
        try self.engine.open(destUniqueId: Int32(destUniqueId), srcUniqueId: Int32(srcUniqueId))
      } catch {
        throw MidiOpenException(error.localizedDescription)
      }
    }

    AsyncFunction("close") {
      self.engine.close()
    }

    AsyncFunction("sendSysEx") { (bytes: [Int], promise: Promise) in
      let u8 = bytes.map { UInt8(truncatingIfNeeded: $0) }
      self.engine.sendSysEx(u8) { error in
        if let error = error {
          promise.reject(MidiSendException(error.localizedDescription))
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("presentBluetoothPicker") { (promise: Promise) in
      guard let top = Self.topViewController() else {
        promise.reject(MidiPickerException("no view controller to present from"))
        return
      }
      let picker = CABTMIDICentralViewController()
      let nav = UINavigationController(rootViewController: picker)
      nav.modalPresentationStyle = .formSheet
      let done = UIBarButtonItem(barButtonSystemItem: .done, target: self.doneTarget, action: #selector(PickerDoneTarget.tap))
      picker.navigationItem.rightBarButtonItem = done
      picker.navigationItem.title = "Bluetooth MIDI"
      self.pickerPromise = promise
      nav.presentationController?.delegate = self.dismissWatcher
      top.present(nav, animated: true)
    }.runOnQueue(.main)
  }

  private lazy var dismissWatcher = DismissWatcher { [weak self] in self?.settlePicker() }
  private lazy var doneTarget = PickerDoneTarget { [weak self] in
    Self.topViewController()?.dismiss(animated: true) { self?.settlePicker() }
  }

  private func settlePicker() {
    pickerPromise?.resolve(nil)
    pickerPromise = nil
    sendEvent("onEndpointsChanged", ["endpoints": engine.listEndpoints().map(Self.toDict)])
  }

  private static func toDict(_ e: MidiEngine.EndpointInfo) -> [String: Any] {
    return [
      "uniqueId": Int(e.uniqueId),
      "sourceUniqueId": Int(e.sourceUniqueId),
      "name": e.name,
      "deviceName": e.deviceName,
      "transport": e.transport,
      "online": e.online,
      "driverOwner": e.driverOwner,
    ]
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }
}

/// 「完了」ボタンのターゲット（Module は NSObject ではないため別クラス）
final class PickerDoneTarget: NSObject {
  private let action: () -> Void
  init(action: @escaping () -> Void) {
    self.action = action
  }
  @objc func tap() {
    action()
  }
}

/// スワイプで閉じられたときも Promise を解決する
final class DismissWatcher: NSObject, UIAdaptivePresentationControllerDelegate {
  private let onDismiss: () -> Void
  init(onDismiss: @escaping () -> Void) {
    self.onDismiss = onDismiss
  }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    onDismiss()
  }
}

final class MidiOpenException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "MIDI_OPEN_FAILED: \(param)" }
}

final class MidiSendException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "MIDI_SEND_FAILED: \(param)" }
}

final class MidiPickerException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "MIDI_PICKER_FAILED: \(param)" }
}
