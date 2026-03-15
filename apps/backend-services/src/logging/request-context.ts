import { AsyncLocalStorage } from "async_hooks";

export interface RequestContextData {
  requestId: string;
  userId?: string;
  sessionId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextData>();

export function getRequestContext(): RequestContextData | undefined {
  return requestContext.getStore();
}
