/**
 * `DynamicNodeNewPage` — `/dynamic-nodes/new` route (Phase 6 US-181,
 * Milestone F).
 *
 * Full-page mount of the `DynamicNodeEditor` in create mode. After the
 * first successful publish navigates to `/dynamic-nodes/:slug` so the
 * version-history pane lights up + future edits are PUTs.
 */

import { Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { DynamicNodeEditor } from "../../features/workflow-builder/dynamic-nodes";

export default function DynamicNodeNewPage() {
  const navigate = useNavigate();
  return (
    <Stack
      gap="md"
      style={{ height: "calc(100vh - 60px)", overflow: "auto" }}
      p="md"
      data-testid="dynamic-node-new-page"
    >
      <DynamicNodeEditor
        layout="full-page"
        onAfterPublish={(slug) => navigate(`/dynamic-nodes/${slug}`)}
        onClose={() => navigate("/dynamic-nodes")}
      />
    </Stack>
  );
}
