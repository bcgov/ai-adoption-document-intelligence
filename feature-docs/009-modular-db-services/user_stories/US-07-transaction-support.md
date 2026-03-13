# US-07: Implement Transaction Support in PrismaService and Db-Services

**As a** backend developer,
**I want to** add a `transaction()` helper to `PrismaService` and standardise an optional `tx?` parameter on all db-service methods,
**So that** multi-step database operations can be executed atomically without services accessing Prisma directly.

## Acceptance Criteria
- [ ] **Scenario 1**: PrismaService exposes a transaction() helper
    - **Given** `PrismaService`
    - **When** reviewing its public API
    - **Then** it exposes `async transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>` that delegates to `this.prisma.$transaction(fn)`

- [ ] **Scenario 2**: All db-service methods accept an optional tx parameter
    - **Given** any db-service method (e.g., `updateDocument`)
    - **When** reviewing its signature
    - **Then** the last parameter is `tx?: Prisma.TransactionClient`, and the method uses `tx ?? this.prisma` as the client

- [ ] **Scenario 3**: Service methods pass tx through to db-service calls
    - **Given** a service method that delegates to a db-service
    - **When** reviewing its signature
    - **Then** it accepts an optional `tx?: Prisma.TransactionClient` as its last parameter and passes it straight through to the db-service call without querying `tx` directly

- [ ] **Scenario 4**: Cross-module transactions use prismaService.transaction()
    - **Given** a service operation that spans multiple modules
    - **When** the owning service initiates the transaction
    - **Then** it calls `this.prismaService.transaction(async (tx) => { ... })` and passes `tx` to both its own db-service and to other modules' service methods

- [ ] **Scenario 5**: Controllers do not initiate or receive transactions
    - **Given** any controller
    - **When** reviewing its methods
    - **Then** no controller method calls `prismaService.transaction()` or accepts a `tx` parameter

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This story applies across all db-services created or moved in US-01 through US-06.
- Services that need to start a cross-module transaction must inject `PrismaService` (following the convention of only injecting it in db-services, but the transaction wrapper is a special case for service-layer atomicity; see requirements R8 for the full rule table).
- Single-module db-services may use `this.prisma.$transaction` directly for intra-service atomicity if needed.
