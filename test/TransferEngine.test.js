const { describe, it } = require('node:test');
const assert = require('node:assert');
const TransferEngine = require('../lib/TransferEngine');
const kdbxweb = require('kdbxweb');

// Mock entry factory
function createMockEntry(uuid, title, username, url, options = {}) {
    let copiedFrom = null;
    const uuidObj = {
        id: uuid,
        toString: () => uuid,
        equals: function(other) {
            if (!other) return false;
            if (other.id) return other.id === uuid;
            if (typeof other === 'string') return other === uuid;
            if (typeof other.toString === 'function') return other.toString() === uuid;
            return false;
        }
    };
    return {
        uuid: uuidObj,
        fields: new Map([
            ['Title', title],
            ['UserName', username],
            ['URL', url],
            ['Password', options.password ? kdbxweb.ProtectedValue.fromString(options.password) : null],
            ['Notes', options.notes || '']
        ]),
        times: {
            creationTime: options.creationTime || new Date('2024-01-01'),
            lastModTime: options.lastModTime || new Date('2024-01-15'),
            lastAccessTime: options.lastAccessTime || new Date()
        },
        parentGroup: options.parentGroup || { name: 'Root', parentGroup: null },
        binaries: options.binaries || new Map(),
        history: options.history || [],
        copyFrom(source) {
            copiedFrom = source;
            this.fields = new Map(source.fields);
            this.times = { ...source.times };
        },
        _getCopiedFrom() { return copiedFrom; }
    };
}

// Mock database factory
function createMockDb(entries, name = 'Test DB') {
    const groups = [{ name, groups: [], parentGroup: null }];
    const importedEntries = [];
    const defaultGroup = {
        name,
        groups,
        parentGroup: null,
        *allEntries() {
            for (const entry of entries) {
                yield entry;
            }
            for (const entry of importedEntries) {
                yield entry;
            }
        }
    };
    
    return {
        meta: {
            recycleBinUuid: null,
            name
        },
        _entries: entries,
        _imported: importedEntries,
        _defaultGroup: defaultGroup,
        getDefaultGroup: function() { return this._defaultGroup; },
        importEntry(entry, targetGroup, sourceDb) {
            const imported = { ...entry, _importedToGroup: targetGroup };
            importedEntries.push(imported);
            return imported;
        },
        createGroup(parent, name) {
            const newGroup = { name, groups: [], parentGroup: parent };
            parent.groups.push(newGroup);
            return newGroup;
        }
    };
}

