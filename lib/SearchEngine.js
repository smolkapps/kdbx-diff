const KdbxService = require('./KdbxService');
const { getFieldAsString, serializeEntry } = require('./utils');

class SearchEngine {
    constructor() {
        this.kdbxService = new KdbxService();
    }

    /**
     * Search entries in both databases by case-insensitive substring match.
     * @param {Kdbx} db1
     * @param {Kdbx} db2
     * @param {string} query - search string
     * @param {object} opts
     * @param {string[]} opts.fields - fields to search (default: Title, UserName, URL)
     * @returns {{ db1Results: object[], db2Results: object[], summary: object }}
     */
    search(db1, db2, query, { fields = ['Title', 'UserName', 'URL'] } = {}) {
        const q = query.toLowerCase();

        const db1Results = db1 ? this._searchDb(db1, q, fields) : [];
        const db2Results = db2 ? this._searchDb(db2, q, fields) : [];

        return {
            db1Results,
            db2Results,
            summary: {
                db1Count: db1Results.length,
                db2Count: db2Results.length,
                totalCount: db1Results.length + db2Results.length
            }
        };
    }

    /**
     * Find the counterpart entry in the other database (UUID first, Title+UserName fallback).
     * @param {Kdbx} sourceDb - db containing the source entry
     * @param {Kdbx} targetDb - db to search for counterpart
     * @param {string} uuid - UUID string of the source entry
     * @returns {{ sourceEntry: object, counterpart: object|null, matchMethod: string|null }}
     */
    findCounterpart(sourceDb, targetDb, uuid, { showPasswords = false } = {}) {
        const sourceEntries = this.kdbxService.getAllEntries(sourceDb);
        const sourceEntry = sourceEntries.find(e => e.uuid.toString() === uuid);

        if (!sourceEntry) {
            return { sourceEntry: null, counterpart: null, matchMethod: null };
        }

        const serializeOpts = { maskPasswords: !showPasswords };
        const serializedSource = serializeEntry(sourceEntry, serializeOpts);

        if (!targetDb) {
            return { sourceEntry: serializedSource, counterpart: null, matchMethod: null };
        }

        const targetEntries = this.kdbxService.getAllEntries(targetDb);

        // Try UUID match first
        let counterpart = targetEntries.find(e => e.uuid.toString() === uuid);
        if (counterpart) {
            return {
                sourceEntry: serializedSource,
                counterpart: serializeEntry(counterpart, serializeOpts),
                matchMethod: 'uuid'
            };
        }

        // Fallback: Title+UserName match
        const sourceTitle = getFieldAsString(sourceEntry, 'Title');
        const sourceUser = getFieldAsString(sourceEntry, 'UserName');

        if (sourceTitle || sourceUser) {
            counterpart = targetEntries.find(e => {
                const title = getFieldAsString(e, 'Title');
                const user = getFieldAsString(e, 'UserName');
                return title === sourceTitle && user === sourceUser;
            });

            if (counterpart) {
                return {
                    sourceEntry: serializedSource,
                    counterpart: serializeEntry(counterpart, serializeOpts),
                    matchMethod: 'title+username'
                };
            }
        }

        return { sourceEntry: serializedSource, counterpart: null, matchMethod: null };
    }

    _searchDb(db, queryLower, fields) {
        const entries = this.kdbxService.getAllEntries(db);
        const results = [];
        const limit = 100;

        for (const entry of entries) {
            if (results.length >= limit) break;

            let matched = false;
            for (const field of fields) {
                const val = getFieldAsString(entry, field).toLowerCase();
                if (val.includes(queryLower)) {
                    matched = true;
                    break;
                }
            }

            if (matched) {
                results.push(serializeEntry(entry));
            }
        }

        return results;
    }
}

module.exports = SearchEngine;
