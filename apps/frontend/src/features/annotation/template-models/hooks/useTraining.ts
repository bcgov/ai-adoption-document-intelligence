import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "../../../../data/services/api.service";
import {
  StartTrainingRequest,
  TrainingJob,
  TrainingStatus,
  ValidationResult,
} from "../types/training.types";

export function useTraining(templateModelId: string) {
  const queryClient = useQueryClient();

  // Validate template model readiness for training
  const validateQuery = useQuery({
    queryKey: ["training-validation", templateModelId],
    queryFn: async () => {
      const response = await apiService.get<ValidationResult>(
        `/template-models/${templateModelId}/training/validate`,
      );
      return response.data;
    },
    enabled: !!templateModelId,
  });

  // Get training jobs for template model
  const jobsQuery = useQuery({
    queryKey: ["training-jobs", templateModelId],
    queryFn: async () => {
      const response = await apiService.get<TrainingJob[]>(
        `/template-models/${templateModelId}/training/jobs`,
      );
      return response.data || [];
    },
    enabled: !!templateModelId,
    refetchInterval: (query) => {
      // Poll every 5 seconds if any job is in progress
      const data = query.state.data;
      const hasActiveJob = data?.some((job) =>
        [
          TrainingStatus.PENDING,
          TrainingStatus.UPLOADING,
          TrainingStatus.UPLOADED,
          TrainingStatus.TRAINING,
        ].includes(job.status),
      );
      return hasActiveJob ? 5000 : false;
    },
  });

  // Start training mutation
  const startTrainingMutation = useMutation({
    mutationFn: async (data: StartTrainingRequest) => {
      const response = await apiService.post<TrainingJob>(
        `/template-models/${templateModelId}/training/train`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["training-jobs", templateModelId],
      });
      queryClient.invalidateQueries({
        queryKey: ["training-validation", templateModelId],
      });
    },
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiService.delete(`/template-models/training/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["training-jobs", templateModelId],
      });
    },
  });

  return {
    // Validation
    validation: validateQuery.data,
    isValidating: validateQuery.isLoading,
    validationError: validateQuery.error,

    // Jobs
    jobs: jobsQuery.data || [],
    isLoadingJobs: jobsQuery.isLoading,
    jobsError: jobsQuery.error,

    // Actions
    startTraining: startTrainingMutation.mutateAsync,
    isStarting: startTrainingMutation.isPending,
    startError: startTrainingMutation.error,

    cancelJob: cancelJobMutation.mutateAsync,
    isCancelling: cancelJobMutation.isPending,
  };
}
