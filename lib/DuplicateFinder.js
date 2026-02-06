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
            const url = getFieldAsString(entry, 'URL').toLowerCase();
            if (!user && !url) return null;
            return `${user}|${url}`;
        } else if (criteria === 'title+username') {
            const title = getFieldAsString(entry, 'Title').toLowerCase();
            const user = getFieldAsString(entry, 'UserName').toLowerCase();
            if (!title && !user) return null;
            return `${title}|${user}`;
        }
        return null;
    }
}

module.exports = DuplicateFinder;
