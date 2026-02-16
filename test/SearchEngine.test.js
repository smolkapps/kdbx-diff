const { describe, it } = require('node:test');
const assert = require('node:assert');
const SearchEngine = require('../lib/SearchEngine');
const kdbxweb = require('kdbxweb');

// Mock entry factory
function createMockEntry(uuid, title, username, url, options = {}) {
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
            lastModTime: options.lastModTime || new Date('2024-01-15'),
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
        })
    };
}

describe('SearchEngine', () => {
    describe('search', () => {
        it('should find entries matching title', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'GitHub Account', 'user1', 'https://github.com');
            const e2 = createMockEntry('uuid-2', 'Gmail', 'user2', 'https://gmail.com');
            const e3 = createMockEntry('uuid-3', 'Work Email', 'user3', 'https://work.com');
            
            const db1 = createMockDb([e1, e2]);
            const db2 = createMockDb([e3]);
            
            const result = engine.search(db1, db2, 'git');
            
            assert.strictEqual(result.db1Results.length, 1);
            assert.strictEqual(result.db1Results[0].uuid, 'uuid-1');
            assert.strictEqual(result.db2Results.length, 0);
        });

        it('should find entries matching username', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Site 1', 'john.doe@example.com', 'https://site1.com');
            const e2 = createMockEntry('uuid-2', 'Site 2', 'jane.smith@example.com', 'https://site2.com');
            
            const db1 = createMockDb([e1, e2]);
            
            const result = engine.search(db1, null, 'john.doe');
            
            assert.strictEqual(result.db1Results.length, 1);
            assert.strictEqual(result.db1Results[0].fields.UserName, 'john.doe@example.com');
        });

        it('should find entries matching URL', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'My Amazon', 'user1', 'https://amazon.com');
            const e2 = createMockEntry('uuid-2', 'My eBay', 'user2', 'https://ebay.com');
            
            const db1 = createMockDb([e1, e2]);
            
            const result = engine.search(db1, null, 'amazon');
            
            assert.strictEqual(result.db1Results.length, 1);
            assert.strictEqual(result.db1Results[0].fields.URL, 'https://amazon.com');
        });

        it('should be case-insensitive', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'GitHub', 'USER@Example.COM', 'https://GitHub.com');
            
            const db1 = createMockDb([e1]);
            
            const result1 = engine.search(db1, null, 'github');
            const result2 = engine.search(db1, null, 'GITHUB');
            const result3 = engine.search(db1, null, 'GiThUb');
            
            assert.strictEqual(result1.db1Results.length, 1);
            assert.strictEqual(result2.db1Results.length, 1);
            assert.strictEqual(result3.db1Results.length, 1);
        });

        it('should search in custom fields', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { notes: 'Important security note' });
            const e2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'https://test2.com', { notes: 'Normal entry' });
            
            const db1 = createMockDb([e1, e2]);
            
            const result = engine.search(db1, null, 'security', { fields: ['Notes'] });
            
            assert.strictEqual(result.db1Results.length, 1);
            assert.strictEqual(result.db1Results[0].uuid, 'uuid-1');
        });

        it('should return results from both databases', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Bank A', 'user1', 'https://banka.com');
            const e2 = createMockEntry('uuid-2', 'Bank B', 'user2', 'https://bankb.com');
            
            const db1 = createMockDb([e1]);
            const db2 = createMockDb([e2]);
            
            const result = engine.search(db1, db2, 'bank');
            
            assert.strictEqual(result.db1Results.length, 1);
            assert.strictEqual(result.db2Results.length, 1);
            assert.strictEqual(result.summary.totalCount, 2);
        });

        it('should handle null databases', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Test', 'user', 'https://test.com');
            const db1 = createMockDb([e1]);
            
            const result = engine.search(db1, null, 'test');
            
            assert.strictEqual(result.db1Results.length, 1);
            assert.strictEqual(result.db2Results.length, 0);
        });

        it('should limit results to 100', () => {
            const engine = new SearchEngine();
            
            const entries = [];
            for (let i = 0; i < 150; i++) {
                entries.push(createMockEntry(`uuid-${i}`, `Match Entry ${i}`, 'user', 'https://test.com'));
            }
            
            const db1 = createMockDb(entries);
            
            const result = engine.search(db1, null, 'match');
            
            assert.strictEqual(result.db1Results.length, 100);
        });

        it('should handle empty database', () => {
            const engine = new SearchEngine();
            const db1 = createMockDb([]);
            
            const result = engine.search(db1, null, 'anything');
            
            assert.strictEqual(result.db1Results.length, 0);
            assert.strictEqual(result.summary.db1Count, 0);
        });

        it('should match partial strings', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'MyCompanyIntranet', 'user', 'https://intranet.mycompany.com');
            
            const db1 = createMockDb([e1]);
            
            const result = engine.search(db1, null, 'comp');
            
            assert.strictEqual(result.db1Results.length, 1);
        });

        it('should return correct summary', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Test A', 'user1', 'https://a.com');
            const e2 = createMockEntry('uuid-2', 'Test B', 'user2', 'https://b.com');
            const e3 = createMockEntry('uuid-3', 'Test C', 'user3', 'https://c.com');
            
            const db1 = createMockDb([e1, e2]);
            const db2 = createMockDb([e3]);
            
            const result = engine.search(db1, db2, 'test');
            
            assert.strictEqual(result.summary.db1Count, 2);
            assert.strictEqual(result.summary.db2Count, 1);
            assert.strictEqual(result.summary.totalCount, 3);
        });
    });

    describe('findCounterpart', () => {
        it('should find counterpart by UUID', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'My Entry', 'user@example.com', 'https://test.com');
            const e2 = createMockEntry('uuid-1', 'My Entry', 'user@example.com', 'https://test.com');  // Same UUID
            
            const db1 = createMockDb([e1]);
            const db2 = createMockDb([e2]);
            
            const result = engine.findCounterpart(db1, db2, 'uuid-1');
            
            assert.ok(result.sourceEntry);
            assert.ok(result.counterpart);
            assert.strictEqual(result.matchMethod, 'uuid');
        });

        it('should fall back to title+username match', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'My Entry', 'user@example.com', 'https://test.com');
            const e2 = createMockEntry('uuid-2', 'My Entry', 'user@example.com', 'https://different.com');  // Different UUID, same Title+UserName
            
            const db1 = createMockDb([e1]);
            const db2 = createMockDb([e2]);
            
            const result = engine.findCounterpart(db1, db2, 'uuid-1');
            
            assert.ok(result.sourceEntry);
            assert.ok(result.counterpart);
            assert.strictEqual(result.matchMethod, 'title+username');
        });

        it('should return null counterpart when not found', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'My Entry', 'user@example.com', 'https://test.com');
            const e2 = createMockEntry('uuid-2', 'Different Entry', 'different@example.com', 'https://other.com');
            
            const db1 = createMockDb([e1]);
            const db2 = createMockDb([e2]);
            
            const result = engine.findCounterpart(db1, db2, 'uuid-1');
            
            assert.ok(result.sourceEntry);
            assert.strictEqual(result.counterpart, null);
            assert.strictEqual(result.matchMethod, null);
        });

        it('should return null source when UUID not found in source db', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
            
            const db1 = createMockDb([e1]);
            const db2 = createMockDb([]);
            
            const result = engine.findCounterpart(db1, db2, 'non-existent-uuid');
            
            assert.strictEqual(result.sourceEntry, null);
            assert.strictEqual(result.counterpart, null);
            assert.strictEqual(result.matchMethod, null);
        });

        it('should handle null target database', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com');
            const db1 = createMockDb([e1]);
            
            const result = engine.findCounterpart(db1, null, 'uuid-1');
            
            assert.ok(result.sourceEntry);
            assert.strictEqual(result.counterpart, null);
            assert.strictEqual(result.matchMethod, null);
        });

        it('should mask passwords by default', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { password: 'secret123' });
            const db1 = createMockDb([e1]);
            
            const result = engine.findCounterpart(db1, null, 'uuid-1');
            
            assert.strictEqual(result.sourceEntry.fields.Password, '********');
        });

        it('should expose passwords when showPasswords=true', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { password: 'secret123' });
            const e2 = createMockEntry('uuid-1', 'Entry', 'user', 'https://test.com', { password: 'secret456' });
            
            const db1 = createMockDb([e1]);
            const db2 = createMockDb([e2]);
            
            const result = engine.findCounterpart(db1, db2, 'uuid-1', { showPasswords: true });
            
            assert.strictEqual(result.sourceEntry.fields.Password, 'secret123');
            assert.strictEqual(result.counterpart.fields.Password, 'secret456');
        });

        it('should not match by title+username when both are empty', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', '', '', 'https://test.com');
            const e2 = createMockEntry('uuid-2', '', '', 'https://test.com');  // Different UUID, empty Title+UserName
            
            const db1 = createMockDb([e1]);
            const db2 = createMockDb([e2]);
            
            const result = engine.findCounterpart(db1, db2, 'uuid-1');
            
            // Should not match because title+username are both empty
            assert.strictEqual(result.counterpart, null);
        });

        it('should require exact title+username match', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'My Entry', 'user@example.com', 'https://test.com');
            const e2 = createMockEntry('uuid-2', 'My Entry', 'different@example.com', 'https://test.com');  // Different username
            
            const db1 = createMockDb([e1]);
            const db2 = createMockDb([e2]);
            
            const result = engine.findCounterpart(db1, db2, 'uuid-1');
            
            assert.strictEqual(result.counterpart, null);
        });
    });

    describe('_searchDb', () => {
        it('should search specified fields only', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'NotAMatch', 'searchterm@test.com', 'https://test.com');
            
            const db1 = createMockDb([e1]);
            
            // Search only in Title
            const result1 = engine.search(db1, null, 'searchterm', { fields: ['Title'] });
            assert.strictEqual(result1.db1Results.length, 0);
            
            // Search in UserName
            const result2 = engine.search(db1, null, 'searchterm', { fields: ['UserName'] });
            assert.strictEqual(result2.db1Results.length, 1);
        });

        it('should use default fields when not specified', () => {
            const engine = new SearchEngine();
            
            const e1 = createMockEntry('uuid-1', 'find-me', 'user', 'https://test.com', { notes: 'secret note' });
            
            const db1 = createMockDb([e1]);
            
            // Default fields are Title, UserName, URL - not Notes
            const result = engine.search(db1, null, 'secret');
            assert.strictEqual(result.db1Results.length, 0);
            
            // Search with Notes included
            const result2 = engine.search(db1, null, 'secret', { fields: ['Notes'] });
            assert.strictEqual(result2.db1Results.length, 1);
        });
    });
});
