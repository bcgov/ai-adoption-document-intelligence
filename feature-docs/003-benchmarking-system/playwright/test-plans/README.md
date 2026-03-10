# Playwright Test Plans — Benchmarking System

This directory contains comprehensive test plans for the Benchmarking System UI features. Each test plan maps to a specific user story and includes detailed test scenarios covering happy paths, edge cases, and error handling.

## Test Plan Index

### Phase 1 — Core Benchmarking UI (High Priority)

Essential features for dataset management, benchmark execution, and results viewing.

| Test Plan | User Story | Priority | Status |
|-----------|------------|----------|--------|
| [US-026](US-026-benchmarking-navigation-routing.md) | Benchmarking Navigation & Routing | High | ⬜ Not Started |
| [US-027](US-027-dataset-list-create-ui.md) | Dataset List & Create UI | High | ⬜ Not Started |
| [US-028](US-028-dataset-version-sample-preview-ui.md) | Dataset Version & Sample Preview UI | High | ⬜ Not Started |
| [US-029](US-029-benchmark-definition-crud-ui.md) | Benchmark Definition CRUD UI | High | ⬜ Not Started |
| [US-030](US-030-run-list-start-cancel-progress-ui.md) | Run List, Start/Cancel, Progress UI | High | ⬜ Not Started |
| [US-031](US-031-results-summary-mlflow-deeplinks-ui.md) | Results Summary & MLflow Deep-Links UI | High | ⬜ Not Started |

**Phase 1 Coverage:**
- Navigation and routing (7 scenarios)
- Dataset management (13 scenarios)
- Dataset versions and samples (15 scenarios)
- Benchmark definitions (17 scenarios)
- Run execution and tracking (17 scenarios)
- Results and metrics display (17 scenarios)

**Total Phase 1 Scenarios:** 86

---

### Phase 1.5 — Incremental Additions (Medium Priority)

Enhanced dataset validation, split management, and baseline features.

| Test Plan | User Story | Priority | Status |
|-----------|------------|----------|--------|
| [US-032](US-032-dataset-quality-checks-validation.md) | Dataset Quality Checks & Validation | Medium | ⬜ Not Started |
| [US-033](US-033-split-management-ui.md) | Split Management UI | Medium | ⬜ Not Started |
| [US-034](US-034-baseline-management.md) | Baseline Management | Medium | ⬜ Not Started |

**Phase 1.5 Coverage:**
- Dataset validation and quality checks (15 scenarios)
- Split creation, editing, and freezing (16 scenarios)
- Baseline promotion and regression detection (16 scenarios)

**Total Phase 1.5 Scenarios:** 47

---

### Phase 2 — Rich React UI (Low Priority)

Advanced features for comparison, analysis, and visualization.

| Test Plan | User Story | Priority | Status |
|-----------|------------|----------|--------|
| [US-036](US-036-side-by-side-run-comparison-ui.md) | Side-by-Side Run Comparison UI | Low | ⬜ Not Started |
| [US-037](US-037-regression-reports-ui.md) | Regression Reports UI | Low | ⬜ Not Started |
| [US-038](US-038-slicing-filtering-drilldown-ui.md) | Slicing, Filtering & Drill-Down UI | Low | ⬜ Not Started |
| [US-039](US-039-in-app-artifact-viewer.md) | In-App Artifact Viewer | Low | ⬜ Not Started |

**Phase 2 Coverage:**
- Run comparison and analysis (17 scenarios)
- Regression reports and trends (17 scenarios)
- Filtering, slicing, and drill-down (17 scenarios)
- In-app artifact viewing (20 scenarios)

**Total Phase 2 Scenarios:** 71

---

## Summary Statistics

### Overall Coverage

| Metric | Count |
|--------|-------|
| **Total Test Plans** | 13 |
| **Total Test Scenarios** | 204 |
| **Phase 1 Scenarios** | 86 (42%) |
| **Phase 1.5 Scenarios** | 47 (23%) |
| **Phase 2 Scenarios** | 71 (35%) |

### Scenario Breakdown by Type

| Type | Estimated Count | Percentage |
|------|-----------------|------------|
| **Happy Path** | ~120 | 59% |
| **Edge Case** | ~50 | 24% |
| **Error Case** | ~34 | 17% |

### Priority Distribution

| Priority | Test Plans | Scenarios |
|----------|------------|-----------|
| **High** | 6 | 86 |
| **Medium** | 3 | 47 |
| **Low** | 4 | 71 |

---

## Test Plan Structure

Each test plan follows this format:

### Header Information
- **Source**: Link to the user story file
- **Requirement Section**: Reference to requirements.md section
- **Priority**: High/Medium/Low based on feature phase

### User Story
Complete user story text from the source file

### Acceptance Criteria
List of acceptance criteria from the user story

### Test Scenarios
Each scenario includes:
- **Type**: Happy Path / Edge Case / Error Case
- **Priority**: High/Medium/Low
- **Given**: Initial state/preconditions
- **When**: User action or system event
- **Then**: Expected outcome
- **Affected Pages**: List of pages involved
- **Data Requirements**: Test data needed
- **Prerequisites**: Auth state, permissions, etc.

