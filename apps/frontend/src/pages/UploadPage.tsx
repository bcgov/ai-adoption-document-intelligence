import { DocumentUploadPanel } from "../components/upload/DocumentUploadPanel";
import { PageHeader, Stack } from "../ui";

export function UploadPage() {
  return (
    <Stack gap="lg">
      <PageHeader
        title="Upload documents"
        description="Add new images and track their ingestion progress."
      />

      <DocumentUploadPanel />
    </Stack>
  );
}
