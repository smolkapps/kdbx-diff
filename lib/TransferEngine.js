const KdbxService = require('./KdbxService');

class TransferEngine {
    constructor() {
        this.kdbxService = new KdbxService();
    }

    /**
     * Transfer entries between databases.
     * Binary attachments and entry history are automatically handled by kdbxweb:
     * - db.importEntry() copies the full entry including binaries and history
     * - entry.copyFrom() copies all fields, binaries, and history from source
     * @param {Kdbx} db1
     * @param {Kdbx} db2
     * @param {Array} transfers - [{uuid, action, direction}]
     *   action: "copy" (for entries only in one DB) or "overwrite" (for modified entries)
     *   direction: "toDb2" or "toDb1"
     */
    transfer(db1, db2, transfers) {
        let copiedToDb1 = 0;
        let copiedToDb2 = 0;
        let overwritten = 0;

        for (const t of transfers) {
            if (t.action === 'copy') {
                if (t.direction === 'toDb2') {
                    const entry = this._findByUuid(db1, t.uuid);
                    if (entry) {
                        db2.importEntry(entry, db2.getDefaultGroup(), db1);
                        copiedToDb2++;
                    }
                } else if (t.direction === 'toDb1') {
                    const entry = this._findByUuid(db2, t.uuid);
                    if (entry) {
                        db1.importEntry(entry, db1.getDefaultGroup(), db2);
                        copiedToDb1++;
                    }
                }
            } else if (t.action === 'overwrite') {
                if (t.direction === 'toDb2') {
                    const source = this._findByUuid(db1, t.uuid);
                    const target = this._findByUuid(db2, t.uuid);
                    if (source && target) {
                        target.copyFrom(source);
                        overwritten++;
                    }
                } else if (t.direction === 'toDb1') {
                    const source = this._findByUuid(db2, t.uuid);
                    const target = this._findByUuid(db1, t.uuid);
                    if (source && target) {
                        target.copyFrom(source);
                        overwritten++;
                    }
                }
            }
        }

        return { copiedToDb1, copiedToDb2, overwritten };
    }

    _findByUuid(db, uuid) {
        return this.kdbxService.findEntryByUuid(db, uuid);
    }
}

module.exports = TransferEngine;
