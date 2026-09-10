export type CalendarTokens = { accessToken: string; refreshToken?: string; expiresAt: number };
type StoredSession = CalendarTokens & { ownerId: string; clientId: string };
type Storage = { get: () => Promise<string | null>; set: (value: string) => Promise<void>; clear: () => Promise<void> };
const REFRESH_MARGIN_MS = 60_000;

/** One account-bound session. Storage is serialized so disconnect wins over pending writes. */
export class CalendarSession {
  private session: StoredSession | null = null;
  private ownerId: string | null = null;
  private clientId = '';
  private generation = 0;
  private pendingRefresh: Promise<string> | null = null;
  private storageQueue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(connected: boolean) => void>();

  constructor(private storage: Storage, private renew: (session: StoredSession) => Promise<CalendarTokens>, private now = Date.now, private nativeRenewal = false) {}

  get version() { return this.generation; }
  get connected() { return this.session !== null; }
  isCurrent(version: number) { return version === this.generation; }
  subscribe(listener: (connected: boolean) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish() { this.listeners.forEach((listener) => listener(this.connected)); }
  private store<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storageQueue.then(operation);
    this.storageQueue = result.catch(() => undefined);
    return result;
  }

  async restore(ownerId: string | null, clientId: string) {
    const version = ++this.generation;
    this.ownerId = ownerId;
    this.clientId = clientId;
    this.session = null;
    this.pendingRefresh = null;
    this.publish();
    const raw = await this.store(() => this.storage.get());
    if (!this.isCurrent(version)) return;
    if (!raw) return;
    let saved: StoredSession | null = null;
    try { saved = JSON.parse(raw) as StoredSession; } catch { /* Discard corrupt storage. */ }
    if (!ownerId || !saved || saved.ownerId !== ownerId || saved.clientId !== clientId ||
        typeof saved.accessToken !== 'string' || !saved.accessToken || !Number.isFinite(saved.expiresAt) ||
        (saved.refreshToken !== undefined && typeof saved.refreshToken !== 'string')) {
      await this.store(() => this.storage.clear());
      return;
    }
    this.session = saved;
    this.publish();
    await this.getToken();
  }

  async authorize(tokens: CalendarTokens, version: number) {
    if (!this.isCurrent(version) || !this.ownerId) return;
    const session = { ...tokens, ownerId: this.ownerId, clientId: this.clientId };
    await this.store(() => this.isCurrent(version) ? this.storage.set(JSON.stringify(session)) : Promise.resolve());
    if (!this.isCurrent(version)) return;
    this.session = session;
    this.publish();
  }

  async clear() {
    ++this.generation;
    this.session = null;
    this.pendingRefresh = null;
    this.publish();
    await this.store(() => this.storage.clear());
  }

  async getToken(): Promise<string> {
    const session = this.session;
    if (!session) throw new Error('Connect Google Calendar first.');
    if (session.expiresAt > this.now() + REFRESH_MARGIN_MS) return session.accessToken;
    if (this.pendingRefresh) return this.pendingRefresh;
    if (!session.refreshToken && !this.nativeRenewal) {
      await this.clear();
      throw new Error('Reconnect Google Calendar to renew access.');
    }
    const version = this.generation;
    const pending = (async () => {
      try {
        const renewed = await this.renew(session);
        if (!this.isCurrent(version)) throw new Error('Google Calendar was disconnected.');
        // Google may omit a refresh token when renewing an existing grant.
        await this.authorize({ ...renewed, refreshToken: renewed.refreshToken || session.refreshToken }, version);
        if (!this.isCurrent(version)) throw new Error('Google Calendar was disconnected.');
        return renewed.accessToken;
      } catch (cause) {
        const code = (cause as { code?: string; params?: { error?: string } } | null)?.params?.error ?? (cause as { code?: string } | null)?.code;
        if (this.isCurrent(version) && (code === 'invalid_grant' || code === 'invalid_client' || code === 'SIGN_IN_REQUIRED')) {
          await this.clear();
          throw new Error('Google Calendar access was revoked or expired. Please reconnect.');
        }
        // Network failures keep the refresh token for a later foreground/request retry.
        throw cause;
      }
    })();
    this.pendingRefresh = pending;
    try { return await pending; } finally { if (this.pendingRefresh === pending) this.pendingRefresh = null; }
  }
}
