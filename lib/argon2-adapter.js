const kdbxweb = require('kdbxweb');

let argon2Available = false;

try {
    const argon2 = require('argon2');
    argon2Available = true;

    // kdbxweb expects: (password, salt, memory, iterations, length, parallelism, type, version) => Promise<ArrayBuffer>
    // argon2 npm module uses: argon2.hash(plain, { salt, memoryCost, timeCost, hashLength, parallelism, type, version, raw })
    kdbxweb.CryptoEngine.setArgon2Impl(
        (password, salt, memory, iterations, length, parallelism, type, version) => {
            return argon2.hash(Buffer.from(password), {
                salt: Buffer.from(salt),
                memoryCost: memory,
                timeCost: iterations,
                hashLength: length,
                parallelism,
                type,
                version,
                raw: true
            }).then(hash => hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength));
        }
    );
} catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
        throw e;
    }
    console.warn('argon2 not installed — KDBX4 databases with Argon2 KDF will fail to open.');
}

module.exports = { argon2Available };
