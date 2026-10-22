import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContextData {
  requestId: string;
  actorId?: string;
  userId?: string;
  sessionId?: string;
  apiKeyId?: string;
  clientIp?: string;
  /**
   * Set while a custom step's (dynamic node's) call is handled: the Temporal
   * run id of the workflow execution running the step, and the step's slug.
   */
  dynamicNodeRun?: { workflowExecutionId: string; slug: string };
}

export const requestContext = new AsyncLocalStorage<RequestContextData>();

export function getRequestContext(): RequestContextData | undefined {
  return requestContext.getStore();
}
