const KdbxService = require('./KdbxService');
const { getFieldAsString, serializeEntry } = require('./utils');

class DuplicateFinder {
    constructor() {
        this.kdbxService = new KdbxService();
    }

    findDuplicates(db, criteria = 'username+url') {
        const entries = this.kdbxService.getAllEntries(db);
        const groups = new Map();

        for (const entry of entries) {
            const key = this._buildKey(entry, criteria);
            if (!key) continue;

            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        }

        // Only keep groups with duplicates (count > 1)
        const duplicateGroups = [];
        for (const [key, entries] of groups) {
            if (entries.length < 2) continue;

            // Sort by lastModTime descending (newest first)
            entries.sort((a, b) => {
                const ta = a.times.lastModTime?.getTime() || 0;
                const tb = b.times.lastModTime?.getTime() || 0;
                return tb - ta;
            });

            duplicateGroups.push({
                key,
                entries: entries.map((e, i) => ({
                    ...serializeEntry(e),
                    suggested: i === 0 ? 'keep' : 'remove'
                }))
            });
        }

        return {
            groups: duplicateGroups,
            summary: {
                totalGroups: duplicateGroups.length,
                totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.entries.length - 1, 0)
            }
        };
    }

    removeEntries(db, uuids) {
        let removed = 0;
        for (const uuid of uuids) {
            const entry = this.kdbxService.findEntryByUuid(db, uuid);
            if (entry) {
                db.remove(entry);
                removed++;
            }
        }
        return { removed };
    }

    _buildKey(entry, criteria) {
        if (criteria === 'username+url') {
            const user = getFieldAsString(entry, 'UserName').toLowerCase();
            const url = this._normalizeUrl(getFieldAsString(entry, 'URL'));
            if (!user || !url) return null;
            return `${user}|${url}`;
        } else if (criteria === 'title+username') {
            const title = this._normalizeTitle(getFieldAsString(entry, 'Title'));
            const user = getFieldAsString(entry, 'UserName').toLowerCase();
            if (!title || !user) return null;
            return `${title}|${user}`;
        }
        return null;
    }

    _normalizeUrl(url) {
        if (!url) return '';
        url = url.toLowerCase().trim();
        // Strip protocol
        url = url.replace(/^https?:\/\//, '');
        // Strip www.
        url = url.replace(/^www\./, '');
        // Strip trailing slashes and fragments
        url = url.replace(/[/#?]+$/, '');
        // Strip common login/auth paths that indicate the same site
        url = url.replace(/\/(login|signin|auth|account|sign-in|log-in)\b.*$/, '');
        return url;
    }

    _normalizeTitle(title) {
        if (!title) return '';
        title = title.toLowerCase().trim();
        // Collapse whitespace
        title = title.replace(/\s+/g, ' ');
        // Strip common noise: leading/trailing punctuation, parens with notes
        title = title.replace(/\s*\(.*?\)\s*$/, '');
        title = title.replace(/\s*[-–—]\s*(login|account|sign in|old|new|backup|copy|2|duplicate)\s*$/i, '');
        return title;
    }
}

module.exports = DuplicateFinder;
