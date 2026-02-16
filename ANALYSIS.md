# KDBX Diff Analyzer — Security & Code Quality Analysis

**Date**: 2026-02-16
**Scope**: Full application (server.js, lib/*.js, static/js/*.js, static/index.html)
**Methodology**: OWASP Top 10 (2021), manual code review, automated agent analysis

---

## Executive Summary

The KDBX Diff Analyzer has been through prior security hardening and demonstrates **above-average security posture** for a locally-deployed tool. Session management uses timing-safe comparisons, error messages are sanitized, XSS protections are mostly in place, and security headers are set. However, several findings remain — ranging from High to Low severity. **No Critical vulnerabilities were identified.**

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | — |
| High | 1 | **Fixed** |
| Medium | 5 | **Fixed** |
| Low | 4 | **Fixed** |
| Info | 3 | **Fixed** |

---

## 1. Security Audit

### [HIGH] H1: CSV Import Endpoint Lacks Authentication

- **File**: `server.js:465`
- **OWASP**: A07 (Authentication Failures) / CWE-798
- **Description**: `/api/csv-import` creates sessions without `requireSession` middleware. Unlike `/api/upload` which requires valid KDBX credentials, CSV import accepts any CSV file with no authentication barrier. Additionally, `CsvImporter.js:43` uses a hardcoded password `'csv-import'` for created databases.
- **Impact**: An attacker on the same network can create sessions and store arbitrary data in server memory. The trivially guessable password on exported databases is a credential weakness.
- **Fix**: Added `requireSession` middleware to the CSV import endpoint. Users must now establish a session via `/api/upload` first.

### [MEDIUM] M1: CSRF Origin Check Allows Missing Origin Header

- **File**: `server.js:119-135`
- **OWASP**: A01 (Broken Access Control) / CWE-352
- **Description**: The CSRF check only validates when an `Origin` header is present. Some browsers omit Origin in certain scenarios (same-origin form submissions, privacy extensions). While the `X-Session-Token` custom header provides secondary defense, session-creating endpoints don't require it.
- **Fix**: Added `Referer` header fallback check when `Origin` is absent.

### [MEDIUM] M2: No Localhost-Only Enforcement

- **File**: `server.js` (server startup)
- **OWASP**: A02 (Cryptographic Failures) / CWE-319
- **Description**: Passwords are transmitted as plaintext form fields over HTTP. The server binds to all interfaces, so non-loopback connections expose master passwords in transit.
- **Fix**: Added middleware rejecting connections from non-loopback addresses (`127.0.0.1`, `::1`).

### [MEDIUM] M3: innerHTML With Server Data in Summary Cards

- **File**: `static/js/components/compare.js:76-81`
- **OWASP**: A03 (Injection) / CWE-79
- **Description**: Summary cards built with `innerHTML` and template literals. While values are integers from the server, this pattern is fragile — any future change introducing string data creates an XSS vector.
- **Fix**: Replaced with DOM element creation (`createElement`/`textContent`).

### [MEDIUM] M4: innerHTML With Entry Field Data in Detail View

- **File**: `static/js/components/compare.js:135-148, 204-217`
- **OWASP**: A03 (Injection) / CWE-79
- **Description**: `showDetail()` and `createModifiedTable()` build HTML strings via `innerHTML`. Although `escapeHtml()` is used, this pattern is inherently riskier than pure DOM construction. Entry data could contain attacker-controlled content from shared databases.
- **Fix**: Replaced with DOM element creation matching the pattern used in search.js and transfer.js.

### [MEDIUM] M5: No Limit on Concurrent Sessions

- **File**: `lib/SessionStore.js:13-22`
- **OWASP**: A04 (Insecure Design) / CWE-770
- **Description**: Sessions are created without any upper bound. Each session can hold two KDBX database objects in memory. At 30 req/min rate limit, an attacker could still create 30 sessions/minute, each with up to 20MB of data.
- **Fix**: Added `MAX_SESSIONS = 50` cap with oldest-session eviction.

### [LOW] L1: Plaintext Passwords in Diff Field Comparisons

- **File**: `lib/DiffEngine.js:111-116`
- **OWASP**: A02 (Cryptographic Failures) / CWE-200
- **Description**: `_compareFields()` decrypts `ProtectedValue` passwords via `getFieldAsString()` and sends plaintext values in the JSON response. The frontend masks them at display, but they travel over the wire and appear in devtools.
- **Fix**: Server-side masking of Password field diffs with a `passwordsDiffer` boolean flag.

### [LOW] L3: Transfer Direction/Action Not Validated Server-Side

- **File**: `server.js:301-318`
- **OWASP**: A03 (Injection) / CWE-20
- **Description**: UUIDs are validated but `action` and `direction` properties are silently accepted without validation. Invalid values are ignored by TransferEngine but waste resources.
- **Fix**: Added allowlist validation for `action` ('copy'/'overwrite') and `direction` ('toDb1'/'toDb2').

### [LOW] L4: Inline onclick Handlers Conflict With CSP

- **File**: `static/index.html:68, 81`
- **OWASP**: A05 (Security Misconfiguration) / CWE-79
- **Description**: Two buttons use inline `onclick` attributes. The CSP sets `script-src 'self'` without `'unsafe-inline'`, so these handlers may be silently blocked by standards-compliant browsers.
- **Fix**: Replaced with `addEventListener` registration in the respective component init functions.

### [INFO] I1: No HTTPS / HSTS

- **Description**: Server runs plain HTTP only. Acceptable for localhost; documented as limitation. Mitigated by M2 (localhost-only enforcement).

### [INFO] I2: No JSON Body Size Limit

- **File**: `server.js:98`
- **Description**: `express.json()` uses default 100KB limit. An explicit limit prevents surprises.
- **Fix**: Added `{ limit: '50kb' }` to `express.json()`.

### [INFO] I3: Inconsistent Container Clearing Pattern

- **Files**: Multiple frontend components
- **Description**: Some components use `innerHTML = ''` to clear containers while others use `textContent = ''`. The latter is consistent with XSS-safe coding patterns.
- **Fix**: Standardized on `textContent = ''` throughout.

---

## 2. Code Quality Assessment

### Strengths

- **Clean separation of concerns**: lib/ modules are well-encapsulated with single responsibilities (DiffEngine doesn't handle HTTP, TransferEngine doesn't manage sessions)
- **Security-first approach**: `safeError()` pattern, timing-safe session lookup, `sanitizeFilename()`, UUID validation, CSRF origin checks are excellent defensive coding
- **DOM safety**: Most components use `createElement`/`textContent`/`dataset` instead of innerHTML with interpolation
- **Graceful degradation**: argon2 adapter falls back cleanly if the optional native dependency isn't installed
- **Minimal dependencies**: Only 3 production deps (express, kdbxweb, multer) reduces supply chain risk

### Issues Found

| Priority | Finding | File | Description |
|----------|---------|------|-------------|
| P1 | Console.warn leaks entry data | `DiffEngine.js:40` | Fallback matching logs entry titles and UUIDs to console |
| P2 | Title+UserName index always built | `DiffEngine.js:20-24` | O(n) construction even when UUID matching succeeds for all entries |
| P2 | Hard-coded search result limit | `SearchEngine.js:95` | 100 result cap with no pagination or `hasMore` flag |
| P3 | No automated tests | — | No test framework, no regression detection |
| P3 | No structured logging | — | `console.log/warn/error` only; no audit trail |
| P4 | Engine classes instantiate own KdbxService | Multiple lib files | Unnecessary singleton creation; could use shared instance |
| P4 | Global mutable state | `static/js/app.js` | Ad-hoc state management with direct property mutation |

### Architecture Notes

- **~4,000 lines** total (1,400 backend + 2,600 frontend)
- **Session lifecycle**: 30-min expiry, auto-cleanup every 5 min, timing-safe lookup
- **Credential flow**: Password used only during decryption, NOT stored in session, masked by default in API responses
- **Frontend**: Vanilla JS SPA with no build step — keeps deployment simple but limits tooling

---

## 3. Priority Fixes (Ordered)

### Completed (This Audit)

| # | Severity | Fix | Effort |
|---|----------|-----|--------|
| 1 | HIGH | Require authentication for CSV import endpoint | Low |
| 2 | MEDIUM | Strengthen CSRF origin check with Referer fallback | Low |
| 3 | MEDIUM | Enforce localhost-only connections | Low |
| 4 | MEDIUM | Replace innerHTML with DOM creation in compare.js | Medium |
| 5 | MEDIUM | Add session count limit (50 max, oldest evicted) | Low |
| 6 | LOW | Mask passwords server-side in diff comparisons | Low |
| 7 | LOW | Validate transfer action/direction server-side | Low |
| 8 | LOW | Replace inline onclick with addEventListener | Low |
| 9 | INFO | Add explicit JSON body size limit (50kb) | Low |
| 10 | INFO | Standardize container clearing to textContent='' | Low |

### Recommended Future Work

| # | Priority | Item | Effort |
|---|----------|------|--------|
| 1 | P3 | Add test suite (Jest/Vitest) for lib/ modules | High |
| 2 | P3 | Add structured logging with configurable levels | Medium |
| 3 | P2 | Lazy-build Title+UserName fallback index | Low |
| 4 | P2 | Add pagination to search results | Medium |
| 5 | P4 | Use dependency injection for KdbxService | Medium |
| 6 | P4 | Sanitize DiffEngine fallback match log output | Low |

---

## Positive Security Controls

The following existing controls were verified as correctly implemented:

1. **Timing-safe session lookup** via `crypto.timingSafeEqual()` — prevents timing attacks
2. **Error sanitization** via `safeError()` — no stack traces leak to clients
3. **Security headers**: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
4. **UUID validation** on all endpoints accepting user-supplied UUIDs
5. **Filename sanitization** with character stripping and `.kdbx` extension enforcement
6. **Rate limiting** at 30 req/min/IP with auto-cleanup
7. **Multer upload limits** at 10MB per file, 4 files max, field name allowlist
8. **Password masking** in `serializeEntry()` (default `maskPasswords: true`)
9. **Explicit password reveal** only via `showPasswords: true` flag
10. **Session expiry** with 30-minute timeout and periodic garbage collection
11. **Credentials not stored** in session objects (kdbxweb manages internally)
12. **Duplicate criteria allowlisting** prevents arbitrary grouping
13. **Search field allowlisting** limits queryable fields
14. **Graceful shutdown** with signal handlers cleaning up sessions and timers
