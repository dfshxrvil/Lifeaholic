import { NativeModules, Platform } from 'react-native';

type WidgetModuleContract = {
  reloadAllWidgets: () => void;
};

const nativeWidgetModule = (Platform.OS === 'android'
  ? NativeModules.AndroidWidgetModule
  : NativeModules.WidgetModule) as WidgetModuleContract | undefined;
let reportedMissingModule = false;

/** Requests a native widget redraw after the platform snapshot is committed. */
export function reloadAllWidgets() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  if (!nativeWidgetModule?.reloadAllWidgets) {
    if (__DEV__ && !reportedMissingModule) {
      reportedMissingModule = true;
      console.info('The native widget module is unavailable. Rebuild the native app to enable widget reloads.');
    }
    return;
  }

  try {
    nativeWidgetModule.reloadAllWidgets();
  } catch (cause) {
    if (__DEV__) console.info('Unable to request a native widget reload.', cause);
  }
}
