# Module 7: Cryptographic Analysis

**Output**: `findings/security/cryptographic-analysis.md`
**Time estimate**: 15-20 minutes

## Objective

Analyze all cryptographic implementations including encryption algorithms, hashing, key management, protocol security, and random number generation.

## Analysis Areas

### 7a. Encryption Algorithms

| Weak (Finding) | Strong (Not a finding) |
|----------------|----------------------|
| DES, 3DES | AES-128/256 |
| RC4 | ChaCha20 |
| ECB mode | CBC with random IV, GCM |
| Blowfish (< 128-bit) | AES-GCM |
| RSA < 2048 bits | RSA >= 2048, ECDSA |

### 7b. Hashing Algorithms

| Context | Weak | Strong |
|---------|------|--------|
| Password storage | MD5, SHA1, SHA256 (unsalted) | bcrypt, scrypt, argon2, PBKDF2 |
| Integrity checking | MD5 | SHA-256, SHA-3 |
| HMAC | MD5 | SHA-256+ |
| Digital signatures | SHA1 | SHA-256+ |

Note: MD5/SHA1 for non-security checksums (e.g., cache keys, ETags) is LOW risk, not CRITICAL.

### 7c. Key Management

- Hardcoded encryption keys in source code
- Hardcoded initialization vectors (IVs)
- Keys derived from predictable values
- Key rotation mechanisms
- Key storage (file system vs. key vault)

### 7d. Protocol Security

- TLS version enforcement (TLS 1.0/1.1 = weak, TLS 1.2+ = strong)
- Cipher suite configuration
- Certificate validation (disabled = CRITICAL)
- Trust-all-certs patterns: `TrustAllCerts`, `X509TrustManager` that returns empty, `ALLOW_ALL_HOSTNAME_VERIFIER`

### 7e. Random Number Generation

| Weak (Finding) | Strong (Not a finding) |
|----------------|----------------------|
| `Math.random()` for security | `SecureRandom` (Java) |
| `Random()` for tokens | `secrets` module (Python) |
| `rand()` for session IDs | `crypto.randomBytes` (Node.js) |

Note: `Math.random()` for non-security purposes (UI, shuffling display) is NOT a finding.

## Search Patterns

```
# Encryption
Cipher|encrypt|decrypt|AES|DES|RSA|Blowfish|RC4|ECB|CBC|GCM

# Hashing
MessageDigest|MD5|SHA1|SHA-1|bcrypt|scrypt|argon2|PBKDF2|hash|digest

# Keys
SecretKey|KeyGenerator|KeyFactory|IvParameterSpec|hardcoded.*key|private.*key

# TLS
SSLContext|TrustManager|HostnameVerifier|ALLOW_ALL|TLS|SSL|certificate

# Random
SecureRandom|Random\(\)|Math\.random|crypto\.random|secrets\.|rand\(
```

## Required Output Format

```markdown
# Cryptographic Analysis

**Analysis Date**: [date]
**Scope**: [files examined]

## Cryptographic Inventory

| Usage | Algorithm | Location | Assessment |
|-------|-----------|----------|-----------|
| [Password hashing] | [MD5/bcrypt/etc.] | [file:line] | [Weak/Strong] |
| [Data encryption] | [AES-256/DES/etc.] | [file:line] | [Weak/Strong] |
| [TLS config] | [TLS 1.2/1.0/etc.] | [file:line] | [Weak/Strong] |

## Findings

### Finding CRYPTO-[N]: [Title] — [SEVERITY]

**File**: [exact path]
**Lines**: [range]
**Evidence**:
```[language]
[code snippet]
```
**Analysis**: [why this is cryptographically weak — specific technical reasoning]
**Impact**: [what could be compromised]
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: [CWE-NNN — e.g., CWE-327 Broken Crypto, CWE-328 Weak Hash, CWE-330 Insufficient Randomness]
**Recommendation**: [specific replacement algorithm/approach with code example]

## Positive Observations

[Good cryptographic practices found]
```
