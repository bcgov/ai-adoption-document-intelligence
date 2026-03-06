import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Pagination,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconAlertCircle, IconSearch } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { useCreateDatasetFromHitl } from "../hooks/useCreateDatasetFromHitl";
import { useEligibleDocuments } from "../hooks/useEligibleDocuments";

interface CreateDatasetFromHitlDialogProps {
  opened: boolean;
  onClose: () => void;
  /** If provided, adds a version to this dataset instead of creating a new one */
  existingDatasetId?: string;
  onSuccess?: (datasetId: string) => void;
}

type Step = "info" | "select" | "confirm";

export function CreateDatasetFromHitlDialog({
  opened,
  onClose,
  existingDatasetId,
  onSuccess,
}: CreateDatasetFromHitlDialogProps) {
  const isAddingVersion = !!existingDatasetId;

  // Step management
  const [step, setStep] = useState<Step>(isAddingVersion ? "select" : "info");

  // Dataset info (step 1)
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");

  // Document selection (step 2)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const limit = 15;

  const { documents, total, isLoading } = useEligibleDocuments(
    page,
    limit,
    searchTerm || undefined,
  );

  const {
    createDataset,
    isCreating,
    createError,
    resetCreateError,
    addVersion,
    isAddingVersion: isAddingVersionPending,
    addVersionError,
    resetAddVersionError,
  } = useCreateDatasetFromHitl();

  const isSubmitting = isCreating || isAddingVersionPending;
  const submitError = isAddingVersion ? addVersionError : createError;

  const totalPages = Math.ceil(total / limit);

  const handleClose = useCallback(() => {
    setStep(isAddingVersion ? "select" : "info");
    setName("");
    setDescription("");
    setNameError("");
    setSelectedIds(new Set());
    setSearchTerm("");
    setPage(1);
    resetCreateError();
    resetAddVersionError();
    onClose();
  }, [isAddingVersion, onClose, resetCreateError, resetAddVersionError]);

  const handleToggleDocument = (docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (documents.every((d) => selectedIds.has(d.id))) {
      // Deselect all on current page
      setSelectedIds((prev) => {
        const next = new Set(prev);
        documents.forEach((d) => next.delete(d.id));
        return next;
      });
    } else {
      // Select all on current page
      setSelectedIds((prev) => {
        const next = new Set(prev);
        documents.forEach((d) => next.add(d.id));
        return next;
      });
    }
  };

  const handleNextFromInfo = () => {
    if (!name.trim()) {
      setNameError("Dataset name is required");
      return;
    }
    setNameError("");
    setStep("select");
  };

  const handleNextFromSelect = () => {
    if (selectedIds.size === 0) return;
    setStep("confirm");
  };

  const handleBack = () => {
    if (step === "select" && !isAddingVersion) {
      setStep("info");
    } else if (step === "confirm") {
      setStep("select");
    }
  };

  const handleSubmit = async () => {
    try {
      if (isAddingVersion) {
        await addVersion({
          datasetId: existingDatasetId!,
          documentIds: Array.from(selectedIds),
        });
        handleClose();
        onSuccess?.(existingDatasetId!);
      } else {
        const result = await createDataset({
          name: name.trim(),
          description: description.trim() || undefined,
          documentIds: Array.from(selectedIds),
        });
        handleClose();
        if (result?.dataset?.id) {
          onSuccess?.(result.dataset.id);
        }
      }
    } catch {
      // Error is captured by the mutation
    }
  };

  const allOnPageSelected =
    documents.length > 0 && documents.every((d) => selectedIds.has(d.id));

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        isAddingVersion
          ? "Add Version from Verified Documents"
          : "Create Dataset from Verified Documents"
      }
      size="xl"
    >
      <Stack gap="md">
        {submitError && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Error"
            color="red"
            variant="light"
          >
            {submitError.message}
          </Alert>
        )}

        {/* Step 1: Dataset Info */}
        {step === "info" && (
          <>
            <TextInput
              label="Dataset Name"
              placeholder="Enter dataset name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameError("");
              }}
              error={nameError}
              required
              data-autofocus
            />

            <Textarea
              label="Description"
              placeholder="Enter dataset description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <Group justify="flex-end">
              <Button variant="subtle" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleNextFromInfo}>Next</Button>
            </Group>
          </>
        )}

        {/* Step 2: Select Documents */}
        {step === "select" && (
          <>
            <Group justify="space-between">
              <TextInput
                placeholder="Search by filename..."
                leftSection={<IconSearch size={16} />}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                style={{ flex: 1, maxWidth: 400 }}
              />
              <Text size="sm" c="dimmed">
                {selectedIds.size} document{selectedIds.size !== 1 ? "s" : ""}{" "}
                selected
              </Text>
            </Group>

            {isLoading ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Loading eligible documents...
                </Text>
              </Group>
            ) : documents.length === 0 ? (
              <Alert color="blue" variant="light">
                No verified documents found. Documents must have completed OCR
                processing and been approved through HITL review.
              </Alert>
            ) : (
              <>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 40 }}>
                        <Checkbox
                          checked={allOnPageSelected}
                          indeterminate={
                            !allOnPageSelected &&
                            documents.some((d) => selectedIds.has(d.id))
                          }
                          onChange={handleToggleAll}
                          aria-label="Select all on page"
                        />
                      </Table.Th>
                      <Table.Th>Filename</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Approved</Table.Th>
                      <Table.Th>Fields</Table.Th>
                      <Table.Th>Corrections</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {documents.map((doc) => (
                      <Table.Tr
                        key={doc.id}
                        onClick={() => handleToggleDocument(doc.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <Table.Td>
                          <Checkbox
                            checked={selectedIds.has(doc.id)}
                            onChange={() => handleToggleDocument(doc.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" lineClamp={1}>
                            {doc.originalFilename}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="light">
                            {doc.fileType}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {new Date(doc.approvedAt).toLocaleDateString()}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{doc.fieldCount}</Text>
                        </Table.Td>
                        <Table.Td>
                          {doc.correctionCount > 0 ? (
                            <Badge size="sm" color="orange" variant="light">
                              {doc.correctionCount}
                            </Badge>
                          ) : (
                            <Text size="sm" c="dimmed">
                              0
                            </Text>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>

                {totalPages > 1 && (
                  <Group justify="center">
                    <Pagination
                      total={totalPages}
                      value={page}
                      onChange={setPage}
                      size="sm"
                    />
                  </Group>
                )}
              </>
            )}

            <Group justify="flex-end">
              <Button variant="subtle" onClick={handleBack}>
                {isAddingVersion ? "Cancel" : "Back"}
              </Button>
              <Button
                onClick={handleNextFromSelect}
                disabled={selectedIds.size === 0}
              >
                Next
              </Button>
            </Group>
          </>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && (
          <>
            <Stack gap="sm">
              {!isAddingVersion && (
                <>
                  <Group>
                    <Text size="sm" fw={500} style={{ width: 100 }}>
                      Name:
                    </Text>
                    <Text size="sm">{name}</Text>
                  </Group>
                  {description && (
                    <Group>
                      <Text size="sm" fw={500} style={{ width: 100 }}>
                        Description:
                      </Text>
                      <Text size="sm">{description}</Text>
                    </Group>
                  )}
                </>
              )}
              <Group>
                <Text size="sm" fw={500} style={{ width: 100 }}>
                  Documents:
                </Text>
                <Text size="sm">
                  {selectedIds.size} document
                  {selectedIds.size !== 1 ? "s" : ""} selected
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                Ground truth will be generated from the verified OCR data with
                reviewer corrections applied.
              </Text>
            </Stack>

            <Group justify="flex-end">
              <Button variant="subtle" onClick={handleBack}>
                Back
              </Button>
              <Button onClick={handleSubmit} loading={isSubmitting}>
                {isAddingVersion ? "Add Version" : "Create Dataset"}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
