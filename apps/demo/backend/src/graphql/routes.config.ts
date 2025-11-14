/**
 * GraphQL Routes Configuration
 * 
 * This file documents all available GraphQL queries and mutations
 * and their corresponding route endpoints.
 * 
 * Base GraphQL Endpoint: POST /graphql
 * GraphQL Playground: GET /graphql (development only)
 */

export const GRAPHQL_ROUTES = {
  endpoint: '/graphql',
  playground: '/graphql',
} as const;

/**
 * Document Queries and Mutations
 */
export const DOCUMENT_ROUTES = {
  queries: {
    /**
     * Get all documents with optional filters
     * Query: documents
     * 
     * Arguments:
     * - workspace_id: ID (optional)
     * - status: DocumentStatus (optional)
     * - ministry: Ministry (optional)
     * - limit: Number (optional)
     * 
     * Returns: [Document]
     */
    documents: {
      name: 'documents',
      description: 'Get all documents with optional filtering',
      example: `
        query GetDocuments($workspace_id: ID, $status: DocumentStatus, $ministry: Ministry, $limit: Int) {
          documents(workspace_id: $workspace_id, status: $status, ministry: $ministry, limit: $limit) {
            id
            title
            file_url
            file_type
            status
            ministry
            confidence_score
            extracted_data
            validation_status
            priority
            retention_date
            created_date
            workspace {
              id
              name
            }
          }
        }
      `,
    },
    /**
     * Get a single document by ID
     * Query: document
     * 
     * Arguments:
     * - id: ID! (required)
     * 
     * Returns: Document | null
     */
    document: {
      name: 'document',
      description: 'Get a single document by ID',
      example: `
        query GetDocument($id: ID!) {
          document(id: $id) {
            id
            title
            file_url
            file_type
            status
            ministry
            confidence_score
            extracted_data
            validation_status
            priority
            retention_date
            created_date
            workspace {
              id
              name
            }
          }
        }
      `,
    },
  },
  mutations: {
    /**
     * Create a new document
     * Mutation: createDocument
     * 
     * Arguments:
     * - title: String! (required)
     * - file_url: String! (required)
     * - file_type: DocumentFileType! (required)
     * - intake_method: IntakeMethod! (required)
     * - ministry: Ministry! (required)
     * - workspace_id: ID (optional)
     * - status: DocumentStatus (optional)
     * - confidence_score: Float (optional)
     * - extracted_data: JSON (optional)
     * - validation_status: ValidationStatus (optional)
     * - priority: Priority (optional)
     * - retention_date: DateTime (optional)
     * 
     * Returns: Document
     */
    createDocument: {
      name: 'createDocument',
      description: 'Create a new document',
      example: `
        mutation CreateDocument(
          $title: String!
          $file_url: String!
          $file_type: DocumentFileType!
          $intake_method: IntakeMethod!
          $ministry: Ministry!
          $workspace_id: ID
          $status: DocumentStatus
          $confidence_score: Float
          $extracted_data: JSON
          $validation_status: ValidationStatus
          $priority: Priority
          $retention_date: DateTime
        ) {
          createDocument(
            title: $title
            file_url: $file_url
            file_type: $file_type
            intake_method: $intake_method
            ministry: $ministry
            workspace_id: $workspace_id
            status: $status
            confidence_score: $confidence_score
            extracted_data: $extracted_data
            validation_status: $validation_status
            priority: $priority
            retention_date: $retention_date
          ) {
            id
            title
            file_url
            status
            created_date
          }
        }
      `,
    },
    /**
     * Update an existing document
     * Mutation: updateDocument
     * 
     * Arguments:
     * - id: ID! (required)
     * - title: String (optional)
     * - status: DocumentStatus (optional)
     * - confidence_score: Float (optional)
     * - extracted_data: JSON (optional)
     * - validation_status: ValidationStatus (optional)
     * - priority: Priority (optional)
     * - retention_date: DateTime (optional)
     * 
     * Returns: Document | null
     */
    updateDocument: {
      name: 'updateDocument',
      description: 'Update an existing document',
      example: `
        mutation UpdateDocument(
          $id: ID!
          $title: String
          $status: DocumentStatus
          $confidence_score: Float
          $extracted_data: JSON
          $validation_status: ValidationStatus
          $priority: Priority
          $retention_date: DateTime
        ) {
          updateDocument(
            id: $id
            title: $title
            status: $status
            confidence_score: $confidence_score
            extracted_data: $extracted_data
            validation_status: $validation_status
            priority: $priority
            retention_date: $retention_date
          ) {
            id
            title
            status
            validation_status
            updated_date
          }
        }
      `,
    },
    /**
     * Delete a document
     * Mutation: deleteDocument
     * 
     * Arguments:
     * - id: ID! (required)
     * 
     * Returns: Boolean
     */
    deleteDocument: {
      name: 'deleteDocument',
      description: 'Delete a document by ID',
      example: `
        mutation DeleteDocument($id: ID!) {
          deleteDocument(id: $id)
        }
      `,
    },
  },
} as const;

/**
 * User Queries and Mutations
 */
