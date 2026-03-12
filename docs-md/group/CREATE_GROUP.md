# Create Group API

## Endpoint

`POST /api/groups`

Creates a new group. Only system admins are permitted to call this endpoint.

### Request Body
- `name` (string, required): Name of the group
- `description` (string, optional): Description of the group

### Response
- `201 Created` with the created group object including `id`, `name`, and `description`
- `400 Bad Request` if the `name` field is missing or invalid
- `401 Unauthorized` if the caller is not authenticated
- `403 Forbidden` if the caller is not a system admin
- `409 Conflict` if a group with the same name already exists

## Description
Creates a new group with the specified name and optional description. Only system admins (as determined by `DatabaseService.isUserSystemAdmin`) are permitted to create groups. Returns `409 Conflict` if a group with the given name already exists.
