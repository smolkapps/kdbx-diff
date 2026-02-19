// IndexedDB wrapper for recent database history
const DbHistory = {
    _db: null,
    _available: false,

    async init() {
        if (!window.indexedDB) return;
        try {
            this._db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('kdbx-diff-history', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('recentDatabases')) {
                        const store = db.createObjectStore('recentDatabases', { keyPath: 'dbFilename' });
                        store.createIndex('lastUsed', 'lastUsed', { unique: false });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            this._available = true;
        } catch {
            this._available = false;
        }
    },

    async save({ dbFilename, dbBlob, keyFilename, keyBlob }) {
        if (!this._available) return;
        try {
            const tx = this._db.transaction('recentDatabases', 'readwrite');
            const store = tx.objectStore('recentDatabases');
            store.put({
                dbFilename,
                dbBlob,
                keyFilename: keyFilename || null,
                keyBlob: keyBlob || null,
                lastUsed: Date.now()
            });
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            await this._evictOldest();
        } catch { /* silent */ }
    },

    async getAll() {
        if (!this._available) return [];
        try {
            const tx = this._db.transaction('recentDatabases', 'readonly');
            const store = tx.objectStore('recentDatabases');
            const all = await new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            return all.sort((a, b) => b.lastUsed - a.lastUsed);
        } catch {
            return [];
        }
    },

    async get(dbFilename) {
        if (!this._available) return null;
        try {
            const tx = this._db.transaction('recentDatabases', 'readonly');
            const store = tx.objectStore('recentDatabases');
            return await new Promise((resolve, reject) => {
                const req = store.get(dbFilename);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch {
            return null;
        }
    },

    async remove(dbFilename) {
        if (!this._available) return;
        try {
            const tx = this._db.transaction('recentDatabases', 'readwrite');
            const store = tx.objectStore('recentDatabases');
            store.delete(dbFilename);
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch { /* silent */ }
    },

    async _evictOldest() {
        if (!this._available) return;
        try {
            const all = await this.getAll();
            if (all.length > 10) {
                const toRemove = all.slice(10);
                const tx = this._db.transaction('recentDatabases', 'readwrite');
                const store = tx.objectStore('recentDatabases');
                for (const entry of toRemove) {
                    store.delete(entry.dbFilename);
                }
                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
            }
        } catch { /* silent */ }
    }
};
