# Sideloadly installation with widgets

Lifeaholic ships a WidgetKit extension at `PlugIns/ExpoWidgetsTarget.appex`.
The app and extension exchange widget snapshots through one App Group. Both
parts must remain in the IPA and must be provisioned with the same App Group.

Despite its generated target name, `ExpoWidgetsTarget` is a self-contained
native Swift extension. It deliberately has no React, Expo, Hermes, or
CocoaPods runtime dependencies. The project config plugin reapplies this setup
after `expo prebuild`, including optimized Release settings, so Sideloadly has
only one extension executable to re-sign.

## Required Sideloadly settings

1. Copy `ios/build/Lifeaholic-sideloadly.ipa` to the Windows computer. This
   artifact has temporary ad-hoc signatures containing the requested App Group
   on both bundles; Sideloadly will replace the signatures during installation.
2. Use the current Sideloadly release and select **Apple ID Sideload**.
3. Open **Advanced options**.
4. Leave **Remove App Extensions (Plug-ins)** disabled. If Sideloadly shows an
   extension selection dialog, keep `ExpoWidgetsTarget.appex`.
5. Do not manually change only the main app's bundle ID. Let Sideloadly assign
   compatible identifiers to the app and its extension, or use provisioning
   profiles made for both `com.example.lifeaholic` and
   `com.example.lifeaholic.widgets`.
6. The profiles for both targets must contain the same
   `com.apple.security.application-groups` value. For the original IDs that is
   `group.com.example.lifeaholic`.
7. Install, launch Lifeaholic once so it writes its first snapshot, then add the
   widget from the Home Screen widget gallery. Reboot the phone if iOS cached a
   prior extension-less install.

Before installing this repaired build, remove the prior Lifeaholic installation
from the phone. iOS can retain widget-extension discovery state from an IPA that
was installed without a usable extension.

## Apple account limitation

If Sideloadly's log says that it removed the App Group entitlement, that signed
build cannot support data-backed or interactive widgets. App Groups are an iOS
security boundary; application code cannot recreate a container omitted by the
provisioning profile. Use an Apple Developer Program team with App Groups
enabled for both App IDs, or install a development build whose profiles retain
the group.

The runtime code reads the App Group granted by each embedded provisioning
profile. This supports re-signers that replace the original group with another
valid common group, but it intentionally cannot bypass a missing entitlement.
