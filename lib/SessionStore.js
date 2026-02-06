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
        const session = this._sessions.get(token);
        if (!session) return null;
        if (Date.now() - session.lastAccessed > EXPIRY_MS) {
            this._sessions.delete(token);
            return null;
        }
        session.lastAccessed = Date.now();
        return session;
    }

    setDatabase(token, slot, data) {
        const session = this.getSession(token);
        if (!session) return false;
        session.databases[slot] = data;
        return true;
    }

    destroySession(token) {
        return this._sessions.delete(token);
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
