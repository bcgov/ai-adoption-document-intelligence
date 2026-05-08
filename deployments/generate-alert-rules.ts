/**
 * Generates Prometheus alert rules YAML from deployments/alert-thresholds.ts.
 *
 * Usage:
 *   npm run generate:alert-rules
 *
 * Output:
 *   deployments/local/prometheus/rules/app-alerts.yml
 *
 * After running, reload Prometheus (or restart the monitoring stack) to pick up
 * the new rules:
 *   npm run dev:monitoring:down && npm run dev:monitoring
 */

import * as fs from "fs";
import * as path from "path";
import {
  ALERT_THRESHOLDS,
  type AlertThresholdConfig,
} from "./alert-thresholds";

const OUTPUT_PATHS = [
  // Local monitoring stack (docker-compose)
  path.resolve(__dirname, "local/prometheus/rules/app-alerts.yml"),
  // OpenShift Helm chart — read by the prometheus-rules ConfigMap template
  path.resolve(
    __dirname,
    "openshift/helm/plg/files/app-alerts.yml",
  ),
];

/**
 * Converts a snake_case alertType string to a PascalCase alert name.
 * e.g. "classifier_training_failed" → "ClassifierTrainingFailed"
 */
function toAlertName(alertType: string): string {
  return alertType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Builds the Prometheus `expr` string for the given config.
 */
function buildExpr(alertType: string, config: AlertThresholdConfig): string {
  const w = config.window ?? "5m";
  if (config.mode === "any-error") {
    return `increase(app_error_total{type="${alertType}"}[${w}]) > 0`;
  }
  // error-rate mode
  const threshold = config.errorRateThreshold ?? 0.01;
  const errRate = `rate(app_error_total{type="${alertType}"}[${w}])`;
  const successRate = `rate(app_success_total{type="${alertType}"}[${w}])`;
  return `${errRate} / (${errRate} + ${successRate}) > ${threshold}`;
}

/**
 * Determines the `for` duration — how long the condition must hold before
 * the alert fires. "any-error" fires immediately (for: 0m) since we never
 * want to miss an error. "error-rate" uses a 2-minute window to avoid
 * flapping on brief rate spikes.
 */
function buildFor(config: AlertThresholdConfig): string {
  return config.mode === "any-error" ? "0m" : "2m";
}

function generateRulesYaml(): string {
  const entries = Object.entries(ALERT_THRESHOLDS);

  const rules = entries
    .map(([alertType, config]) => {
      const name = toAlertName(alertType);
      const expr = buildExpr(alertType, config);
      const forDuration = buildFor(config);

      return [
        `    - alert: ${name}`,
        `      expr: >-`,
        `        ${expr}`,
        `      for: ${forDuration}`,
        `      labels:`,
        `        severity: ${config.severity}`,
        `      annotations:`,
        `        summary: "${config.summary}"`,
        `        description: "${config.description}"`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# ============================================================`,
    `# AUTO-GENERATED — do not edit directly.`,
    `# Source of truth: deployments/alert-thresholds.ts`,
    `# Regenerate:      npm run generate:alert-rules`,
    `# ============================================================`,
    `#`,
    `# Counters driving these rules (emitted by the shared logger hook):`,
    `#   app_error_total{type, severity}  — incremented on warn/error log level`,
    `#   app_success_total{type}          — incremented on info/debug log level`,
    `#   app_recovery_total{type}         — incremented on first info/debug after an error`,
    `#`,
    `# To add a new alert:`,
    `#   1. Add alertType to log context in application code.`,
    `#   2. Add an entry to ALERT_THRESHOLDS in deployments/alert-thresholds.ts.`,
    `#   3. Run: npm run generate:alert-rules`,
    `#`,
    `groups:`,
    `  - name: app_alerts`,
    `    rules:`,
    rules,
  ].join("\n");
}

const yaml = generateRulesYaml();
for (const outputPath of OUTPUT_PATHS) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, yaml + "\n", "utf-8");
  console.log(`Generated: ${outputPath}`);
}
