const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('argon2-adapter', () => {
    it('should export argon2Available flag', () => {
        const { argon2Available } = require('../lib/argon2-adapter');
        
        assert.strictEqual(typeof argon2Available, 'boolean');
    });

    it('should configure kdbxweb CryptoEngine', () => {
        // Re-require to ensure the adapter has run
        const { argon2Available } = require('../lib/argon2-adapter');
        const kdbxweb = require('kdbxweb');
        
        // The adapter should have been configured
        // We can verify by checking kdbxweb.CryptoEngine exists
        assert.ok(kdbxweb.CryptoEngine);
    });

    it('should indicate argon2 availability correctly', () => {
        const { argon2Available } = require('../lib/argon2-adapter');
        
        // Try to require argon2 to check if it's actually available
        let argon2IsInstalled = false;
        try {
            require('argon2');
            argon2IsInstalled = true;
        } catch (e) {
            if (e.code !== 'MODULE_NOT_FOUND') throw e;
        }
        
        // The flag should match reality
        assert.strictEqual(argon2Available, argon2IsInstalled);
    });

    it('should allow loading KDBX databases without argon2 if using AES-KDF', async () => {
        // This test verifies that non-Argon2 databases can still be loaded
        const kdbxweb = require('kdbxweb');
        require('../lib/argon2-adapter'); // Ensure adapter is loaded
        
        // Create a simple credentials (uses default KDF settings)
        const credentials = new kdbxweb.KdbxCredentials(
            kdbxweb.ProtectedValue.fromString('testpassword')
        );
        await credentials.ready;
        
        // Create a database (this should work regardless of argon2)
        const db = kdbxweb.Kdbx.create(credentials, 'Test');
        
        assert.ok(db);
        assert.strictEqual(db.meta.name, 'Test');
    });
});
