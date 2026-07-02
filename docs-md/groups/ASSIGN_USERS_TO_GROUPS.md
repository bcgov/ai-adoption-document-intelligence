# Assign Users to Groups API

## Endpoint

`POST /api/users/:userId/groups`

Assigns a user to multiple groups.

### Request Body
- `groupIds` (string[], required): Array of group IDs

### Response
- `200 OK` with success message
- `400 Bad Request` if groupIds is missing or invalid

## Description
Assigns the specified user to the provided groups. Validates group existence before assignment.
