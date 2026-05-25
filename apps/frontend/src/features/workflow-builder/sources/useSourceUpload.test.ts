/**
 * Unit tests for `useSourceUpload` (US-122).
 *
 * Each `describe` block maps to one acceptance scenario from
 * feature-docs/20260530-workflow-builder-phase8-document-sources/user_stories/US-122-use-source-upload-hook.md.
 *
 * MSW is not part of the frontend test toolkit (see
 * apps/frontend/package.json — only vitest + @testing-library/react),
 * so we follow the existing hook-test convention and stub the global
 * `fetch` via `vi.spyOn` to intercept the upload request. Functionally
 * equivalent for the four contracts being asserted.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "../../../shared/constants";
import { ApiError, useSourceUpload } from "./useSourceUpload";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const WORKFLOW_ID = "workflow-abc";
const SOURCE_NODE_ID = "source-node-1";
const UPLOAD_URL = `${API_BASE_URL}/workflows/${WORKFLOW_ID}/sources/${SOURCE_NODE_ID}/upload`;

function makeFile(): File {
  return new File(["hello world"], "hello.pdf", { type: "application/pdf" });
}

function createWrapper(): (props: {
  children: ReactNode;
}) => ReturnType<typeof createElement> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

/**
 * Build a stubbed `Response` for the global-fetch mock. jsdom's
 * `Response` constructor is sufficient for the JSON / status paths we
 * exercise here.
 */
function jsonResponse(
  body: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

// ---------------------------------------------------------------------------
// Global fetch spy — reset per test.
// ---------------------------------------------------------------------------

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1 — Hook signature + invocation contract
// ---------------------------------------------------------------------------

describe("Scenario 1 — hook signature + invocation contract", () => {
  it("POSTs to /api/workflows/:id/sources/:sourceNodeId/upload with multipart/form-data carrying the file under part name 'file'", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ myFile: "https://blob/abc" }),
    );

    const { result } = renderHook(
      () => useSourceUpload(WORKFLOW_ID, SOURCE_NODE_ID),
      { wrapper: createWrapper() },
    );

    const file = makeFile();
    await result.current.mutateAsync(file);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe(UPLOAD_URL);

    const init = calledInit as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);

    const sentForm = init.body as FormData;
    const sentFile = sentForm.get("file");
    expect(sentFile).toBeInstanceOf(File);
    expect((sentFile as File).name).toBe(file.name);
    expect((sentFile as File).type).toBe(file.type);

    // Browser sets the multipart Content-Type with boundary itself — the
    // hook must NOT pre-set it.
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers["content-type"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Happy path returns the ctxKey-keyed dict verbatim
// ---------------------------------------------------------------------------

describe("Scenario 2 — response shape (ctxKey-keyed dict)", () => {
  it("returns the wire body as a Record<string, string> on success", async () => {
    const wireBody = { myFile: "https://blob/.../abc" };
    fetchSpy.mockResolvedValueOnce(jsonResponse(wireBody));

    const { result } = renderHook(
      () => useSourceUpload(WORKFLOW_ID, SOURCE_NODE_ID),
      { wrapper: createWrapper() },
    );

    const returned = await result.current.mutateAsync(makeFile());

    expect(returned).toEqual(wireBody);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(wireBody);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — 4xx surfaces as a typed ApiError (400 path)
// ---------------------------------------------------------------------------

describe("Scenario 3 — 400 surfaces as a typed ApiError", () => {
  it("throws ApiError with status=400 and the body message when MIME validation fails", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ message: "Unsupported MIME type" }, { status: 400 }),
    );

    const { result } = renderHook(
      () => useSourceUpload(WORKFLOW_ID, SOURCE_NODE_ID),
      { wrapper: createWrapper() },
    );

    const onError = vi.fn();
    await expect(
      result.current.mutateAsync(makeFile(), { onError }),
    ).rejects.toBeInstanceOf(ApiError);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const err = result.current.error;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toBe("Unsupported MIME type");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(ApiError);
    expect((onError.mock.calls[0][0] as ApiError).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 (continued) — 413 surfaces as a typed ApiError
// ---------------------------------------------------------------------------

describe("Scenario 3 — 413 surfaces as a typed ApiError", () => {
  it("throws ApiError with status=413 and the body message when the upload is oversized", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ message: "File too large" }, { status: 413 }),
    );

    const { result } = renderHook(
      () => useSourceUpload(WORKFLOW_ID, SOURCE_NODE_ID),
      { wrapper: createWrapper() },
    );

    await expect(result.current.mutateAsync(makeFile())).rejects.toBeInstanceOf(
      ApiError,
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const err = result.current.error;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(413);
    expect((err as ApiError).message).toBe("File too large");
  });
});
