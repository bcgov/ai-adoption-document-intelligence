# Dependency Inventory

**Analysis Date**: 2026-04-09
**Total Dependencies**: 38 (36 production + 2 local workspace packages)
**Source**: package.json (NPM registry)
**Trivy Scan**: Available — 0 HIGH/CRITICAL CVEs detected

## Risk Summary

| Risk Level | Count | Key Concerns |
|------------|-------|-------------|
| CRITICAL | 0 | None detected |
| HIGH | 0 | None detected |
| MEDIUM | 7 | Authentication tier, Azure clients, Blob storage |
| LOW | 29 | NestJS ecosystem, Prisma, database, utilities |
| N/A | 2 | Local workspace packages |

## Full Inventory

| # | Library | Version | Purpose | Risk | CVEs / Notes | Source |
|---|---------|---------|---------|------|-------------|--------|
| 1 | @ai-di/graph-insertion-slots | file: | Local graph slot insertion logic | N/A | Workspace-managed | Local |
| 2 | @ai-di/shared-logging | file: | Local logging framework | N/A | Workspace-managed | Local |
| 3 | @aws-sdk/client-s3 | ^3.990.0 | AWS S3 client for blob storage | LOW | No CVEs [Trivy]; AWS SDK v3 maintained | NPM |
| 4 | @azure-rest/ai-document-intelligence | 1.1.0 | Azure Document Intelligence API client | MEDIUM | No CVEs [Trivy]; pinned version—verify currency [AI-estimated] | NPM |
| 5 | @azure/storage-blob | 12.30.0 | Azure Blob Storage client | MEDIUM | No CVEs [Trivy]; pinned version [AI-estimated] | NPM |
| 6 | @nestjs/axios | 4.0.1 | NestJS HTTP client (axios) | LOW | No CVEs; stable | NPM |
| 7 | @nestjs/common | ^11.1.12 | NestJS core utilities | LOW | No CVEs [Trivy]; current LTS | NPM |
| 8 | @nestjs/config | ^4.0.2 | NestJS configuration module | LOW | No CVEs; stable | NPM |
| 9 | @nestjs/core | ^11.1.12 | NestJS framework core | LOW | No CVEs [Trivy]; current LTS | NPM |
| 10 | @nestjs/passport | ^11.0.5 | NestJS Passport.js integration | MEDIUM | No CVEs [Trivy]; auth-critical [AI-estimated] | NPM |
| 11 | @nestjs/platform-express | 11.1.13 | NestJS Express adapter | LOW | No CVEs; stable | NPM |
| 12 | @nestjs/schedule | 6.1.0 | NestJS task scheduling | LOW | No CVEs; stable | NPM |
| 13 | @nestjs/swagger | 11.2.5 | NestJS OpenAPI documentation | LOW | No CVEs; stable | NPM |
| 14 | @nestjs/throttler | ^6.5.0 | NestJS rate limiting | LOW | No CVEs [Trivy] | NPM |
| 15 | @prisma/adapter-pg | 7.2.0 | Prisma PostgreSQL adapter | LOW | No CVEs [Trivy]; recent | NPM |
| 16 | @prisma/client | 7.2.0 | Prisma ORM client | LOW | No CVEs [Trivy]; recent | NPM |
| 17 | @temporalio/client | ^1.10.0 | Temporal.io workflow client | LOW | No CVEs [Trivy]; maintained | NPM |
| 18 | @types/helmet | ^0.0.48 | TypeScript types for Helmet | LOW | Type definitions only | NPM |
| 19 | ajv | ^8.17.1 | JSON Schema validator | LOW | No CVEs [Trivy] | NPM |
| 20 | bcrypt | ^6.0.0 | Password hashing | MEDIUM | No CVEs [Trivy]; security-critical [AI-estimated] | NPM |
| 21 | body-parser | ^1.20.3 | Express body parsing middleware | LOW | No CVEs [Trivy] | NPM |
| 22 | class-transformer | ^0.5.1 | DTO transformation | LOW | No CVEs; stable | NPM |
| 23 | class-validator | ^0.14.3 | DTO validation | LOW | No CVEs; stable | NPM |
| 24 | cookie-parser | ^1.4.7 | Express cookie parsing | LOW | No CVEs [Trivy] | NPM |
| 25 | dotenv | ^17.2.3 | Environment variable loader | LOW | No CVEs | NPM |
| 26 | express | ^5.2.1 | Web server framework | LOW | No CVEs [Trivy]; Express 5.x current | NPM |
| 27 | helmet | ^8.1.0 | Security headers middleware | LOW | No CVEs [Trivy]; security-focused | NPM |
| 28 | jwks-rsa | ^3.2.0 | JWT public key fetcher | MEDIUM | No CVEs [Trivy]; auth-critical [AI-estimated] | NPM |
| 29 | openid-client | ^6.8.2 | OpenID Connect client | MEDIUM | No CVEs [Trivy]; auth-critical [AI-estimated] | NPM |
| 30 | passport | ^0.7.0 | Authentication middleware | MEDIUM | No CVEs [Trivy]; auth-critical [AI-estimated] | NPM |
| 31 | passport-jwt | ^4.0.1 | Passport JWT strategy | MEDIUM | No CVEs [Trivy]; auth-critical [AI-estimated] | NPM |
| 32 | pg | ^8.16.3 | PostgreSQL driver | LOW | No CVEs [Trivy] | NPM |
| 33 | prom-client | ^15.1.3 | Prometheus metrics | LOW | No CVEs [Trivy] | NPM |
| 34 | prisma | 7.2.0 | Prisma CLI | LOW | No CVEs [Trivy] | NPM |
| 35 | rxjs | ^7.8.2 | Reactive Extensions | LOW | No CVEs [Trivy] | NPM |
| 36 | uuid | 13.0.0 | UUID generator | LOW | No CVEs [Trivy] | NPM |

## EOL / Unmaintained Libraries

No truly EOL or abandoned libraries detected. All critical dependencies are actively maintained.

| Library | Version | Status | Recommendation |
|---------|---------|--------|---------------|
| passport-jwt | 4.0.1 | Active | Monitor for patches |
| @azure-rest/ai-document-intelligence | 1.1.0 | Pinned | Check for newer versions |
| @azure/storage-blob | 12.30.0 | Pinned | Check Azure release notes |

## Transitive Dependency Notes

Trivy scan covers the entire dependency tree (direct + transitive). **0 vulnerabilities reported at any depth.** Notable transitive dependency chains: NestJS ecosystem (Express, RxJS), Authentication chain (passport → passport-jwt → openid-client → jwks-rsa), Azure SDK internals, Prisma internals.
