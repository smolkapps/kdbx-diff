const { describe, it } = require('node:test');
const assert = require('node:assert');
const DuplicateFinder = require('../lib/DuplicateFinder');
const kdbxweb = require('kdbxweb');

// Mock entry factory
function createMockEntry(uuid, title, username, url, modTime = new Date(), options = {}) {
    return {
        uuid: {
            id: uuid,
            toString: () => uuid,
            equals: (other) => other.id === uuid
        },
        fields: new Map([
            ['Title', title],
            ['UserName', username],
            ['URL', url],
            ['Password', options.password ? kdbxweb.ProtectedValue.fromString(options.password) : null],
            ['Notes', options.notes || '']
        ]),
        times: {
            creationTime: options.creationTime || new Date('2024-01-01'),
            lastModTime: modTime,
            lastAccessTime: options.lastAccessTime || new Date()
        },
        parentGroup: options.parentGroup || null,
        binaries: options.binaries || new Map(),
        history: options.history || []
    };
}

// Mock database
function createMockDb(entries) {
    return {
        meta: {
            recycleBinUuid: null
        },
        getDefaultGroup: () => ({
            *allEntries() {
                for (const entry of entries) {
                    yield entry;
                }
            }
        }),
        remove(entry) {
            const idx = entries.indexOf(entry);
            if (idx >= 0) entries.splice(idx, 1);
        }
    };
}

