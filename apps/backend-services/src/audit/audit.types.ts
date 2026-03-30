/**
 * Input for recording a single audit event.
 * All fields except event_type, resource_type, and resource_id are optional.
 */
export interface CreateAuditEventInput {
  event_type: string;
  resource_type: string;
  resource_id: string;
  actor_id?: string;
  document_id?: string;
  workflow_execution_id?: string;
  group_id?: string;
  request_id?: string;
  payload?: Record<string, unknown>;
}
