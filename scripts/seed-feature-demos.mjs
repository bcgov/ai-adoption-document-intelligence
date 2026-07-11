#!/usr/bin/env node
/**
 * Seed a set of "feature demo" workflows into the local seed group and generate
 * a click-through guide (docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md) with a
 * deep link + instructions for each visual feature of the workflow builder.
 *
 * Why: the full MANUAL_TEST_PLAN.md walks every feature from scratch. This lets
 * you jump straight to a pre-built workflow that already demonstrates one thing.
 *
 * Usage (backend must be running on :3002):
 *   node scripts/seed-feature-demos.mjs
 *
 * It is idempotent: every run deletes the previously-seeded demos (matched by
 * the "🎯 Demo — " name prefix) and recreates them, then rewrites the guide
 * with the fresh workflow ids. Re-run it after a DB reset (`npm run test:db:reset`)
 * to refresh the links.
 *
 * Env: BACKEND_URL (default http://localhost:3002), FRONTEND_URL
 * (default http://localhost:3000), TEST_API_KEY (defaults to the documented
 * local seed key, matching playwright.config.ts).
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the backend .env so we authenticate with the SAME key the DB was seeded
// with: `seed.ts` (`prisma db seed`) reads `TEST_API_KEY` from this file via
// `dotenv/config`, and the backend validates `x-api-key` against that seeded
// value. Without this the hardcoded fallback only works when the DB happened to
// be seeded with the default key. Mirrors playwright.config.ts. (`loadEnvFile`
// does not overwrite an already-set shell var, matching dotenv semantics.)
// The backend validates `x-api-key` against the value the DB was seeded with,
// which — depending on how `prisma db seed` ran — may be the shell env, the
// backend .env's `TEST_API_KEY`, or the documented default. Rather than guess,
// we gather all three and probe which one the running backend accepts.
const DEFAULT_KEY = "69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY";
const SHELL_KEY = process.env.TEST_API_KEY; // captured before loading .env
const BACKEND_ENV = resolve(__dirname, "../apps/backend-services/.env");
try {
  if (existsSync(BACKEND_ENV)) process.loadEnvFile(BACKEND_ENV);
} catch {
  // Older Node without loadEnvFile, or unreadable — rely on the other sources.
}
const CANDIDATE_KEYS = [
  ...new Set([SHELL_KEY, process.env.TEST_API_KEY, DEFAULT_KEY].filter(Boolean)),
];

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3002";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const GROUP_ID = "seeddefaultgroup";
const NAME_PREFIX = "🎯 Demo — ";
const GUIDE_PATH = resolve(
  __dirname,
  "../docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md",
);

let apiKey = ""; // resolved by resolveApiKey() before any write
const authHeaders = () => ({
  "x-api-key": apiKey,
  "Content-Type": "application/json",
});
const pos = (x, y) => ({ metadata: { position: { x, y } } });

async function api(method, path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

// ---------------------------------------------------------------------------
// Config builders — mirror the shapes the e2e specs build (known-valid).
// ---------------------------------------------------------------------------

function typedChainConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: { blobKey: { type: "string" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        ...pos(80, 120),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        ...pos(400, 120),
      },
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract",
        activityType: "azureOcr.extract",
        ...pos(720, 120),
      },
      clean: {
        id: "clean",
        type: "activity",
        label: "Cleanup",
        activityType: "ocr.cleanup",
        ...pos(360, 340),
      },
    },
    edges: [
      { id: "e1", source: "prep", target: "submit", type: "normal" },
      { id: "e2", source: "submit", target: "extract", type: "normal" },
      { id: "e3", source: "extract", target: "clean", type: "normal" },
    ],
  };
}

function autoWireConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: { blobKey: { type: "string" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        ...pos(80, 120),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit OCR (auto-bound)",
        activityType: "azureOcr.submit",
        ...pos(420, 120),
      },
      lone: {
        id: "lone",
        type: "activity",
        label: "Lone Submit (unsatisfied)",
        activityType: "azureOcr.submit",
        ...pos(420, 360),
      },
    },
    edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
  };
}

function ambiguousConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prepA",
    ctx: { blobKey: { type: "string" } },
    nodes: {
      prepA: {
        id: "prepA",
        type: "activity",
        label: "Prepare A",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        ...pos(80, 80),
      },
      normB: {
        id: "normB",
        type: "activity",
        label: "Normalize B",
        activityType: "document.normalizeOrientation",
        ...pos(80, 320),
      },
      sink: {
        id: "sink",
        type: "activity",
        label: "Submit OCR (ambiguous)",
        activityType: "azureOcr.submit",
        ...pos(460, 200),
      },
    },
    edges: [
      { id: "a", source: "prepA", target: "sink", type: "normal" },
      { id: "b", source: "normB", target: "sink", type: "normal" },
    ],
  };
}

function linearConfig(name, submitLabel = "Submit to Azure OCR") {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {
      blobKey: { type: "string" },
      fileName: { type: "string" },
      preparedFileData: { type: "object" },
      apimRequestId: { type: "string" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [
          { port: "blobKey", ctxKey: "blobKey" },
          { port: "fileName", ctxKey: "fileName" },
        ],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        ...pos(120, 80),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: submitLabel,
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
        outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        ...pos(420, 80),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        inputs: [{ port: "documentId", ctxKey: "apimRequestId" }],
        ...pos(720, 80),
      },
    },
    edges: [
      { id: "prep-submit", source: "prep", target: "submit", type: "normal" },
      { id: "submit-store", source: "submit", target: "store", type: "normal" },
    ],
  };
}

function validationWarningConfig(name) {
  const config = linearConfig(name);
  // An orphan node with no incoming edge → reachability WARNING (not an error,
  // so the create endpoint still accepts it).
  config.nodes.orphan = {
    id: "orphan",
    type: "activity",
    label: "Orphan (unreachable)",
    activityType: "file.prepare",
    inputs: [
      { port: "blobKey", ctxKey: "blobKey" },
      { port: "fileName", ctxKey: "fileName" },
    ],
    ...pos(420, 340),
  };
  return config;
}

function sourcePrepConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: { documentUrl: { type: "string" } },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        ...pos(120, 300),
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
        ...pos(460, 300),
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Demo definitions — each becomes one seeded workflow + one guide section.
// ---------------------------------------------------------------------------

const DEMOS = [
  {
    key: "typed-io",
    title: "Typed I/O — coloured handles & type pills (Part 7)",
    config: typedChainConfig,
    steps: [
      "Look at the node handles: single-typed ports are **coloured**; a node with multiple same-kind outputs (Submit OCR) shows a **grey wildcard** handle.",
      "Hover a handle to see its kind (e.g. `OcrResult`) or the multi-output prompt.",
      "Click **Cleanup** — the settings panel shows an **arrow** type pill (one typed port each side).",
      "Click **Extract** — it shows a **stacked** pill listing all 5 input ports.",
    ],
  },
  {
    key: "autowire",
    title: "Auto-wire — typed input binding states (Part 8)",
    config: autoWireConfig,
    steps: [
      "Select **Submit OCR (auto-bound)** → the Inputs section shows its `fileData` auto-bound to *Prepare* with an **auto** badge and an **Override** button. No status dot.",
      "Select **Lone Submit (unsatisfied)** → its input shows **Needs source** and the node carries a red **unsatisfied** status dot (no upstream producer).",
      "On the auto-bound node, click **Override** → the binding locks; click **Revert to auto** to restore it.",
    ],
  },
  {
    key: "ambiguous",
    title: "Auto-wire — ambiguous source picker (Part 8)",
    config: ambiguousConfig,
    steps: [
      "Two Document producers (*Prepare A*, *Normalize B*) both feed **Submit OCR** — the resolver can't choose.",
      "Select **Submit OCR (ambiguous)** → its `fileData` input shows **Choose source** and the node carries an amber **ambiguous** status dot.",
      "Use the producer picker to pick one — the dot clears.",
    ],
  },
  {
    key: "validation",
    title: "Validation surfacing — warning badge & drawer (5.4)",
    config: validationWarningConfig,
    steps: [
      "The **Orphan (unreachable)** node has no incoming edge → a validation issue is computed on load (no Save needed).",
      "The top-bar summary reads **1 warning** (amber); the orphan node shows an amber count badge.",
      "Click the node's badge → the **Validation** drawer opens with an entry anchored to `nodes.orphan` and the message *“…is not reachable from entry node…”*.",
    ],
  },
  {
    key: "node-settings",
    title: "Node settings panel & canvas basics (Part 3)",
    config: (n) => linearConfig(n),
    steps: [
      "Click **Submit to Azure OCR** → the settings panel shows the editable label + a type badge.",
      "Edit the label and blur — the node updates live.",
      "Toggle **Advanced** to reveal the raw port bindings.",
    ],
  },
  {
    key: "try-preview",
    title: "Try-in-place — run a workflow & see previews (Part 9)",
    config: sourcePrepConfig,
    infra: true,
    steps: [
      "Select the **Upload** source node → use **Upload & Try** and pick any PDF/image.",
      "Watch the per-node **run-status badges** go blue → green as the run executes (no Azure needed — this chain just prepares the file).",
      "The **Upload** node renders a **document preview** of what you uploaded.",
      "⚠️ Requires the Temporal **worker** + **deno-runner** to be running (the `dev: all` task).",
    ],
  },
  {
    key: "versioning",
    title: "Versioning — history & revert (Part 12)",
    config: (n) => linearConfig(n, "Submit to Azure OCR"),
    secondVersion: (n) => linearConfig(n, "Submit to Azure OCR (v2 — edited)"),
    steps: [
      "This workflow has **two saved versions**. Open **More ▸ History**.",
      "You'll see `v2` (head) and `v1`, newest-first, each with a timestamp.",
      "Click **Revert** on `v1` → confirm → the canvas reloads v1's config (the Submit label reverts) and v1 becomes head.",
      "Use **Compare to head** to see the two configs side-by-side.",
    ],
  },
  {
    key: "library",
    title: "Library workflow (Part 10)",
    config: (n) => linearConfig(n),
    kind: "library",
    steps: [
      "This is a **library** workflow (a reusable building block, not a top-level runnable).",
      "Open the workflows list and switch to the **Library** view/kind — this entry appears there.",
      "In another workflow you can drop a **Child workflow** node and pick this from the Library picker.",
    ],
  },
];

// ---------------------------------------------------------------------------

function unwrap(created) {
  return created && created.workflow ? created.workflow : created;
}

function listItems(list) {
  if (Array.isArray(list)) return list;
  return list.workflows ?? list.data ?? list.items ?? [];
}

async function deleteExistingDemos() {
  // The default list is primary-kind only; sweep the library kind too so the
  // library demo is also replaced (otherwise it accumulates across re-runs).
  const seen = new Map();
  for (const q of ["", "&kind=library"]) {
    const list = await api("GET", `/api/workflows?limit=200${q}`).catch(
      () => ({}),
    );
    for (const w of listItems(list)) {
      if ((w.name || "").startsWith(NAME_PREFIX)) seen.set(w.id, w);
    }
  }
  for (const id of seen.keys()) {
    await api("DELETE", `/api/workflows/${id}`).catch(() => {});
  }
  return seen.size;
}

async function seed() {
  console.log(`Seeding feature demos → ${BACKEND_URL} (group ${GROUP_ID})`);
  const removed = await deleteExistingDemos();
  if (removed) console.log(`  cleared ${removed} previous demo(s)`);

  const results = [];
  for (const demo of DEMOS) {
    const name = `${NAME_PREFIX}${demo.title}`;
    const config =
      typeof demo.config === "function" ? demo.config(name) : demo.config;
    const created = unwrap(
      await api("POST", "/api/workflows", {
        name,
        config,
        groupId: GROUP_ID,
        kind: demo.kind,
      }),
    );
    if (demo.secondVersion) {
      await api("PUT", `/api/workflows/${created.id}`, {
        name,
        config: demo.secondVersion(name),
        groupId: GROUP_ID,
      });
    }
    results.push({ ...demo, id: created.id });
    console.log(`  ✓ ${demo.key.padEnd(14)} ${created.id}`);
  }
  return results;
}

function renderGuide(results) {
  const link = (id) => `${FRONTEND_URL}/workflows/${id}/edit`;
  const lines = [];
  lines.push("# Workflow Builder — Feature Demo Guide");
  lines.push("");
  lines.push(
    "A fast, click-through companion to `MANUAL_TEST_PLAN.md`. Each entry is a" +
      " pre-built workflow that demonstrates **one** feature — open the link and" +
      " follow the steps, no set-up required.",
  );
  lines.push("");
  lines.push("> **Generated by** `scripts/seed-feature-demos.mjs`. Re-run it to");
  lines.push("> (re)create these workflows and refresh the links below — e.g. after");
  lines.push("> a database reset. Requires the backend running on :3002.");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run seed:demos");
  lines.push("```");
  lines.push("");
  lines.push("## Contents");
  lines.push("");
  for (const r of results) {
    lines.push(`- [${r.title}](#${slug(r.title)})`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const r of results) {
    lines.push(`## ${r.title}`);
    lines.push("");
    lines.push(`**▶ Open:** [${link(r.id)}](${link(r.id)})`);
    if (r.infra) {
      lines.push("");
      lines.push(
        "> Needs the Temporal worker + deno-runner live (the `dev: all` task).",
      );
    }
    lines.push("");
    for (const step of r.steps) {
      lines.push(`1. ${step}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push(
    "_Not covered here (need external services or a published dynamic node):" +
      " real OCR output previews, incremental cache-hit re-runs, dynamic-node" +
      " authoring/security, and the agent chat. See `MANUAL_TEST_PLAN.md`._",
  );
  lines.push("");
  return lines.join("\n");
}

function slug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Return the first candidate key the backend accepts (a cheap authenticated
 * GET that is 200 for a valid key, 401/403 for a bad one). Never logs a key.
 */
