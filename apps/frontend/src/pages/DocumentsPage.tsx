import {
  ActionIcon,
  Badge,
  Button,
  Collapse,
  Group,
  Image,
  Loader,
  Modal,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconChartBar,
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconRefresh,
  IconSearch,
  IconSelector,
  IconTrash,
} from "@tabler/icons-react";
import { type JSX, useEffect, useState } from "react";
import { DocumentViewerModal } from "../components/document/DocumentViewerModal";
import { useDeleteDocument } from "../data/hooks/useDeleteDocument";
import { useDocumentStats } from "../data/hooks/useDocumentStats";
import { useDocuments } from "../data/hooks/useDocuments";
import { useDocumentThumbnails } from "../data/hooks/useDocumentThumbnails";
import type { Document, DocumentStatus } from "../shared/types";
import { formatDate, formatFileSize } from "../shared/utils";

const statusOptions: { value: DocumentStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pre_ocr", label: "Waiting" },
  { value: "ongoing_ocr", label: "Processing" },
  { value: "completed_ocr", label: "Completed" },
  { value: "awaiting_review", label: "Awaiting Review" },
  { value: "ready", label: "Ready" },
  { value: "failed", label: "Failed" },
  { value: "rejected_by_human", label: "Rejected" },
];

const statusStyles: Record<string, { color: string; label: string }> = {
  pre_ocr: { color: "gray", label: "Queued" },
  ongoing_ocr: { color: "yellow", label: "Processing" },
  completed_ocr: { color: "blue", label: "Complete" },
  awaiting_review: { color: "orange", label: "Awaiting Review" },
  ready: { color: "green", label: "Ready" },
  failed: { color: "red", label: "Failed" },
  rejected_by_human: { color: "red", label: "Rejected by Human" },
};

const PAGE_SIZE = 50;

type SortField =
  | "title"
  | "status"
  | "size"
  | "source"
  | "workflow"
  | "created_at";

function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField | null;
  sortDir: "asc" | "desc";
}): JSX.Element {
  if (sortField !== field) return <IconSelector size={14} />;
  return sortDir === "asc" ? (
    <IconChevronUp size={14} />
  ) : (
    <IconChevronDown size={14} />
  );
}

