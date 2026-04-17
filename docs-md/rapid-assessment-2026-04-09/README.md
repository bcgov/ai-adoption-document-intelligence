# Rapid Assessment — apps/backend-services

**Assessment Date**: 2026-04-09
**Framework**: Rapid Assessment v3.0 (GitHub Copilot + Subagents)
**Target**: `apps/backend-services`

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (Node.js >= 24.0.0) |
| Framework | NestJS 11.x |
| Database | PostgreSQL (Prisma ORM 7.2.0) |
| Authentication | Passport.js (JWT), OpenID Connect (openid-client) |
| Cloud — Azure | AI Document Intelligence 1.1.0, Blob Storage 12.30.0 |
| Cloud — AWS | S3 (aws-sdk v3) |
| Workflow Engine | Temporal.io (client 1.10.0) |
| API Documentation | @nestjs/swagger 11.2.5 |
| Security | Helmet 8.1.0, @nestjs/throttler 6.5.0, bcrypt 6.0.0 |
| Metrics | prom-client 15.1.3 |
| Build | SWC (NestJS CLI), TypeScript 5.9.3 |
| Testing | Jest 30.2.0, Supertest 7.1.4, Testcontainers |
| Linting | Biome 2.4.8 |

## Output Structure

```
rapid-assessment/
├── README.md                  (this file)
├── status/
│   └── progress.md
├── findings/
│   ├── summary/
│   │   ├── architecture-diagram.md
│   │   ├── executive-summary.md
│   │   ├── file-inventory.md
│   │   └── trivy-results.md
│   ├── dependencies/
│   │   ├── dependency-inventory.md
│   │   └── component-dependencies/
│   ├── security/
│   │   ├── code-vulnerabilities.md
│   │   ├── secrets-analysis.md
│   │   ├── authentication-analysis.md
│   │   ├── configuration-security.md
│   │   ├── cryptographic-analysis.md
│   │   ├── logging-analysis.md
│   │   └── database-analysis.md
│   └── testing/
│       └── testing-analysis.md
├── validation-report.md
└── final-summary.md
```
