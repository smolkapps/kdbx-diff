const { describe, it } = require('node:test');
const assert = require('node:assert');
const ImportEngine = require('../lib/ImportEngine');
const kdbxweb = require('kdbxweb');

// Mock entry factory
function createMockEntry(uuid, title, username, url, options = {}) {
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
        history: options.history || []
    };
}

// Mock database factory for source databases
function createMockSourceDb(entries, name = 'Source DB') {
    const defaultGroup = {
        name,
        groups: [],
        parentGroup: null,
        *allEntries() {
            for (const entry of entries) {
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
        _defaultGroup: defaultGroup,
        getDefaultGroup: function() { return this._defaultGroup; }
    };
}

// Mock database factory for target databases
function createMockTargetDb(entries, name = 'Target DB') {
    const importedEntries = [];
    const groups = [];
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

describe('ImportEngine', () => {
    describe('importEntries', () => {
        describe('mode: skip-existing', () => {
            it('should import only entries not in target', () => {
                const engine = new ImportEngine();
                
                const e1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://a.com');
                const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com');
                const e3 = createMockEntry('uuid-3', 'Entry 3', 'user3', 'https://c.com');
                
                // Source has e1, e2, e3
                const sourceDb = createMockSourceDb([e1, e2, e3]);
                
                // Target already has e2
                const targetEntry = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com');
                const targetDb = createMockTargetDb([targetEntry]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'skip-existing');
                
                // Should import e1 and e3, but not e2
                assert.strictEqual(result.imported, 2);
                assert.strictEqual(targetDb._imported.length, 2);
            });

            it('should import all entries when target is empty', () => {
                const engine = new ImportEngine();
                
                const e1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://a.com');
                const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com');
                
                const sourceDb = createMockSourceDb([e1, e2]);
                const targetDb = createMockTargetDb([]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'skip-existing');
                
                assert.strictEqual(result.imported, 2);
            });

            it('should import nothing when all entries exist', () => {
                const engine = new ImportEngine();
                
                const sourceE1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
                const targetE1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
                
                const sourceDb = createMockSourceDb([sourceE1]);
                const targetDb = createMockTargetDb([targetE1]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'skip-existing');
                
                assert.strictEqual(result.imported, 0);
            });
        });

        describe('mode: selected', () => {
            it('should import only selected UUIDs', () => {
                const engine = new ImportEngine();
                
                const e1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://a.com');
                const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com');
                const e3 = createMockEntry('uuid-3', 'Entry 3', 'user3', 'https://c.com');
                
                const sourceDb = createMockSourceDb([e1, e2, e3]);
                const targetDb = createMockTargetDb([]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'selected', ['uuid-1', 'uuid-3']);
                
                assert.strictEqual(result.imported, 2);
                
                // Verify correct entries were imported
                const importedUuids = targetDb._imported.map(e => e.uuid.id);
                assert.ok(importedUuids.includes('uuid-1'));
                assert.ok(importedUuids.includes('uuid-3'));
                assert.ok(!importedUuids.includes('uuid-2'));
            });

            it('should handle empty selection', () => {
                const engine = new ImportEngine();
                
                const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
                
                const sourceDb = createMockSourceDb([e1]);
                const targetDb = createMockTargetDb([]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'selected', []);
                
                assert.strictEqual(result.imported, 0);
            });

            it('should handle null selection', () => {
                const engine = new ImportEngine();
                
                const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
                
                const sourceDb = createMockSourceDb([e1]);
                const targetDb = createMockTargetDb([]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'selected', null);
                
                assert.strictEqual(result.imported, 0);
            });

            it('should skip non-existent UUIDs in selection', () => {
                const engine = new ImportEngine();
                
                const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
                
                const sourceDb = createMockSourceDb([e1]);
                const targetDb = createMockTargetDb([]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'selected', ['uuid-1', 'non-existent']);
                
                assert.strictEqual(result.imported, 1);
            });
        });

        describe('mode: all', () => {
            it('should import all entries from source', () => {
                const engine = new ImportEngine();
                
                const e1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://a.com');
                const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com');
                const e3 = createMockEntry('uuid-3', 'Entry 3', 'user3', 'https://c.com');
                
                const sourceDb = createMockSourceDb([e1, e2, e3]);
                const targetDb = createMockTargetDb([]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'all');
                
                assert.strictEqual(result.imported, 3);
                assert.strictEqual(targetDb._imported.length, 3);
            });

            it('should handle empty source database', () => {
                const engine = new ImportEngine();
                
                const sourceDb = createMockSourceDb([]);
                const targetDb = createMockTargetDb([]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'all');
                
                assert.strictEqual(result.imported, 0);
            });

            it('should import even if entry already exists (creates duplicate)', () => {
                const engine = new ImportEngine();
                
                const sourceE1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
                const targetE1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
                
                const sourceDb = createMockSourceDb([sourceE1]);
                const targetDb = createMockTargetDb([targetE1]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'all');
                
                // 'all' mode doesn't check for duplicates
                assert.strictEqual(result.imported, 1);
            });
        });

        describe('unknown mode', () => {
            it('should import nothing for unknown mode', () => {
                const engine = new ImportEngine();
                
                const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
                
                const sourceDb = createMockSourceDb([e1]);
                const targetDb = createMockTargetDb([]);
                
                const result = engine.importEntries(sourceDb, targetDb, 'invalid-mode');
                
                assert.strictEqual(result.imported, 0);
            });
        });
    });

    describe('_getTargetGroup', () => {
        it('should return default group for root-level entries', () => {
            const engine = new ImportEngine();
            
            const rootGroup = { name: 'Root', parentGroup: null };
            const entry = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { parentGroup: rootGroup });
            
            const targetDb = createMockTargetDb([], 'TargetDB');
            
            const targetGroup = engine._getTargetGroup(entry, targetDb);
            
            assert.strictEqual(targetGroup.name, 'TargetDB');
        });

        it('should preserve group structure for nested entries', () => {
            const engine = new ImportEngine();
            
            const rootGroup = { name: 'Root', parentGroup: null };
            const workGroup = { name: 'Work', parentGroup: rootGroup };
            const projectsGroup = { name: 'Projects', parentGroup: workGroup };
            
            const entry = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { parentGroup: projectsGroup });
            
            const targetDb = createMockTargetDb([], 'TargetDB');
            
            const targetGroup = engine._getTargetGroup(entry, targetDb);
            
            // Should create/return the Projects group
            assert.strictEqual(targetGroup.name, 'Projects');
        });

        it('should handle deeply nested groups', () => {
            const engine = new ImportEngine();
            
            const root = { name: 'Root', parentGroup: null };
            const level1 = { name: 'Level1', parentGroup: root };
            const level2 = { name: 'Level2', parentGroup: level1 };
            const level3 = { name: 'Level3', parentGroup: level2 };
            const level4 = { name: 'Level4', parentGroup: level3 };
            
            const entry = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { parentGroup: level4 });
            
            const targetDb = createMockTargetDb([], 'TargetDB');
            
            const targetGroup = engine._getTargetGroup(entry, targetDb);
            
            assert.strictEqual(targetGroup.name, 'Level4');
        });
    });

    describe('integration scenarios', () => {
        it('should preserve group paths during import', () => {
            const engine = new ImportEngine();
            
            const rootGroup = { name: 'Source', parentGroup: null };
            const workGroup = { name: 'Work', parentGroup: rootGroup };
            
            const e1 = createMockEntry('uuid-1', 'Work Entry', 'user', 'https://work.com', { parentGroup: workGroup });
            
            const sourceDb = createMockSourceDb([e1], 'Source');
            const targetDb = createMockTargetDb([], 'Target');
            
            const result = engine.importEntries(sourceDb, targetDb, 'all');
            
            assert.strictEqual(result.imported, 1);
            
            // Verify the imported entry was placed in the correct group
            const imported = targetDb._imported[0];
            assert.ok(imported._importedToGroup);
        });

        it('should handle mixed group levels', () => {
            const engine = new ImportEngine();
            
            const rootGroup = { name: 'Root', parentGroup: null };
            const workGroup = { name: 'Work', parentGroup: rootGroup };
            
            const e1 = createMockEntry('uuid-1', 'Root Entry', 'user1', 'https://root.com', { parentGroup: rootGroup });
            const e2 = createMockEntry('uuid-2', 'Work Entry', 'user2', 'https://work.com', { parentGroup: workGroup });
            
            const sourceDb = createMockSourceDb([e1, e2], 'Source');
            const targetDb = createMockTargetDb([], 'Target');
            
            const result = engine.importEntries(sourceDb, targetDb, 'all');
            
            assert.strictEqual(result.imported, 2);
        });
    });
});
