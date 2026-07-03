import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client, Connection } from "@temporalio/client";

type HarnessMode = "start" | "cleanup";

type HarnessConfig = {
  mode: HarnessMode;
  address: string;
  namespace: string;
  taskQueue: string;
  runId: string;
  workflowIdPrefix: string;
  ratePerSecond: number;
  durationSeconds: number;
  totalWorkflows: number;
  maxStartConcurrency: number;
  holdTimeout: string;
  cleanupAfterRun: boolean;
  summaryPath: string;
};

type HumanGateNode = {
  id: "hold";
  type: "humanGate";
  label: string;
  signal: {
    name: string;
  };
  timeout: string;
  onTimeout: "continue";
};

type GraphWorkflowInput = {
  graph: {
    schemaVersion: "1.0";
    metadata: {
      name: string;
      description: string;
      tags: string[];
    };
    nodes: Record<"hold", HumanGateNode>;
    edges: [];
    entryNodeId: "hold";
    ctx: Record<string, never>;
  };
  initialCtx: {
    loadTestRunId: string;
  };
  configHash: string;
  runnerVersion: "1.0.0";
  requestId: string;
};

type WorkflowStartRecord = {
  workflowId: string;
  runId?: string;
  startedAt: string;
};

type FailureRecord = {
  workflowId: string;
  message: string;
};

type Summary = {
  mode: HarnessMode;
  runId: string;
  workflowIdPrefix: string;
  address: string;
  namespace: string;
  taskQueue: string;
  ratePerSecond: number;
  durationSeconds: number;
  totalWorkflows: number;
  maxStartConcurrency: number;
  holdTimeout: string;
  cleanupAfterRun: boolean;
  started: number;
  failed: number;
  terminated: number;
  elapsedMs: number;
  startedAt: string;
  finishedAt: string;
  workflows: WorkflowStartRecord[];
  failures: FailureRecord[];
};

const DEFAULT_RESULTS_DIR = path.join(process.cwd(), "results");
const DEFAULT_SUMMARY_PATH = path.join(
  DEFAULT_RESULTS_DIR,
  "temporal-queue-saturation-summary.json",
);

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function getPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return parsed;
}

function getPositiveInteger(name: string, fallback: number): number {
  const parsed = getPositiveNumber(name, fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function getBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) {
    return false;
  }

  throw new Error(`${name} must be true or false`);
}

function sanitizeRunId(runId: string): string {
  const sanitized = runId.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (sanitized.length === 0) {
    throw new Error(
      "LOAD_TEST_RUN_ID must contain at least one safe character",
    );
  }

  return sanitized;
}

function getMode(): HarnessMode {
  const rawMode = process.argv[2] ?? "start";
  if (rawMode === "start" || rawMode === "cleanup") {
    return rawMode;
  }

  throw new Error(`Unsupported mode "${rawMode}". Use "start" or "cleanup".`);
}

