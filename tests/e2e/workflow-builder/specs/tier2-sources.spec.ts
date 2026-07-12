import { expect, test } from "@playwright/test";
import {
  BACKEND_URL,
  SEED_GROUP_ID,
  setupWorkflowBuilderTest,
  TEST_API_KEY,
} from "../helpers/wb-test";
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  type GraphConfig,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — document sources: upload-endpoint validation (13.4) + the
 * single-source validator (13.7). Manual test plan Part 13.
 *
 * Pure-API and fully deterministic: every case here fails BEFORE the upload
 * endpoint kicks off its Temporal Try run (the guards run first), and the
 * single-source rule is enforced at `POST /api/workflows`. So — unlike the
 * happy-path upload (covered by `tier3-try-*`, `@infra`) — none of this needs
 * the worker or blob storage, and it stays in default CI.
 */

const jsonHeaders = {
  "x-api-key": TEST_API_KEY,
  "Content-Type": "application/json",
};

/** A minimal, valid single `source.upload` workflow (defaults resolved). */
function uploadConfig(name: string, maxFileSizeMB?: number): GraphConfig {
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
        label: "File upload",
        // Omitting `parameters` resolves defaults: allow pdf + image/*, 50 MB,
        // ctxKey "documentUrl". A small cap is set only for the oversize case.
        ...(maxFileSizeMB ? { parameters: { maxFileSizeMB } } : {}),
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        metadata: { position: { x: 120, y: 200 } },
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
        metadata: { position: { x: 460, y: 200 } },
      },
    },
    edges: [
      { id: "u-prep", source: "upload1", target: "prep", type: "normal" },
    ],
  };
}

/** A valid single `source.api` workflow whose entry declares one field. */
function apiSourceConfig(name: string, withIsInputCtx: boolean): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "apiSource",
    ctx: withIsInputCtx
      ? { documentUrl: { type: "string", isInput: true } }
      : { documentUrl: { type: "string" } },
    nodes: {
      apiSource: {
        id: "apiSource",
        type: "source",
        sourceType: "source.api",
        label: "API endpoint",
        parameters: {
          // kind Document so the derived output is assignable to prep's typed
          // Document input — otherwise a real typed-binding error would mask the
          // isInput warning this test is about.
          fields: [
            {
              name: "documentUrl",
              type: "string",
              required: true,
              kind: "Document",
            },
          ],
        },
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        metadata: { position: { x: 120, y: 160 } },
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
        metadata: { position: { x: 460, y: 160 } },
      },
    },
    edges: [
      { id: "s-prep", source: "apiSource", target: "prep", type: "normal" },
    ],
  };
}

/** A minimal fake PDF whose magic bytes sniff as application/pdf. */
function pdfBuffer(sizeBytes = 64): Buffer {
  // "%PDF-1.4\n" + a binary comment line, as raw bytes (a string literal trips
  // the secret-scanner's entropy heuristic).
  const head = Buffer.from([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3,
    0xcf, 0xd3, 0x0a,
  ]);
  if (sizeBytes <= head.length) return head;
  return Buffer.concat([head, Buffer.alloc(sizeBytes - head.length, 0x20)]);
}

/** PNG magic bytes — used to trigger the declared-vs-actual MIME mismatch. */
function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
}

const uploadUrl = (wfId: string, nodeId: string) =>
  `${BACKEND_URL}/api/workflows/${wfId}/sources/${nodeId}/upload`;

