import { gql } from '@apollo/client';

// User Queries
export const GET_USERS = gql`
  query GetUsers {
    users {
      id
      email
      full_name
      role
      status
      createdAt
      updatedAt
    }
  }
`;

export const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      email
      full_name
      role
      status
      createdAt
      updatedAt
    }
  }
`;

// Workspace Queries
export const GET_WORKSPACES = gql`
  query GetWorkspaces {
    workspaces {
      id
      name
      ministry
      description
      status
      intake_methods
      retention_policy
      access_level
      createdAt
      updatedAt
      documents {
        id
        title
        status
      }
    }
  }
`;

export const GET_WORKSPACE = gql`
  query GetWorkspace($id: ID!) {
    workspace(id: $id) {
      id
      name
      ministry
      description
      status
      intake_methods
      retention_policy
      access_level
      createdAt
      updatedAt
      documents {
        id
        title
        status
        file_url
        file_type
        created_date
      }
    }
  }
`;

// Document Queries
export const GET_DOCUMENTS = gql`
  query GetDocuments(
    $workspace_id: ID
    $status: DocumentStatus
    $ministry: Ministry
    $limit: Int
  ) {
    documents(
      workspace_id: $workspace_id
      status: $status
      ministry: $ministry
      limit: $limit
    ) {
      id
      title
      file_url
      file_type
      intake_method
      workspace_id
      status
      confidence_score
      extracted_data
      validation_status
      ministry
      priority
      retention_date
      created_date
      updatedAt
      workspace {
        id
        name
        ministry
      }
    }
  }
`;

export const GET_DOCUMENT = gql`
  query GetDocument($id: ID!) {
    document(id: $id) {
      id
      title
      file_url
      file_type
      intake_method
      workspace_id
      status
      confidence_score
      extracted_data
      validation_status
      ministry
      priority
      retention_date
      created_date
      updatedAt
      workspace {
        id
        name
        ministry
        description
      }
    }
  }
`;

// User Mutations
export const CREATE_USER = gql`
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
`;

export const UPDATE_USER = gql`
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
`;

export const DELETE_USER = gql`
  mutation DeleteUser($id: ID!) {
    deleteUser(id: $id)
  }
`;

// Workspace Mutations
export const CREATE_WORKSPACE = gql`
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
      description
      status
      intake_methods
      retention_policy
      access_level
      createdAt
    }
  }
`;

export const UPDATE_WORKSPACE = gql`
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
      ministry
      description
      status
      intake_methods
      retention_policy
      access_level
      updatedAt
    }
  }
`;

export const DELETE_WORKSPACE = gql`
  mutation DeleteWorkspace($id: ID!) {
    deleteWorkspace(id: $id)
  }
`;

// Document Mutations
export const CREATE_DOCUMENT = gql`
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
      file_type
      intake_method
      workspace_id
      status
      confidence_score
      extracted_data
      validation_status
      ministry
      priority
      retention_date
      created_date
    }
  }
`;

export const UPDATE_DOCUMENT = gql`
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
      confidence_score
      extracted_data
      validation_status
      priority
      retention_date
      updatedAt
    }
  }
`;

export const DELETE_DOCUMENT = gql`
  mutation DeleteDocument($id: ID!) {
    deleteDocument(id: $id)
  }
`;





