import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { createCalendarEvent, deleteCalendarEvent, fetchCalendarEvents, removeHabitFromGoogleCalendar, syncHabitToGoogleCalendar, updateCalendarEvent } from '@/services/googleCalendar';
import { connectGoogleCalendarNative, disconnectGoogleCalendarNative } from '@/services/googleCalendarAuth';
import { calendarTokens, googleCalendarSession as session, googleDiscovery } from '@/services/googleCalendarSession';
import type { GoogleCalendarEvent } from '@/types/calendar';
import type { Habit } from '@/types/database';

WebBrowser.maybeCompleteAuthSession();
const NATIVE_REDIRECT_URI = 'com.example.lifeaholic:/oauthredirect';
const isGoogleClientId = (value?: string) => Boolean(value && /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(value));
type EventInput = { title: string; start: Date; end: Date; description?: string };
type CalendarContextValue = {
  events: GoogleCalendarEvent[];
  nextEvent: GoogleCalendarEvent | null;
  connected: boolean;
  loading: boolean;
  restoring: boolean;
  error: string | null;
  redirectUri: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: (from?: Date, to?: Date) => Promise<void>;
  addEvent: (input: EventInput) => Promise<void>;
  updateEvent: (eventId: string, input: EventInput) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  syncHabit: (habit: Habit) => Promise<void>;
  removeHabit: (habitId: string) => Promise<void>;
};
const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: PropsWithChildren) {
  const { user, loading: authLoading } = useAuth();
  const ownerId = user?.id;
  const configuredClientId = Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  const clientId = isGoogleClientId(configuredClientId) ? configuredClientId : undefined;
  const redirectUri = Platform.OS === 'web' ? AuthSession.makeRedirectUri() : NATIVE_REDIRECT_URI;
  const [connected, setConnected] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connecting = useRef(false);
  const fetchSequence = useRef(0);
  const [request, , promptAsync] = AuthSession.useAuthRequest({
    clientId: clientId ?? 'missing-client-id', redirectUri,
    scopes: ['openid', 'profile', 'https://www.googleapis.com/auth/calendar.events'],
    responseType: Platform.OS === 'web' ? AuthSession.ResponseType.Token : AuthSession.ResponseType.Code,
    usePKCE: Platform.OS !== 'web',
    extraParams: { access_type: Platform.OS === 'web' ? 'online' : 'offline', prompt: 'consent' },
  }, googleDiscovery);

  useEffect(() => session.subscribe((value) => {
    setConnected(value);
    if (!value) setEvents([]);
  }), []);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setRestoring(true); setError(null); setEvents([]);
    void session.restore(ownerId ?? null, clientId ?? '').catch(() => {
      if (active) setError(session.connected ? 'Unable to refresh Google Calendar. Check your connection and retry.' : 'Reconnect Google Calendar to restore access.');
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [authLoading, ownerId, clientId]);

  const refresh = useCallback(async (from = new Date(), to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60)) => {
    if (!session.connected) return;
    const version = session.version;
    const sequence = ++fetchSequence.current;
    setLoading(true); setError(null);
    try {
      const rows = await fetchCalendarEvents(await session.getToken(), from, to);
      if (session.isCurrent(version) && sequence === fetchSequence.current) setEvents(rows);
    } catch (cause) {
      if (session.isCurrent(version) && sequence === fetchSequence.current) setError(cause instanceof Error ? cause.message : 'Calendar sync failed.');
    } finally { if (sequence === fetchSequence.current) setLoading(false); }
  }, []);

  useEffect(() => {
    if (!connected || restoring) return;
    void refresh();
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void session.getToken().catch(() => {
        setError('Unable to renew Google Calendar access. Check your connection or reconnect.');
      });
    }, 60_000);
    return () => { foreground.remove(); clearInterval(timer); };
  }, [connected, restoring, refresh]);

  const connect = useCallback(async () => {
    if (connecting.current || restoring || !ownerId) return;
    if (Platform.OS !== 'android' && (!clientId || !request)) { setError('Google Calendar authorization is not configured or is still loading.'); return; }
    connecting.current = true;
    const version = session.version;
    setLoading(true); setError(null);
    try {
      if (Platform.OS === 'android') {
        const accessToken = await connectGoogleCalendarNative();
        await session.authorize({ accessToken, expiresAt: Date.now() + 3600_000 }, version);
      } else {
        // Handle only this attempt so an old response cannot undo a disconnect.
        const response = await promptAsync();
        if (!session.isCurrent(version)) return;
        if (response.type === 'cancel' || response.type === 'dismiss') return;
        if (response.type !== 'success') throw new Error('Google Calendar authorization was not completed.');
        const authentication = Platform.OS === 'web'
          ? AuthSession.TokenResponse.fromQueryParams(response.params)
          : await AuthSession.exchangeCodeAsync({ clientId: clientId!, code: response.params.code!, redirectUri, extraParams: { code_verifier: request!.codeVerifier! } }, googleDiscovery);
        if (Platform.OS === 'ios' && !authentication.refreshToken) throw new Error('Google did not grant offline access. Please connect again and approve Calendar access.');
        await session.authorize(calendarTokens(authentication), version);
      }
      if (session.isCurrent(version)) await refresh();
    } catch (cause) {
      if (session.isCurrent(version)) setError(cause instanceof Error ? cause.message : 'Google Calendar authorization failed.');
    } finally { connecting.current = false; setLoading(false); }
  }, [restoring, ownerId, clientId, request, promptAsync, redirectUri, refresh]);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await session.clear();
      if (Platform.OS === 'android') await disconnectGoogleCalendarNative();
    } catch { setError('Unable to completely disconnect Google Calendar. Please retry.'); }
  }, []);

  const nextEvent = useMemo(() => events.filter((event) => event.end > new Date() && !Number.isNaN(event.start.getTime())).sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null, [events]);
  const value = useMemo<CalendarContextValue>(() => ({
    events, nextEvent, connected, loading: loading || restoring, restoring, error, redirectUri, connect, disconnect, refresh,
    addEvent: async (input) => {
      const version = session.version;
      const event = await createCalendarEvent(await session.getToken(), input);
      if (event && session.isCurrent(version)) setEvents((current) => [...current, event].sort((a, b) => a.start.getTime() - b.start.getTime()));
    },
    updateEvent: async (eventId, input) => {
      const version = session.version;
      const event = await updateCalendarEvent(await session.getToken(), eventId, input);
      if (session.isCurrent(version)) setEvents((current) => current.map((item) => item.id === eventId ? event : item).sort((a, b) => a.start.getTime() - b.start.getTime()));
    },
    deleteEvent: async (eventId) => {
      const version = session.version;
      await deleteCalendarEvent(await session.getToken(), eventId);
      if (session.isCurrent(version)) setEvents((current) => current.filter((item) => item.id !== eventId));
    },
    syncHabit: async (habit) => { await syncHabitToGoogleCalendar(await session.getToken(), habit); await refresh(); },
    removeHabit: async (habitId) => { if (!session.connected) return; await removeHabitFromGoogleCalendar(await session.getToken(), habitId); await refresh(); },
  }), [events, nextEvent, connected, loading, restoring, error, redirectUri, connect, disconnect, refresh]);

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar() {
  const value = useContext(CalendarContext);
  if (!value) throw new Error('useCalendar must be used inside CalendarProvider');
  return value;
}
