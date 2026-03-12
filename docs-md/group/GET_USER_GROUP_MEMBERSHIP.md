# Get User Group Membership API

## Endpoint

`GET /users/:userId/groups` (actual)
`POST /api/users/:userId/groups/membership` (current)

Returns all groups a user is a member of.

### Response
- `200 OK` with array of group objects

## Description
Retrieves the list of groups for the specified user.
