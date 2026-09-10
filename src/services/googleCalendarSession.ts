import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { CalendarSession, type CalendarTokens } from './calendarSession';
import { refreshGoogleCalendarNative } from './googleCalendarAuth';

export const googleDiscovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};
const KEY = 'lifeaholic.google-calendar.session.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
// Browsers have no SecureStore. Keep the existing web connection in memory;
// never put Google refresh credentials into localStorage as a fallback.
let webSession: string | null = null;

export function calendarTokens(response: Pick<AuthSession.TokenResponse, 'accessToken' | 'refreshToken' | 'expiresIn' | 'issuedAt'>): CalendarTokens {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: ((response.issuedAt ?? Date.now() / 1000) + (response.expiresIn ?? 3600)) * 1000,
  };
}

export const googleCalendarSession = new CalendarSession({
  get: () => Platform.OS === 'web' ? Promise.resolve(webSession) : SecureStore.getItemAsync(KEY, options),
  set: async (value) => { if (Platform.OS === 'web') webSession = value; else await SecureStore.setItemAsync(KEY, value, options); },
  clear: async () => { webSession = null; if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(KEY, options); },
}, async (session) => {
  if (Platform.OS === 'android') return { accessToken: await refreshGoogleCalendarNative(session.accessToken), expiresAt: Date.now() + 3600_000 };
  return calendarTokens(await AuthSession.refreshAsync({ clientId: session.clientId, refreshToken: session.refreshToken! }, googleDiscovery));
}, Date.now, Platform.OS === 'android');
