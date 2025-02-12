const kdbxweb = require('kdbxweb');
const fs = require('fs');
const path = require('path');

class KdbxDiffAnalyzer {
    constructor() {
        kdbxweb.CryptoEngine.configure(argon2);
    }

    async createCredentials(password, keyFileBuffer) {
        let passwordPart = null;
        let keyFilePart = null;

        if (password) {
            passwordPart = kdbxweb.ProtectedValue.fromString(password);
        }

        if (keyFileBuffer) {
            keyFilePart = await kdbxweb.KeyEncoding.identifyKey(keyFileBuffer);
        }

        if (!passwordPart && !keyFilePart) {
            throw new Error('Either password or key file must be provided');
        }

        return new kdbxweb.Credentials(passwordPart, keyFilePart);
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

    async createDiffDatabase() {
        const newDb = await kdbxweb.Kdbx.create(new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('temp')));
        const missingGroup = newDb.createGroup(newDb.getDefaultGroup(), 'Missing Entries');
        const modifiedGroup = newDb.createGroup(newDb.getDefaultGroup(), 'Modified Entries');
        return { db: newDb, missingGroup, modifiedGroup };
    }

    async compareDatabases(db1Buffer, db2Buffer, password1, password2, keyFile1Buffer, keyFile2Buffer) {
        const db1 = await this.loadDatabase(db1Buffer, password1, keyFile1Buffer);
        const db2 = await this.loadDatabase(db2Buffer, password2, keyFile2Buffer);

        const { db: diffDb, missingGroup, modifiedGroup } = await this.createDiffDatabase();
        const entries1 = db1.getEntries();

        for (const entry of entries1) {
            const matchingEntry = this.findMatchingEntry(entry, db2);

            if (!matchingEntry) {
                await diffDb.createEntry(missingGroup, entry.fields);
            } else {
                const differences = this.compareEntries(entry, matchingEntry);
                if (differences) {
                    let targetGroup = modifiedGroup;
                    if (matchingEntry.times.lastModTime) {
                        const dateStr = matchingEntry.times.lastModTime.toISOString().split('T')[0];
                        targetGroup = diffDb.groups.find(g => g.name === dateStr) ||
                                    diffDb.createGroup(modifiedGroup, dateStr);
                    }

                    const diffEntry = await diffDb.createEntry(targetGroup, entry.fields);
                    diffEntry.fields.Notes = kdbxweb.ProtectedValue.fromString(
                        `Differences found:\n${JSON.stringify(differences, null, 2)}`
                    );
                }
            }
        }

        return await diffDb.save();
    }
}

module.exports = KdbxDiffAnalyzer;