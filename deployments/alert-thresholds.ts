// This file is a re-export facade. All alert configuration lives in
// packages/alert-config so it can be shared with application services
// (backend-services, temporal) without reaching into the deployments directory.
export type {
  AlertMode,
  AlertThresholdConfig,
  StaticAlertRule,
} from "../packages/alert-config/src";
export {
  ALERT_THRESHOLDS,
  DEFAULT_ALERT_THRESHOLD,
  HTTP_ERROR_RATE_THRESHOLD,
  HTTP_P95_LATENCY_THRESHOLD_S,
  NODE_HEAP_RATIO_THRESHOLD,
  STATIC_ALERT_RULES,
} from "../packages/alert-config/src";