async function resolveApiKey() {
  for (const candidate of CANDIDATE_KEYS) {
    const res = await fetch(`${BACKEND_URL}/api/workflows?limit=1`, {
      headers: { "x-api-key": candidate },
    }).catch(() => null);
    if (res && res.status !== 401 && res.status !== 403) return candidate;
  }
  return null;
}

async function main() {
  apiKey = await resolveApiKey();
  if (!apiKey) {
    throw new Error(
      `401 — none of the ${CANDIDATE_KEYS.length} candidate API key(s) were ` +
        "accepted by the backend",
    );
  }
  const results = await seed();
  writeFileSync(GUIDE_PATH, renderGuide(results), "utf-8");
  console.log(`\nGuide written → ${GUIDE_PATH}`);
  console.log(`Open the workflows list: ${FRONTEND_URL}/workflows`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  if (/\b401\b|Invalid API key|Unauthorized/i.test(err.message)) {
    console.error(
      "\nThe backend accepted none of the API keys it tried (shell" +
        " TEST_API_KEY, apps/backend-services/.env TEST_API_KEY, and the" +
        " documented default). The backend validates x-api-key against the" +
        " value the DB was seeded with. Fix by re-seeding so they line up" +
        " (`npm run test:db:reset`) or pass the seeded key explicitly:\n" +
        "  TEST_API_KEY=<your-seeded-key> npm run seed:demos",
    );
  } else if (/fetch failed|ECONNREFUSED|connect/i.test(err.message)) {
    console.error(
      `\nCould not reach the backend at ${BACKEND_URL}. Start it (the` +
        " `dev: all` task / `npm run dev:backend`) and retry.",
    );
  }
  process.exit(1);
});
