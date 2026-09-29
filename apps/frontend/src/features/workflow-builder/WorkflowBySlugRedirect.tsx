/**
 * `WorkflowBySlugRedirect` — resolver route for stable, shareable editor
 * links. Mounted at `/workflows/by-slug/:slug/edit`, it resolves the slug
 * to the current lineage id via `useWorkflowBySlug` and redirects to the
 * canonical `/workflows/:workflowId/edit` route.
 *
 * Why a slug entry-point? A slug is derived deterministically from the
 * workflow name and is stable across reseeds, whereas the lineage `id`
 * churns every time demo data is re-created. A `by-slug` link therefore
 * keeps working after a reseed (and reads far better when shared) while
 * all the editor's own machinery continues to run off the resolved id.
 */

import { Alert, Center, Code, Loader, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { useWorkflowBySlug } from "../../data/hooks/useWorkflows";

export function WorkflowBySlugRedirect(): ReactNode {
  const { slug } = useParams<{ slug: string }>();
  // Preserve the query string across the redirect so deep-link params (e.g.
  // `?agentChat=<id>`, which opens the agent drawer and replays a seeded
  // conversation) survive the by-slug → canonical-id hop.
  const { search } = useLocation();
  const { data, isPending, isError } = useWorkflowBySlug(slug ?? "");

  if (isError) {
    return (
      <Center h="60vh" p="md">
        <Alert
          icon={<IconAlertTriangle size={18} />}
          color="red"
          title="Workflow not found"
          maw={480}
        >
          <Text size="sm">
            We couldn't find a workflow with the handle{" "}
            <Text span fw={600}>
              {slug}
            </Text>{" "}
            in this group.
          </Text>
          <Text size="sm" mt="xs">
            If you followed a demo link from the docs, this demo workflow isn't
            seeded in this environment — run <Code>npm run seed:demos</Code> to
            load the feature demos. Otherwise the workflow may have been renamed
            or deleted.
          </Text>
        </Alert>
      </Center>
    );
  }

  if (isPending || !data) {
    return (
      <Center h="60vh">
        <Stack align="center" gap="xs">
          <Loader />
          <Text c="dimmed" size="sm">
            Resolving workflow…
          </Text>
        </Stack>
      </Center>
    );
  }

  return <Navigate to={`/workflows/${data.id}/edit${search}`} replace />;
}
