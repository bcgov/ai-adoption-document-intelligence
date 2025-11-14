# GraphQL Routes Documentation

This document describes all available GraphQL queries and mutations in the API.

## Base Endpoint

- **GraphQL Endpoint**: `POST /graphql`
- **GraphQL Playground**: `GET /graphql` (development only)

## Document Operations

### Queries

#### `documents`
Get all documents with optional filtering.

**Arguments:**
- `workspace_id` (ID, optional): Filter by workspace ID
- `status` (DocumentStatus, optional): Filter by document status
- `ministry` (Ministry, optional): Filter by ministry
- `limit` (Int, optional): Limit the number of results

**Example Query:**
```graphql
query GetDocuments($workspace_id: ID, $status: DocumentStatus, $limit: Int) {
  documents(workspace_id: $workspace_id, status: $status, limit: $limit) {
    id
    title
    file_url
    status
    ministry
    confidence_score
    workspace {
      id
      name
    }
  }
}
```

#### `document`
Get a single document by ID.

**Arguments:**
- `id` (ID!, required): Document ID

**Example Query:**
```graphql
query GetDocument($id: ID!) {
  document(id: $id) {
    id
    title
    file_url
    status
    extracted_data
    workspace {
      id
      name
    }
  }
}
```

### Mutations

#### `createDocument`
Create a new document.

**Required Arguments:**
- `title` (String!): Document title
- `file_url` (String!): URL to the document file
- `file_type` (DocumentFileType!): Type of document file
- `intake_method` (IntakeMethod!): Method of document intake
- `ministry` (Ministry!): Associated ministry

**Optional Arguments:**
- `workspace_id` (ID): Associated workspace ID
- `status` (DocumentStatus): Document status (default: `uploaded`)
- `confidence_score` (Float): OCR confidence score
- `extracted_data` (JSON): Extracted data from OCR
- `validation_status` (ValidationStatus): Validation status (default: `pending`)
- `priority` (Priority): Document priority (default: `medium`)
- `retention_date` (DateTime): Document retention date

**Example Mutation:**
```graphql
mutation CreateDocument(
  $title: String!
  $file_url: String!
  $file_type: DocumentFileType!
  $intake_method: IntakeMethod!
  $ministry: Ministry!
) {
  createDocument(
    title: $title
    file_url: $file_url
    file_type: $file_type
    intake_method: $intake_method
    ministry: $ministry
  ) {
    id
    title
    status
    created_date
  }
}
```

#### `updateDocument`
Update an existing document.

**Required Arguments:**
- `id` (ID!): Document ID

**Optional Arguments:**
- `title` (String): Document title
- `status` (DocumentStatus): Document status
- `confidence_score` (Float): OCR confidence score
- `extracted_data` (JSON): Extracted data from OCR
- `validation_status` (ValidationStatus): Validation status
- `priority` (Priority): Document priority
- `retention_date` (DateTime): Document retention date

**Example Mutation:**
```graphql
mutation UpdateDocument($id: ID!, $status: DocumentStatus) {
  updateDocument(id: $id, status: $status) {
    id
    title
    status
    validation_status
  }
}
```

#### `deleteDocument`
Delete a document.

**Arguments:**
- `id` (ID!, required): Document ID

**Returns:** Boolean

**Example Mutation:**
```graphql
mutation DeleteDocument($id: ID!) {
  deleteDocument(id: $id)
}
```

## User Operations

### Queries

#### `users`
Get all users.

**Example Query:**
```graphql
query GetUsers {
  users {
    id
    email
    full_name
    role
    status
    createdAt
  }
}
```

#### `user`
Get a single user by ID.

**Arguments:**
- `id` (ID!, required): User ID

**Example Query:**
```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    email
    full_name
    role
    status
  }
}
```

### Mutations

#### `createUser`
Create a new user.

**Required Arguments:**
- `email` (String!): User email

**Optional Arguments:**
- `full_name` (String): User's full name
- `role` (UserRole): User role (default: `user`)
- `status` (UserStatus): User status (default: `active`)

**Example Mutation:**
```graphql
mutation CreateUser($email: String!, $full_name: String) {
  createUser(email: $email, full_name: $full_name) {
    id
    email
    full_name
    role
  }
}
```

