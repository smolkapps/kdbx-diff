const KdbxService = require('./KdbxService');
const { getFieldAsString, serializeEntry } = require('./utils');

class DiffEngine {
    constructor() {
        this.kdbxService = new KdbxService();
    }

    compare(db1, db2) {
        const entries1 = this.kdbxService.getAllEntries(db1);
        const entries2 = this.kdbxService.getAllEntries(db2);

        // Build UUID index for O(1) lookup on db2
        const db2ByUuid = new Map();
        for (const entry of entries2) {
            db2ByUuid.set(entry.uuid.id, entry);
        }

        // Build Title+UserName index for fallback lookup on db2
        const db2ByTitleUser = new Map();
        for (const entry of entries2) {
            const key = this._titleUserKey(entry);
            if (key) db2ByTitleUser.set(key, entry);
        }

        const seenDb2Uuids = new Set();
        const onlyInDb1 = [];
        const modified = [];
        const identical = [];

        // Pass 1: iterate db1 entries, find matches in db2
        for (const e1 of entries1) {
            let e2 = db2ByUuid.get(e1.uuid.id);
            let matchedByFallback = false;

            if (!e2) {
                e2 = db2ByTitleUser.get(this._titleUserKey(e1)) || null;
                if (e2) {
                    matchedByFallback = true;
                    console.warn(`DiffEngine: entry "${getFieldAsString(e1, 'Title')}" matched by Title+UserName fallback (UUIDs differ: ${e1.uuid.id} vs ${e2.uuid.id})`);
                }
            }

            if (!e2) {
                onlyInDb1.push(serializeEntry(e1));
                continue;
            }

            seenDb2Uuids.add(e2.uuid.id);

            const fieldDiffs = this._compareFields(e1, e2);
            const timeDiff = this._compareTimestamps(e1, e2);

            if (fieldDiffs.length === 0 && !timeDiff) {
                identical.push({ uuid: e1.uuid.toString(), matchedByFallback });
            } else {
                modified.push({
                    db1Entry: serializeEntry(e1),
                    db2Entry: serializeEntry(e2),
                    fieldDiffs,
                    timeDiff,
                    matchedByFallback
                });
            }
        }

        // Pass 2: db2 entries not seen → onlyInDb2
        const onlyInDb2 = [];
        for (const e2 of entries2) {
            if (!seenDb2Uuids.has(e2.uuid.id)) {
                onlyInDb2.push(serializeEntry(e2));
            }
        }

        return {
            onlyInDb1,
            onlyInDb2,
            modified,
            identical,
            summary: {
                totalDb1: entries1.length,
                totalDb2: entries2.length,
                onlyInDb1: onlyInDb1.length,
                onlyInDb2: onlyInDb2.length,
                modified: modified.length,
                identical: identical.length
            }
        };
    }

    _titleUserKey(entry) {
        const title = getFieldAsString(entry, 'Title');
        const user = getFieldAsString(entry, 'UserName');
        if (!title && !user) return null;
        return `${title}\0${user}`;
    }

    _compareFields(e1, e2) {
        const diffs = [];
        const allKeys = new Set([...e1.fields.keys(), ...e2.fields.keys()]);

        for (const key of allKeys) {
            const v1 = getFieldAsString(e1, key);
            const v2 = getFieldAsString(e2, key);
            if (v1 !== v2) {
                diffs.push({ field: key, db1Value: v1, db2Value: v2 });
            }
        }

        return diffs;
    }

    _compareTimestamps(e1, e2) {
        const t1 = e1.times.lastModTime?.getTime();
        const t2 = e2.times.lastModTime?.getTime();
        if (t1 === t2) return null;
        return {
            db1LastMod: e1.times.lastModTime,
            db2LastMod: e2.times.lastModTime,
            newerIn: t1 > t2 ? 'db1' : 'db2'
        };
    }
}

module.exports = DiffEngine;
