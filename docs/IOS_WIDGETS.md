# Lifeaholic iOS 17 widgets

Lifeaholic ships seven WidgetKit configurations from one extension target:

1. D-Day — Small
2. Tasks — Medium and Large, interactive completion
3. Eisenhower Matrix — Large and iPad Extra Large, interactive completion
4. What’s Next — Small and Medium
5. Add Expense — Small and Medium
6. Focus Controller — Large, interactive start/pause/break
7. Focus Analytics — Small and Medium

## Native setup

- Main bundle identifier: `com.example.lifeaholic`
- Extension bundle identifier: `com.example.lifeaholic.widgets`
- URL scheme: `lifeaholic`
- App Group on both targets: `group.com.example.lifeaholic`
- Extension deployment target: iOS 17.0
- Push notifications: disabled; neither target contains `aps-environment`

The persistent Expo config is in `plugins/withPersonalTeamWidgetEntitlements.js`. It runs after `expo-widgets`, removes the SDK 57 push-entitlement regression, copies the production Swift sources into the generated extension, and pins the extension deployment target to iOS 17.

Regenerate and install pods with:

```sh
npx expo prebuild --platform ios
cd ios
pod install
```

Always open `ios/Lifeaholic.xcworkspace`, not the `.xcodeproj`.

In Xcode, select Signing & Capabilities for both `Lifeaholic` and `ExpoWidgetsTarget`. Both must use the same Apple team and both must contain the App Groups capability with `group.com.example.lifeaholic`. Do not add Push Notifications.

App Groups are an Apple-controlled capability. A free Personal Team cannot sign a production-style App Group widget on a physical device. Use the simulator for free development or a paid Apple Developer Program team for installation on an iPhone.

## Shared data and interaction contract

`widgets/LifeaholicSharedData.tsx` creates a storage-only Expo widget object named `LifeaholicSharedData`. Its timeline is stored by Expo in App Group `UserDefaults`. It is deliberately not included in the visible WidgetBundle.

`native-widgets/LifeaholicWidgets.swift` reads and validates that versioned property-list snapshot defensively. Missing, stale, or malformed data produces safe empty states instead of a force unwrap or crash. Collections and action queues are bounded to keep memory use predictable.

Interactive App Intents update the snapshot first, reload WidgetKit timelines, and append a durable action:

- `completeTask` removes the task immediately and is reconciled to Supabase.
- `saveFocusSession` is generated when focus is paused or changed to a break.

`src/components/widgets/WidgetSyncProvider.tsx` reconciles those actions when the app is active. Authentication tokens remain in the main app; they are never copied into App Group storage. Failed offline actions remain queued and retry on the next foreground/network opportunity.

## Deep links

- `lifeaholic://home`
- `lifeaholic://calendar`
- `lifeaholic://matrix?taskId=<id>`
- `lifeaholic://finance/add-expense`
- `lifeaholic://focus`
- `lifeaholic://focus/analytics`

`src/components/navigation/DeepLinkRouter.tsx` maps these URLs to Expo Router routes. The finance link opens the Add Expense modal immediately. The matrix link opens the selected task’s quadrant so the task is ready for app-native drag and drop.

## Validation

```sh
npm run typecheck
npm run lint
xcodebuild -workspace ios/Lifeaholic.xcworkspace \
  -scheme Lifeaholic \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

Use the workspace and the main app scheme for command-line validation. Building the
widget directly from `Lifeaholic.xcodeproj` bypasses CocoaPods and produces misleading
`Expo.modulemap`, `ExpoUI.modulemap`, or `ExpoWidgets.modulemap` errors.
