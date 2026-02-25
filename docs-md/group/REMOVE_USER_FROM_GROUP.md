# Remove User from Group API

## Endpoint

`DELETE /api/users/:groupId/users/:userId`

Removes a user from a group.

### Response
- `200 OK` with success message
- `404 Not Found` if group or user not found
- `400 Bad Request` if user is not a member of the group

## Description
Removes the specified user from the specified group. Throws an error if the group or user does not exist, or if the user is not a member of the group.