#### `updateUser`
Update an existing user.

**Required Arguments:**
- `id` (ID!): User ID

**Optional Arguments:**
- `email` (String): User email
- `full_name` (String): User's full name
- `role` (UserRole): User role
- `status` (UserStatus): User status

**Example Mutation:**
```graphql
mutation UpdateUser($id: ID!, $email: String) {
  updateUser(id: $id, email: $email) {
    id
    email
    full_name
  }
}
```

#### `deleteUser`
Delete a user.

**Arguments:**
- `id` (ID!, required): User ID

**Returns:** Boolean

**Example Mutation:**
```graphql
mutation DeleteUser($id: ID!) {
  deleteUser(id: $id)
}
```

## Workspace Operations

### Queries

#### `workspaces`
Get all workspaces.

**Example Query:**
```graphql
query GetWorkspaces {
  workspaces {
    id
    name
    description
    ministry
    status
    documents {
      id
      title
    }
  }
}
```

#### `workspace`
Get a single workspace by ID.

**Arguments:**
- `id` (ID!, required): Workspace ID

**Example Query:**
```graphql
query GetWorkspace($id: ID!) {
  workspace(id: $id) {
    id
    name
    description
    ministry
    status
    documents {
      id
      title
      status
    }
  }
}
```

### Mutations

#### `createWorkspace`
Create a new workspace.

**Required Arguments:**
- `name` (String!): Workspace name
- `ministry` (Ministry!): Associated ministry

**Optional Arguments:**
- `description` (String): Workspace description
- `status` (WorkspaceStatus): Workspace status (default: `active`)
- `intake_methods` ([String!]): Allowed intake methods
- `retention_policy` (RetentionPolicy): Retention policy (default: `seven_years`)
- `access_level` (AccessLevel): Access level (default: `internal`)

**Example Mutation:**
```graphql
mutation CreateWorkspace($name: String!, $ministry: Ministry!) {
  createWorkspace(name: $name, ministry: $ministry) {
    id
    name
    ministry
    status
  }
}
```

#### `updateWorkspace`
Update an existing workspace.

**Required Arguments:**
- `id` (ID!): Workspace ID

**Optional Arguments:**
- `name` (String): Workspace name
- `description` (String): Workspace description
- `status` (WorkspaceStatus): Workspace status
- `intake_methods` ([String!]): Allowed intake methods
- `retention_policy` (RetentionPolicy): Retention policy
- `access_level` (AccessLevel): Access level

**Example Mutation:**
```graphql
mutation UpdateWorkspace($id: ID!, $name: String) {
  updateWorkspace(id: $id, name: $name) {
    id
    name
    status
  }
}
```

#### `deleteWorkspace`
Delete a workspace.

**Arguments:**
- `id` (ID!, required): Workspace ID

**Returns:** Boolean

**Example Mutation:**
```graphql
mutation DeleteWorkspace($id: ID!) {
  deleteWorkspace(id: $id)
}
```

## Usage Examples

### Using with Apollo Client (Frontend)

```typescript
import { gql } from '@apollo/client';
import { QUERIES, MUTATIONS } from './graphql/routes.constants';

// Query example
const GET_DOCUMENTS = gql`
  query GetDocuments {
    ${QUERIES.DOCUMENTS} {
      id
      title
      status
    }
  }
`;

// Mutation example
const CREATE_DOCUMENT = gql`
  mutation CreateDocument($title: String!, $file_url: String!) {
    ${MUTATIONS.CREATE_DOCUMENT}(title: $title, file_url: $file_url) {
      id
      title
    }
  }
`;
```

### Using with fetch (Direct HTTP)

```typescript
import { GRAPHQL_ENDPOINT } from './graphql/routes.constants';

const response = await fetch(`http://localhost:3000${GRAPHQL_ENDPOINT}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `
      query GetDocuments {
        documents {
          id
          title
          status
        }
      }
    `,
  }),
});

const data = await response.json();
```

## Type Definitions

For complete type definitions and enums, refer to the generated GraphQL schema at `src/schema.gql` or use GraphQL introspection.

