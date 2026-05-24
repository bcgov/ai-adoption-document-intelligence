import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
import { GraphWorkflowConfig } from "../../types/workflow";
import { apiService } from "../services/api.service";

export interface WorkflowInfo {
  id: string;
  workflowVersionId: string;
  /** Stable, URL/CLI-friendly handle. Unique within a group. */
  slug: string;
  name: string;
  description: string | null;
  actorId: string;
  config: GraphWorkflowConfig;
  schemaVersion: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  config: GraphWorkflowConfig;
  /**
   * Workflow kind: "workflow" (or absent) creates a regular primary
   * workflow; "library" creates a library workflow whose top-level
   * `metadata.inputs[]` / `metadata.outputs[]` define its signature
   * for use as a `childWorkflow` target.
   */
  kind?: "workflow" | "library";
}

interface WorkflowsResponse {
  workflows: WorkflowInfo[];
}

interface WorkflowResponse {
  workflow: WorkflowInfo;
}

export function useWorkflows(options?: {
  includeBenchmarkCandidates?: boolean;
  /**
   * Filter by workflow kind:
   * - `"workflow"` — primary lineages only (current default behavior)
   * - `"library"` — library workflows only
   * - `"all"` — every kind, still honoring `includeBenchmarkCandidates`
   * - omitted — primary lineages only (default; libraries excluded)
   */
  kind?: "workflow" | "library" | "all";
}) {
  const { activeGroup } = useGroup();
  const includeBenchmarkCandidates = Boolean(
    options?.includeBenchmarkCandidates,
  );
  const kind = options?.kind;

  return useQuery({
    queryKey: ["workflows", activeGroup?.id, includeBenchmarkCandidates, kind],
    queryFn: async (): Promise<WorkflowInfo[]> => {
      const params: string[] = [];
      if (activeGroup?.id) {
        params.push(`groupId=${activeGroup.id}`);
      }
      if (includeBenchmarkCandidates) {
        params.push("includeBenchmarkCandidates=true");
      }
      if (kind) {
        params.push(`kind=${kind}`);
      }
      const url =
        params.length > 0 ? `/workflows?${params.join("&")}` : "/workflows";
      const response = await apiService.get<WorkflowsResponse>(url);
      if (!response.success) {
        throw new Error(response.message || "Failed to fetch workflows");
      }
      return response.data?.workflows || [];
    },
  });
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ["workflow", id],
    queryFn: async (): Promise<WorkflowInfo> => {
      const response = await apiService.get<WorkflowResponse>(
        `/workflows/${id}`,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to fetch workflow");
      }
      return response.data.workflow;
    },
    enabled: !!id,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  const { activeGroup } = useGroup();

  return useMutation({
    mutationFn: async (dto: CreateWorkflowDto): Promise<WorkflowInfo> => {
      if (!activeGroup) {
        throw new Error("No active group selected");
      }
      const response = await apiService.post<WorkflowResponse>("/workflows", {
        ...dto,
        groupId: activeGroup.id,
      });
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to create workflow");
      }
      return response.data.workflow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      dto,
    }: {
      id: string;
      dto: Partial<CreateWorkflowDto>;
    }): Promise<WorkflowInfo> => {
      const response = await apiService.put<WorkflowResponse>(
        `/workflows/${id}`,
        dto,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to update workflow");
      }
      return response.data.workflow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["workflow", variables.id] });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await apiService.delete(`/workflows/${id}`);
      if (!response.success) {
        throw new Error(response.message || "Failed to delete workflow");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export interface WorkflowVersionSummary {
  id: string;
  versionNumber: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Phase 2 Track 2 — Workflow-as-API
// ---------------------------------------------------------------------------

/**
 * Mirror of backend's `RunSpecInputSchemaPropertyDto`. Minimal subset of
 * JSON Schema used by the Run drawer.
 */
export interface RunSpecInputSchemaProperty {
  type: "string" | "number" | "boolean" | "object" | "array";
  title?: string;
  description?: string;
  default?: unknown;
}

export interface RunSpecInputSchema {
  type: "object";
  properties: Record<string, RunSpecInputSchemaProperty>;
  required: string[];
}

export interface WorkflowRunSpec {
  triggerUrl: string;
  inputSchema: RunSpecInputSchema;
  authNotes: string;
  sampleCurl: string;
}

export interface StartRunRequest {
  initialCtx?: Record<string, unknown>;
  workflowVersionId?: string;
}

export interface StartRunResponse {
  workflowId: string;
  workflowVersionId: string;
  status: "started";
}

export function useWorkflowRunSpec(workflowId: string | undefined) {
  return useQuery({
    queryKey: ["workflow-run-spec", workflowId],
    queryFn: async (): Promise<WorkflowRunSpec> => {
      const response = await apiService.get<WorkflowRunSpec>(
        `/workflows/${workflowId}/run-spec`,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to fetch run-spec");
      }
      return response.data;
    },
    enabled: !!workflowId,
  });
}

export function useStartWorkflowRun() {
  return useMutation({
    mutationFn: async ({
      workflowId,
      body,
    }: {
      workflowId: string;
      body: StartRunRequest;
    }): Promise<StartRunResponse> => {
      const response = await apiService.post<StartRunResponse>(
        `/workflows/${workflowId}/runs`,
        body,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to start workflow run");
      }
      return response.data;
    },
  });
}

export function useWorkflowVersions(lineageId: string | undefined) {
  return useQuery({
    queryKey: ["workflow-versions", lineageId],
    queryFn: async (): Promise<WorkflowVersionSummary[]> => {
      const response = await apiService.get<{
        versions: WorkflowVersionSummary[];
      }>(`/workflows/${lineageId}/versions`);
      if (!response.success || !response.data) {
        throw new Error(
          response.message || "Failed to fetch workflow versions",
        );
      }
      return response.data.versions || [];
    },
    enabled: !!lineageId,
  });
}

/**
 * Fetches the full `WorkflowInfo` (config + metadata) for a specific
 * version within a lineage. Backs the version-history drawer's
 * "Compare to head" action and per-version run-spec refetches that need
 * the raw config (US-079 / US-081).
 */
export function useWorkflowVersion(
  lineageId: string | undefined,
  versionId: string | undefined,
) {
  return useQuery({
    queryKey: ["workflow-version", lineageId, versionId],
    queryFn: async (): Promise<WorkflowInfo> => {
      const response = await apiService.get<WorkflowResponse>(
        `/workflows/${lineageId}/versions/${versionId}`,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to fetch workflow version");
      }
      return response.data.workflow;
    },
    enabled: !!lineageId && !!versionId,
  });
}

export function useRevertWorkflowHead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lineageId,
      workflowVersionId,
    }: {
      lineageId: string;
      workflowVersionId: string;
    }): Promise<WorkflowInfo> => {
      const response = await apiService.post<WorkflowResponse>(
        `/workflows/${lineageId}/revert-head`,
        { workflowVersionId },
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to update workflow head");
      }
      return response.data.workflow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({
        queryKey: ["workflow", variables.lineageId],
      });
      queryClient.invalidateQueries({
        queryKey: ["workflow-versions", variables.lineageId],
      });
    },
  });
}