function getConfig(): HarnessConfig {
  const mode = getMode();
  const ratePerSecond = getPositiveNumber(
    "LOAD_TEST_TEMPORAL_RATE_PER_SECOND",
    5,
  );
  const durationSeconds = getPositiveInteger(
    "LOAD_TEST_TEMPORAL_DURATION_SECONDS",
    60,
  );
  const totalOverride = process.env.LOAD_TEST_TEMPORAL_TOTAL_WORKFLOWS;
  const totalWorkflows =
    totalOverride === undefined || totalOverride.trim() === ""
      ? Math.max(1, Math.floor(ratePerSecond * durationSeconds))
      : getPositiveInteger("LOAD_TEST_TEMPORAL_TOTAL_WORKFLOWS", 1);
  const runId = sanitizeRunId(
    getEnv(
      "LOAD_TEST_RUN_ID",
      `temporal-saturation-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    ),
  );

  return {
    mode,
    address: getEnv("TEMPORAL_ADDRESS", "localhost:7233"),
    namespace: getEnv("TEMPORAL_NAMESPACE", "default"),
    taskQueue: getEnv("TEMPORAL_TASK_QUEUE", "ocr-processing"),
    runId,
    workflowIdPrefix: `load-test-temporal-${runId}`,
    ratePerSecond,
    durationSeconds,
    totalWorkflows,
    maxStartConcurrency: getPositiveInteger(
      "LOAD_TEST_TEMPORAL_START_CONCURRENCY",
      10,
    ),
    holdTimeout: getEnv("LOAD_TEST_TEMPORAL_HOLD_TIMEOUT", "30 minutes"),
    cleanupAfterRun: getBoolean("LOAD_TEST_TEMPORAL_CLEANUP", true),
    summaryPath: getEnv(
      "LOAD_TEST_TEMPORAL_SUMMARY_PATH",
      DEFAULT_SUMMARY_PATH,
    ),
  };
}

function buildWorkflowInput(config: HarnessConfig): GraphWorkflowInput {
  return {
    graph: {
      schemaVersion: "1.0",
      metadata: {
        name: "Load test Temporal queue saturation hold graph",
        description:
          "Generic human-gate graph used to create workflow-task pressure without document-specific fixtures.",
        tags: ["load-test", "temporal-saturation"],
      },
      nodes: {
        hold: {
          id: "hold",
          type: "humanGate",
          label: "Hold workflow open for saturation observation",
          signal: {
            name: `release-${config.runId}`,
          },
          timeout: config.holdTimeout,
          onTimeout: "continue",
        },
      },
      edges: [],
      entryNodeId: "hold",
      ctx: {},
    },
    initialCtx: {
      loadTestRunId: config.runId,
    },
    configHash: "load-test-temporal-saturation-v1",
    runnerVersion: "1.0.0",
    requestId: config.runId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function startWorkflow(
  client: Client,
  config: HarnessConfig,
  sequence: number,
): Promise<WorkflowStartRecord> {
  const workflowId = `${config.workflowIdPrefix}-${sequence.toString().padStart(6, "0")}`;
  const handle = await client.workflow.start("graphWorkflow", {
    taskQueue: config.taskQueue,
    workflowId,
    args: [buildWorkflowInput(config)],
  });

  return {
    workflowId,
    runId: handle.firstExecutionRunId,
    startedAt: new Date().toISOString(),
  };
}

async function terminateWorkflows(
  client: Client,
  workflows: WorkflowStartRecord[],
): Promise<number> {
  let terminated = 0;

  for (const workflow of workflows) {
    try {
      await client.workflow
        .getHandle(workflow.workflowId, workflow.runId)
        .terminate("load-test temporal queue saturation cleanup");
      terminated++;
    } catch (error) {
      console.warn(
        `Failed to terminate ${workflow.workflowId}: ${getErrorMessage(error)}`,
      );
    }
  }

  return terminated;
}

async function readSummary(config: HarnessConfig): Promise<Summary> {
  const raw = await readFile(config.summaryPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("workflows" in parsed) ||
    !Array.isArray(parsed.workflows)
  ) {
    throw new Error(
      `Summary file ${config.summaryPath} is not a valid harness summary`,
    );
  }

  return parsed as Summary;
}

async function writeSummary(
  summaryPath: string,
  summary: Summary,
): Promise<void> {
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
}

async function runStartMode(
  client: Client,
  config: HarnessConfig,
): Promise<Summary> {
  const startedAt = new Date();
  const workflows: WorkflowStartRecord[] = [];
  const failures: FailureRecord[] = [];
  const activeStarts = new Set<Promise<void>>();
  const intervalMs = 1000 / config.ratePerSecond;

  for (let sequence = 1; sequence <= config.totalWorkflows; sequence++) {
    const scheduledStart = startedAt.getTime() + (sequence - 1) * intervalMs;
    const waitMs = scheduledStart - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    while (activeStarts.size >= config.maxStartConcurrency) {
      await Promise.race(activeStarts);
    }

    const startPromise = startWorkflow(client, config, sequence)
      .then((workflow) => {
        workflows.push(workflow);
        console.log(`started ${workflow.workflowId}`);
      })
      .catch((error: unknown) => {
        const workflowId = `${config.workflowIdPrefix}-${sequence
          .toString()
          .padStart(6, "0")}`;
        const message = getErrorMessage(error);
        failures.push({ workflowId, message });
        console.error(`failed ${workflowId}: ${message}`);
      })
      .finally(() => {
        activeStarts.delete(startPromise);
      });

    activeStarts.add(startPromise);
  }

  await Promise.all(activeStarts);

  const terminated = config.cleanupAfterRun
    ? await terminateWorkflows(client, workflows)
    : 0;
  const finishedAt = new Date();

  return {
    mode: config.mode,
    runId: config.runId,
    workflowIdPrefix: config.workflowIdPrefix,
    address: config.address,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    ratePerSecond: config.ratePerSecond,
    durationSeconds: config.durationSeconds,
    totalWorkflows: config.totalWorkflows,
    maxStartConcurrency: config.maxStartConcurrency,
    holdTimeout: config.holdTimeout,
    cleanupAfterRun: config.cleanupAfterRun,
    started: workflows.length,
    failed: failures.length,
    terminated,
    elapsedMs: finishedAt.getTime() - startedAt.getTime(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    workflows,
    failures,
  };
}

async function runCleanupMode(
  client: Client,
  config: HarnessConfig,
): Promise<Summary> {
  const startedAt = new Date();
  const priorSummary = await readSummary(config);
  const terminated = await terminateWorkflows(client, priorSummary.workflows);
  const finishedAt = new Date();

  return {
    ...priorSummary,
    mode: "cleanup",
    terminated,
    cleanupAfterRun: true,
    elapsedMs: finishedAt.getTime() - startedAt.getTime(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
}

async function main(): Promise<void> {
  const config = getConfig();
  const connection = await Connection.connect({ address: config.address });
  const client = new Client({
    connection,
    namespace: config.namespace,
  });

  try {
    const summary =
      config.mode === "cleanup"
        ? await runCleanupMode(client, config)
        : await runStartMode(client, config);
    await writeSummary(config.summaryPath, summary);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(getErrorMessage(error));
  process.exit(1);
});