describe('DuplicateFinder', () => {
    describe('findDuplicates', () => {
        it('should find duplicates by username+url (default)', () => {
            const finder = new DuplicateFinder();
            
            const e1 = createMockEntry('uuid-1', 'Entry 1', 'user@example.com', 'https://example.com', new Date('2024-01-15'));
            const e2 = createMockEntry('uuid-2', 'Entry 1 Copy', 'user@example.com', 'https://example.com', new Date('2024-01-20'));
            const e3 = createMockEntry('uuid-3', 'Different', 'other@example.com', 'https://example.com', new Date('2024-01-10'));
            
            const db = createMockDb([e1, e2, e3]);
            const result = finder.findDuplicates(db);
            
            assert.strictEqual(result.groups.length, 1);
            assert.strictEqual(result.groups[0].entries.length, 2);
            assert.strictEqual(result.summary.totalGroups, 1);
            assert.strictEqual(result.summary.totalDuplicates, 1); // One duplicate to remove
        });

        it('should find duplicates by title+username', () => {
            const finder = new DuplicateFinder();
            
            const e1 = createMockEntry('uuid-1', 'My Login', 'user@example.com', 'https://site1.com', new Date('2024-01-15'));
            const e2 = createMockEntry('uuid-2', 'My Login', 'user@example.com', 'https://site2.com', new Date('2024-01-20'));
            const e3 = createMockEntry('uuid-3', 'Different Login', 'user@example.com', 'https://site3.com', new Date('2024-01-10'));
            
            const db = createMockDb([e1, e2, e3]);
            const result = finder.findDuplicates(db, 'title+username');
            
            assert.strictEqual(result.groups.length, 1);
            assert.strictEqual(result.groups[0].entries.length, 2);
        });

        it('should sort duplicates by lastModTime (newest first)', () => {
            const finder = new DuplicateFinder();
            
            const oldTime = new Date('2024-01-01');
            const newTime = new Date('2024-02-01');
            
            const e1 = createMockEntry('uuid-1', 'Same', 'user', 'https://same.com', oldTime);
            const e2 = createMockEntry('uuid-2', 'Same Copy', 'user', 'https://same.com', newTime);
            
            const db = createMockDb([e1, e2]);
            const result = finder.findDuplicates(db);
            
            // Newest should be first and suggested to keep
            assert.strictEqual(result.groups[0].entries[0].uuid, 'uuid-2');
            assert.strictEqual(result.groups[0].entries[0].suggested, 'keep');
            assert.strictEqual(result.groups[0].entries[1].uuid, 'uuid-1');
            assert.strictEqual(result.groups[0].entries[1].suggested, 'remove');
        });

        it('should not group entries with different keys', () => {
            const finder = new DuplicateFinder();
            
            const e1 = createMockEntry('uuid-1', 'Entry 1', 'user1@example.com', 'https://example.com');
            const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2@example.com', 'https://example.com');
            const e3 = createMockEntry('uuid-3', 'Entry 3', 'user3@example.com', 'https://different.com');
            
            const db = createMockDb([e1, e2, e3]);
            const result = finder.findDuplicates(db);
            
            // No duplicates since all username+url combinations are unique
            assert.strictEqual(result.groups.length, 0);
        });

        it('should skip entries with empty key fields', () => {
            const finder = new DuplicateFinder();
            
            const e1 = createMockEntry('uuid-1', '', '', '');  // Empty key
            const e2 = createMockEntry('uuid-2', '', '', '');  // Empty key
            const e3 = createMockEntry('uuid-3', 'Entry', 'user', 'https://example.com');
            
            const db = createMockDb([e1, e2, e3]);
            const result = finder.findDuplicates(db);
            
            // Empty key entries should be skipped, not grouped
            assert.strictEqual(result.groups.length, 0);
        });

        it('should return correct summary', () => {
            const finder = new DuplicateFinder();
            
            // Group 1: 3 entries with same username+url (2 duplicates)
            const e1 = createMockEntry('uuid-1', 'A', 'a@test.com', 'https://test.com', new Date('2024-01-01'));
            const e2 = createMockEntry('uuid-2', 'B', 'a@test.com', 'https://test.com', new Date('2024-01-02'));
            const e3 = createMockEntry('uuid-3', 'C', 'a@test.com', 'https://test.com', new Date('2024-01-03'));
            
            // Group 2: 2 entries with same username+url (1 duplicate)
            const e4 = createMockEntry('uuid-4', 'X', 'x@test.com', 'https://x.com', new Date('2024-01-01'));
            const e5 = createMockEntry('uuid-5', 'Y', 'x@test.com', 'https://x.com', new Date('2024-01-02'));
            
            // Unique entry
            const e6 = createMockEntry('uuid-6', 'Unique', 'unique@test.com', 'https://unique.com');
            
            const db = createMockDb([e1, e2, e3, e4, e5, e6]);
            const result = finder.findDuplicates(db);
            
            assert.strictEqual(result.summary.totalGroups, 2);
            assert.strictEqual(result.summary.totalDuplicates, 3); // 2 + 1
        });

        it('should handle empty database', () => {
            const finder = new DuplicateFinder();
            const db = createMockDb([]);
            const result = finder.findDuplicates(db);
            
            assert.strictEqual(result.groups.length, 0);
            assert.strictEqual(result.summary.totalGroups, 0);
            assert.strictEqual(result.summary.totalDuplicates, 0);
        });

        it('should handle database with single entry', () => {
            const finder = new DuplicateFinder();
            const e1 = createMockEntry('uuid-1', 'Single', 'user', 'https://single.com');
            const db = createMockDb([e1]);
            const result = finder.findDuplicates(db);
            
            assert.strictEqual(result.groups.length, 0);
        });

        it('should be case-insensitive for keys', () => {
            const finder = new DuplicateFinder();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'User@Example.com', 'HTTPS://EXAMPLE.COM');
            const e2 = createMockEntry('uuid-2', 'Entry', 'user@example.com', 'https://example.com');
            
            const db = createMockDb([e1, e2]);
            const result = finder.findDuplicates(db);
            
            // Should be treated as duplicates due to lowercase comparison
            assert.strictEqual(result.groups.length, 1);
        });

        it('should handle entries with null lastModTime', () => {
            const finder = new DuplicateFinder();
            
            const e1 = createMockEntry('uuid-1', 'A', 'user', 'https://test.com', null);
            const e2 = createMockEntry('uuid-2', 'B', 'user', 'https://test.com', new Date('2024-01-01'));
            
            const db = createMockDb([e1, e2]);
            
            // Should not throw
            const result = finder.findDuplicates(db);
            assert.strictEqual(result.groups.length, 1);
        });
    });

    describe('removeEntries', () => {
        it('should remove entries by UUID', () => {
            const finder = new DuplicateFinder();
            
            const entries = [
                createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://a.com'),
                createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com'),
                createMockEntry('uuid-3', 'Entry 3', 'user3', 'https://c.com')
            ];
            
            const db = createMockDb(entries);
            
            // Mock findEntryByUuid to return entries from our array
            finder.kdbxService.findEntryByUuid = (database, uuid) => {
                return entries.find(e => e.uuid.id === uuid || e.uuid.toString() === uuid);
            };
            
            // Override remove to use our mock
            db.remove = (entry) => {
                const idx = entries.findIndex(e => e.uuid.id === entry.uuid.id);
                if (idx >= 0) entries.splice(idx, 1);
            };
            
            const result = finder.removeEntries(db, ['uuid-1', 'uuid-3']);
            
            assert.strictEqual(result.removed, 2);
            assert.strictEqual(entries.length, 1);
            assert.strictEqual(entries[0].uuid.id, 'uuid-2');
        });

        it('should return 0 for non-existent UUIDs', () => {
            const finder = new DuplicateFinder();
            const db = createMockDb([]);
            
            // Mock findEntryByUuid to return null
            finder.kdbxService.findEntryByUuid = () => null;
            
            const result = finder.removeEntries(db, ['non-existent-uuid']);
            
            assert.strictEqual(result.removed, 0);
        });

        it('should handle empty UUID list', () => {
            const finder = new DuplicateFinder();
            const db = createMockDb([createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com')]);
            
            const result = finder.removeEntries(db, []);
            
            assert.strictEqual(result.removed, 0);
        });

        it('should handle mixed valid and invalid UUIDs', () => {
            const finder = new DuplicateFinder();
            
            const entries = [
                createMockEntry('uuid-1', 'Entry 1', 'user1', 'https://a.com'),
                createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://b.com')
            ];
            
            const db = createMockDb(entries);
            
            finder.kdbxService.findEntryByUuid = (database, uuid) => {
                return entries.find(e => e.uuid.id === uuid || e.uuid.toString() === uuid);
            };
            
            db.remove = (entry) => {
                const idx = entries.findIndex(e => e.uuid.id === entry.uuid.id);
                if (idx >= 0) entries.splice(idx, 1);
            };
            
            const result = finder.removeEntries(db, ['uuid-1', 'invalid-uuid', 'uuid-2']);
            
            assert.strictEqual(result.removed, 2);
        });
    });

    describe('_buildKey', () => {
        it('should build username+url key', () => {
            const finder = new DuplicateFinder();
            const entry = createMockEntry('uuid', 'Title', 'USER@Example.com', 'HTTPS://Example.com');
            
            const key = finder._buildKey(entry, 'username+url');
            
            assert.strictEqual(key, 'user@example.com|example.com');
        });

        it('should build title+username key', () => {
            const finder = new DuplicateFinder();
            const entry = createMockEntry('uuid', 'My Title', 'user@example.com', 'https://test.com');
            
            const key = finder._buildKey(entry, 'title+username');
            
            assert.strictEqual(key, 'my title|user@example.com');
        });

        it('should return null for empty fields with username+url', () => {
            const finder = new DuplicateFinder();
            const entry = createMockEntry('uuid', 'Title', '', '');
            
            const key = finder._buildKey(entry, 'username+url');
            
            assert.strictEqual(key, null);
        });

        it('should return null for empty fields with title+username', () => {
            const finder = new DuplicateFinder();
            const entry = createMockEntry('uuid', '', '', 'https://test.com');
            
            const key = finder._buildKey(entry, 'title+username');
            
            assert.strictEqual(key, null);
        });

        it('should return null for unknown criteria', () => {
            const finder = new DuplicateFinder();
            const entry = createMockEntry('uuid', 'Title', 'user', 'https://test.com');
            
            const key = finder._buildKey(entry, 'unknown');
            
            assert.strictEqual(key, null);
        });

        it('should return null when username is empty for username+url', () => {
            const finder = new DuplicateFinder();
            const entry = createMockEntry('uuid', '', '', 'https://test.com');

            const key = finder._buildKey(entry, 'username+url');

            // Both username and url are required to avoid false matches
            assert.strictEqual(key, null);
        });
    });
});
