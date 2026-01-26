import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../../../data/services/api.service';
import {
  TrainingJob,
  TrainedModel,
  ValidationResult,
  StartTrainingRequest,
  TrainingStatus,
} from '../types/training.types';

export function useTraining(projectId: string) {
  const queryClient = useQueryClient();

  // Validate project readiness for training
  const validateQuery = useQuery({
    queryKey: ['training-validation', projectId],
    queryFn: async () => {
      const response = await apiService.get<ValidationResult>(
        `/training/projects/${projectId}/validate`,
      );
      return response.data;
    },
    enabled: !!projectId,
  });

  // Get training jobs for project
  const jobsQuery = useQuery({
    queryKey: ['training-jobs', projectId],
    queryFn: async () => {
      const response = await apiService.get<TrainingJob[]>(
        `/training/projects/${projectId}/jobs`,
      );
      return response.data || [];
    },
    enabled: !!projectId,
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

  // Get trained models for project
  const modelsQuery = useQuery({
    queryKey: ['trained-models', projectId],
    queryFn: async () => {
      const response = await apiService.get<TrainedModel[]>(
        `/training/projects/${projectId}/models`,
      );
      return response.data || [];
    },
    enabled: !!projectId,
  });

  // Start training mutation
  const startTrainingMutation = useMutation({
    mutationFn: async (data: StartTrainingRequest) => {
      const response = await apiService.post<TrainingJob>(
        `/training/projects/${projectId}/train`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-jobs', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['training-validation', projectId],
      });
    },
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiService.delete(`/training/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-jobs', projectId] });
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

    // Models
    models: modelsQuery.data || [],
    isLoadingModels: modelsQuery.isLoading,
    modelsError: modelsQuery.error,

    // Actions
    startTraining: startTrainingMutation.mutateAsync,
    isStarting: startTrainingMutation.isPending,
    startError: startTrainingMutation.error,

    cancelJob: cancelJobMutation.mutateAsync,
    isCancelling: cancelJobMutation.isPending,
  };
}
