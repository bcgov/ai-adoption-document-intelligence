# US-002: Environment Configuration Files

**As a** Developer,
**I want to** have environment configuration files with sensible defaults for `dev` and `prod` profiles,
**So that** I can deploy instances with the correct settings without manually configuring every value.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Dev environment file exists with defaults
    - **Given** the developer is preparing to deploy
    - **When** they inspect `deployments/openshift/config/dev.env`
    - **Then** the file contains sensible default values for all required configuration including SSO/Keycloak settings (realm, client ID, auth server URL), Azure Document Intelligence, Azure Blob Storage (`BLOB_STORAGE_PROVIDER=azure`), and application-level settings

- [ ] **Scenario 2**: Prod environment file exists with defaults
    - **Given** the developer is preparing to deploy to prod
    - **When** they inspect `deployments/openshift/config/prod.env`
    - **Then** the file contains production-appropriate default values for all required configuration

- [ ] **Scenario 3**: Instance-specific override
    - **Given** a developer needs custom configuration for their instance
    - **When** they create `deployments/openshift/config/<instance-name>.env` with override values
    - **Then** the deploy script merges instance overrides on top of the selected profile defaults (instance values take precedence)

- [ ] **Scenario 4**: Profile selection at deploy time
    - **Given** the developer runs the deploy script
    - **When** they specify `--env dev` or `--env prod`
    - **Then** the corresponding configuration file is loaded as the base configuration

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- SSO/Keycloak settings are per environment profile, not per instance
- Azure Document Intelligence and Azure Blob Storage are per environment profile, not per instance
- Instance-specific overrides are optional — most instances use profile defaults only
- Config files are checked into the repo (no secrets in config files — secrets come from OpenShift Secrets)
