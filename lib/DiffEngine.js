const KdbxService = require('./KdbxService');
const { getFieldAsString, serializeEntry, getBinarySize } = require('./utils');

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
            const binaryDiffs = this._compareBinaries(e1, e2);
            const historyDiff = this._compareHistory(e1, e2);

            if (fieldDiffs.length === 0 && !timeDiff && binaryDiffs.length === 0 && !historyDiff) {
                identical.push({ uuid: e1.uuid.toString(), matchedByFallback });
            } else {
                const modEntry = {
                    db1Entry: serializeEntry(e1),
                    db2Entry: serializeEntry(e2),
                    fieldDiffs,
                    timeDiff,
                    matchedByFallback
                };
                if (binaryDiffs.length > 0) {
                    modEntry.binaryDiffs = binaryDiffs;
                }
                if (historyDiff) {
                    modEntry.historyDiff = historyDiff;
                }
                modified.push(modEntry);
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

    _compareBinaries(e1, e2) {
        const diffs = [];
        const b1 = e1.binaries || new Map();
        const b2 = e2.binaries || new Map();

        const allNames = new Set([...b1.keys(), ...b2.keys()]);

        for (const name of allNames) {
            const has1 = b1.has(name);
            const has2 = b2.has(name);
            const size1 = has1 ? getBinarySize(b1.get(name)) : 0;
            const size2 = has2 ? getBinarySize(b2.get(name)) : 0;

            if (has1 && !has2) {
                diffs.push({ name, status: 'removed', db1Size: size1, db2Size: 0 });
            } else if (!has1 && has2) {
                diffs.push({ name, status: 'added', db1Size: 0, db2Size: size2 });
            } else if (has1 && has2 && size1 !== size2) {
                diffs.push({ name, status: 'modified', db1Size: size1, db2Size: size2 });
            }
        }

        return diffs;
    }

    _compareHistory(e1, e2) {
        const h1 = Array.isArray(e1.history) ? e1.history.length : 0;
        const h2 = Array.isArray(e2.history) ? e2.history.length : 0;

        if (h1 === h2) return null;
        return { db1Count: h1, db2Count: h2 };
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
