const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const KdbxService = require('../lib/KdbxService');
const kdbxweb = require('kdbxweb');

// Helper to create a valid in-memory KDBX database for testing
async function createTestDatabase(password = 'testpass', name = 'Test DB') {
    const credentials = new kdbxweb.KdbxCredentials(
        kdbxweb.ProtectedValue.fromString(password)
    );
    await credentials.ready;
    return kdbxweb.Kdbx.create(credentials, name);
}

// Helper to create a mock entry in a database
function addEntryToDb(db, title, username, password, groupPath = null) {
    let targetGroup = db.getDefaultGroup();
    
    if (groupPath && groupPath.length > 0) {
        // Create nested groups if needed
        for (const groupName of groupPath) {
            let found = null;
            if (targetGroup.groups) {
                for (const g of targetGroup.groups) {
                    if (g.name === groupName) {
                        found = g;
                        break;
                    }
                }
            }
            if (!found) {
                found = db.createGroup(targetGroup, groupName);
            }
            targetGroup = found;
        }
    }
    
    const entry = db.createEntry(targetGroup);
    entry.fields.set('Title', title);
    entry.fields.set('UserName', username);
    entry.fields.set('Password', kdbxweb.ProtectedValue.fromString(password));
    return entry;
}

describe('KdbxService', () => {
    let service;

    beforeEach(() => {
        service = new KdbxService();
    });

    describe('createCredentials', () => {
        it('should create credentials with password only', async () => {
            const credentials = await service.createCredentials('testpassword', null);
            assert.ok(credentials);
            assert.ok(credentials instanceof kdbxweb.KdbxCredentials);
        });

        it('should create credentials with empty string password', async () => {
            const credentials = await service.createCredentials('', null);
            // Empty string password should work (it's a valid "empty" password)
            assert.ok(credentials);
        });

        it('should create credentials with key file buffer', async () => {
            // Create a simple key file buffer (any 32+ bytes will work as a key)
            const keyFileBuffer = Buffer.alloc(64, 0xAB);
            const credentials = await service.createCredentials(null, keyFileBuffer);
            assert.ok(credentials);
        });

        it('should create credentials with both password and key file', async () => {
            const keyFileBuffer = Buffer.alloc(64, 0xCD);
            const credentials = await service.createCredentials('mypassword', keyFileBuffer);
            assert.ok(credentials);
        });

        it('should throw when neither password nor key file provided', async () => {
            await assert.rejects(
                async () => await service.createCredentials(null, null),
                { message: 'Either password or key file must be provided' }
            );
        });

        it('should throw when both password and key file are undefined', async () => {
            await assert.rejects(
                async () => await service.createCredentials(undefined, undefined),
                { message: 'Either password or key file must be provided' }
            );
        });
    });

    describe('loadDatabase', () => {
        it('should load a valid KDBX database from buffer', async () => {
            // Create a database and save it to buffer
            const originalDb = await createTestDatabase('loadtest123');
            addEntryToDb(originalDb, 'Test Entry', 'user@example.com', 'secret');
            
            const savedBuffer = await originalDb.save();
            const nodeBuffer = Buffer.from(savedBuffer);
            
            // Load it back
            const loadedDb = await service.loadDatabase(nodeBuffer, 'loadtest123', null);
            
            assert.ok(loadedDb);
            const entries = service.getAllEntries(loadedDb);
            assert.strictEqual(entries.length, 1);
        });

        it('should fail to load with wrong password', async () => {
            const originalDb = await createTestDatabase('correctpassword');
            const savedBuffer = await originalDb.save();
            const nodeBuffer = Buffer.from(savedBuffer);
            
            await assert.rejects(
                async () => await service.loadDatabase(nodeBuffer, 'wrongpassword', null),
                // kdbxweb throws an error on invalid credentials
                /Invalid key|File is corrupted|Error/
            );
        });

        it('should fail to load corrupted data', async () => {
            const corruptedBuffer = Buffer.from('not a valid kdbx file data');
            
            await assert.rejects(
                async () => await service.loadDatabase(corruptedBuffer, 'anypassword', null),
                // kdbxweb throws on invalid file signature
                /signature|corrupted|invalid|Error/i
            );
        });

        it('should handle ArrayBuffer input', async () => {
            const originalDb = await createTestDatabase('arraytest');
            const savedBuffer = await originalDb.save();
            
            // Pass ArrayBuffer directly
            const loadedDb = await service.loadDatabase(savedBuffer, 'arraytest', null);
            assert.ok(loadedDb);
        });
    });

    describe('saveDatabase', () => {
        it('should save database to ArrayBuffer', async () => {
            const db = await createTestDatabase('savetest');
            addEntryToDb(db, 'Entry 1', 'user1', 'pass1');
            
            const savedBuffer = await service.saveDatabase(db);
            
            assert.ok(savedBuffer instanceof ArrayBuffer);
            assert.ok(savedBuffer.byteLength > 0);
        });

        it('should produce loadable output', async () => {
            const db = await createTestDatabase('roundtrip');
            addEntryToDb(db, 'Roundtrip Entry', 'ruser', 'rpass');
            
            const savedBuffer = await service.saveDatabase(db);
            const loadedDb = await service.loadDatabase(Buffer.from(savedBuffer), 'roundtrip', null);
            
            const entries = service.getAllEntries(loadedDb);
            assert.strictEqual(entries.length, 1);
        });
    });

    describe('createDatabase', () => {
        it('should create a new database with given credentials', async () => {
            const credentials = await service.createCredentials('newdb', null);
            const db = service.createDatabase(credentials, 'My New DB');
            
            assert.ok(db);
            assert.strictEqual(db.meta.name, 'My New DB');
        });

        it('should use default name if not provided', async () => {
            const credentials = await service.createCredentials('newdb', null);
            const db = service.createDatabase(credentials);
            
            assert.strictEqual(db.meta.name, 'KDBX Diff');
        });
    });

    describe('getAllEntries', () => {
        it('should return all entries in database', async () => {
            const db = await createTestDatabase();
            addEntryToDb(db, 'Entry 1', 'user1', 'pass1');
            addEntryToDb(db, 'Entry 2', 'user2', 'pass2');
            addEntryToDb(db, 'Entry 3', 'user3', 'pass3');
            
            const entries = service.getAllEntries(db);
            
            assert.strictEqual(entries.length, 3);
        });

        it('should return empty array for empty database', async () => {
            const db = await createTestDatabase();
            const entries = service.getAllEntries(db);
            
            assert.strictEqual(entries.length, 0);
        });

        it('should exclude recycle bin entries by default', async () => {
            const db = await createTestDatabase();
            const entry1 = addEntryToDb(db, 'Active Entry', 'user1', 'pass1');
            const entry2 = addEntryToDb(db, 'To Delete', 'user2', 'pass2');
            
            // Move entry2 to recycle bin
            db.remove(entry2);
            
            const entries = service.getAllEntries(db);
            
            // Only entry1 should be returned
            assert.strictEqual(entries.length, 1);
            assert.ok(entries[0].fields.get('Title') === 'Active Entry');
        });

        it('should include recycle bin entries when option is set', async () => {
            const db = await createTestDatabase();
            addEntryToDb(db, 'Active Entry', 'user1', 'pass1');
            const entry2 = addEntryToDb(db, 'Deleted Entry', 'user2', 'pass2');
            
            db.remove(entry2);
            
            const entriesWithRecycle = service.getAllEntries(db, { includeRecycleBin: true });
            
            // Both should be returned
            assert.strictEqual(entriesWithRecycle.length, 2);
        });

        it('should get entries from nested groups', async () => {
            const db = await createTestDatabase();
            addEntryToDb(db, 'Root Entry', 'root', 'pass');
            addEntryToDb(db, 'Work Entry', 'work', 'pass', ['Work']);
            addEntryToDb(db, 'Nested Entry', 'nested', 'pass', ['Work', 'Projects']);
            
            const entries = service.getAllEntries(db);
            
            assert.strictEqual(entries.length, 3);
        });
    });

    describe('findEntryByUuid', () => {
        it('should find entry by UUID', async () => {
            const db = await createTestDatabase();
            const entry = addEntryToDb(db, 'Find Me', 'finduser', 'findpass');
            const uuid = entry.uuid;
            
            const found = service.findEntryByUuid(db, uuid);
            
            assert.ok(found);
            assert.strictEqual(found.fields.get('Title'), 'Find Me');
        });

        it('should return null for non-existent UUID', async () => {
            const db = await createTestDatabase();
            addEntryToDb(db, 'Other Entry', 'user', 'pass');
            
            const fakeUuid = kdbxweb.KdbxUuid.random();
            const found = service.findEntryByUuid(db, fakeUuid);
            
            assert.strictEqual(found, null);
        });

        it('should not find entry in recycle bin by default', async () => {
            const db = await createTestDatabase();
            const entry = addEntryToDb(db, 'Deleted Entry', 'user', 'pass');
            const uuid = entry.uuid;
            
            db.remove(entry);
            
            const found = service.findEntryByUuid(db, uuid);
            assert.strictEqual(found, null);
        });

        it('should find entry in recycle bin when option is set', async () => {
            const db = await createTestDatabase();
            const entry = addEntryToDb(db, 'Deleted Entry', 'user', 'pass');
            const uuid = entry.uuid;
            
            db.remove(entry);
            
            const found = service.findEntryByUuid(db, uuid, { includeRecycleBin: true });
            assert.ok(found);
            assert.strictEqual(found.fields.get('Title'), 'Deleted Entry');
        });
    });

    describe('_isInRecycleBin', () => {
        it('should return true for entry in recycle bin', async () => {
            const db = await createTestDatabase();
            const entry = addEntryToDb(db, 'To Delete', 'user', 'pass');
            
            db.remove(entry);
            
            // Get the entry from recycle bin
            const recycleBinUuid = db.meta.recycleBinUuid;
            assert.ok(recycleBinUuid);
            
            const isInBin = service._isInRecycleBin(entry, recycleBinUuid);
            assert.strictEqual(isInBin, true);
        });

        it('should return false for entry not in recycle bin', async () => {
            const db = await createTestDatabase();
            const entry = addEntryToDb(db, 'Active Entry', 'user', 'pass');
            
            // Create a fake recycle bin UUID
            const fakeRecycleBinUuid = kdbxweb.KdbxUuid.random();
            
            const isInBin = service._isInRecycleBin(entry, fakeRecycleBinUuid);
            assert.strictEqual(isInBin, false);
        });

        it('should return false when entry has no parent group', async () => {
            const mockEntry = { parentGroup: null };
            const fakeRecycleBinUuid = kdbxweb.KdbxUuid.random();
            
            const isInBin = service._isInRecycleBin(mockEntry, fakeRecycleBinUuid);
            assert.strictEqual(isInBin, false);
        });
    });
});
