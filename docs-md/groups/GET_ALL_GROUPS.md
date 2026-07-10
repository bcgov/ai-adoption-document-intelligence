# Get All Groups API

## Endpoint

`GET /api/groups`

Returns a list of all non-deleted groups. Requires an authenticated caller (any authenticated user; no role restriction).

### Response
- `200 OK` with an array of group objects: `{ id, name, description }` (`description` may be `null`)
- `401 Unauthorized` if the caller is not authenticated

## Description
Retrieves all groups from the database, excluding soft-deleted groups (`deleted_at` set). Used by the frontend `useAllGroups` hook (`apps/frontend/src/data/hooks/useGroups.ts`).
