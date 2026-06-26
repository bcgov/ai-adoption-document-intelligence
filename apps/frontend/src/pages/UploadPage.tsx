import { DocumentUploadPanel } from "../components/upload/DocumentUploadPanel";
import { PageHeader, Stack } from "../ui";

export function UploadPage() {
  return (
    <Stack style={{ gap: "var(--layout-margin-large)" }}>
      <PageHeader
        title="Upload documents"
        description="Add new images and track their ingestion progress."
      />

      <DocumentUploadPanel />
    </Stack>
  );
}
