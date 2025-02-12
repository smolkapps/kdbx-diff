const kdbxweb = require('kdbxweb');
const fs = require('fs');
const path = require('path');

class KdbxDiffAnalyzer {
    constructor() {
        // Initialize KDBX credentials
        kdbxweb.CryptoEngine.configure(argon2);
    }

    async loadDatabase(filePath, password) {
        const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password));
        const dbContent = await fs.promises.readFile(filePath);
        return await kdbxweb.Kdbx.load(dbContent, credentials);
    }

    /**
     * Compare two entries for equality
     * @returns {Object} Difference details if entries differ, null if identical
     */
    compareEntries(entry1, entry2) {
        const differences = {};
        
        // Compare basic fields
        const fields = ['Title', 'UserName', 'Password', 'URL', 'Notes'];
        for (const field of fields) {
            const val1 = entry1.fields[field]?.toString();
            const val2 = entry2.fields[field]?.toString();
            if (val1 !== val2) {
                differences[field] = {
                    original: val1,
                    modified: val2
                };
            }
        }

        // Compare custom fields
        const customFields1 = Object.keys(entry1.fields).filter(f => !fields.includes(f));
        const customFields2 = Object.keys(entry2.fields).filter(f => !fields.includes(f));
        
        for (const field of customFields1) {
            if (!entry2.fields[field] ||
                entry1.fields[field].toString() !== entry2.fields[field].toString()) {
                differences[field] = {
                    original: entry1.fields[field]?.toString(),
                    modified: entry2.fields[field]?.toString()
                };
            }
        }

        // Check for custom fields in second DB that don't exist in first
        for (const field of customFields2) {
            if (!entry1.fields[field]) {
                differences[field] = {
                    original: null,
                    modified: entry2.fields[field].toString()
                };
            }
        }

        return Object.keys(differences).length > 0 ? differences : null;
    }

    /**
     * Find an entry in the target database that matches the source entry
     */
    findMatchingEntry(sourceEntry, targetDb) {
        // First try to match by UUID if it exists
        if (sourceEntry.uuid) {
            const byUuid = targetDb.findEntryByUuid(sourceEntry.uuid);
            if (byUuid) return byUuid;
        }

        // Fall back to matching by title and username
        return targetDb.getEntries().find(entry =>
            entry.fields.Title === sourceEntry.fields.Title &&
            entry.fields.UserName === sourceEntry.fields.UserName
        );
    }

    /**
     * Create a diff database containing only the differences
     */
    async createDiffDatabase() {
        const newDb = await kdbxweb.Kdbx.create(new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('temp')));
        
        // Create our two main groups
        const missingGroup = newDb.createGroup(newDb.getDefaultGroup(), 'Missing Entries');
        const modifiedGroup = newDb.createGroup(newDb.getDefaultGroup(), 'Modified Entries');

        return { db: newDb, missingGroup, modifiedGroup };
    }

    /**
     * Main comparison function
     */
    async compareDatabases(db1Path, db2Path, password1, password2, outputPath) {
        // Load both databases
        const db1 = await this.loadDatabase(db1Path, password1);
        const db2 = await this.loadDatabase(db2Path, password2);

        // Create new database for differences
        const { db: diffDb, missingGroup, modifiedGroup } = await this.createDiffDatabase();

        // Get all entries from first database
        const entries1 = db1.getEntries();

        for (const entry of entries1) {
            const matchingEntry = this.findMatchingEntry(entry, db2);

            if (!matchingEntry) {
                // Entry doesn't exist in second database
                await diffDb.createEntry(missingGroup, entry.fields);
            } else {
                // Entry exists, check for differences
                const differences = this.compareEntries(entry, matchingEntry);
                if (differences) {
                    // Create subgroup by modification date if available
                    let targetGroup = modifiedGroup;
                    if (matchingEntry.times.lastModTime) {
                        const dateStr = matchingEntry.times.lastModTime.toISOString().split('T')[0];
                        targetGroup = diffDb.createGroup(modifiedGroup, dateStr);
                    }

                    // Create entry with original values and add differences in notes
                    const diffEntry = await diffDb.createEntry(targetGroup, entry.fields);
                    diffEntry.fields.Notes = kdbxweb.ProtectedValue.fromString(
                        `Differences found:\n${JSON.stringify(differences, null, 2)}`
                    );
                }
            }
        }

        // Save the diff database
        const diffContent = await diffDb.save();
        await fs.promises.writeFile(outputPath, Buffer.from(diffContent));
    }
}

module.exports = KdbxDiffAnalyzer;