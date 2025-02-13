const kdbxweb = require('kdbxweb');
const fs = require('fs');
const path = require('path');

class KdbxDiffAnalyzer {
    constructor() {
        try {
            const argon2 = require('argon2');
            kdbxweb.CryptoEngine.argon2 = async function(password, salt, memory, iterations, length, parallelism, type, version) {
                try {
                    const hash = await argon2.hash(password, {
                        salt: Buffer.from(salt),
                        timeCost: iterations,
                        memoryCost: memory,
                        parallelism: parallelism,
                        type: type === 0 ? argon2.argon2d : argon2.argon2i,
                        hashLength: length,
                        version: version,
                        raw: true
                    });
                    return new Uint8Array(hash);
                } catch (err) {
                    throw new Error(`Argon2 error: ${err.message}`);
                }
            };
        } catch (e) {
            if (e.code !== 'MODULE_NOT_FOUND') {
                throw e;
            }
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
            try {
                keyFilePart = await kdbxweb.Credentials.createKeyFile(keyFileBuffer);
            } catch (error) {
                throw new Error(`Failed to process key file: ${error.message}`);
            }
        }

        if (!passwordPart && !keyFilePart) {
            throw new Error('Either password or key file must be provided');
        }

        return new kdbxweb.Credentials(passwordPart, keyFilePart);
    }

    async loadDatabase(fileBuffer, password, keyFileBuffer, dbIdentifier) {
        try {
            const credentials = await this.createCredentials(password, keyFileBuffer);
            return await kdbxweb.Kdbx.load(fileBuffer, credentials);
        } catch (error) {
            if (error.name === 'InvalidKeyError') {
                throw new Error(`Database ${dbIdentifier}: Incorrect key. Please try again.`);
            }
            throw new Error(`Database ${dbIdentifier}: ${error.message}`);
        }
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
            const byUuid = targetDb.getDefaultGroup().entries.find(e => e.uuid.id === sourceEntry.uuid.id);
            if (byUuid) return byUuid;
        }

        return targetDb.getDefaultGroup().entries.find(entry =>
            entry.fields.get('Title')?.toString() === sourceEntry.fields.get('Title')?.toString() &&
            entry.fields.get('UserName')?.toString() === sourceEntry.fields.get('UserName')?.toString()
        );
    }

    async createDiffDatabase(credentials) {
        const newDb = kdbxweb.Kdbx.create(credentials, {
            passwordKey: credentials.passwordHash
        });
        const missingGroup = newDb.createGroup(newDb.getDefaultGroup(), 'Missing Entries');
        const modifiedGroup = newDb.createGroup(newDb.getDefaultGroup(), 'Modified Entries');
        return { db: newDb, missingGroup, modifiedGroup };
    }

    async compareDatabases(db1Buffer, db2Buffer, password1, password2, keyFile1Buffer, keyFile2Buffer) {
        const db1 = await this.loadDatabase(db1Buffer, password1, keyFile1Buffer, '1');
        const db2 = await this.loadDatabase(db2Buffer, password2, keyFile2Buffer, '2');
        let allDifferences = '';

        const credentials = await this.createCredentials(password1, keyFile1Buffer);
        const { db: diffDb, missingGroup, modifiedGroup } = await this.createDiffDatabase(credentials);
        const entries1 = db1.getDefaultGroup().entries;

        for (const entry of entries1) {
            const matchingEntry = this.findMatchingEntry(entry, db2);

            if (!matchingEntry) {
                const newEntry = diffDb.createEntry(missingGroup);
                Object.entries(entry.fields.toObject()).forEach(([key, value]) => {
                    newEntry.fields.set(key, value);
                });
                allDifferences += `Entry missing: ${entry.fields.get('Title')}\n`;
            } else {
                const differences = this.compareEntries(entry, matchingEntry);
                if (differences) {
                    let targetGroup = modifiedGroup;
                    if (matchingEntry.times.lastModTime) {
                        const dateStr = matchingEntry.times.lastModTime.toISOString().split('T')[0];
                        targetGroup = diffDb.getGroup([dateStr]) ||
                                    diffDb.createGroup(modifiedGroup, dateStr);
                    }

                    const diffEntry = diffDb.createEntry(targetGroup);
                    Object.entries(entry.fields.toObject()).forEach(([key, value]) => {
                        diffEntry.fields.set(key, value);
                    });
                    
                    diffEntry.fields.set('Notes', kdbxweb.ProtectedValue.fromString(
                        `Differences found:\n${JSON.stringify(differences, null, 2)}`
                    ));
                    
                    allDifferences += `Differences in ${entry.fields.get('Title')}: ${JSON.stringify(differences)}\n`;
                }
            }
        }

        const savedDiff = await diffDb.save();
        return { diffBuffer: savedDiff, diffString: allDifferences };
    }
}

module.exports = KdbxDiffAnalyzer;