import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraphWorkflowConfig } from "../../types/workflow";
import { apiService } from "../services/api.service";

export interface WorkflowInfo {
  id: string;
  name: string;
  description: string | null;
  userId: string;
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

export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: async (): Promise<WorkflowInfo[]> => {
      const response = await apiService.get<WorkflowsResponse>("/workflows");
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

  return useMutation({
    mutationFn: async (dto: CreateWorkflowDto): Promise<WorkflowInfo> => {
      const response = await apiService.post<WorkflowResponse>(
        "/workflows",
        dto,
      );
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}
