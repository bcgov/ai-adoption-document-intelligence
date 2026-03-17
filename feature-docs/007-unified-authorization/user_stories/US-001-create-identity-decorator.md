# US-001: Create `@Identity` Method Decorator with Options Interface

**As a** backend developer,
**I want to** have an `@Identity` decorator that accepts a typed options object (`requireSystemAdmin`, `groupIdFrom`, `minimumRole`, `allowApiKey`),
**So that** I can declaratively configure authentication and authorization requirements on controller methods in a single, consistent annotation.

## Acceptance Criteria
- [x] **Scenario 1**: Decorator is defined and importable
    - **Given** the `@Identity` decorator module exists
    - **When** a developer imports and applies `@Identity(options)` to a controller method
    - **Then** the decorator compiles without TypeScript errors and attaches metadata to the handler

- [x] **Scenario 2**: Options interface is correctly typed
    - **Given** the `IdentityOptions` TypeScript interface is defined
    - **When** an invalid option value (e.g. wrong type for `minimumRole`) is provided
    - **Then** the TypeScript compiler reports a type error

- [x] **Scenario 3**: Options object is retrievable as metadata
    - **Given** `@Identity(options)` is applied to a handler
    - **When** `Reflector.get` (or `getAllAndOverride`) is called for the metadata key
    - **Then** the exact options object passed to the decorator is returned

- [x] **Scenario 4**: Decorator can be applied with no options (all defaults)
    - **Given** `@Identity()` is applied
    - **When** the metadata is read
    - **Then** all options resolve to their defaults (`requireSystemAdmin: false`, `allowApiKey: false`, no `groupIdFrom`, no `minimumRole`)

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Use NestJS `SetMetadata` (or a custom `Reflector` key) to store the options object.
- The exported metadata key constant should be co-located with the decorator (e.g. `IDENTITY_KEY`).
- `GroupRole` enum is already defined in the codebase; import it for the `minimumRole` option type.
- `groupIdFrom` is an object with optional fields `param`, `query`, and `body` (string names). Only one should be set per usage, but this is a convention, not a compile-time constraint.
