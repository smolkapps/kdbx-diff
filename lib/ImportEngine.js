const KdbxService = require('./KdbxService');
const DiffEngine = require('./DiffEngine');

class ImportEngine {
    constructor() {
        this.kdbxService = new KdbxService();
    }

    /**
     * Import entries from sourceDb into targetDb.
     * @param {Kdbx} sourceDb - the database to import FROM
     * @param {Kdbx} targetDb - the database to import INTO
     * @param {string} mode - "skip-existing", "selected", or "all"
     * @param {string[]} [selectedUuids] - required when mode is "selected"
     * @returns {{ imported: number }}
     */
    importEntries(sourceDb, targetDb, mode, selectedUuids) {
        let imported = 0;
        const targetGroup = targetDb.getDefaultGroup();

        if (mode === 'skip-existing') {
            const engine = new DiffEngine();
            const diff = engine.compare(sourceDb, targetDb);
            // Only import entries that are in source but not in target
            for (const entry of diff.onlyInDb1) {
                const sourceEntry = this.kdbxService.findEntryByUuid(sourceDb, entry.uuid);
                if (sourceEntry) {
                    targetDb.importEntry(sourceEntry, targetGroup, sourceDb);
                    imported++;
                }
            }
        } else if (mode === 'selected') {
            const uuidSet = new Set(selectedUuids || []);
            const entries = this.kdbxService.getAllEntries(sourceDb);
            for (const entry of entries) {
                if (uuidSet.has(entry.uuid.toString())) {
                    targetDb.importEntry(entry, targetGroup, sourceDb);
                    imported++;
                }
            }
        } else if (mode === 'all') {
            const entries = this.kdbxService.getAllEntries(sourceDb);
            for (const entry of entries) {
                targetDb.importEntry(entry, targetGroup, sourceDb);
                imported++;
            }
        }

        return { imported };
    }
}

module.exports = ImportEngine;
