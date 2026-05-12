import type {
  NormalizeDocumentOrientationInput,
  PageOrientationResult,
} from "./normalize-document-orientation";
import { normalizeDocumentOrientation } from "./normalize-document-orientation";

// ---------------------------------------------------------------------------
// Blob storage mock
// ---------------------------------------------------------------------------
const mockBlobRead = jest.fn();
const mockBlobWrite = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
    write: mockBlobWrite,
  }),
}));

// ---------------------------------------------------------------------------
// tesseract.js — minimal mock for the static `import { OEM }` in the activity.
// The actual createWorker is provided via the esm-imports mock below.
// ---------------------------------------------------------------------------
jest.mock("tesseract.js", () => ({
  OEM: { TESSERACT_ONLY: 0 },
}));

// ---------------------------------------------------------------------------
// ESM imports mock — replaces loadMupdf/loadTesseract so new Function() is
// never invoked inside Jest's VM sandbox.
// The factory only returns jest.fn() stubs with no references to outer
// variables; per-test behaviour is configured in beforeEach via
// jest.requireMock(), which avoids the var-hoisting problem entirely.
// ---------------------------------------------------------------------------
jest.mock("./esm-imports", () => ({
  loadMupdf: jest.fn(),
  loadTesseract: jest.fn(),
}));

// Per-page mupdf helpers — configured in beforeEach.
const mockAsPNG = jest.fn<Uint8Array, []>(() => new Uint8Array([1, 2, 3]));
const mockToPixmap = jest.fn<{ asPNG: typeof mockAsPNG }, [object, object]>(
  () => ({ asPNG: mockAsPNG }),
);
const mockLoadPage = jest.fn<{ toPixmap: typeof mockToPixmap }, [number]>(
  () => ({
    toPixmap: mockToPixmap,
  }),
);
const mockCountPages = jest.fn<number, []>(() => 1);
const mockOpenDocument = jest.fn<
  { countPages: typeof mockCountPages; loadPage: typeof mockLoadPage },
  [Uint8Array, string]
>(() => ({
  countPages: mockCountPages,
  loadPage: mockLoadPage,
}));
const mockDetect = jest.fn();
const mockTerminate = jest.fn().mockResolvedValue(undefined);

