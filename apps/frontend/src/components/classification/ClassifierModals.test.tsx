import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../../auth/AuthContext";
import {
  CreateClassifierModal,
  DeleteClassifierConfirmationModal,
  UploadClassifierFilesModal,
} from "./ClassifierModals";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockNotificationsShow } = vi.hoisted(() => ({
  mockNotificationsShow: vi.fn(),
}));

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
    show: mockNotificationsShow,
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

// ---------------------------------------------------------------------------
// DeleteClassifierConfirmationModal
// ---------------------------------------------------------------------------

const mockDeleteMutate = vi.fn();

/**
 * Renders DeleteClassifierConfirmationModal inside required providers.
 */
const renderDeleteModal = (props?: {
  onDeleted?: () => void;
  mutate?: ReturnType<typeof vi.fn>;
  isPending?: boolean;
}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mockUseClassifier.mockReturnValue({
    deleteClassifier: {
      mutate: props?.mutate ?? mockDeleteMutate,
      isPending: props?.isPending ?? false,
    },
  });
  mockUseGroup.mockReturnValue({ activeGroup });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <DeleteClassifierConfirmationModal
          isOpen={true}
          setIsOpen={vi.fn()}
          classifierName="my-classifier"
          groupId="group-abc"
          onDeleted={props?.onDeleted ?? vi.fn()}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
};

describe("DeleteClassifierConfirmationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – delete button disabled until "delete" is typed
  // -------------------------------------------------------------------------
  describe("Scenario 1 – confirmation input gates the Delete button", () => {
    it("renders the classifier name in the modal", () => {
      renderDeleteModal();
      expect(screen.getByText(/my-classifier/)).toBeInTheDocument();
    });

    it("Delete button is disabled when input is empty", () => {
      renderDeleteModal();
      const btn = screen.getByRole("button", { name: /^delete$/i });
      expect(btn).toBeDisabled();
    });

    it("Delete button is disabled when input text is incorrect", () => {
      renderDeleteModal();
      fireEvent.change(screen.getByPlaceholderText(/delete/i), {
        target: { value: "delet" },
      });
      const btn = screen.getByRole("button", { name: /^delete$/i });
      expect(btn).toBeDisabled();
    });

    it("Delete button is enabled when user types 'delete' (case-insensitive)", () => {
      renderDeleteModal();
      fireEvent.change(screen.getByPlaceholderText(/delete/i), {
        target: { value: "DELETE" },
      });
      const btn = screen.getByRole("button", { name: /^delete$/i });
      expect(btn).not.toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – successful deletion
  // -------------------------------------------------------------------------
  describe("Scenario 2 – success flow", () => {
    it("calls deleteClassifier.mutate with correct params on confirm", async () => {
      const mutate = vi.fn();
      renderDeleteModal({ mutate });
      fireEvent.change(screen.getByPlaceholderText(/delete/i), {
        target: { value: "delete" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      expect(mutate).toHaveBeenCalledWith(
        { name: "my-classifier", group_id: "group-abc" },
        expect.any(Object),
      );
    });

    it("shows success notification and calls onDeleted on 200 success", async () => {
      const onDeleted = vi.fn();
      const mutate = vi.fn().mockImplementation((_params, callbacks) => {
        callbacks.onSuccess();
      });
      renderDeleteModal({ mutate, onDeleted });
      fireEvent.change(screen.getByPlaceholderText(/delete/i), {
        target: { value: "delete" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      await waitFor(() => {
        expect(mockNotificationsShow).toHaveBeenCalledWith(
          expect.objectContaining({ color: "green" }),
        );
        expect(onDeleted).toHaveBeenCalled();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – 409 conflict handling
  // -------------------------------------------------------------------------
  describe("Scenario 3 – 409 conflict error display", () => {
    it("does not navigate away and shows conflicting workflows on 409", async () => {
      const onDeleted = vi.fn();
      const conflictingWorkflows = [
        { id: "wf-1", name: "Workflow One" },
        { id: "wf-2", name: "Workflow Two" },
      ];
      const mutate = vi.fn().mockImplementation((_params, callbacks) => {
        callbacks.onError({ conflictingWorkflows, message: "Conflict" });
      });
      renderDeleteModal({ mutate, onDeleted });
      fireEvent.change(screen.getByPlaceholderText(/delete/i), {
        target: { value: "delete" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      await waitFor(() => {
        expect(screen.getByText(/workflow one/i)).toBeInTheDocument();
        expect(screen.getByText(/workflow two/i)).toBeInTheDocument();
      });
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it("does not show a notification on 409 conflict", async () => {
      const conflictingWorkflows = [{ id: "wf-1", name: "Workflow One" }];
      const mutate = vi.fn().mockImplementation((_params, callbacks) => {
        callbacks.onError({ conflictingWorkflows, message: "Conflict" });
      });
      renderDeleteModal({ mutate });
      fireEvent.change(screen.getByPlaceholderText(/delete/i), {
        target: { value: "delete" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      await waitFor(() => {
        expect(mockNotificationsShow).not.toHaveBeenCalled();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – modal close resets state
  // -------------------------------------------------------------------------
  describe("Scenario 4 – Cancel closes modal without action", () => {
    it("clicking Cancel calls setIsOpen(false)", () => {
      const setIsOpen = vi.fn();
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      mockUseClassifier.mockReturnValue({
        deleteClassifier: { mutate: vi.fn(), isPending: false },
      });
      mockUseGroup.mockReturnValue({ activeGroup });
      render(
        <QueryClientProvider client={queryClient}>
          <MantineProvider>
            <DeleteClassifierConfirmationModal
              isOpen={true}
              setIsOpen={setIsOpen}
              classifierName="my-classifier"
              groupId="group-abc"
              onDeleted={vi.fn()}
            />
          </MantineProvider>
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(setIsOpen).toHaveBeenCalledWith(false);
    });
  });
});
