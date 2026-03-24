import { AsyncLocalStorage } from "async_hooks";

export interface RequestContextData {
  requestId: string;
  actorId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextData>();

export function getRequestContext(): RequestContextData | undefined {
  return requestContext.getStore();
}
