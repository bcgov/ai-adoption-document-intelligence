/**
 * GraphQL Routes Constants
 * 
 * Simple constants for GraphQL endpoint paths
 * Use these constants throughout the application for consistency
 */

export const GRAPHQL_ENDPOINT = '/graphql';
export const GRAPHQL_PLAYGROUND = '/graphql';

/**
 * Route paths for different GraphQL operations
 */
export const GRAPHQL_ROUTES = {
  endpoint: GRAPHQL_ENDPOINT,
  playground: GRAPHQL_PLAYGROUND,
} as const;

/**
 * Query names
 */
export const QUERIES = {
  // Document queries
  DOCUMENTS: 'documents',
  DOCUMENT: 'document',
  
  // User queries
  USERS: 'users',
  USER: 'user',
  
  // Workspace queries
  WORKSPACES: 'workspaces',
  WORKSPACE: 'workspace',
} as const;

/**
 * Mutation names
 */
export const MUTATIONS = {
  // Document mutations
  CREATE_DOCUMENT: 'createDocument',
  UPDATE_DOCUMENT: 'updateDocument',
  DELETE_DOCUMENT: 'deleteDocument',
  
  // User mutations
  CREATE_USER: 'createUser',
  UPDATE_USER: 'updateUser',
  DELETE_USER: 'deleteUser',
  
  // Workspace mutations
  CREATE_WORKSPACE: 'createWorkspace',
  UPDATE_WORKSPACE: 'updateWorkspace',
  DELETE_WORKSPACE: 'deleteWorkspace',
} as const;