export function DocumentsPage() {
  const [searchInput, setSearchInput] = useState(""); // Immediate input value
  const [search, setSearch] = useState(""); // Debounced search query
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">(
    "all",
  );
  const [page, setPage] = useState(1);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(
    null,
  );
  const [sortField, setSortField] = useState<SortField | null>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statsOpen, { toggle: toggleStats }] = useDisclosure(true);

  // Debounce search input (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset page to 1 when filters or sort change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortField, sortDir]);

  const { data, isLoading, isFetching, refetch } = useDocuments({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: search || undefined,
    status: statusFilter,
    sortBy: sortField || "created_at",
    sortDir,
    refetchInterval: (query) => {
      const docs = query.state.data?.documents;
      return docs?.some(
        (d) => d.status === "pre_ocr" || d.status === "ongoing_ocr",
      )
        ? 10_000
        : 60_000;
    },
  });

  const documents = data?.documents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const { data: statsData } = useDocumentStats();
  const { data: thumbnails } = useDocumentThumbnails(
    documents.map((d) => d.id),
  );

  const deleteDocument = useDeleteDocument();
  const [docPendingDelete, setDocPendingDelete] = useState<Document | null>(
    null,
  );

  const isInFlight = (status: Document["status"]) =>
    status === "pre_ocr" || status === "ongoing_ocr";

  const toggleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleConfirmDelete = () => {
    if (!docPendingDelete) return;
    const target = docPendingDelete;
    deleteDocument.mutate(target.id, {
      onSuccess: () => {
        notifications.show({
          title: "Document deleted",
          message: `${target.original_filename} was removed.`,
          color: "green",
          autoClose: 3000,
        });
        setDocPendingDelete(null);
        void refetch();
      },
      onError: (error) => {
        notifications.show({
          title: "Cannot delete document",
          message: error.message,
          color: "red",
          autoClose: 5000,
        });
        setDocPendingDelete(null);
      },
    });
  };

  return (
    <>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>Documents</Title>
            <Text size="sm" c="dimmed">
              View and manage all documents in your group
            </Text>
          </div>
          <Group gap="xs">
            <Tooltip label={statsOpen ? "Hide stats" : "Show stats"}>
              <ActionIcon variant="light" onClick={toggleStats} size="lg">
                <IconChartBar size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Refresh now">
              <ActionIcon
                variant="light"
                onClick={() => refetch()}
                loading={isFetching}
                size="lg"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Collapse in={statsOpen}>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4, lg: 6 }}>
            <Paper radius="md" p="md" withBorder>
              <Text size="xs" c="dimmed">
                Total
              </Text>
              <Text fw={600} size="lg">
                {statsData?.total ?? total}
              </Text>
            </Paper>
            <Paper radius="md" p="md" withBorder>
              <Text size="xs" c="dimmed">
                Processing
              </Text>
              <Text fw={600} size="lg" c="yellow">
                {statsData?.ongoing_ocr ?? 0}
              </Text>
            </Paper>
            <Paper radius="md" p="md" withBorder>
              <Text size="xs" c="dimmed">
                OCR Complete
              </Text>
              <Text fw={600} size="lg" c="blue">
                {statsData?.completed_ocr ?? 0}
              </Text>
            </Paper>
            <Paper radius="md" p="md" withBorder>
              <Text size="xs" c="dimmed">
                Awaiting Review
              </Text>
              <Text fw={600} size="lg" c="orange">
                {statsData?.awaiting_review ?? 0}
              </Text>
            </Paper>
            <Paper radius="md" p="md" withBorder>
              <Text size="xs" c="dimmed">
                Ready
              </Text>
              <Text fw={600} size="lg" c="green">
                {statsData?.ready ?? 0}
              </Text>
            </Paper>
            <Paper radius="md" p="md" withBorder>
              <Text size="xs" c="dimmed">
                Failed
              </Text>
              <Text fw={600} size="lg" c="red">
                {statsData?.failed ?? 0}
              </Text>
            </Paper>
          </SimpleGrid>
        </Collapse>

        <Paper shadow="sm" radius="md" p="lg" withBorder>
          <Stack gap="lg">
            <Group gap="md" align="flex-end">
              <TextInput
                placeholder="Search by document name or filename"
                value={searchInput}
                onChange={(event) => setSearchInput(event.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                flex={1}
              />
              <Select
                data={statusOptions}
                value={statusFilter}
                onChange={(value) =>
                  setStatusFilter((value as DocumentStatus | "all") ?? "all")
                }
                placeholder="Status"
                w={200}
              />
            </Group>

            {isLoading ? (
              <Stack align="center" gap="xs" py="xl">
                <Loader />
                <Text c="dimmed">Loading documents…</Text>
              </Stack>
            ) : documents.length === 0 ? (
              <Stack align="center" gap="xs" py="xl">
                <Text size="xl">📄</Text>
                <Text>No documents match your filters.</Text>
                <Text size="sm" c="dimmed">
                  Try adjusting your search or filters.
                </Text>
              </Stack>
            ) : (
              <>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={56} />
                      <Table.Th>
                        <UnstyledButton
                          onClick={() => toggleSort("title")}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          Name
                          <SortIcon
                            field="title"
                            sortField={sortField}
                            sortDir={sortDir}
                          />
                        </UnstyledButton>
                      </Table.Th>
                      <Table.Th>
                        <UnstyledButton
                          onClick={() => toggleSort("status")}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          Status
                          <SortIcon
                            field="status"
                            sortField={sortField}
                            sortDir={sortDir}
                          />
                        </UnstyledButton>
                      </Table.Th>
                      <Table.Th>
                        <UnstyledButton
                          onClick={() => toggleSort("size")}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          Size
                          <SortIcon
                            field="size"
                            sortField={sortField}
                            sortDir={sortDir}
                          />
                        </UnstyledButton>
                      </Table.Th>
                      <Table.Th>
                        <UnstyledButton
                          onClick={() => toggleSort("source")}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          Source
                          <SortIcon
                            field="source"
                            sortField={sortField}
                            sortDir={sortDir}
                          />
                        </UnstyledButton>
                      </Table.Th>
                      <Table.Th>
                        <UnstyledButton
                          onClick={() => toggleSort("workflow")}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          Workflow
                          <SortIcon
                            field="workflow"
                            sortField={sortField}
                            sortDir={sortDir}
                          />
                        </UnstyledButton>
                      </Table.Th>
                      <Table.Th>
                        <UnstyledButton
                          onClick={() => toggleSort("created_at")}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          Created
                          <SortIcon
                            field="created_at"
                            sortField={sortField}
                            sortDir={sortDir}
                          />
                        </UnstyledButton>
                      </Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {documents.map((doc) => {
                      const status = statusStyles[doc.status] ?? {
                        color: "gray",
                        label: doc.status,
                      };
                      return (
                        <Table.Tr
                          key={doc.id}
                          onClick={() => setSelectedDocument(doc)}
                          style={{ cursor: "pointer" }}
                        >
                          <Table.Td>
                            <Image
                              src={thumbnails?.[doc.id] ?? undefined}
                              w={40}
                              h={50}
                              radius="sm"
                              fit="cover"
                              fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='50'%3E%3Crect width='40' height='50' fill='%23dee2e6' rx='4'/%3E%3C/svg%3E"
                            />
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={600}>{doc.title}</Text>
                              <Text size="xs" c="dimmed">
                                {doc.original_filename}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Badge color={status.color} variant="light">
                              {status.label}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{formatFileSize(doc.file_size)}</Table.Td>
                          <Table.Td>{doc.source ?? "—"}</Table.Td>
                          <Table.Td>
                            <Text size="sm">{doc.workflow_name ?? "—"}</Text>
                          </Table.Td>
                          <Table.Td>
                            {formatDate(new Date(doc.created_at))}
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <Tooltip label="View details">
                                <ActionIcon
                                  variant="subtle"
                                  color="blue"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedDocument(doc);
                                  }}
                                >
                                  <IconEye size={18} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip
                                label={
                                  isInFlight(doc.status)
                                    ? "Cannot delete while processing"
                                    : "Delete document"
                                }
                              >
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  disabled={isInFlight(doc.status)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!isInFlight(doc.status)) {
                                      setDocPendingDelete(doc);
                                    }
                                  }}
                                >
                                  <IconTrash size={18} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>

                {totalPages > 1 && (
                  <Group justify="center" mt="md">
                    <Pagination
                      value={page}
                      onChange={setPage}
                      total={totalPages}
                      siblings={1}
                      boundaries={1}
                    />
                  </Group>
                )}
              </>
            )}
          </Stack>
        </Paper>
      </Stack>

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        document={selectedDocument}
        opened={!!selectedDocument}
        onClose={() => setSelectedDocument(null)}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        opened={docPendingDelete !== null}
        onClose={() => setDocPendingDelete(null)}
        title="Confirm deletion"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete{" "}
            <Text span fw={600}>
              {docPendingDelete?.original_filename}
            </Text>
            ? This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => setDocPendingDelete(null)}
              disabled={deleteDocument.isPending}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleConfirmDelete}
              loading={deleteDocument.isPending}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
