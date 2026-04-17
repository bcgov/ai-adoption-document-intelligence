import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Popover,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { type JSX, useMemo, useState } from "react";
import type { ConfusionProfile } from "../hooks/useConfusionProfiles";

interface ConfusionMatrixEditorProps {
  profile: ConfusionProfile;
  onSave: (matrix: Record<string, Record<string, number>>) => void;
  onClose: () => void;
}

interface MatrixRow {
  trueChar: string;
  recognizedChar: string;
  count: number;
}

type SortField = "trueChar" | "recognizedChar" | "count" | "fields";
type SortDir = "asc" | "desc";

function flattenMatrix(
  matrix: Record<string, Record<string, number>>,
): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const [trueChar, confusions] of Object.entries(matrix)) {
    for (const [recognizedChar, count] of Object.entries(confusions)) {
      rows.push({ trueChar, recognizedChar, count });
    }
  }
  return rows;
}

function reconstructMatrix(
  rows: MatrixRow[],
): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!matrix[row.trueChar]) {
      matrix[row.trueChar] = {};
    }
    const existing = matrix[row.trueChar][row.recognizedChar];
    matrix[row.trueChar][row.recognizedChar] = (existing ?? 0) + row.count;
  }
  return matrix;
}

function getFieldCount(
  profile: ConfusionProfile,
  trueChar: string,
  recognizedChar: string,
): number {
  const fieldCounts = profile.metadata?.fieldCounts as
    | Record<string, Record<string, number>>
    | undefined;
  if (!fieldCounts?.[trueChar]?.[recognizedChar]) return 0;
  return fieldCounts[trueChar][recognizedChar];
}

interface ExampleEntry {
  fieldKey: string;
  predicted: string;
  expected: string;
}

function getExamples(
  profile: ConfusionProfile,
  trueChar: string,
  recognizedChar: string,
): ExampleEntry[] {
  const examples = profile.metadata?.examples as
    | Record<string, Record<string, ExampleEntry[]>>
    | undefined;
  if (!examples?.[trueChar]?.[recognizedChar]) return [];
  return examples[trueChar][recognizedChar].slice(0, 5);
}

function displayChar(ch: string): string {
  if (ch === " ") return "\u2423"; // open box for space
  if (ch === "") return "(empty)";
  return ch;
}

export function ConfusionMatrixEditor({
  profile,
  onSave,
  onClose,
}: ConfusionMatrixEditorProps): JSX.Element {
  const [rows, setRows] = useState<MatrixRow[]>(() =>
    flattenMatrix(profile.matrix),
  );
  const [sortField, setSortField] = useState<SortField>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [newTrue, setNewTrue] = useState("");
  const [newRecognized, setNewRecognized] = useState("");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "count" || field === "fields" ? "desc" : "asc");
    }
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "trueChar":
          cmp = a.trueChar.localeCompare(b.trueChar);
          break;
        case "recognizedChar":
          cmp = a.recognizedChar.localeCompare(b.recognizedChar);
          break;
        case "count":
          cmp = a.count - b.count;
          break;
        case "fields":
          cmp =
            getFieldCount(profile, a.trueChar, a.recognizedChar) -
            getFieldCount(profile, b.trueChar, b.recognizedChar);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortField, sortDir, profile]);

  const handleDelete = (trueChar: string, recognizedChar: string) => {
    setRows((prev) =>
      prev.filter(
        (r) =>
          !(r.trueChar === trueChar && r.recognizedChar === recognizedChar),
      ),
    );
  };

  const handleAdd = () => {
    if (!newTrue || !newRecognized) return;
    setRows((prev) => [
      ...prev,
      { trueChar: newTrue, recognizedChar: newRecognized, count: 1 },
    ]);
    setNewTrue("");
    setNewRecognized("");
  };

  const handleSave = () => {
    onSave(reconstructMatrix(rows));
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Confusion Matrix: ${profile.name}`}
      size="xl"
    >
      <Stack gap="md">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <UnstyledButton onClick={() => handleSort("trueChar")}>
                  True char{sortIndicator("trueChar")}
                </UnstyledButton>
              </Table.Th>
              <Table.Th>
                <UnstyledButton onClick={() => handleSort("recognizedChar")}>
                  OCR read as{sortIndicator("recognizedChar")}
                </UnstyledButton>
              </Table.Th>
              <Table.Th>
                <UnstyledButton onClick={() => handleSort("count")}>
                  Count{sortIndicator("count")}
                </UnstyledButton>
              </Table.Th>
              <Table.Th>
                <UnstyledButton onClick={() => handleSort("fields")}>
                  Fields{sortIndicator("fields")}
                </UnstyledButton>
              </Table.Th>
              <Table.Th>Examples</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedRows.map((row) => {
              const fields = getFieldCount(
                profile,
                row.trueChar,
                row.recognizedChar,
              );
              const examples = getExamples(
                profile,
                row.trueChar,
                row.recognizedChar,
              );
              const isNoise = row.count === 1 || fields === 1;

              return (
                <Table.Tr
                  key={`${row.trueChar}-${row.recognizedChar}`}
                  style={isNoise ? { opacity: 0.5 } : undefined}
                >
                  <Table.Td>
                    <Text ff="monospace">{displayChar(row.trueChar)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ff="monospace">
                      {displayChar(row.recognizedChar)}
                    </Text>
                  </Table.Td>
                  <Table.Td>{row.count}</Table.Td>
                  <Table.Td>
                    {fields > 0
                      ? `${fields} field${fields !== 1 ? "s" : ""}`
                      : "-"}
                  </Table.Td>
                  <Table.Td>
                    {examples.length > 0 ? (
                      <Popover width={320} position="bottom" withArrow>
                        <Popover.Target>
                          <UnstyledButton>
                            <Text size="sm" c="blue" td="underline">
                              {examples.length} example
                              {examples.length !== 1 ? "s" : ""}
                            </Text>
                          </UnstyledButton>
                        </Popover.Target>
                        <Popover.Dropdown>
                          <Stack gap="xs">
                            {examples.map((ex, i) => (
                              <Text key={i} size="xs">
                                <Text span fw={600}>
                                  {ex.fieldKey}
                                </Text>
                                : &quot;{ex.predicted}&quot; vs &quot;
                                {ex.expected}&quot;
                              </Text>
                            ))}
                          </Stack>
                        </Popover.Dropdown>
                      </Popover>
                    ) : (
                      <Text size="sm" c="dimmed">
                        -
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() =>
                        handleDelete(row.trueChar, row.recognizedChar)
                      }
                      aria-label="Delete row"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {sortedRows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" ta="center" py="md">
                    No entries in the confusion matrix.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        <Group gap="sm" align="flex-end">
          <TextInput
            label="True char"
            value={newTrue}
            onChange={(e) => setNewTrue(e.currentTarget.value)}
            style={{ flex: 1 }}
            maxLength={5}
          />
          <TextInput
            label="Recognized char"
            value={newRecognized}
            onChange={(e) => setNewRecognized(e.currentTarget.value)}
            style={{ flex: 1 }}
            maxLength={5}
          />
          <ActionIcon
            variant="filled"
            size="lg"
            onClick={handleAdd}
            disabled={!newTrue || !newRecognized}
            aria-label="Add entry"
          >
            <IconPlus size={16} />
          </ActionIcon>
        </Group>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
