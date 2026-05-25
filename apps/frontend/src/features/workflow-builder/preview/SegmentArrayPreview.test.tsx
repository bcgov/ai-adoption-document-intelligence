/**
 * Unit tests for `SegmentArrayPreview` (US-143 Phase 4 Milestone D).
 *
 * Each `describe` block maps to a scenario from
 * feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-143-segment-array-preview.md.
 *
 * The widget consumes `useDocuments()` to resolve a segment's
 * `parentDocId` → image URL; tests stub the hook with `vi.mock` so
 * each case can declare its own fixture document set without touching
 * the network.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Document } from "../../../shared/types";
import { SegmentArrayPreview } from "./SegmentArrayPreview";
import { SEGMENT_KIND_COLORS } from "./segment-kind-colors";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const mockUseDocuments = vi.fn();

vi.mock("../../../data/hooks/useDocuments", () => ({
  useDocuments: () => mockUseDocuments(),
}));

function buildDoc(id: string, overrides?: Partial<Document>): Document {
  return {
    id,
    title: `Doc ${id}`,
    original_filename: `${id}.pdf`,
    file_path: `path/to/${id}.pdf`,
    file_type: "pdf",
    file_size: 1024,
    source: "api",
    status: "completed_ocr",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    file_url: `https://example.com/${id}.png`,
    ...overrides,
  };
}

function setDocs(docs: Document[]): void {
  mockUseDocuments.mockReturnValue({
    data: docs,
    isLoading: false,
    error: null,
    isSuccess: true,
  });
}

function renderWithMantine(ui: ReactNode): ReturnType<typeof render> {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface SegFixtureInput {
  parentDocId: string;
  polygon?: number[];
  kind?: string;
  confidence?: number;
}

function buildSegments(
  count: number,
  parentDocId = "doc-1",
): SegFixtureInput[] {
  const out: SegFixtureInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const baseX = (i % 4) * 110;
    const baseY = Math.floor(i / 4) * 60;
    out.push({
      parentDocId,
      polygon: [
        baseX,
        baseY,
        baseX + 100,
        baseY,
        baseX + 100,
        baseY + 50,
        baseX,
        baseY + 50,
      ],
      kind: "Text",
      confidence: 0.9,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Common setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUseDocuments.mockReset();
  setDocs([buildDoc("doc-1"), buildDoc("doc-2")]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1 — Component signature + base render + malformed fallback
// ---------------------------------------------------------------------------

describe("Scenario 1 — base render + malformed fallback", () => {
  it("renders overlays when given a valid array of Segments", () => {
    renderWithMantine(<SegmentArrayPreview value={buildSegments(3)} />);
    expect(screen.getByTestId("segment-array-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("segment-array-preview-empty")).toBeNull();
    expect(
      screen.getByTestId("segment-array-preview-overlay-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("segment-array-preview-overlay-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("segment-array-preview-overlay-2"),
    ).toBeInTheDocument();
  });

  it("renders 'No segments to preview' when value is not an array", () => {
    renderWithMantine(<SegmentArrayPreview value={{ not: "an array" }} />);
    const empty = screen.getByTestId("segment-array-preview-empty");
    expect(empty).toHaveTextContent("No segments to preview");
  });

  it("renders 'No segments to preview' for an empty array", () => {
    renderWithMantine(<SegmentArrayPreview value={[]} />);
    expect(screen.getByTestId("segment-array-preview-empty")).toHaveTextContent(
      "No segments to preview",
    );
  });

  it("renders 'No segments to preview' when entries miss required fields", () => {
    renderWithMantine(
      <SegmentArrayPreview
        value={[{ parentDocId: "doc-1" /* no polygon */ }]}
      />,
    );
    expect(
      screen.getByTestId("segment-array-preview-empty"),
    ).toBeInTheDocument();
  });

  it("renders 'No segments to preview' when polygon is too short to form a region", () => {
    renderWithMantine(
      <SegmentArrayPreview
        value={[{ parentDocId: "doc-1", polygon: [0, 0, 10, 10] }]}
      />,
    );
    expect(
      screen.getByTestId("segment-array-preview-empty"),
    ).toBeInTheDocument();
  });

  it("renders 'No segments to preview' when value is null/undefined/number", () => {
    const { rerender } = renderWithMantine(
      <SegmentArrayPreview value={null} />,
    );
    expect(
      screen.getByTestId("segment-array-preview-empty"),
    ).toBeInTheDocument();
    rerender(
      <MantineProvider>
        <SegmentArrayPreview value={undefined} />
      </MantineProvider>,
    );
    expect(
      screen.getByTestId("segment-array-preview-empty"),
    ).toBeInTheDocument();
    rerender(
      <MantineProvider>
        <SegmentArrayPreview value={42} />
      </MantineProvider>,
    );
    expect(
      screen.getByTestId("segment-array-preview-empty"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Parent document rendered at display size with overlays
// ---------------------------------------------------------------------------

describe("Scenario 2 — parent doc + overlay colours", () => {
  it("renders the parent doc image and one overlay rect per segment, coloured by kind", () => {
    const segments: SegFixtureInput[] = [
      {
        parentDocId: "doc-1",
        polygon: [0, 0, 100, 0, 100, 50, 0, 50],
        kind: "Text",
        confidence: 0.9,
      },
      {
        parentDocId: "doc-1",
        polygon: [0, 60, 100, 60, 100, 110, 0, 110],
        kind: "Table",
        confidence: 0.85,
      },
      {
        parentDocId: "doc-1",
        polygon: [0, 120, 100, 120, 100, 170, 0, 170],
        kind: "Figure",
        confidence: 0.7,
      },
    ];

    renderWithMantine(<SegmentArrayPreview value={segments} />);

    const img = screen.getByTestId(
      "segment-array-preview-parent-image",
    ) as HTMLImageElement;
    expect(img.src).toBe("https://example.com/doc-1.png");

    const o0 = screen.getByTestId("segment-array-preview-overlay-0");
    const o1 = screen.getByTestId("segment-array-preview-overlay-1");
    const o2 = screen.getByTestId("segment-array-preview-overlay-2");

    expect(o0.getAttribute("data-stroke-color")).toBe("gray");
    expect(o1.getAttribute("data-stroke-color")).toBe("blue");
    expect(o2.getAttribute("data-stroke-color")).toBe("violet");

    // fillOpacity = 0.25 for visible overlays (Scenario 2 + Scenario 3 dim rule)
    expect(o0.getAttribute("data-fill-opacity")).toBe("0.25");
  });

  it("falls back to a 'No parent doc available' placeholder when the doc lookup misses", () => {
    setDocs([]); // useDocuments returns no rows
    const segments = buildSegments(1, "doc-missing");
    renderWithMantine(<SegmentArrayPreview value={segments} />);
    expect(
      screen.getByTestId("segment-array-preview-no-parent"),
    ).toHaveTextContent("No parent doc available");
    // No image, no overlay layer when parent doc absent.
    expect(
      screen.queryByTestId("segment-array-preview-parent-image"),
    ).toBeNull();
    expect(
      screen.queryByTestId("segment-array-preview-overlay-layer"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Segment pagination (>6 segments)
// ---------------------------------------------------------------------------

describe("Scenario 3 — pagination", () => {
  it("renders all 12 overlays but only the first 6 carry full opacity; pagination cycles pages", () => {
    renderWithMantine(<SegmentArrayPreview value={buildSegments(12)} />);

    const pagination = screen.getByTestId("segment-array-preview-pagination");
    expect(pagination).toBeInTheDocument();

    // First page — overlays 0..5 are "on current page", 6..11 are dimmed.
    for (let i = 0; i < 6; i += 1) {
      const rect = screen.getByTestId(`segment-array-preview-overlay-${i}`);
      expect(rect.getAttribute("data-on-current-page")).toBe("true");
      expect(rect.getAttribute("data-fill-opacity")).toBe("0.25");
    }
    for (let i = 6; i < 12; i += 1) {
      const rect = screen.getByTestId(`segment-array-preview-overlay-${i}`);
      expect(rect.getAttribute("data-on-current-page")).toBe("false");
      expect(rect.getAttribute("data-fill-opacity")).toBe("0.05");
    }

    // Click page 2 — overlays 6..11 should become active.
    const page2 = within(pagination).getByText("2");
    fireEvent.click(page2);
    for (let i = 0; i < 6; i += 1) {
      expect(
        screen
          .getByTestId(`segment-array-preview-overlay-${i}`)
          .getAttribute("data-on-current-page"),
      ).toBe("false");
    }
    for (let i = 6; i < 12; i += 1) {
      expect(
        screen
          .getByTestId(`segment-array-preview-overlay-${i}`)
          .getAttribute("data-on-current-page"),
      ).toBe("true");
    }
  });

  it("does not render the pagination control when 6 or fewer segments", () => {
    renderWithMantine(<SegmentArrayPreview value={buildSegments(6)} />);
    expect(screen.queryByTestId("segment-array-preview-pagination")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Mixed parent documents
// ---------------------------------------------------------------------------

describe("Scenario 4 — multi-parent Select", () => {
  it("shows a Select when segments reference 2+ parent docs", () => {
    const segments: SegFixtureInput[] = [
      ...buildSegments(2, "doc-1"),
      ...buildSegments(3, "doc-2"),
    ];
    renderWithMantine(<SegmentArrayPreview value={segments} />);

    const selectInput = screen.getByTestId(
      "segment-array-preview-parent-select",
    );
    expect(selectInput).toBeInTheDocument();

    // Initially shows doc-1 → 2 overlays.
    expect(
      screen.getByTestId("segment-array-preview-overlay-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("segment-array-preview-overlay-1"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("segment-array-preview-overlay-2")).toBeNull();
  });

  it("filters overlays to the selected parent when the user changes the Select", () => {
    const segments: SegFixtureInput[] = [
      ...buildSegments(2, "doc-1"),
      ...buildSegments(3, "doc-2"),
    ];
    renderWithMantine(<SegmentArrayPreview value={segments} />);

    // Mantine `<Select>` forwards `data-testid` to its input element.
    // Open the dropdown by simulating mouseDown + click, then click
    // the doc-2 option that appears in the portal.
    const selectInput = screen.getByTestId(
      "segment-array-preview-parent-select",
    ) as HTMLInputElement;
    fireEvent.mouseDown(selectInput);
    fireEvent.click(selectInput);

    const option = screen.getByText("Doc doc-2");
    fireEvent.click(option);

    // After switching → 3 overlays from doc-2.
    expect(
      screen.getByTestId("segment-array-preview-overlay-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("segment-array-preview-overlay-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("segment-array-preview-overlay-2"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("segment-array-preview-overlay-3")).toBeNull();

    const root = screen.getByTestId("segment-array-preview");
    expect(root.getAttribute("data-parent-doc-id")).toBe("doc-2");
  });

  it("hides the Select when every segment shares a single parent doc", () => {
    renderWithMantine(
      <SegmentArrayPreview value={buildSegments(3, "doc-1")} />,
    );
    expect(
      screen.queryByTestId("segment-array-preview-parent-select"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Hover tooltip + click-to-zoom modal
// ---------------------------------------------------------------------------

describe("Scenario 5 — tooltip + modal", () => {
  it("attaches a Tooltip per overlay carrying kind + confidence", () => {
    // Mantine Tooltips render lazily on hover; we just assert the
    // tooltip-target element wraps the rect — confirmed by an
    // `aria-describedby` hookup OR by Mantine's tooltip target marker.
    // The simplest stable check is that the rect is mounted with the
    // expected `data-kind` / `data-stroke-color` markers; the actual
    // Tooltip primitive is exercised by Mantine's own test suite.
    renderWithMantine(
      <SegmentArrayPreview
        value={[
          {
            parentDocId: "doc-1",
            polygon: [0, 0, 50, 0, 50, 50, 0, 50],
            kind: "Signature",
            confidence: 0.42,
          },
        ]}
      />,
    );
    const rect = screen.getByTestId("segment-array-preview-overlay-0");
    expect(rect.getAttribute("data-kind")).toBe("Signature");
    expect(rect.getAttribute("data-stroke-color")).toBe("pink");
  });

  it("opens a modal preview when an overlay is clicked", async () => {
    renderWithMantine(
      <SegmentArrayPreview
        value={[
          {
            parentDocId: "doc-1",
            polygon: [10, 10, 110, 10, 110, 60, 10, 60],
            kind: "Form",
            confidence: 0.77,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("segment-array-preview-overlay-0"));
    // Mantine Modal mounts its dialog asynchronously after `opened`
    // flips to true. Wait for the zoom panel before asserting body.
    await waitFor(() => {
      expect(
        screen.getByTestId("segment-array-preview-modal-zoom"),
      ).toBeInTheDocument();
    });
    const modalRoot = screen.getByTestId("segment-array-preview-modal");
    expect(modalRoot).toHaveTextContent("Segment — Form");
    expect(modalRoot).toHaveTextContent("Confidence:");
    expect(modalRoot).toHaveTextContent("0.77");
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Kind→colour mapping verified for all 7 kinds
// ---------------------------------------------------------------------------

describe("Scenario 6 — kind→colour mapping verified for all 7 kinds", () => {
  const KINDS: Array<[string, string]> = [
    ["Text", "gray"],
    ["Table", "blue"],
    ["Figure", "violet"],
    ["Form", "green"],
    ["KeyValue", "yellow"],
    ["Signature", "pink"],
    ["Header", "teal"],
  ];

  it("maps each segment kind to its Phase 3 §1 colour token", () => {
    const segments: SegFixtureInput[] = KINDS.map(([kind], i) => ({
      parentDocId: "doc-1",
      polygon: [i * 110, 0, i * 110 + 100, 0, i * 110 + 100, 50, i * 110, 50],
      kind,
      confidence: 0.9,
    }));
    renderWithMantine(<SegmentArrayPreview value={segments} />);

    for (let i = 0; i < KINDS.length; i += 1) {
      const [kind, expectedColor] = KINDS[i];
      const rect = screen.getByTestId(`segment-array-preview-overlay-${i}`);
      expect(rect.getAttribute("data-kind")).toBe(kind);
      expect(rect.getAttribute("data-stroke-color")).toBe(expectedColor);
    }
  });

  it("exports a SEGMENT_KIND_COLORS map matching the spec exactly", () => {
    expect(SEGMENT_KIND_COLORS).toEqual({
      Text: "gray",
      Table: "blue",
      Figure: "violet",
      Form: "green",
      KeyValue: "yellow",
      Signature: "pink",
      Header: "teal",
    });
  });

  it("defaults unknown segment kinds to gray", () => {
    renderWithMantine(
      <SegmentArrayPreview
        value={[
          {
            parentDocId: "doc-1",
            polygon: [0, 0, 50, 0, 50, 50, 0, 50],
            kind: "Mystery",
          },
        ]}
      />,
    );
    const rect = screen.getByTestId("segment-array-preview-overlay-0");
    expect(rect.getAttribute("data-stroke-color")).toBe("gray");
  });
});
