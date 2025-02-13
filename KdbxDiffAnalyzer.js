const kdbxweb = require('kdbxweb');
const fs = require('fs');
const path = require('path');

class KdbxDiffAnalyzer {
    constructor() {
        try {
            const argon2 = require('argon2');
            kdbxweb.argon2 = argon2; // Corrected configuration
        } catch (e) {
            if (e.code !== 'MODULE_NOT_FOUND') {
                throw e; // Re-throw if it's not a missing module error
            }
            // argon2 is optional, so ignore if it's not installed
            console.warn('argon2 not found, using default crypto engine. Install argon2 for better security.');
        }
    }

    async createCredentials(password, keyFileBuffer) {
        let passwordPart = null;
        let keyFilePart = null;

        if (password) {
            passwordPart = kdbxweb.ProtectedValue.fromString(password);
        }

        if (keyFileBuffer) {
            keyFilePart = await kdbxweb.KdbxCredentials.readKeyFile(keyFileBuffer);
        }

        if (!passwordPart && !keyFilePart) {
            throw new Error('Either password or key file must be provided');
        }

        return new kdbxweb.KdbxCredentials(passwordPart, keyFilePart);
    }

    async loadDatabase(fileBuffer, password, keyFileBuffer) {
        const credentials = await this.createCredentials(password, keyFileBuffer);
        return await kdbxweb.Kdbx.load(fileBuffer, credentials);
    }

    compareEntries(entry1, entry2) {
        const differences = {};

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

    findMatchingEntry(sourceEntry, targetDb) {
        if (sourceEntry.uuid) {
            const byUuid = targetDb.findEntryByUuid(sourceEntry.uuid);
            if (byUuid) return byUuid;
        }

        return targetDb.getEntries().find(entry =>
            entry.fields.Title === sourceEntry.fields.Title &&
            entry.fields.UserName === sourceEntry.fields.UserName
        );
    }

    async createDiffDatabase(credentials) {
        const newDb = await kdbxweb.Kdbx.create(credentials);
        const missingGroup = newDb.createGroup(newDb.getDefaultGroup(), 'Missing Entries');
        const modifiedGroup = newDb.createGroup(newDb.getDefaultGroup(), 'Modified Entries');
        return { db: newDb, missingGroup, modifiedGroup };
    }

    async compareDatabases(db1Buffer, db2Buffer, password1, password2, keyFile1Buffer, keyFile2Buffer) {
        const db1 = await this.loadDatabase(db1Buffer, password1, keyFile1Buffer);
        const db2 = await this.loadDatabase(db2Buffer, password2, keyFile2Buffer);
        let allDifferences = '';

        const credentials = await this.createCredentials(password1, keyFile1Buffer);
        const { db: diffDb, missingGroup, modifiedGroup } = await this.createDiffDatabase(credentials);
        const entries1 = db1.getEntries();

        for (const entry of entries1) {
            const matchingEntry = this.findMatchingEntry(entry, db2);

            if (!matchingEntry) {
                const newEntry = diffDb.createEntry(missingGroup);
                newEntry.fields = Object.assign({}, entry.fields);
                newEntry.uuid = entry.uuid; //Copy UUID
                allDifferences += `Entry missing: ${entry.fields.Title}\n`;

            } else {
                const differences = this.compareEntries(entry, matchingEntry);
                if (differences) {
                    allDifferences += `Differences in ${entry.fields.Title}: ${JSON.stringify(differences)}\n`;
                    let targetGroup = modifiedGroup;
                    if (matchingEntry.times.lastModTime) {
                        const dateStr = matchingEntry.times.lastModTime.toISOString().split('T')[0];
                        targetGroup = diffDb.groups.find(g => g.name === dateStr) ||
                                    diffDb.createGroup(modifiedGroup, dateStr);
                    }

                    const diffEntry = diffDb.createEntry(targetGroup);
                    diffEntry.fields = Object.assign({}, entry.fields);
                    diffEntry.uuid = entry.uuid; //Copy UUID
                    diffEntry.fields.Notes = kdbxweb.ProtectedValue.fromString(
                        `Differences found:\n${JSON.stringify(differences, null, 2)}`
                    );
                }
            }
        }
      const savedDiff = await diffDb.save();
      return {diffBuffer: savedDiff, diffString: allDifferences};
    }
}

module.exports = KdbxDiffAnalyzer;