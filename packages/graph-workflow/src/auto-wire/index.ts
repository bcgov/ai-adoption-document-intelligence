export {
  AUTO_CTX_KEY_PREFIX,
  isAutoCtxKey,
  synthesiseCtxKey,
} from "./synthesise-ctx-key";
export { upstreamNodesWithDistance } from "./upstream-walk";
export {
  resolveInputPort,
  type PortResolution,
} from "./resolve-input-port";
export { getLockedInputPorts, getLockedOutputPorts } from "./lock-list";
export { normaliseLocks } from "./normalise-locks";
export { stripRedundantLocks } from "./strip-redundant-locks";
export { resolveBindings } from "./resolver";
export { shouldAutoWirePort } from "./should-auto-wire";
