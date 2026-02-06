// Centralized API client — manages session token and wraps all fetch calls
const Api = {
    sessionToken: null,

    async upload(formData) {
        const headers = {};
        if (this.sessionToken) headers['X-Session-Token'] = this.sessionToken;

        const res = await fetch('/api/upload', { method: 'POST', headers, body: formData });
        const data = await this._handle(res);
        if (data.sessionToken) this.sessionToken = data.sessionToken;
        return data;
    },

    async compare() {
        const res = await fetch('/api/compare', {
            method: 'POST',
            headers: this._headers()
        });
        return this._handle(res);
    },

    async download(slot) {
        const res = await fetch(`/api/download/${slot}`, {
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
        await fetch('/api/session', {
            method: 'DELETE',
            headers: this._headers()
        });
        this.sessionToken = null;
    },

    // Future: transfer, duplicates, import
    async transfer(transfers) {
        const res = await fetch('/api/transfer', {
            method: 'POST',
            headers: { ...this._headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ transfers })
        });
        return this._handle(res);
    },

    async duplicates() {
        const res = await fetch('/api/duplicates', {
            method: 'POST',
            headers: this._headers()
        });
        return this._handle(res);
    },

    async removeDuplicates(uuids) {
        const res = await fetch('/api/duplicates/remove', {
            method: 'POST',
            headers: { ...this._headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuids })
        });
        return this._handle(res);
    },

    async importEntries(mode, selectedUuids) {
        const res = await fetch('/api/import', {
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }
};
