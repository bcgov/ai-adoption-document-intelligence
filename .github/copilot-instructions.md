## General Implementation Guidelines
- When updating existing code, do not add backwards compatibility features.
- Avoid using "any" types in both back end and front end code, use proper typing.
- Do not create "placeholders" or any other types of partial implementations or stubs for "future use", implement features requested only.
- Do not create features that are not explicitly described in specifications, if there is a gap, include it summary notes after implementing the task. If there is a question regarding the implementation, do not make assumptions, stop and clarify from the user.
- When creating or modifying features, create/update documentation in /docs-md folder
- Do not include any document-specific implementation, the system is generic and must support arbitrary workloads
- Changes to files must pass any linting and formatting checks. If there are any errors, fix them before submitting the code for review.
- To test the API directly, use `curl -H "x-api-key: $API_KEY" http://localhost:3002/api/...` (read the key from local env/config; never paste or log secrets).
- NEVER read secrets from `.env` files directly or leak them into chat or terminal output.

## Frontend Implementation Guidelines
- Use React functional components and hooks for state management and side effects.
- Use Mantine components for UI elements and styling consistency.
- Use Tanstack React Query for data fetching and mutations, with proper error handling and loading states.
- Ensure all API interactions are typed correctly using TypeScript interfaces and types.
- Write unit tests for components and hooks using React Testing Library and Vitest, covering various states and edge cases.
- Follow accessibility best practices, including proper use of ARIA attributes and keyboard navigation.

## Backend Implementation Guidelines
- Functions in js/ts and jsx/tsx files should be documented with JSDoc comments, including parameter and return types, and a description of the function's purpose.
- In the backend-services app, all controller functions must have full Swagger/OpenAPI documentation: use specific decorators (`@ApiOkResponse`, `@ApiForbiddenResponse`, `@ApiUnauthorizedResponse`, `@ApiConflictResponse`, etc.) instead of generic `@ApiResponse`, create dedicated DTO classes with `@ApiProperty` decorators for all request/response shapes, and reference those DTOs via the `type` field in response decorators. Use `@ApiOperation` and `@ApiParam` where appropriate.
- When creating or updating backend code also create and update related tests. If backend code was updated, run tests to ensure they still pass. Adjust tests if they fail and re-run.
- Do not use the `any` type. Use proper typing for all variables, function parameters, and return types. This ensures type safety and improves code readability and maintainability.

## Prisma and Database Guidelines
- If you need to run `npx prisma generate`, run `npm run db:generate` from `apps/backend-services` - it's a special script that writes models into apps/temporal/src and apps/backend-services/src. Don't forget to run migrations as normal if necessary.
- Tables should be designed with a `created_at` timestamp (default to now) and an `updated_at` timestamp (auto-updated on change) for auditing purposes.
- Table names should be singular (e.g., `User`, not `Users`) to align with Prisma conventions.

## Repo Wiki

See `AGENTS.md` (Repo Wiki section) for canonical wiki maintenance rules.

## Requirements and User Stories
- When finished implementing a user story, check it off in the related user stories README under the relevant `feature-docs/` directory and update acceptance checkboxes in the story file.
- If you find any gaps in the requirements or user stories, document them in summary notes after implementation and ask for clarification before proceeding with any assumptions.
