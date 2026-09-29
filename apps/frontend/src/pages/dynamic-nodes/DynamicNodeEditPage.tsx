/**
 * `DynamicNodeEditPage` — `/dynamic-nodes/:slug` route (Phase 6 US-181,
 * Milestone F).
 *
 * Full-page mount of the `DynamicNodeEditor` in edit mode. Reads `slug`
 * from `useParams()`. On 404 (lineage soft-deleted or never existed)
 * renders a "not found" body with a link back to the management list.
 * On successful Delete the editor calls `onClose`, which navigates back
 * to `/dynamic-nodes`.
 */

import { Alert, Anchor, Loader, Stack, Text } from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import {
  DynamicNodeEditor,
  useDynamicNode,
} from "../../features/workflow-builder/dynamic-nodes";

export default function DynamicNodeEditPage() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const detailQuery = useDynamicNode(slug);

  if (!slug) {
    return (
      <Stack p="md">
        <Alert color="red">Missing slug in URL.</Alert>
      </Stack>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <Stack
        align="center"
        justify="center"
        mih="60vh"
        data-testid="dynamic-node-edit-page-loading"
      >
        <Loader />
        <Text size="sm" c="dimmed">
          Loading dynamic node…
        </Text>
      </Stack>
    );
  }

  if (detailQuery.error && detailQuery.error.status === 404) {
    return (
      <Stack p="md" gap="md" data-testid="dynamic-node-edit-page-not-found">
        <Alert color="red" title="Dynamic node not found or deleted">
          The lineage <code>{slug}</code> does not exist or has been
          soft-deleted.
        </Alert>
        <Anchor
          component="button"
          type="button"
          onClick={() => navigate("/dynamic-nodes")}
          data-testid="dynamic-node-edit-page-back-link"
        >
          Back to dynamic nodes
        </Anchor>
      </Stack>
    );
  }

  return (
    <Stack
      gap="md"
      style={{ height: "calc(100vh - 60px)", overflow: "auto" }}
      p="md"
      data-testid="dynamic-node-edit-page"
    >
      <DynamicNodeEditor
        slug={slug}
        layout="full-page"
        onClose={() => navigate("/dynamic-nodes")}
      />
    </Stack>
  );
}
