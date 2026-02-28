import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  mlflowExperimentId: string;
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
  mlflowRunId: string | null;
  temporalWorkflowId: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface ProjectDetails {
  id: string;
  name: string;
  description: string | null;
  mlflowExperimentId: string;
  createdBy: string;
  definitions: DefinitionSummary[];
  recentRuns: RecentRunSummary[];
  createdAt: string;
  updatedAt: string;
}

interface CreateProjectDto {
  name: string;
  description?: string;
  createdBy: string;
}

export const useProjects = () => {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ["benchmark-projects"],
    queryFn: async () => {
      const response = await apiService.get<ProjectSummary[]>(
        "/benchmark/projects",
      );
      return response.data || [];
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectDto) => {
      const response = await apiService.post<ProjectDetails>(
        "/benchmark/projects",
        data,
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

  return {
    projects: projectsQuery.data || [],
    isLoading: projectsQuery.isLoading,
    error: projectsQuery.error,
    createProject: createProjectMutation.mutate,
    isCreating: createProjectMutation.isPending,
    createError: createProjectMutation.error,
    resetCreateError: createProjectMutation.reset,
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