describe('TransferEngine', () => {
    describe('transfer', () => {
        it('should copy entry from db1 to db2', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://test.com');
            const db1 = createMockDb([e1], 'DB1');
            const db2 = createMockDb([], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-1', action: 'copy', direction: 'toDb2' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.copiedToDb2, 1);
            assert.strictEqual(result.copiedToDb1, 0);
            assert.strictEqual(result.overwritten, 0);
            assert.strictEqual(db2._imported.length, 1);
        });

        it('should copy entry from db2 to db1', () => {
            const engine = new TransferEngine();
            
            const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://test2.com');
            const db1 = createMockDb([], 'DB1');
            const db2 = createMockDb([e2], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-2', action: 'copy', direction: 'toDb1' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.copiedToDb1, 1);
            assert.strictEqual(result.copiedToDb2, 0);
            assert.strictEqual(db1._imported.length, 1);
        });

        it('should overwrite entry in db2 with db1 version', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Updated Title', 'user1', 'https://new.com');
            const e2 = createMockEntry('uuid-1', 'Old Title', 'user1', 'https://old.com');
            
            const db1 = createMockDb([e1], 'DB1');
            const db2 = createMockDb([e2], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-1', action: 'overwrite', direction: 'toDb2' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.overwritten, 1);
            // The target entry should have been updated via copyFrom
            assert.ok(e2._getCopiedFrom());
        });

        it('should overwrite entry in db1 with db2 version', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Old Title', 'user1', 'https://old.com');
            const e2 = createMockEntry('uuid-1', 'Updated Title', 'user1', 'https://new.com');
            
            const db1 = createMockDb([e1], 'DB1');
            const db2 = createMockDb([e2], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-1', action: 'overwrite', direction: 'toDb1' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.overwritten, 1);
            assert.ok(e1._getCopiedFrom());
        });

        it('should handle multiple transfers', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://a.com');
            const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com');
            const e3 = createMockEntry('uuid-3', 'Entry 3', 'user3', 'https://c.com');
            
            const db1 = createMockDb([e1, e3], 'DB1');
            const db2 = createMockDb([e2, e3], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-1', action: 'copy', direction: 'toDb2' },
                { uuid: 'uuid-2', action: 'copy', direction: 'toDb1' },
                { uuid: 'uuid-3', action: 'overwrite', direction: 'toDb2' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.copiedToDb1, 1);
            assert.strictEqual(result.copiedToDb2, 1);
            assert.strictEqual(result.overwritten, 1);
        });

        it('should skip non-existent entries for copy', () => {
            const engine = new TransferEngine();
            
            const db1 = createMockDb([], 'DB1');
            const db2 = createMockDb([], 'DB2');
            
            const transfers = [
                { uuid: 'non-existent', action: 'copy', direction: 'toDb2' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.copiedToDb2, 0);
        });

        it('should skip overwrite when source entry not found', () => {
            const engine = new TransferEngine();
            
            const e2 = createMockEntry('uuid-1', 'Target', 'user', 'https://test.com');
            
            const db1 = createMockDb([], 'DB1');
            const db2 = createMockDb([e2], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-1', action: 'overwrite', direction: 'toDb2' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.overwritten, 0);
        });

        it('should skip overwrite when target entry not found', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Source', 'user', 'https://test.com');
            
            const db1 = createMockDb([e1], 'DB1');
            const db2 = createMockDb([], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-1', action: 'overwrite', direction: 'toDb2' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.overwritten, 0);
        });

        it('should handle empty transfers array', () => {
            const engine = new TransferEngine();
            
            const db1 = createMockDb([], 'DB1');
            const db2 = createMockDb([], 'DB2');
            
            const result = engine.transfer(db1, db2, []);
            
            assert.strictEqual(result.copiedToDb1, 0);
            assert.strictEqual(result.copiedToDb2, 0);
            assert.strictEqual(result.overwritten, 0);
        });

        it('should ignore unknown actions', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
            const db1 = createMockDb([e1], 'DB1');
            const db2 = createMockDb([], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-1', action: 'delete', direction: 'toDb2' },
                { uuid: 'uuid-1', action: 'move', direction: 'toDb2' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            // Unknown actions should be silently ignored
            assert.strictEqual(result.copiedToDb1, 0);
            assert.strictEqual(result.copiedToDb2, 0);
            assert.strictEqual(result.overwritten, 0);
        });

        it('should ignore unknown directions', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
            const db1 = createMockDb([e1], 'DB1');
            const db2 = createMockDb([], 'DB2');
            
            const transfers = [
                { uuid: 'uuid-1', action: 'copy', direction: 'toDb3' },
                { uuid: 'uuid-1', action: 'copy', direction: 'fromDb1' }
            ];
            
            const result = engine.transfer(db1, db2, transfers);
            
            assert.strictEqual(result.copiedToDb1, 0);
            assert.strictEqual(result.copiedToDb2, 0);
        });
    });

    describe('_getTargetGroup', () => {
        it('should return default group for entries in root', () => {
            const engine = new TransferEngine();
            
            const rootGroup = { name: 'Root', parentGroup: null };
            const entry = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { parentGroup: rootGroup });
            
            const db = createMockDb([], 'TargetDB');
            
            const targetGroup = engine._getTargetGroup(entry, db);
            
            // Should return the default group
            assert.strictEqual(targetGroup.name, 'TargetDB');
        });

        it('should create group path for nested entries', () => {
            const engine = new TransferEngine();
            
            const rootGroup = { name: 'Root', parentGroup: null };
            const workGroup = { name: 'Work', parentGroup: rootGroup };
            const projectsGroup = { name: 'Projects', parentGroup: workGroup };
            
            const entry = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { parentGroup: projectsGroup });
            
            const db = createMockDb([], 'TargetDB');
            
            const targetGroup = engine._getTargetGroup(entry, db);
            
            // Should have created the nested group structure
            assert.strictEqual(targetGroup.name, 'Projects');
        });
    });

    describe('_findByUuid', () => {
        it('should find entry by UUID in database', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://a.com');
            const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com');
            
            const db = createMockDb([e1, e2], 'TestDB');
            
            const found = engine._findByUuid(db, 'uuid-2');
            
            assert.ok(found);
            assert.strictEqual(found.fields.get('Title'), 'Entry 2');
        });

        it('should return null for non-existent UUID', () => {
            const engine = new TransferEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
            const db = createMockDb([e1], 'TestDB');
            
            const found = engine._findByUuid(db, 'non-existent');
            
            assert.strictEqual(found, null);
        });
    });
});