// ---------------------------------------------------------------------------
// pdf-lib mock — only needs to produce a valid save() buffer
// ---------------------------------------------------------------------------
jest.mock("pdf-lib", () => ({
  PDFDocument: {
    load: jest.fn().mockResolvedValue({
      getPage: jest.fn(() => ({ fake: "srcPage" })),
    }),
    create: jest.fn().mockResolvedValue({
      save: jest.fn().mockResolvedValue(new Uint8Array([5, 6, 7])),
      addPage: jest.fn().mockReturnValue({ drawPage: jest.fn() }),
      copyPages: jest.fn().mockResolvedValue([{ fake: "page" }]),
      embedPage: jest.fn().mockResolvedValue({ width: 200, height: 100 }),
    }),
  },
  degrees: jest.fn((n: number) => ({ angle: n })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_BLOB_KEY = "testgroup/ocr/docid/normalized.pdf";

function makeInput(
  overrides: Partial<NormalizeDocumentOrientationInput> = {},
): NormalizeDocumentOrientationInput {
  return { blobKey: VALID_BLOB_KEY, ...overrides };
}

function osdResult(angle: number, confidence = 5.0) {
  return {
    data: {
      orientation_degrees: angle,
      orientation_confidence: confidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("normalizeDocumentOrientation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlobRead.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
    mockCountPages.mockReturnValue(1);
    mockBlobWrite.mockResolvedValue(undefined);

    const esmImports = jest.requireMock("./esm-imports") as {
      loadMupdf: jest.Mock;
      loadTesseract: jest.Mock;
    };

    esmImports.loadMupdf.mockResolvedValue({
      Document: {
        openDocument: (buf: Uint8Array, magic: string) =>
          mockOpenDocument(buf, magic),
      },
      Matrix: { scale: jest.fn(() => ({})) },
      ColorSpace: { DeviceRGB: {} },
    });

    esmImports.loadTesseract.mockResolvedValue({
      OEM: { TESSERACT_ONLY: 0 },
      createWorker: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ detect: mockDetect, terminate: mockTerminate }),
        ),
    });
  });

  // --- No correction needed ---

  it("returns the original blob key unchanged when all pages are upright", async () => {
    mockDetect.mockResolvedValue(osdResult(0, 9.0));

    const result = await normalizeDocumentOrientation(makeInput());

    expect(result.correctedBlobKey).toBe(VALID_BLOB_KEY);
    expect(mockBlobWrite).not.toHaveBeenCalled();
  });

  it("marks each page as not corrected when angle is 0", async () => {
    mockDetect.mockResolvedValue(osdResult(0, 9.0));

    const result = await normalizeDocumentOrientation(makeInput());

    expect(result.pageCorrections).toHaveLength(1);
    expect(result.pageCorrections[0].corrected).toBe(false);
    expect(result.pageCorrections[0].detectedAngle).toBe(0);
  });

  it("does not correct when confidence is below threshold", async () => {
    mockDetect.mockResolvedValue(osdResult(90, 1.0)); // under default 2.0

    const result = await normalizeDocumentOrientation(makeInput());

    expect(result.pageCorrections[0].corrected).toBe(false);
    expect(mockBlobWrite).not.toHaveBeenCalled();
  });

  it("uses a custom confidenceThreshold", async () => {
    mockDetect.mockResolvedValue(osdResult(90, 3.0));

    // With threshold=5, confidence 3.0 is too low
    const result = await normalizeDocumentOrientation(
      makeInput({ confidenceThreshold: 5.0 }),
    );

    expect(result.pageCorrections[0].corrected).toBe(false);
    expect(mockBlobWrite).not.toHaveBeenCalled();
  });

  // --- Correction applied ---

  it("writes a corrected PDF and returns the same blob key when a page is rotated", async () => {
    mockDetect.mockResolvedValue(osdResult(90, 9.0));

    const result = await normalizeDocumentOrientation(makeInput());

    expect(result.pageCorrections[0].corrected).toBe(true);
    expect(result.pageCorrections[0].detectedAngle).toBe(90);
    expect(mockBlobWrite).toHaveBeenCalledWith(
      VALID_BLOB_KEY,
      expect.any(Buffer),
    );
    expect(result.correctedBlobKey).toBe(VALID_BLOB_KEY);
  });

  it("records the correct angle for 180° rotation", async () => {
    mockDetect.mockResolvedValue(osdResult(180, 9.0));

    const result = await normalizeDocumentOrientation(makeInput());

    expect(result.pageCorrections[0].detectedAngle).toBe(180);
    expect(result.pageCorrections[0].corrected).toBe(true);
  });

  it("records the correct angle for 270° rotation", async () => {
    mockDetect.mockResolvedValue(osdResult(270, 9.0));

    const result = await normalizeDocumentOrientation(makeInput());

    expect(result.pageCorrections[0].detectedAngle).toBe(270);
    expect(result.pageCorrections[0].corrected).toBe(true);
  });

  // --- Multi-page: each page handled independently ---

  it("processes each page independently — corrects only rotated pages", async () => {
    mockCountPages.mockReturnValue(3);
    mockDetect
      .mockResolvedValueOnce(osdResult(0, 9.0)) // page 1: upright
      .mockResolvedValueOnce(osdResult(90, 9.0)) // page 2: rotated
      .mockResolvedValueOnce(osdResult(0, 9.0)); // page 3: upright

    const result = await normalizeDocumentOrientation(makeInput());

    const corrections: PageOrientationResult[] = result.pageCorrections;
    expect(corrections).toHaveLength(3);
    expect(corrections[0].corrected).toBe(false);
    expect(corrections[1].corrected).toBe(true);
    expect(corrections[2].corrected).toBe(false);

    // Only page 2 rotated → correction should be applied
    expect(mockBlobWrite).toHaveBeenCalledTimes(1);
  });

  it("skips correction if all pages are upright in a multi-page document", async () => {
    mockCountPages.mockReturnValue(2);
    mockDetect
      .mockResolvedValueOnce(osdResult(0, 9.0))
      .mockResolvedValueOnce(osdResult(0, 9.0));

    const result = await normalizeDocumentOrientation(makeInput());

    expect(result.pageCorrections.every((p) => !p.corrected)).toBe(true);
    expect(mockBlobWrite).not.toHaveBeenCalled();
  });

  // --- OSD failure graceful handling ---

  it("treats a page as upright (angle=0) when OSD throws and does not throw", async () => {
    mockDetect.mockRejectedValue(new Error("tesseract osd failed"));

    const result = await normalizeDocumentOrientation(makeInput());

    expect(result.pageCorrections[0].detectedAngle).toBe(0);
    expect(result.pageCorrections[0].corrected).toBe(false);
    expect(mockBlobWrite).not.toHaveBeenCalled();
  });

  // --- Worker lifecycle ---

  it("terminates the tesseract worker after processing", async () => {
    mockDetect.mockResolvedValue(osdResult(0, 9.0));

    await normalizeDocumentOrientation(makeInput());

    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it("terminates the tesseract worker even when OSD throws", async () => {
    mockDetect.mockRejectedValue(new Error("osd error"));

    await normalizeDocumentOrientation(makeInput());

    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});
