import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { createCalendarEvent, deleteCalendarEvent, fetchCalendarEvents, removeHabitFromGoogleCalendar, syncHabitToGoogleCalendar, updateCalendarEvent } from '@/services/googleCalendar';
import { connectGoogleCalendarNative, disconnectGoogleCalendarNative } from '@/services/googleCalendarAuth';
import type { GoogleCalendarEvent } from '@/types/calendar';
import type { Habit } from '@/types/database';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const NATIVE_REDIRECT_URI = 'com.example.lifeaholic:/oauthredirect';
const isGoogleClientId = (value?: string) => Boolean(value && /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(value));

type CalendarContextValue = {
  events: GoogleCalendarEvent[];
  nextEvent: GoogleCalendarEvent | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  redirectUri: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: (from?: Date, to?: Date) => Promise<void>;
  addEvent: (input: { title: string; start: Date; end: Date; description?: string }) => Promise<void>;
  updateEvent: (eventId: string, input: { title: string; start: Date; end: Date; description?: string }) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  syncHabit: (habit: Habit) => Promise<void>;
  removeHabit: (habitId: string) => Promise<void>;
};

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: PropsWithChildren) {
  const configuredClientId = Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  const clientId = isGoogleClientId(configuredClientId) ? configuredClientId : undefined;
  const redirectUri = Platform.OS === 'web' ? AuthSession.makeRedirectUri() : NATIVE_REDIRECT_URI;
  const [token, setToken] = useState<string | null>(null);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handledCode = useRef<string | null>(null);
  const [request, response, promptAsync] = AuthSession.useAuthRequest({
    clientId: clientId ?? 'missing-client-id',
    redirectUri,
    scopes: ['openid', 'profile', 'https://www.googleapis.com/auth/calendar.events'],
    responseType: Platform.OS === 'web' ? AuthSession.ResponseType.Token : AuthSession.ResponseType.Code,
    usePKCE: Platform.OS !== 'web',
    extraParams: { access_type: 'online', prompt: 'consent' },
  }, discovery);

  const refresh = useCallback(async (from = new Date(), to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60)) => {
    if (!token) return;
    setLoading(true); setError(null);
    try { setEvents(await fetchCalendarEvents(token, from, to)); }
    catch (cause) { setEvents([]); setError(cause instanceof Error ? cause.message : 'Calendar sync failed.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (response?.type === 'success') {
      if (response.params.access_token) {
        setToken(response.params.access_token);
        return;
      }
      const code = response.params.code;
      if (!code || code === handledCode.current || !clientId || !request?.codeVerifier) return;
      handledCode.current = code;
      setLoading(true);
      AuthSession.exchangeCodeAsync({
        clientId,
        code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      }, discovery).then((authentication) => setToken(authentication.accessToken))
        .catch((cause) => setError(cause instanceof Error ? `Google authorization could not be exchanged: ${cause.message}` : 'Google authorization could not be exchanged.'))
        .finally(() => setLoading(false));
    } else if (response?.type === 'error') setError('Google authorization was not completed.');
  }, [response, clientId, redirectUri, request]);

  useEffect(() => { if (token) void refresh(); }, [token, refresh]);

  const nextEvent = useMemo(() => events
    .filter((event) => event.end > new Date() && !Number.isNaN(event.start.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null, [events]);
  const value = useMemo<CalendarContextValue>(() => ({
    events, nextEvent, connected: Boolean(token), loading, error, redirectUri,
    connect: async () => {
      setError(null);
      if (Platform.OS === 'android') {
        setLoading(true);
        try { setToken(await connectGoogleCalendarNative()); }
        catch (cause) { setToken(null); setEvents([]); setError(cause instanceof Error ? cause.message : 'Google Calendar authorization failed.'); }
        finally { setLoading(false); }
        return;
      }
      if (!clientId) { setError(`Add a valid Google OAuth ${Platform.OS} client ID to .env before connecting.`); return; }
      if (!request) return;
      await promptAsync();
    },
    disconnect: () => { setToken(null); setEvents([]); setError(null); if (Platform.OS === 'android') void disconnectGoogleCalendarNative().catch(() => undefined); },
    refresh,
    addEvent: async (input) => { if (!token) throw new Error('Connect Google Calendar first.'); const event = await createCalendarEvent(token, input); if (event) setEvents((current) => [...current, event].sort((a, b) => a.start.getTime() - b.start.getTime())); },
    updateEvent: async (eventId, input) => { if (!token) throw new Error('Connect Google Calendar first.'); const event = await updateCalendarEvent(token, eventId, input); setEvents((current) => current.map((item) => item.id === eventId ? event : item).sort((a, b) => a.start.getTime() - b.start.getTime())); },
    deleteEvent: async (eventId) => { if (!token) throw new Error('Connect Google Calendar first.'); await deleteCalendarEvent(token, eventId); setEvents((current) => current.filter((item) => item.id !== eventId)); },
    syncHabit: async (habit) => { if (!token) throw new Error('Connect Google Calendar first.'); await syncHabitToGoogleCalendar(token, habit); await refresh(); },
    removeHabit: async (habitId) => { if (!token) return; await removeHabitFromGoogleCalendar(token, habitId); await refresh(); },
  }), [events, nextEvent, token, loading, error, redirectUri, clientId, request, promptAsync, refresh]);

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar() {
  const value = useContext(CalendarContext);
  if (!value) throw new Error('useCalendar must be used inside CalendarProvider');
  return value;
}
