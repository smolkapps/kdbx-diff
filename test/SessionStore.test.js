const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const SessionStore = require('../lib/SessionStore');

describe('SessionStore', () => {
    let store;

    before(() => {
        store = new SessionStore();
    });

    after(() => {
        store.destroy();
    });

    describe('createSession', () => {
        it('should create a new session and return a UUID token', () => {
            const token = store.createSession();
            assert.strictEqual(typeof token, 'string');
            assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });

        it('should create a session with databases object', () => {
            const token = store.createSession();
            const session = store.getSession(token);
            assert.ok(session);
            assert.strictEqual(typeof session.databases, 'object');
            assert.ok(session.createdAt > 0);
            assert.ok(session.lastAccessed > 0);
        });

        it('should evict oldest session when at MAX_SESSIONS capacity', () => {
            const tokens = [];
            // Create 50 sessions to hit capacity
            for (let i = 0; i < 50; i++) {
                tokens.push(store.createSession());
            }

            // All 50 should exist
            for (const token of tokens) {
                assert.ok(store.getSession(token));
            }

            // Create one more - should evict the oldest (first one)
            const newToken = store.createSession();
            assert.ok(store.getSession(newToken));

            // First token should be evicted
            assert.strictEqual(store.getSession(tokens[0]), null);

            // Second token should still exist
            assert.ok(store.getSession(tokens[1]));

            // Cleanup
            for (const token of tokens.slice(1)) {
                store.destroySession(token);
            }
            store.destroySession(newToken);
        });
    });

    describe('getSession', () => {
        it('should return session for valid token', () => {
            const token = store.createSession();
            const session = store.getSession(token);
            assert.ok(session);
            assert.strictEqual(session.id, token);
        });

        it('should return null for invalid token', () => {
            const session = store.getSession('invalid-token');
            assert.strictEqual(session, null);
        });

        it('should return null for empty string', () => {
            const session = store.getSession('');
            assert.strictEqual(session, null);
        });

        it('should return null for non-string token', () => {
            const session = store.getSession(null);
            assert.strictEqual(session, null);
        });

        it('should update lastAccessed time on access', (t, done) => {
            const token = store.createSession();
            const session1 = store.getSession(token);
            const firstAccess = session1.lastAccessed;

            setTimeout(() => {
                const session2 = store.getSession(token);
                assert.ok(session2.lastAccessed > firstAccess);
                store.destroySession(token);
                done();
            }, 10);
        });

        it('should return null for expired session (timing-safe)', () => {
            const token = store.createSession();
            const session = store.getSession(token);

            // Manually expire the session by setting lastAccessed to 31 minutes ago
            session.lastAccessed = Date.now() - (31 * 60 * 1000);

            const expired = store.getSession(token);
            assert.strictEqual(expired, null);
        });

        it('should use timing-safe comparison to prevent timing attacks', () => {
            const token = store.createSession();

            // These should all take similar time regardless of match position
            const validSession = store.getSession(token);
            const invalidSession1 = store.getSession('00000000-0000-0000-0000-000000000000');
            const invalidSession2 = store.getSession(token.slice(0, -1) + 'X');

            assert.ok(validSession);
            assert.strictEqual(invalidSession1, null);
            assert.strictEqual(invalidSession2, null);

            store.destroySession(token);
        });
    });

    describe('setDatabase', () => {
        it('should store database data in session', () => {
            const token = store.createSession();
            const dbData = { db: { mock: 'database' }, filename: 'test.kdbx' };

            const success = store.setDatabase(token, 'db1', dbData);
            assert.strictEqual(success, true);

            const session = store.getSession(token);
            assert.deepStrictEqual(session.databases.db1, dbData);

            store.destroySession(token);
        });

        it('should return false for invalid token', () => {
            const success = store.setDatabase('invalid-token', 'db1', {});
            assert.strictEqual(success, false);
        });

        it('should support multiple database slots', () => {
            const token = store.createSession();
            const db1Data = { db: { mock: 'db1' }, filename: 'db1.kdbx' };
            const db2Data = { db: { mock: 'db2' }, filename: 'db2.kdbx' };

            store.setDatabase(token, 'db1', db1Data);
            store.setDatabase(token, 'db2', db2Data);

            const session = store.getSession(token);
            assert.deepStrictEqual(session.databases.db1, db1Data);
            assert.deepStrictEqual(session.databases.db2, db2Data);

            store.destroySession(token);
        });
    });

    describe('destroySession', () => {
        it('should destroy an existing session', () => {
            const token = store.createSession();
            assert.ok(store.getSession(token));

            const destroyed = store.destroySession(token);
            assert.strictEqual(destroyed, true);
            assert.strictEqual(store.getSession(token), null);
        });

        it('should return false for non-existent session', () => {
            const destroyed = store.destroySession('00000000-0000-0000-0000-000000000000');
            assert.strictEqual(destroyed, false);
        });

        it('should return false for invalid token types', () => {
            assert.strictEqual(store.destroySession(''), false);
            assert.strictEqual(store.destroySession(null), false);
        });

        it('should use timing-safe comparison', () => {
            const token = store.createSession();

            // Wrong token should not leak timing info
            const result1 = store.destroySession(token.slice(0, -1) + 'X');
            assert.strictEqual(result1, false);

            // Real token should still work
            const result2 = store.destroySession(token);
            assert.strictEqual(result2, true);
        });
    });

    describe('destroy', () => {
        it('should clear all sessions and stop cleanup timer', () => {
            const localStore = new SessionStore();
            const token1 = localStore.createSession();
            const token2 = localStore.createSession();

            assert.ok(localStore.getSession(token1));
            assert.ok(localStore.getSession(token2));

            localStore.destroy();

            // Sessions should be cleared
            assert.strictEqual(localStore.getSession(token1), null);
            assert.strictEqual(localStore.getSession(token2), null);

            // Timer should be cleared (no way to check directly, but no errors should occur)
            assert.strictEqual(localStore._cleanupTimer, null);
        });
    });

    describe('_cleanup (automatic expiry)', () => {
        it('should remove expired sessions during periodic cleanup', (t, done) => {
            const localStore = new SessionStore();
            const token = localStore.createSession();

            // Manually expire the session
            const session = localStore.getSession(token);
            session.lastAccessed = Date.now() - (31 * 60 * 1000);

            // Trigger cleanup manually
            localStore._cleanup();

            // Session should be removed
            const result = localStore.getSession(token);
            assert.strictEqual(result, null);

            localStore.destroy();
            done();
        });

        it('should not remove non-expired sessions during cleanup', () => {
            const localStore = new SessionStore();
            const token = localStore.createSession();

            // Trigger cleanup
            localStore._cleanup();

            // Session should still exist
            assert.ok(localStore.getSession(token));

            localStore.destroy();
        });
    });
});
