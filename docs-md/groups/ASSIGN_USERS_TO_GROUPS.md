# Assign User to Group API

## Endpoint

`POST /api/groups/:groupId/members/:userId`

Assigns a single user to a single group. There is no bulk-assignment endpoint; assigning a user to multiple groups requires one call per group.

### Path Parameters
- `groupId` (string, required): The ID of the group
- `userId` (string, required): The ID of the user to add

### Request Body
None.

### Response
- `200 OK` with `{ "success": true }`
- `400 Bad Request` if `groupId` or `userId` is missing or invalid
- `401 Unauthorized` if the caller is not authenticated
- `403 Forbidden` if the caller is not a group admin of the group or a system admin
- `404 Not Found` if the group does not exist

## Description
Adds the specified user to the specified group by upserting a `UserGroup` record (default role `MEMBER`). Validates group existence before assignment. The operation is idempotent: if the user is already a member, the existing membership (including its role) is left unchanged and no error is thrown. A `member_added` audit event is recorded.

Authorization is enforced by the `@Identity` guard (`groupIdFrom` the `groupId` path param, minimum role `ADMIN`); system admins bypass the group-membership check.
