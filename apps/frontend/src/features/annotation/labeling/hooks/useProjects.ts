import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";

interface FieldSchema {
  id: string;
  [key: string]: unknown;
}

interface OcrField {
  confidence?: number;
  value?: string;
  [key: string]: unknown;
}

interface OcrResult {
  fields?: Record<string, OcrField>;
  [key: string]: unknown;
}

interface BoundingBox {
  polygon: number[];
  pageWidth?: number;
  pageHeight?: number;
  span?: {
    offset?: number;
    length?: number;
  };
  [key: string]: unknown;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  field_schema: FieldSchema[];
  _count?: { documents: number };
}

interface ProjectDocument {
  id: string;
  labeling_document_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  labeling_document: {
    id: string;
    title: string;
    original_filename: string;
    file_path?: string;
    file_type: string;
    file_size: number;
    status: string;
    created_at: string;
    updated_at: string;
    model_id?: string;
    file_url?: string | null;
    ocr_result?: OcrResult;
  };
  labels?: Array<{
    id: string;
    field_key: string;
    label_name: string;
    value?: string;
    page_number: number;
    bounding_box: BoundingBox;
    confidence?: number;
  }>;
}

interface CreateProjectDto {
  name: string;
  description?: string;
}

interface UpdateProjectDto {
  name?: string;
  description?: string;
  status?: string;
}

export const useProjects = () => {
  const queryClient = useQueryClient();
  const { activeGroup } = useGroup();

  const projectsQuery = useQuery({
    queryKey: ["labeling-projects", activeGroup?.id],
    queryFn: async () => {
      const endpoint = activeGroup?.id
        ? `/labeling/projects?group_id=${activeGroup.id}`
        : "/labeling/projects";
      const response = await apiService.get<Project[]>(endpoint);
      return response.data || [];
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectDto) => {
      const response = await apiService.post<Project>(
        "/labeling/projects",
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labeling-projects"] });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateProjectDto;
    }) => {
      const response = await apiService.put<Project>(
        `/labeling/projects/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labeling-projects"] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiService.delete(`/labeling/projects/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labeling-projects"] });
    },
  });

  return {
    projects: projectsQuery.data || [],
    isLoading: projectsQuery.isLoading,
    error: projectsQuery.error,
    createProject: createProjectMutation.mutate,
    updateProject: updateProjectMutation.mutate,
    deleteProject: deleteProjectMutation.mutate,
    isCreating: createProjectMutation.isPending,
    isUpdating: updateProjectMutation.isPending,
    isDeleting: deleteProjectMutation.isPending,
  };
};

export const useProject = (projectId: string) => {
  const projectQuery = useQuery({
    queryKey: ["labeling-project", projectId],
    queryFn: async () => {
      const response = await apiService.get<Project>(
        `/labeling/projects/${projectId}`,
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

export const useProjectDocuments = (projectId: string) => {
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ["labeling-project-documents", projectId],
    queryFn: async () => {
      const response = await apiService.get<ProjectDocument[]>(
        `/labeling/projects/${projectId}/documents`,
      );
      return response.data || [];
    },
    enabled: Boolean(projectId),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const addDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiService.post<ProjectDocument>(
        `/labeling/projects/${projectId}/documents`,
        { labelingDocumentId: documentId },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["labeling-project-documents", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["labeling-project", projectId],
      });
    },
  });

  const removeDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiService.delete(
        `/labeling/projects/${projectId}/documents/${documentId}`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["labeling-project-documents", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["labeling-project", projectId],
      });
    },
  });

  return {
    documents: documentsQuery.data || [],
    isLoading: documentsQuery.isLoading,
    error: documentsQuery.error,
    addDocument: addDocumentMutation.mutate,
    addDocumentAsync: addDocumentMutation.mutateAsync,
    removeDocument: removeDocumentMutation.mutate,
    isAdding: addDocumentMutation.isPending,
    isRemoving: removeDocumentMutation.isPending,
  };
};

export const useProjectDocument = (projectId: string, documentId?: string) => {
  const documentQuery = useQuery({
    queryKey: ["labeling-project-document", projectId, documentId],
    queryFn: async () => {
      const response = await apiService.get<ProjectDocument>(
        `/labeling/projects/${projectId}/documents/${documentId}`,
      );
      return response.data;
    },
    enabled: Boolean(projectId && documentId),
  });

  return {
    document: documentQuery.data,
    isLoading: documentQuery.isLoading,
    error: documentQuery.error,
  };
};
