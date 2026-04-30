# US-001: List Azure DI Classifiers Service Method

## Summary
As a backend service, I need a reusable method to list all classifier models registered in Azure Document Intelligence so that both manual deletion and orphan cleanup can reliably check what exists in Azure.

## Actors
- Backend service (internal usage only)

## Main Flow
1. Service calls the Azure Document Intelligence API to retrieve all registered classifier model IDs.
2. Method returns the full list of classifier identifiers (Azure DI model IDs).
3. Callers use the returned list to check existence or iterate for cleanup.

## Endpoints
- No public API endpoint — internal service method only.
- Method: `listAzureClassifiers()` on `ClassifierService`.

## Acceptance Criteria
- `listAzureClassifiers()` is implemented on `ClassifierService`.
- Returns the full list of Azure DI classifier model IDs from the Azure DI API.
- Method is typed correctly (no `any` types).
- Unit tests cover the happy path and Azure DI API error scenarios.

## Notes
- This method is consumed internally by the manual deletion path and the orphan cleanup cron job.
- Not exposed as a public API endpoint.
