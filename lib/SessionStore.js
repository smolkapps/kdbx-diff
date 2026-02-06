const crypto = require('crypto');

const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

class SessionStore {
    constructor() {
        this._sessions = new Map();
        this._cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
        this._cleanupTimer.unref(); // don't keep process alive
    }

    createSession() {
        const id = crypto.randomUUID();
        const now = Date.now();
        this._sessions.set(id, {
            id,
            createdAt: now,
            lastAccessed: now,
            databases: {}
        });
        return id;
    }

    getSession(token) {
        // Timing-safe lookup: iterate all sessions and compare with constant-time equality
        // to prevent timing attacks on session tokens. Acceptable O(n) for local tool with few sessions.
        if (typeof token !== 'string' || token.length === 0) return null;

        const tokenBuf = Buffer.from(token, 'utf8');
        let matched = null;

        for (const [id, session] of this._sessions) {
            const idBuf = Buffer.from(id, 'utf8');
            if (tokenBuf.length === idBuf.length && crypto.timingSafeEqual(tokenBuf, idBuf)) {
                matched = session;
                break;
            }
        }

        if (!matched) return null;
        if (Date.now() - matched.lastAccessed > EXPIRY_MS) {
            this._sessions.delete(matched.id);
            return null;
        }
        matched.lastAccessed = Date.now();
        return matched;
    }

    setDatabase(token, slot, data) {
        const session = this.getSession(token);
        if (!session) return false;
        session.databases[slot] = data;
        return true;
    }

    destroySession(token) {
        // Find the matching session using timing-safe comparison
        if (typeof token !== 'string' || token.length === 0) return false;
        const tokenBuf = Buffer.from(token, 'utf8');
        for (const [id] of this._sessions) {
            const idBuf = Buffer.from(id, 'utf8');
            if (tokenBuf.length === idBuf.length && crypto.timingSafeEqual(tokenBuf, idBuf)) {
                return this._sessions.delete(id);
            }
        }
        return false;
    }

    destroy() {
        clearInterval(this._cleanupTimer);
        this._sessions.clear();
    }

    _cleanup() {
        const now = Date.now();
        for (const [token, session] of this._sessions) {
            if (now - session.lastAccessed > EXPIRY_MS) {
                this._sessions.delete(token);
            }
        }
    }
}

module.exports = SessionStore;
