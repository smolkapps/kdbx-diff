const KdbxService = require('./KdbxService');
const DiffEngine = require('./DiffEngine');
const { getEntryGroupNames, ensureGroupPath } = require('./utils');

class ImportEngine {
    constructor() {
        this.kdbxService = new KdbxService();
    }

    /**
     * Import entries from sourceDb into targetDb, preserving group structure.
     * When importing entries, the source group hierarchy is recreated in the target database.
     * @param {Kdbx} sourceDb - the database to import FROM
     * @param {Kdbx} targetDb - the database to import INTO
     * @param {string} mode - "skip-existing", "selected", or "all"
     * @param {string[]} [selectedUuids] - required when mode is "selected"
     * @returns {{ imported: number }}
     */
    importEntries(sourceDb, targetDb, mode, selectedUuids) {
        let imported = 0;

        if (mode === 'skip-existing') {
            const engine = new DiffEngine();
            const diff = engine.compare(sourceDb, targetDb);
            // Only import entries that are in source but not in target
            for (const entry of diff.onlyInDb1) {
                const sourceEntry = this.kdbxService.findEntryByUuid(sourceDb, entry.uuid);
                if (sourceEntry) {
                    const targetGroup = this._getTargetGroup(sourceEntry, targetDb);
                    targetDb.importEntry(sourceEntry, targetGroup, sourceDb);
                    imported++;
                }
            }
        } else if (mode === 'selected') {
            const uuidSet = new Set(selectedUuids || []);
            const entries = this.kdbxService.getAllEntries(sourceDb);
            for (const entry of entries) {
                if (uuidSet.has(entry.uuid.toString())) {
                    const targetGroup = this._getTargetGroup(entry, targetDb);
                    targetDb.importEntry(entry, targetGroup, sourceDb);
                    imported++;
                }
            }
        } else if (mode === 'all') {
            const entries = this.kdbxService.getAllEntries(sourceDb);
            for (const entry of entries) {
                const targetGroup = this._getTargetGroup(entry, targetDb);
                targetDb.importEntry(entry, targetGroup, sourceDb);
                imported++;
            }
        }

        return { imported };
    }

    /**
     * Get (or create) the matching group in the target database
     * for the given source entry, preserving group hierarchy.
     */
    _getTargetGroup(sourceEntry, targetDb) {
        const groupNames = getEntryGroupNames(sourceEntry);
        if (groupNames.length <= 1) {
            // Entry is in the root group, use default group
            return targetDb.getDefaultGroup();
        }
        return ensureGroupPath(targetDb, groupNames);
    }
}

module.exports = ImportEngine;
