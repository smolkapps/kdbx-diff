// Centralized API client — manages session token and wraps all fetch calls
const Api = {
    sessionToken: null,

    async upload(formData) {
        const headers = {};
        if (this.sessionToken) headers['X-Session-Token'] = this.sessionToken;

        const res = await this._fetch('/api/upload', { method: 'POST', headers, body: formData });
        const data = await this._handle(res);
        if (data.sessionToken) this.sessionToken = data.sessionToken;
        return data;
    },

    async compare() {
        const res = await this._fetch('/api/compare', {
            method: 'POST',
            headers: this._headers()
        });
        return this._handle(res);
    },

    async download(slot) {
        const res = await this._fetch(`/api/download/${slot}`, {
            headers: this._headers()
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Download failed');
        }
        return res.blob();
    },

    async destroySession() {
        if (!this.sessionToken) return;
        await this._fetch('/api/session', {
            method: 'DELETE',
            headers: this._headers()
        });
        this.sessionToken = null;
    },

    // Future: transfer, duplicates, import
    async transfer(transfers) {
        const res = await this._fetch('/api/transfer', {
            method: 'POST',
            headers: { ...this._headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ transfers })
        });
        return this._handle(res);
    },

    async duplicates() {
        const res = await this._fetch('/api/duplicates', {
            method: 'POST',
            headers: this._headers()
        });
        return this._handle(res);
    },

    async removeDuplicates(uuids) {
        const res = await this._fetch('/api/duplicates/remove', {
            method: 'POST',
            headers: { ...this._headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuids })
        });
        return this._handle(res);
    },

    async csvImport(formData) {
        const headers = {};
        if (this.sessionToken) headers['X-Session-Token'] = this.sessionToken;

        const res = await this._fetch('/api/csv-import', { method: 'POST', headers, body: formData });
        const data = await this._handle(res);
        if (data.sessionToken) this.sessionToken = data.sessionToken;
        return data;
    },

    async search(query, fields) {
        const body = { query };
        if (fields) body.fields = fields;
        const res = await this._fetch('/api/search', {
            method: 'POST',
            headers: { ...this._headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return this._handle(res);
    },

    async searchDetail(uuid, source, { showPasswords = false } = {}) {
        const res = await this._fetch('/api/search/detail', {
            method: 'POST',
            headers: { ...this._headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid, source, showPasswords })
        });
        return this._handle(res);
    },

    async importEntries(mode, selectedUuids) {
        const res = await this._fetch('/api/import', {
            method: 'POST',
            headers: { ...this._headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, selectedUuids })
        });
        return this._handle(res);
    },

    _headers() {
        const h = {};
        if (this.sessionToken) h['X-Session-Token'] = this.sessionToken;
        return h;
    },

    async _handle(res) {
        let data;
        try {
            data = await res.json();
        } catch {
            throw new Error(res.ok ? 'Unexpected non-JSON response' : `Request failed (${res.status})`);
        }
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    },

    // Wrap fetch calls to detect network errors
    async _fetch(url, options) {
        try {
            return await fetch(url, options);
        } catch (err) {
            // Network error or server unreachable
            if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
                // Show reconnect button if App is available
                if (typeof App !== 'undefined' && App.showReconnectButton) {
                    App.showReconnectButton();
                }
                throw new Error('Server disconnected. Please reconnect using the "Reconnect" button in the top right or re-upload your databases on the Compare tab.');
            }
            throw err;
        }
    }
};