test.describe("document sources — upload validation + single-source rule", () => {
  const created: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of created.splice(0)) {
      await deleteWorkflow(request, id);
    }
  });

  test("13.4 — upload endpoint rejects bad requests before running", async ({
    request,
  }, testInfo) => {
    const wf = await createWorkflow(request, {
      name: `e2e upload-neg ${testInfo.testId}`,
      config: uploadConfig(`e2e upload-neg ${testInfo.testId}`),
    });
    created.push(wf.id);

    // Missing file part → 400 (checked before anything else).
    const noFile = await request.post(uploadUrl(wf.id, "upload1"), {
      headers: { "x-api-key": TEST_API_KEY },
      multipart: { notAFile: "x" },
    });
    expect(noFile.status(), await noFile.text()).toBe(400);

    // Unknown workflow id → 404.
    const badWf = await request.post(uploadUrl("no-such-lineage", "upload1"), {
      headers: { "x-api-key": TEST_API_KEY },
      multipart: {
        file: {
          name: "d.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer(),
        },
      },
    });
    expect(badWf.status()).toBe(404);

    // Unknown source node id → 404.
    const badNode = await request.post(uploadUrl(wf.id, "no-such-node"), {
      headers: { "x-api-key": TEST_API_KEY },
      multipart: {
        file: {
          name: "d.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer(),
        },
      },
    });
    expect(badNode.status()).toBe(404);

    // Targeting a non-source node (the activity) → 400.
    const notSource = await request.post(uploadUrl(wf.id, "prep"), {
      headers: { "x-api-key": TEST_API_KEY },
      multipart: {
        file: {
          name: "d.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer(),
        },
      },
    });
    expect(notSource.status()).toBe(400);

    // MIME type not in allowedMimeTypes (pdf + image/*) → 400.
    const badMime = await request.post(uploadUrl(wf.id, "upload1"), {
      headers: { "x-api-key": TEST_API_KEY },
      multipart: {
        file: { name: "d.txt", mimeType: "text/plain", buffer: pdfBuffer() },
      },
    });
    expect(badMime.status()).toBe(400);

    // Declared application/pdf but PNG magic bytes → content mismatch → 400.
    const mismatch = await request.post(uploadUrl(wf.id, "upload1"), {
      headers: { "x-api-key": TEST_API_KEY },
      multipart: {
        file: {
          name: "d.pdf",
          mimeType: "application/pdf",
          buffer: pngBuffer(),
        },
      },
    });
    expect(mismatch.status()).toBe(400);
  });

  test("13.4 — a file over the per-source cap → 413", async ({
    request,
  }, testInfo) => {
    const wf = await createWorkflow(request, {
      name: `e2e upload-big ${testInfo.testId}`,
      // 1 MB cap; upload ~2 MB of valid PDF.
      config: uploadConfig(`e2e upload-big ${testInfo.testId}`, 1),
    });
    created.push(wf.id);

    const oversize = await request.post(uploadUrl(wf.id, "upload1"), {
      headers: { "x-api-key": TEST_API_KEY },
      multipart: {
        file: {
          name: "big.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer(2 * 1024 * 1024),
        },
      },
    });
    expect(oversize.status(), await oversize.text()).toBe(413);
  });

  test("13.7 — a second source of the same subtype is rejected (400)", async ({
    request,
  }, testInfo) => {
    const name = `e2e two-uploads ${testInfo.testId}`;
    const config = uploadConfig(name);
    // Add a second source.upload node — violates the single-source rule.
    config.nodes.upload2 = {
      id: "upload2",
      type: "source",
      sourceType: "source.upload",
      label: "Second upload",
      outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
      metadata: { position: { x: 120, y: 420 } },
    };

    const res = await request.post(`${BACKEND_URL}/api/workflows`, {
      headers: jsonHeaders,
      data: { name, config, groupId: SEED_GROUP_ID },
    });
    expect(res.status(), await res.text()).toBe(400);
    const body = (await res.json()) as {
      message: string;
      errors: { path: string; message: string; severity: string }[];
    };
    expect(body.message).toBe("Invalid workflow configuration");
    const dup = body.errors.find(
      (e) =>
        e.severity === "error" &&
        /at most one source of subtype/.test(e.message),
    );
    expect(dup, JSON.stringify(body.errors)).toBeTruthy();
    // Anchored at the offending (second) source node's sourceType.
    expect(dup?.path).toBe("nodes.upload2.sourceType");
  });

  test("13.7 — source.api + a legacy isInput ctx is a warning, still persists (201)", async ({
    request,
  }, testInfo) => {
    // isInput is ignored when a source.api node is present — a warning, not a
    // blocker, so the create succeeds.
    const name = `e2e api-isinput ${testInfo.testId}`;
    const res = await request.post(`${BACKEND_URL}/api/workflows`, {
      headers: jsonHeaders,
      data: {
        name,
        config: apiSourceConfig(name, true),
        groupId: SEED_GROUP_ID,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = (await res.json()) as
      | { id: string }
      | { workflow: { id: string } };
    created.push("workflow" in body ? body.workflow.id : body.id);
  });
});

test.describe("source node settings UI", () => {
  let pageErrors: string[] = [];
  let createdId: string | null = null;

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await setupWorkflowBuilderTest(page);
  });

  test.afterEach(async ({ request }) => {
    if (createdId) {
      await deleteWorkflow(request, createdId);
      createdId = null;
    }
  });

  test("13.2/13.3 — SourceNodeSettings renders the upload params and a maxFileSizeMB edit round-trips", async ({
    page,
    request,
  }, testInfo) => {
    const name = `e2e source-settings ${testInfo.testId}`;
    const created = await createWorkflow(request, {
      name,
      config: uploadConfig(name, 25),
    });
    createdId = created.id;

    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(created.id, 2);
    await editor.selectNode("upload1");

    // The source-specific settings body mounts with the catalog identity.
    const settings = page.getByTestId("source-node-settings");
    await expect(settings).toBeVisible();
    await expect(
      page.getByTestId("source-node-settings-display-name"),
    ).toBeVisible();

    // Edit the schema-driven "Max file size (MB)" parameter and save.
    const sizeInput = page.getByLabel("Max file size (MB)");
    await expect(sizeInput).toHaveValue("25");
    await sizeInput.fill("10");
    await page.keyboard.press("Tab");
    await editor.saveButton.click();

    // Persisted server-side…
    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        return (
          wf.config.nodes.upload1.parameters as { maxFileSizeMB?: number }
        ).maxFileSizeMB;
      })
      .toBe(10);

    // …and survives a reload into the form.
    await editor.openExisting(createdId, 2);
    await editor.selectNode("upload1");
    await expect(page.getByLabel("Max file size (MB)")).toHaveValue("10");

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
