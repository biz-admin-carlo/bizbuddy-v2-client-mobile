// Copyright 2018-present 650 Industries. All rights reserved.
// Patched for the iOS 27 scene lifecycle. The stock SDK 54 subscriber
// fatalErrors when the window is created in SceneDelegate instead of
// application(_:didFinishLaunchingWithOptions:).

import ExpoModulesCore

public class ExpoDevLauncherAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  private var didStartDevLauncher = false

  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    // iOS 27 builds the window in SceneDelegate, after this method returns.
    // SceneDelegate posts this once startReactNative has prepared the launcher.
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(devLauncherWindowReady(_:)),
      name: Notification.Name("BizBuddyDevLauncherWindowReady"),
      object: nil
    )
    startDevLauncher(in: UIApplication.shared.delegate?.window ?? UIApplication.shared.windows.filter { $0.isKeyWindow }.first)
    return false
  }

  @objc private func devLauncherWindowReady(_ notification: Notification) {
    let window = notification.object as? UIWindow
    startDevLauncher(in: window)
    NotificationCenter.default.removeObserver(self, name: Notification.Name("BizBuddyDevLauncherWindowReady"), object: nil)
  }

  private func startDevLauncher(in window: UIWindow?) {
    guard !didStartDevLauncher, let window else { return }
    didStartDevLauncher = true
    EXDevLauncherController.sharedInstance().autoSetupStart(window)
  }

  public func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return EXDevLauncherController.sharedInstance().onDeepLink(url, options: options)
  }
}
