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
  STATIC_ALERT_RULES,
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
  // Also fire when there are errors but app_success_total has never been
  // recorded (series absent), which makes the ratio expression return no data.
  return (
    `(${errRate} / (${errRate} + ${successRate}) > ${threshold})` +
    ` or (${errRate} > 0 unless ${successRate} > 0)`
  );
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

  // Group entries by job
  const byJob = new Map<string, typeof entries>();
  for (const entry of entries) {
    const job = entry[1].job;
    if (!byJob.has(job)) byJob.set(job, []);
    byJob.get(job)!.push(entry);
  }

  // Ensure both known groups exist even if empty
  const knownJobs: Array<"backend-services" | "temporal-worker"> = [
    "backend-services",
    "temporal-worker",
  ];
  for (const job of knownJobs) {
    if (!byJob.has(job)) byJob.set(job, []);
  }

  /**
   * Builds a catch-all rule that fires for any app_error_total on a given job.
   */
  function buildCatchAll(job: string, jobEntries: typeof entries): string {
    const jobLabel = job
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("");
    // The catch-all must wait at least as long as the longest specific alert's
    // `for` duration so that specific alerts are always firing before the
    // catch-all fires — allowing inhibition rules to suppress the generic alert.
    const maxFor = jobEntries.some((e) => e[1].mode === "error-rate")
      ? "2m"
      : "0m";
    return [
      `    - alert: Any${jobLabel}Error`,
      `      expr: >-`,
      `        increase(app_error_total{job="${job}"}[5m]) > 0`,
      `      for: ${maxFor}`,
      `      labels:`,
      `        severity: warning`,
      `      annotations:`,
      `        summary: "Application error detected on ${job} ({{ $labels.type }})"`,
      `        description: "An alertable error of type {{ $labels.type }} was logged on ${job} within the last 5 minutes."`,
    ].join("\n");
  }

  const groups = [...byJob.entries()]
    .map(([job, jobEntries]) => {
      const specificRules = jobEntries
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
            `        type: ${alertType}`,
            `      annotations:`,
            `        summary: "${config.summary}"`,
            `        description: "${config.description}"`,
          ].join("\n");
        })
        .join("\n\n");

      const catchAll = buildCatchAll(job, jobEntries);
      const groupName = job.replace(/-/g, "_") + "_alerts";

      const rules =
        specificRules.length > 0
          ? specificRules + "\n\n" + catchAll
          : catchAll;

      return [`  - name: ${groupName}`, `    rules:`, rules].join("\n");
    })
    .join("\n\n");

  const staticRulesByJob = new Map<string, typeof STATIC_ALERT_RULES>();
  for (const rule of STATIC_ALERT_RULES) {
    const key = rule.job ?? "shared";
    if (!staticRulesByJob.has(key)) staticRulesByJob.set(key, []);
    staticRulesByJob.get(key)!.push(rule);
  }

  function renderStaticRule(rule: (typeof STATIC_ALERT_RULES)[number]): string {
    return [
      `    - alert: ${rule.name}`,
      `      expr: >-`,
      `        ${rule.expr}`,
      `      for: ${rule.forDuration}`,
      ...(rule.severity !== undefined
        ? [`      labels:`, `        severity: ${rule.severity}`]
        : []),
      `      annotations:`,
      `        summary: "${rule.summary}"`,
      `        description: "${rule.description}"`,
    ].join("\n");
  }

  const staticGroups = [...staticRulesByJob.entries()]
    .map(([job, rules]) => {
      const groupName =
        job === "shared"
          ? "shared_static_alerts"
          : job.replace(/-/g, "_") + "_static_alerts";
      return [
        `  - name: ${groupName}`,
        `    rules:`,
        rules.map(renderStaticRule).join("\n\n"),
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
    groups,
    ``,
    staticGroups,
  ].join("\n");
}

const yaml = generateRulesYaml();
for (const outputPath of OUTPUT_PATHS) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, yaml + "\n", "utf-8");
  console.log(`Generated: ${outputPath}`);
}
