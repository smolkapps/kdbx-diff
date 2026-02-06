const kdbxweb = require('kdbxweb');
require('./argon2-adapter'); // configures CryptoEngine on import
const { nodeBufferToArrayBuffer } = require('./utils');

class KdbxService {
    async createCredentials(password, keyFileBuffer) {
        const hasPassword = password != null && password !== undefined;
        const passwordPart = hasPassword
            ? kdbxweb.ProtectedValue.fromString(password)
            : null;

        const keyFilePart = keyFileBuffer
            ? nodeBufferToArrayBuffer(keyFileBuffer)
            : null;

        if (!passwordPart && !keyFilePart) {
            throw new Error('Either password or key file must be provided');
        }

        const credentials = new kdbxweb.KdbxCredentials(passwordPart, keyFilePart);
        await credentials.ready;
        return credentials;
    }

    async loadDatabase(fileBuffer, password, keyFileBuffer) {
        const credentials = await this.createCredentials(password, keyFileBuffer);
        const arrayBuffer = Buffer.isBuffer(fileBuffer)
            ? nodeBufferToArrayBuffer(fileBuffer)
            : fileBuffer;
        return kdbxweb.Kdbx.load(arrayBuffer, credentials);
    }

    async saveDatabase(db) {
        return db.save();
    }

    createDatabase(credentials, name = 'KDBX Diff') {
        return kdbxweb.Kdbx.create(credentials, name);
    }

    getAllEntries(db, { includeRecycleBin = false } = {}) {
        const recycleBinUuid = db.meta.recycleBinUuid;
        const entries = [];

        for (const entry of db.getDefaultGroup().allEntries()) {
            if (!includeRecycleBin && recycleBinUuid) {
                if (this._isInRecycleBin(entry, recycleBinUuid)) continue;
            }
            entries.push(entry);
        }

        return entries;
    }

    findEntryByUuid(db, uuid, { includeRecycleBin = false } = {}) {
        for (const entry of this.getAllEntries(db, { includeRecycleBin })) {
            if (entry.uuid.equals(uuid)) return entry;
        }
        return null;
    }

    _isInRecycleBin(entry, recycleBinUuid) {
        let group = entry.parentGroup;
        while (group) {
            if (group.uuid && group.uuid.equals(recycleBinUuid)) return true;
            group = group.parentGroup;
        }
        return false;
    }
}

module.exports = KdbxService;
