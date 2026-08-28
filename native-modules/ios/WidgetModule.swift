import Foundation
import React
import WidgetKit

@objc(WidgetModule)
final class WidgetModule: NSObject {
  private static let snapshotName = "LifeaholicSharedData"
  private static let timelineKey = "__expo_widgets_\(snapshotName)_timeline"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  /// Re-signers can replace the App Group in the provisioning profile without
  /// updating Info.plist. Prefer the entitlement that iOS actually provisioned
  /// and retain the configured identifier for App Store/Xcode builds.
  private func resolvedAppGroup() -> String? {
    let provisionedGroups = provisioningProfileEntitlements()["com.apple.security.application-groups"] as? [String] ?? []
    let configuredGroup = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String
    let candidates = provisionedGroups + [configuredGroup].compactMap { $0 }

    return candidates.first(where: {
      !$0.contains("*") && FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil
    })
  }

  private func provisioningProfileEntitlements() -> [String: Any] {
    guard
      let profileURL = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let profileData = try? Data(contentsOf: profileURL),
      let plistStart = profileData.range(of: Data("<plist".utf8)),
      let plistEnd = profileData.range(of: Data("</plist>".utf8), options: [], in: plistStart.lowerBound..<profileData.endIndex)
    else { return [:] }

    let plistData = profileData[plistStart.lowerBound..<plistEnd.upperBound]
    guard
      let profile = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any],
      let entitlements = profile["Entitlements"] as? [String: Any]
    else { return [:] }
    return entitlements
  }

  @objc(readWidgetSnapshot:rejecter:)
  func readWidgetSnapshot(
    resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let appGroup = resolvedAppGroup(),
      let defaults = UserDefaults(suiteName: appGroup)
    else {
      reject("widget_app_group_unavailable", "The signed app has no usable App Group entitlement.", nil)
      return
    }

    let timeline = defaults.array(forKey: Self.timelineKey) as? [[String: Any]]
    resolve(timeline?.last?["props"])
  }

  @objc(updateWidgetSnapshot:resolver:rejecter:)
  func updateWidgetSnapshot(
    _ snapshot: [String: Any],
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      JSONSerialization.isValidJSONObject(snapshot),
      let appGroup = resolvedAppGroup(),
      let defaults = UserDefaults(suiteName: appGroup)
    else {
      reject("widget_app_group_unavailable", "The signed app has no usable App Group entitlement.", nil)
      return
    }

    let timestamp = Int(Date().timeIntervalSince1970 * 1000)
    defaults.set([["timestamp": timestamp, "props": snapshot]], forKey: Self.timelineKey)
    DispatchQueue.main.async {
      WidgetCenter.shared.reloadAllTimelines()
    }
    resolve(nil)
  }

  @objc(reloadAllWidgets)
  func reloadAllWidgets() {
    // React Native may invoke bridge methods off the main queue. WidgetKit's
    // reload is cheap, but dispatching here keeps the native boundary safe.
    DispatchQueue.main.async {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
