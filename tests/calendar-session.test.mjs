import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Exercise the actual platform-independent session code with an in-memory vault
// and fake OAuth endpoint; no credentials, network, or device storage are touched.
const source = await readFile(new URL('../src/services/calendarSession.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { CalendarSession } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const NOW = 1_800_000_000_000;
const valid = { ownerId: 'alice', clientId: 'ios-client', accessToken: 'access', refreshToken: 'refresh', expiresAt: NOW + 3600_000 };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function vault(initial = null) {
  let value = initial;
  return { get: async () => value, set: async (next) => { value = next; }, clear: async () => { value = null; } };
}
const unexpectedRenew = async () => { throw new Error('Unexpected refresh'); };

test('authorization survives a fresh session instance and restores without OAuth', async () => {
  const storage = vault();
  const first = new CalendarSession(storage, unexpectedRenew, () => NOW);
  await first.restore('alice', 'ios-client');
  await first.authorize(valid, first.version);
  const reopened = new CalendarSession(storage, unexpectedRenew, () => NOW);
  await reopened.restore('alice', 'ios-client');
  assert.equal(await reopened.getToken(), 'access');
  assert.equal(reopened.connected, true);
});

test('expired access refreshes at startup and retains an omitted refresh token', async () => {
  const storage = vault(JSON.stringify({ ...valid, expiresAt: NOW - 1 }));
  const session = new CalendarSession(storage, async (saved) => {
    assert.equal(saved.refreshToken, 'refresh');
    return { accessToken: 'renewed', expiresAt: NOW + 3600_000 };
  }, () => NOW);
  await session.restore('alice', 'ios-client');
  assert.equal(await session.getToken(), 'renewed');
  assert.equal(JSON.parse(await storage.get()).refreshToken, 'refresh');
});

test('nearing expiry is refreshed once for concurrent operations and rotation is persisted', async () => {
  let now = NOW;
  let calls = 0;
  const gate = deferred();
  const storage = vault(JSON.stringify(valid));
  const session = new CalendarSession(storage, async () => {
    calls++;
    await gate.promise;
    return { accessToken: 'renewed', refreshToken: 'rotated', expiresAt: now + 3600_000 };
  }, () => now);
  await session.restore('alice', 'ios-client');
  now = valid.expiresAt - 30_000;
  const requests = [session.getToken(), session.getToken(), session.getToken()];
  gate.resolve();
  assert.deepEqual(await Promise.all(requests), ['renewed', 'renewed', 'renewed']);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await storage.get()).refreshToken, 'rotated');
});

test('offline refresh retains credentials and retries successfully later', async () => {
  let offline = true;
  const storage = vault(JSON.stringify({ ...valid, expiresAt: NOW - 1 }));
  const session = new CalendarSession(storage, async () => {
    if (offline) throw new Error('Network unavailable');
    return { accessToken: 'renewed', expiresAt: NOW + 3600_000 };
  }, () => NOW);
  await assert.rejects(session.restore('alice', 'ios-client'), /Network unavailable/);
  assert.equal(session.connected, true);
  assert.equal(JSON.parse(await storage.get()).refreshToken, 'refresh');
  offline = false;
  assert.equal(await session.getToken(), 'renewed');
});

test('revoked refresh token clears the vault and requests reconnection', async () => {
  const storage = vault(JSON.stringify({ ...valid, expiresAt: NOW - 1 }));
  const session = new CalendarSession(storage, async () => { throw { params: { error: 'invalid_grant' } }; }, () => NOW);
  await assert.rejects(session.restore('alice', 'ios-client'), /Please reconnect/);
  assert.equal(await storage.get(), null);
  assert.equal(session.connected, false);
});

test('disconnect invalidates a pending refresh and prevents credential resurrection', async () => {
  let now = NOW;
  const gate = deferred();
  const storage = vault(JSON.stringify(valid));
  const session = new CalendarSession(storage, async () => {
    await gate.promise;
    return { accessToken: 'late', expiresAt: now + 3600_000 };
  }, () => now);
  await session.restore('alice', 'ios-client');
  now = valid.expiresAt;
  const pending = assert.rejects(session.getToken(), /disconnected/);
  await session.clear();
  gate.resolve();
  await pending;
  assert.equal(await storage.get(), null);
  assert.equal(session.connected, false);
});

test('disconnect also invalidates a late authorization callback', async () => {
  const storage = vault();
  const session = new CalendarSession(storage, unexpectedRenew, () => NOW);
  await session.restore('alice', 'ios-client');
  const attempt = session.version;
  await session.clear();
  await session.authorize(valid, attempt);
  assert.equal(await storage.get(), null);
  assert.equal(session.connected, false);
});

test('storage writes completing during disconnect are followed by a delete', async () => {
  const gate = deferred();
  const started = deferred();
  let stored = null;
  const storage = { get: async () => stored, set: async (value) => { started.resolve(); await gate.promise; stored = value; }, clear: async () => { stored = null; } };
  const session = new CalendarSession(storage, unexpectedRenew, () => NOW);
  await session.restore('alice', 'ios-client');
  const write = session.authorize(valid, session.version);
  await started.promise;
  const disconnect = session.clear();
  gate.resolve();
  await Promise.all([write, disconnect]);
  assert.equal(stored, null);
  assert.equal(session.connected, false);
});

test('different app user, changed OAuth client, signed-out state, and corrupt data are discarded', async () => {
  for (const [raw, owner, client] of [
    [JSON.stringify(valid), 'bob', 'ios-client'],
    [JSON.stringify(valid), 'alice', 'other-client'],
    [JSON.stringify(valid), null, 'ios-client'],
    ['invalid-json', 'alice', 'ios-client'],
    [JSON.stringify({ ...valid, expiresAt: 'tomorrow' }), 'alice', 'ios-client'],
  ]) {
    const storage = vault(raw);
    const session = new CalendarSession(storage, unexpectedRenew, () => NOW);
    await session.restore(owner, client);
    assert.equal(await storage.get(), null);
    assert.equal(session.connected, false);
  }
});

test('an old access-only grant requests reconnection after expiry', async () => {
  const storage = vault(JSON.stringify({ ...valid, refreshToken: undefined, expiresAt: NOW - 1 }));
  const session = new CalendarSession(storage, unexpectedRenew, () => NOW);
  await assert.rejects(session.restore('alice', 'ios-client'), /Reconnect/);
  assert.equal(await storage.get(), null);
});

test('Android can delegate renewal to its native token manager', async () => {
  const storage = vault(JSON.stringify({ ...valid, refreshToken: undefined, expiresAt: NOW - 1 }));
  const session = new CalendarSession(storage, async () => ({ accessToken: 'native', expiresAt: NOW + 3600_000 }), () => NOW, true);
  await session.restore('alice', 'ios-client');
  assert.equal(await session.getToken(), 'native');
});

test('secure storage errors are surfaced without claiming a persisted connection', async () => {
  const session = new CalendarSession({ get: async () => null, set: async () => { throw new Error('Keychain unavailable'); }, clear: async () => {} }, unexpectedRenew, () => NOW);
  await session.restore('alice', 'ios-client');
  await assert.rejects(session.authorize(valid, session.version), /Keychain unavailable/);
  assert.equal(session.connected, false);
});
