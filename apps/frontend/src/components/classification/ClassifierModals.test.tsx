import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../../auth/AuthContext";
import {
  CreateClassifierModal,
  UploadClassifierFilesModal,
} from "./ClassifierModals";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGroup = vi.fn();
const mockUseClassifier = vi.fn();

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../../data/hooks/useClassifier", () => ({
  useClassifier: () => mockUseClassifier(),
}));

vi.mock("@mantine/notifications", () => ({
  notifications: {
    show: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup: Group = { id: "group-abc", name: "Test Group" };

/**
 * Renders CreateClassifierModal inside required providers.
 */
const renderModal = (isOpen = true) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <CreateClassifierModal
          isOpen={isOpen}
          setIsOpen={vi.fn()}
          afterSubmit={vi.fn()}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
};

/**
 * Renders UploadClassifierFilesModal inside required providers.
 */
const renderUploadModal = (isOpen = true) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <UploadClassifierFilesModal
          isOpen={isOpen}
          setIsOpen={vi.fn()}
          onUpload={vi.fn()}
          label="TestLabel"
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreateClassifierModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClassifier.mockReturnValue({
      createClassifier: {
        mutateAsync: vi.fn().mockResolvedValue({}),
        isPending: false,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – active group id is used in createClassifier mutation
  // -------------------------------------------------------------------------
  describe("Scenario 1 – active group id injected from GroupContext", () => {
    it("calls createClassifier.mutateAsync with activeGroup.id as group_id", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      mockUseGroup.mockReturnValue({ activeGroup });
      mockUseClassifier.mockReturnValue({
        createClassifier: { mutateAsync, isPending: false },
      });

      renderModal();

      fireEvent.change(screen.getByLabelText(/classifier name/i), {
        target: { value: "My Classifier" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ group_id: "group-abc" }),
        );
      });
    });

    it("does not require a group to be passed as a prop", () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      // No groupOptions prop needed — renders without error
      expect(() => renderModal()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – Group dropdown is absent from the form
  // -------------------------------------------------------------------------
  describe("Scenario 3 – Group dropdown is absent", () => {
    it("does not render a Group selector in the form", () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderModal();

      expect(screen.queryByLabelText(/^group$/i)).not.toBeInTheDocument();
    });

    it("renders only Name and Description fields", () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderModal();

      expect(screen.getByLabelText(/classifier name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// UploadClassifierFilesModal
// ---------------------------------------------------------------------------

describe("UploadClassifierFilesModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGroup.mockReturnValue({ activeGroup });
  });

  // -------------------------------------------------------------------------
  // File type restriction
  // -------------------------------------------------------------------------
  describe("File type restriction – only images and PDFs accepted", () => {
    it("shows a validation error when a non-image, non-PDF file is selected", async () => {
      renderUploadModal();

      // Mantine renders the hidden file input inside a portal - use document.querySelector
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const formEl = document.querySelector("form") as HTMLFormElement;
      expect(fileInput).not.toBeNull();
      expect(formEl).not.toBeNull();

      const invalidFile = new File(["data"], "document.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      // Use DataTransfer + Object.defineProperty to set files on the hidden input
      // (required because input.files is read-only in jsdom)
      const dt = new DataTransfer();
      dt.items.add(invalidFile);
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: dt.files,
      });

      // Trigger Mantine's onChange handler so the form state is updated
      fireEvent.change(fileInput);

      // Submit the form directly (the button is disabled when file type is invalid,
      // so fireEvent.click on it would be a no-op)
      fireEvent.submit(formEl);

      await waitFor(() => {
        expect(
          screen.getByText(/only image files and pdfs are allowed/i),
        ).toBeInTheDocument();
      });
    });

    it("accepts a PDF file without a validation error", async () => {
      renderUploadModal();

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const formEl = document.querySelector("form") as HTMLFormElement;
      expect(fileInput).not.toBeNull();

      const pdfFile = new File(["data"], "invoice.pdf", {
        type: "application/pdf",
      });

      const dt = new DataTransfer();
      dt.items.add(pdfFile);
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: dt.files,
      });
      fireEvent.change(fileInput);
      fireEvent.submit(formEl);

      await waitFor(() => {
        expect(
          screen.queryByText(/only image files and pdfs are allowed/i),
        ).not.toBeInTheDocument();
      });
    });

    it("accepts an image file without a validation error", async () => {
      renderUploadModal();

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const formEl = document.querySelector("form") as HTMLFormElement;
      expect(fileInput).not.toBeNull();

      const imageFile = new File(["data"], "photo.png", { type: "image/png" });

      const dt = new DataTransfer();
      dt.items.add(imageFile);
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: dt.files,
      });
      fireEvent.change(fileInput);
      fireEvent.submit(formEl);

      await waitFor(() => {
        expect(
          screen.queryByText(/only image files and pdfs are allowed/i),
        ).not.toBeInTheDocument();
      });
    });

    it("has accept attribute restricting the file picker to images and PDFs", () => {
      renderUploadModal();

      // Mantine renders the hidden file input inside a portal - use document.querySelector
      const input = document.querySelector('input[type="file"]');
      expect(input).not.toBeNull();
      expect(input).toHaveAttribute("accept", "image/*,application/pdf");
    });
  });
});
