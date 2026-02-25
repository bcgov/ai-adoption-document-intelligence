# Create Group API

## Endpoint

`POST /api/users/groups`

Creates a new group.

### Request Body
- `name` (string, required): Name of the group

### Response
- `200 OK` with the created group object
- `400 Bad Request` if the group name is missing or already exists

## Description
Creates a new group with the specified name. Fails if a group with the same name already exists.