### Coverage Analysis
- ✅ Areas covered (happy path, edge cases, errors)
- ⚠️ Known gaps or missing scenarios

---

## Implementation Guidelines

### Test Organization

Tests should be organized by user story:

```
tests/
├── benchmarking/
│   ├── navigation/
│   │   └── US-026-navigation-routing.spec.ts
│   ├── datasets/
│   │   ├── US-027-dataset-list-create.spec.ts
│   │   ├── US-028-dataset-versions-preview.spec.ts
│   │   └── US-032-quality-validation.spec.ts
│   ├── definitions/
│   │   └── US-029-definition-crud.spec.ts
│   ├── runs/
│   │   ├── US-030-run-execution-tracking.spec.ts
│   │   └── US-031-results-summary.spec.ts
│   ├── splits/
│   │   └── US-033-split-management.spec.ts
│   ├── baselines/
│   │   └── US-034-baseline-management.spec.ts
│   ├── comparison/
│   │   ├── US-036-run-comparison.spec.ts
│   │   └── US-037-regression-reports.spec.ts
│   ├── drilldown/
│   │   └── US-038-filtering-drilldown.spec.ts
│   └── artifacts/
│       └── US-039-artifact-viewer.spec.ts
```

### Test Execution Strategy

1. **Smoke Tests** (Phase 1 Happy Paths): Run on every commit
2. **Regression Suite** (All Happy Paths): Run on every PR
3. **Full Suite** (All Scenarios): Run nightly or before release
4. **Phase-Specific Suites**: Run based on development phase

### Test Data Requirements

Each phase requires specific test data:

**Phase 1:**
- Multiple datasets with versions (draft, published, archived)
- Datasets with 50+ samples and rich metadata
- Multiple benchmark projects with definitions and runs
- Runs in all status states (pending, running, completed, failed, cancelled)
- Completed runs with metrics and artifacts

**Phase 1.5:**
- Datasets with schema violations, missing ground truth, duplicates
- Dataset versions with multiple splits (train/val/test/golden)
- Baseline runs with configured thresholds
- Runs with metric regressions

**Phase 2:**
- Multiple runs for comparison (same definition, different configs)
- Runs with extensive per-sample results for filtering/drill-down
- Diverse artifact types (JSON, images, PDFs, text, diffs)
- Historical run data for trend analysis

### API Mocking vs Integration

- **Unit/Component Tests**: Mock API responses
- **Integration Tests**: Use real backend with test database
- **E2E Tests**: Full stack with seeded test data

### Accessibility Requirements

All UI tests should verify:
- Keyboard navigation support
- Screen reader compatibility (ARIA labels)
- Color contrast requirements (WCAG AA)
- Focus management
- Error message clarity

---

## Known Gaps & Future Work

### Not Covered in Current Test Plans

1. **Performance Testing**
   - Large dataset handling (10,000+ samples)
   - Concurrent user scenarios
   - Long-running benchmark execution

2. **Security Testing**
   - Permission boundaries
   - Data isolation
   - Injection vulnerabilities

3. **Browser Compatibility**
   - Cross-browser testing (Chrome, Firefox, Safari, Edge)
   - Mobile/responsive layouts

4. **Internationalization**
   - Multi-language support
   - Date/time formatting across locales

5. **Network Resilience**
   - Offline behavior
   - Network interruption recovery
   - Retry mechanisms

### Recommendations

- Add performance test suite for large-scale scenarios
- Include security-focused tests in CI pipeline
- Implement cross-browser testing matrix
- Add visual regression testing for UI consistency

---

## Getting Started

### Prerequisites

- Playwright installed and configured
- Backend services running (NestJS, PostgreSQL, MinIO, MLflow, Temporal)
- Test database seeded with appropriate data
- Frontend development server running

### Running Tests

```bash
# Run all benchmarking tests
npx playwright test tests/benchmarking/

# Run specific phase
npx playwright test tests/benchmarking/ --grep "Phase 1"

# Run specific user story
npx playwright test tests/benchmarking/datasets/US-027-dataset-list-create.spec.ts

# Run in headed mode (see browser)
npx playwright test tests/benchmarking/ --headed

# Debug specific test
npx playwright test tests/benchmarking/ --debug
```

### Writing New Tests

1. Review the relevant test plan in this directory
2. Create spec file following the naming convention
3. Implement scenarios from the test plan
4. Use Page Object Model for reusable components
5. Add appropriate assertions and error handling
6. Update test plan status when tests are implemented

---

## Maintenance

- **Update Frequency**: Test plans should be reviewed and updated whenever:
  - User stories are refined or changed
  - New edge cases are discovered
  - Production bugs reveal missing test coverage

- **Owner**: QA Team / Test Automation Engineers
- **Review Cycle**: Quarterly review of coverage gaps and priorities

---

**Last Updated**: 2026-02-15
**Version**: 1.0
**Status**: Draft — Test plans created, implementation pending
