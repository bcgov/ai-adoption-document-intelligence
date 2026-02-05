import {
  Button,
  Checkbox,
  Group,
  MultiSelect,
  Radio,
  Stack,
  Text,
} from "@mantine/core";
import { FC, useState } from "react";
import { apiService } from "@/data/services/api.service";

interface ExportPanelProps {
  projectId: string;
  documents: Array<{ id: string; name: string }>;
}

interface LabelFile {
  filename: string;
  content: unknown;
}

interface ExportData {
  fieldsJson?: unknown;
  labelsFiles?: LabelFile[];
  [key: string]: unknown;
}

export const ExportPanel: FC<ExportPanelProps> = ({ projectId, documents }) => {
  const [format, setFormat] = useState<"azure" | "json">("azure");
  const [labeledOnly, setLabeledOnly] = useState(true);
  const [includeOcrData, setIncludeOcrData] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    const response = await apiService.post(
      `/labeling/projects/${projectId}/export`,
      {
        format,
        labeledOnly,
        includeOcrData,
        documentIds: selectedDocs.length ? selectedDocs : undefined,
      },
    );
    setExportData(response.data as ExportData);
    setIsExporting(false);
  };

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap="md">
      <Radio.Group
        value={format}
        onChange={(value) => setFormat(value as "azure" | "json")}
        label="Export format"
      >
        <Group>
          <Radio value="azure" label="Azure Document Intelligence" />
          <Radio value="json" label="JSON" />
        </Group>
      </Radio.Group>

      <Checkbox
        label="Export labeled documents only"
        checked={labeledOnly}
        onChange={(event) => setLabeledOnly(event.currentTarget.checked)}
      />
      <Checkbox
        label="Include OCR data"
        checked={includeOcrData}
        onChange={(event) => setIncludeOcrData(event.currentTarget.checked)}
      />

      <MultiSelect
        label="Limit to documents"
        placeholder="Select documents (optional)"
        data={documents.map((doc) => ({ value: doc.id, label: doc.name }))}
        value={selectedDocs}
        onChange={setSelectedDocs}
        searchable
        clearable
      />

      <Group>
        <Button onClick={handleExport} loading={isExporting}>
          Export
        </Button>
      </Group>

      {exportData && (
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Download export files
          </Text>
          {format === "json" ? (
            <Button
              variant="light"
              onClick={() => downloadJson(exportData, "export.json")}
            >
              Download export.json
            </Button>
          ) : (
            <>
              <Button
                variant="light"
                onClick={() =>
                  downloadJson(exportData.fieldsJson, "fields.json")
                }
              >
                Download fields.json
              </Button>
              {Array.isArray(exportData.labelsFiles) &&
                exportData.labelsFiles.map((file) => (
                  <Button
                    key={file.filename}
                    variant="light"
                    onClick={() => downloadJson(file.content, file.filename)}
                  >
                    Download {file.filename}
                  </Button>
                ))}
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
};