export const USER_ROUTES = {
  queries: {
    /**
     * Get all users
     * Query: users
     * 
     * Returns: [User]
     */
    users: {
      name: 'users',
      description: 'Get all users',
      example: `
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
      `,
    },
    /**
     * Get a single user by ID
     * Query: user
     * 
     * Arguments:
     * - id: ID! (required)
     * 
     * Returns: User | null
     */
    user: {
      name: 'user',
      description: 'Get a single user by ID',
      example: `
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            email
            full_name
            role
            status
            createdAt
          }
        }
      `,
    },
  },
  mutations: {
    /**
     * Create a new user
     * Mutation: createUser
     * 
     * Arguments:
     * - email: String! (required)
     * - full_name: String (optional)
     * - role: UserRole (optional)
     * - status: UserStatus (optional)
     * 
     * Returns: User
     */
    createUser: {
      name: 'createUser',
      description: 'Create a new user',
      example: `
        mutation CreateUser(
          $email: String!
          $full_name: String
          $role: UserRole
          $status: UserStatus
        ) {
          createUser(
            email: $email
            full_name: $full_name
            role: $role
            status: $status
          ) {
            id
            email
            full_name
            role
            status
          }
        }
      `,
    },
    /**
     * Update an existing user
     * Mutation: updateUser
     * 
     * Arguments:
     * - id: ID! (required)
     * - email: String (optional)
     * - full_name: String (optional)
     * - role: UserRole (optional)
     * - status: UserStatus (optional)
     * 
     * Returns: User | null
     */
    updateUser: {
      name: 'updateUser',
      description: 'Update an existing user',
      example: `
        mutation UpdateUser(
          $id: ID!
          $email: String
          $full_name: String
          $role: UserRole
          $status: UserStatus
        ) {
          updateUser(
            id: $id
            email: $email
            full_name: $full_name
            role: $role
            status: $status
          ) {
            id
            email
            full_name
            role
            status
          }
        }
      `,
    },
    /**
     * Delete a user
     * Mutation: deleteUser
     * 
     * Arguments:
     * - id: ID! (required)
     * 
     * Returns: Boolean
     */
    deleteUser: {
      name: 'deleteUser',
      description: 'Delete a user by ID',
      example: `
        mutation DeleteUser($id: ID!) {
          deleteUser(id: $id)
        }
      `,
    },
  },
} as const;

/**
 * Workspace Queries and Mutations
 */
export const WORKSPACE_ROUTES = {
  queries: {
    /**
     * Get all workspaces
     * Query: workspaces
     * 
     * Returns: [Workspace]
     */
    workspaces: {
      name: 'workspaces',
      description: 'Get all workspaces',
      example: `
        query GetWorkspaces {
          workspaces {
            id
            name
            description
            ministry
            status
            intake_methods
            retention_policy
            access_level
            createdAt
            documents {
              id
              title
              status
            }
          }
        }
      `,
    },
    /**
     * Get a single workspace by ID
     * Query: workspace
     * 
     * Arguments:
     * - id: ID! (required)
     * 
     * Returns: Workspace | null
     */
    workspace: {
      name: 'workspace',
      description: 'Get a single workspace by ID',
      example: `
        query GetWorkspace($id: ID!) {
          workspace(id: $id) {
            id
            name
            description
            ministry
            status
            intake_methods
            retention_policy
            access_level
            createdAt
            documents {
              id
              title
              status
            }
          }
        }
      `,
    },
  },
  mutations: {
    /**
     * Create a new workspace
     * Mutation: createWorkspace
     * 
     * Arguments:
     * - name: String! (required)
     * - ministry: Ministry! (required)
     * - description: String (optional)
     * - status: WorkspaceStatus (optional)
     * - intake_methods: [String!] (optional)
     * - retention_policy: RetentionPolicy (optional)
     * - access_level: AccessLevel (optional)
     * 
     * Returns: Workspace
     */
    createWorkspace: {
      name: 'createWorkspace',
      description: 'Create a new workspace',
      example: `
        mutation CreateWorkspace(
          $name: String!
          $ministry: Ministry!
          $description: String
          $status: WorkspaceStatus
          $intake_methods: [String!]
          $retention_policy: RetentionPolicy
          $access_level: AccessLevel
        ) {
          createWorkspace(
            name: $name
            ministry: $ministry
            description: $description
            status: $status
            intake_methods: $intake_methods
            retention_policy: $retention_policy
            access_level: $access_level
          ) {
            id
            name
            ministry
            status
            createdAt
          }
        }
      `,
    },
    /**
     * Update an existing workspace
     * Mutation: updateWorkspace
     * 
     * Arguments:
     * - id: ID! (required)
     * - name: String (optional)
     * - description: String (optional)
     * - status: WorkspaceStatus (optional)
     * - intake_methods: [String!] (optional)
     * - retention_policy: RetentionPolicy (optional)
     * - access_level: AccessLevel (optional)
     * 
     * Returns: Workspace | null
     */
    updateWorkspace: {
      name: 'updateWorkspace',
      description: 'Update an existing workspace',
      example: `
        mutation UpdateWorkspace(
          $id: ID!
          $name: String
          $description: String
          $status: WorkspaceStatus
          $intake_methods: [String!]
          $retention_policy: RetentionPolicy
          $access_level: AccessLevel
        ) {
          updateWorkspace(
            id: $id
            name: $name
            description: $description
            status: $status
            intake_methods: $intake_methods
            retention_policy: $retention_policy
            access_level: $access_level
          ) {
            id
            name
            status
            updatedAt
          }
        }
      `,
    },
    /**
     * Delete a workspace
     * Mutation: deleteWorkspace
     * 
     * Arguments:
     * - id: ID! (required)
     * 
     * Returns: Boolean
     */
    deleteWorkspace: {
      name: 'deleteWorkspace',
      description: 'Delete a workspace by ID',
      example: `
        mutation DeleteWorkspace($id: ID!) {
          deleteWorkspace(id: $id)
        }
      `,
    },
  },
} as const;

/**
 * All available GraphQL routes
 */
export const ALL_GRAPHQL_ROUTES = {
  endpoint: GRAPHQL_ROUTES.endpoint,
  playground: GRAPHQL_ROUTES.playground,
  document: DOCUMENT_ROUTES,
  user: USER_ROUTES,
  workspace: WORKSPACE_ROUTES,
} as const;

