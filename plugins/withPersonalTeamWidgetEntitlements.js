const fs = require('fs');
const path = require('path');
const { withDangerousMod, withEntitlementsPlist, withXcodeProject } = require('expo/config-plugins');

const WIDGET_TARGET = 'ExpoWidgetsTarget';
const APP_NATIVE_MODULE_FILES = ['WidgetModule.swift', 'WidgetModule.m'];

/**
 * expo-widgets 57 currently writes aps-environment even when widget push
 * notifications are disabled. Lifeaholic uses local widget snapshots, so the
 * entitlement is unnecessary and prevents Personal Team development signing.
 */
module.exports = function withPersonalTeamWidgetEntitlements(config) {
  config = withEntitlementsPlist(config, (entitlementsConfig) => {
    delete entitlementsConfig.modResults['aps-environment'];
    return entitlementsConfig;
  });

  // expo-widgets owns creation of the extension target. This mod deliberately
  // runs after its generator and replaces only the generated widget sources.
  config = withDangerousMod(config, [
    'ios',
    (dangerousConfig) => {
      const sourceRoot = path.join(dangerousConfig.modRequest.projectRoot, 'native-widgets');
      const targetRoot = path.join(dangerousConfig.modRequest.platformProjectRoot, WIDGET_TARGET);
      const sourceFile = path.join(sourceRoot, 'LifeaholicWidgets.swift');
      const indexFile = path.join(sourceRoot, 'index.swift');
      if (!fs.existsSync(sourceFile) || !fs.existsSync(indexFile)) {
        throw new Error('Lifeaholic native widget sources are missing.');
      }
      fs.copyFileSync(sourceFile, path.join(targetRoot, 'LifeaholicTasksWidget.swift'));
      fs.copyFileSync(indexFile, path.join(targetRoot, 'index.swift'));
      const nativeModuleRoot = path.join(dangerousConfig.modRequest.projectRoot, 'native-modules', 'ios');
      const appSourceRoot = path.join(dangerousConfig.modRequest.platformProjectRoot, 'Lifeaholic');
      for (const fileName of APP_NATIVE_MODULE_FILES) {
        const nativeModuleFile = path.join(nativeModuleRoot, fileName);
        if (!fs.existsSync(nativeModuleFile)) {
          throw new Error(`Lifeaholic native module source is missing: ${fileName}`);
        }
        fs.copyFileSync(nativeModuleFile, path.join(appSourceRoot, fileName));
      }

      // expo-widgets generates a React/Expo/Hermes CocoaPods target even
      // though Lifeaholic's extension UI is fully native. Remove that target
      // so the resulting .appex has only Apple-system framework dependencies
      // and can be re-signed reliably by Sideloadly.
      const podfilePath = path.join(dangerousConfig.modRequest.platformProjectRoot, 'Podfile');
      const podfile = fs.readFileSync(podfilePath, 'utf8');
      const generatedTarget = podfile.indexOf(`target "${WIDGET_TARGET}" do`);
      if (generatedTarget >= 0) {
        fs.writeFileSync(
          podfilePath,
          `${podfile.slice(0, generatedTarget).trimEnd()}\n\n` +
            '# Lifeaholic widgets are a self-contained native WidgetKit extension.\n',
        );
      }
      return dangerousConfig;
    },
  ]);

  config = withXcodeProject(config, (projectConfig) => {
    const project = projectConfig.modResults;
    const appTargetId = project.getFirstTarget().uuid;
    const appGroupKey = project.findPBXGroupKey({ name: 'Lifeaholic' });
    if (!appGroupKey) throw new Error('Could not find the Lifeaholic Xcode source group.');
    for (const fileName of APP_NATIVE_MODULE_FILES) {
      const sourcePath = `Lifeaholic/${fileName}`;
      if (!project.hasFile(sourcePath)) {
        project.addSourceFile(sourcePath, { target: appTargetId }, appGroupKey);
      }
    }

    const target = project.pbxTargetByName(WIDGET_TARGET);
    if (!target) throw new Error(`Could not find ${WIDGET_TARGET} after expo-widgets generation.`);
    const developmentTeam = projectConfig.ios?.appleTeamId;
    if (!developmentTeam) {
      throw new Error('expo.ios.appleTeamId is required to sign the Lifeaholic widget extension.');
    }
    const widgetTargetEntry = Object.entries(project.pbxNativeTargetSection()).find(
      ([id, nativeTarget]) => !id.endsWith('_comment') && nativeTarget.name === WIDGET_TARGET,
    );
    if (!widgetTargetEntry) {
      throw new Error(`Could not resolve the Xcode target ID for ${WIDGET_TARGET}.`);
    }
    const [widgetTargetId] = widgetTargetEntry;
    const configList = project.pbxXCConfigurationList()[target.buildConfigurationList];
    const configurationIds = new Set((configList?.buildConfigurations ?? []).map((item) => item.value));
    for (const [id, buildConfig] of Object.entries(project.pbxXCBuildConfigurationSection())) {
      if (!id.endsWith('_comment') && configurationIds.has(id)) {
        buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '17.0';
        buildConfig.buildSettings.DEVELOPMENT_TEAM = developmentTeam;
        buildConfig.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        // expo-widgets currently generates its Release configuration with
        // debug-style Swift settings. A debug dylib inside an unsigned .appex
        // gives re-signing tools another nested executable to discover and
        // sign. Keep the production extension as one optimized executable.
        if (buildConfig.name === 'Release') {
          buildConfig.buildSettings.ENABLE_DEBUG_DYLIB = 'NO';
          buildConfig.buildSettings.SWIFT_OPTIMIZATION_LEVEL = '"-O"';
          buildConfig.buildSettings.DEBUG_INFORMATION_FORMAT = '"dwarf-with-dsym"';
        }
      }
    }

    // Xcode also stores automatic-signing selection at target level. Without
    // these attributes it can still show "requires a development team" even
    // when DEVELOPMENT_TEAM exists in individual build configurations.
    const firstProject = project.getFirstProject();
    const targetAttributes = firstProject.firstProject.attributes.TargetAttributes ?? {};
    targetAttributes[widgetTargetId] = {
      ...(targetAttributes[widgetTargetId] ?? {}),
      DevelopmentTeam: developmentTeam,
      ProvisioningStyle: 'Automatic',
    };
    firstProject.firstProject.attributes.TargetAttributes = targetAttributes;
    return projectConfig;
  });

  return config;
};
