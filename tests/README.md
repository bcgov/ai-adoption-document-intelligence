# Testing Directory

This directory contains all E2E (end-to-end) tests for the AI OCR application using Playwright.

## 📚 Documentation

- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - **START HERE** - Complete guide for running tests
- **[WRITING_TESTS.md](WRITING_TESTS.md)** - Guide for writing new tests manually
- **[e2e/AUTOMATED_WORKFLOW_SETUP.md](e2e/AUTOMATED_WORKFLOW_SETUP.md)** - Automated test generation workflow

## ⚡ Quick Start

```bash
# 1. Start the application
npm run dev

# 2. Run tests (automatically resets database and runs all tests)
npm run test:e2e
```

**That's it!** The database is automatically reset with seed data before every test run.

## 🎯 Common Commands

### Run Tests (All Auto-Reset DB)
```bash
# Using npm scripts
npm run test:e2e        # Run all tests
npm run test:e2e:ui     # Interactive UI mode
npm run test:file <path> # Run specific file
npm run test:dir <path>  # Run directory

# Using Playwright directly (also resets DB)
npx playwright test                  # Run all tests
npx playwright test <path>           # Run specific file/directory
npx playwright test --headed         # With visible browser
npx playwright test --debug          # Debug mode
npx playwright test -g "pattern"     # Pattern matching
```

**Note:** ALL commands automatically reset the database before running tests.

### Database Management
```bash
npm run test:db:reset   # Manual database reset (⚠️ deletes data, runs seed)
```

## 📁 Directory Structure

```
tests/
├── README.md                        # Quick start & navigation (this file)
├── TESTING_GUIDE.md                 # Complete comprehensive guide
├── WRITING_TESTS.md                 # How to write tests manually
└── e2e/
    ├── AUTOMATED_WORKFLOW_SETUP.md  # Optional automation workflow
    ├── helpers/
    │   └── auth.ts              # Authentication setup
    ├── pages/
    │   ├── README.md            # Page Object Model guide
    │   └── DatasetsListPage.ts
    ├── benchmarking/             # Benchmarking feature tests
    │   ├── dataset-list-create.spec.ts
    │   └── results-metrics.spec.ts
    ├── api-key-auth.spec.ts      # API authentication tests
    └── training-labels-with-api-key.spec.ts
├── test-results/                 # Screenshots (gitignored)
└── playwright-report/            # HTML reports (gitignored)
```

## ⚙️ Configuration

Tests are configured in [playwright.config.ts](../playwright.config.ts) at the repository root.

Environment variables are loaded from `apps/backend-services/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ai_ocr
BACKEND_URL=http://localhost:3002  # Optional, has defaults
FRONTEND_URL=http://localhost:3000  # Optional, has defaults
TEST_API_KEY=69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY  # Optional, has default
```

The `TEST_API_KEY` is hardcoded and automatically seeded - no manual setup required.

## 🔧 Prerequisites

1. **Application running**: Both backend and frontend must be running
   ```bash
   npm run dev
   ```

2. **Database running**: PostgreSQL must be running and accessible

That's it! No manual database setup, no API key configuration - everything is automatic.

## 📖 Learn More

- **New to testing here?** Read [TESTING_GUIDE.md](TESTING_GUIDE.md)
- **Writing a new test?** See [WRITING_TESTS.md](WRITING_TESTS.md)
- **Using automated test generation?** Check [e2e/AUTOMATED_WORKFLOW_SETUP.md](e2e/AUTOMATED_WORKFLOW_SETUP.md)
- **Need help with Playwright?** Visit [Playwright Documentation](https://playwright.dev/docs/intro)

## 🐛 Troubleshooting

**Database connection issues?**
```bash
npm run test:db:reset
```

**Tests timeout?**
- Ensure `npm run dev` is running
- Check URLs in `.env` are correct

For more troubleshooting, see [TESTING_GUIDE.md#troubleshooting](TESTING_GUIDE.md#troubleshooting).

## 🚀 What Makes This Easy

- ✅ **No manual setup** - Database resets and seeds automatically
- ✅ **Hardcoded API key** - Matches seed file, no configuration needed
- ✅ **Simple commands** - Just 4 npm scripts for 90% of use cases
- ✅ **Clean state** - Every test run starts fresh
- ✅ **Flexible** - Use `npx playwright test` directly for advanced options
- ✅ **CI/CD ready** - Single command for pipelines

## 📋 CI/CD Integration

```yaml
# In your CI configuration
- run: npm run test:e2e
```

This single command:
1. Resets the database
2. Seeds test data
3. Runs all tests
4. Generates HTML report

No additional setup steps required!
