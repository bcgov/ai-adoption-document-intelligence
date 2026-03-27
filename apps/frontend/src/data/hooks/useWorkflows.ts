import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
import { GraphWorkflowConfig } from "../../types/workflow";
import { apiService } from "../services/api.service";

export interface WorkflowInfo {
  id: string;
  workflowVersionId: string;
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
}

interface WorkflowsResponse {
  workflows: WorkflowInfo[];
}

interface WorkflowResponse {
  workflow: WorkflowInfo;
}

export function useWorkflows(options?: {
  includeBenchmarkCandidates?: boolean;
}) {
  const { activeGroup } = useGroup();
  const includeBenchmarkCandidates = Boolean(
    options?.includeBenchmarkCandidates,
  );

  return useQuery({
    queryKey: includeBenchmarkCandidates
      ? ["workflows", activeGroup?.id, true]
      : ["workflows", activeGroup?.id],
    queryFn: async (): Promise<WorkflowInfo[]> => {
      let url = activeGroup?.id
        ? `/workflows?groupId=${activeGroup.id}`
        : "/workflows";

      if (includeBenchmarkCandidates) {
        url += activeGroup?.id
          ? "&includeBenchmarkCandidates=true"
          : "?includeBenchmarkCandidates=true";
      }
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
