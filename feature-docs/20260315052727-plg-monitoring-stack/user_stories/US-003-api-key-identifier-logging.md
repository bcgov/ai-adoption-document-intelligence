# US-003: Add API Key Identifier to Log Output

**As a** platform operator,
**I want to** see an API key identifier in log lines for API key-authenticated requests,
**So that** I can filter and audit activity by API consumer without exposing the full key.

## Acceptance Criteria

- [ ] **Scenario 1**: API key prefix logged for API key requests
    - **Given** a request authenticated via API key (x-api-key header, validated by `ApiKeyAuthGuard`)
    - **When** the request is processed by the logging interceptor
    - **Then** the API key prefix or key ID from the database is included as `apiKeyId` in the NDJSON log output

- [ ] **Scenario 2**: No sessionId for API key requests
    - **Given** a request authenticated via API key (no JWT present)
    - **When** the request is logged
    - **Then** the `sessionId` field is omitted and `apiKeyId` is present instead

- [ ] **Scenario 3**: JWT-authenticated requests omit apiKeyId
    - **Given** a request authenticated via Keycloak JWT
    - **When** the request is logged
    - **Then** the `apiKeyId` field is omitted and `sessionId` is present instead

- [ ] **Scenario 4**: Full API key value is never logged
    - **Given** any API key-authenticated request
    - **When** the request is logged
    - **Then** only the key prefix or database ID appears in logs — the full API key value is never written to log output

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The `ApiKeyAuthGuard` already sets `request.apiKeyGroupId` on successful validation
- Use the key prefix (already stored in DB) or the key's database ID as the identifier
- Files affected: `request-logging.interceptor.ts`
