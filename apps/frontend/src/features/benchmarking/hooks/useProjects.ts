import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  groupId: string;
  createdBy: string;
  definitionCount: number;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DefinitionSummary {
  id: string;
  name: string;
  datasetVersionId: string;
  evaluatorType: string;
  immutable: boolean;
  createdAt: string;
}

interface RecentRunSummary {
  id: string;
  definitionName: string;
  status: string;
  temporalWorkflowId: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface ProjectDetails {
  id: string;
  name: string;
  description: string | null;
  groupId: string;
  createdBy: string;
  definitions: DefinitionSummary[];
  recentRuns: RecentRunSummary[];
  createdAt: string;
  updatedAt: string;
}

interface CreateProjectDto {
  name: string;
  description?: string;
}

export const useProjects = () => {
  const queryClient = useQueryClient();
  const { activeGroup } = useGroup();

  const projectsQuery = useQuery({
    queryKey: ["benchmark-projects", activeGroup?.id],
    queryFn: async () => {
      const url = activeGroup?.id
        ? `/benchmark/projects?groupId=${activeGroup.id}`
        : "/benchmark/projects";
      const response = await apiService.get<ProjectSummary[]>(url);
      return response.data || [];
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectDto) => {
      if (!activeGroup) {
        throw new Error("No active group selected");
      }
      const response = await apiService.post<ProjectDetails>(
        "/benchmark/projects",
        { ...data, groupId: activeGroup.id },
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to create project");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-projects"] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiService.delete(`/benchmark/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-projects"] });
    },
  });

  return {
    projects: projectsQuery.data || [],
    isLoading: projectsQuery.isLoading,
    error: projectsQuery.error,
    createProject: createProjectMutation.mutate,
    isCreating: createProjectMutation.isPending,
    createError: createProjectMutation.error,
    resetCreateError: createProjectMutation.reset,
    deleteProject: deleteProjectMutation.mutate,
    isDeletingProject: deleteProjectMutation.isPending,
    deleteError: deleteProjectMutation.error,
  };
};

export const useProject = (projectId: string) => {
  const projectQuery = useQuery({
    queryKey: ["benchmark-project", projectId],
    queryFn: async () => {
      const response = await apiService.get<ProjectDetails>(
        `/benchmark/projects/${projectId}`,
      );
      return response.data;
    },
    enabled: !!projectId,
  });

  return {
    project: projectQuery.data,
    isLoading: projectQuery.isLoading,
    error: projectQuery.error,
  };
};
