import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";
import type { CorrectionAction } from "../../core/types/annotation";

interface ReviewSession {
  id: string;
  documentId: string;
  reviewerId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  document?: {
    id: string;
    original_filename: string;
    storage_path?: string;
    ocr_result?: any;
    file_type?: string;
  };
  corrections?: any[];
}

interface CorrectionDto {
  field_key: string;
  original_value?: string;
  corrected_value?: string;
  original_conf?: number;
  action: CorrectionAction;
}

export const useReviewSession = (sessionId?: string) => {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["hitl-session", sessionId],
    queryFn: async () => {
      const response = await apiService.get<ReviewSession>(
        `/hitl/sessions/${sessionId}`,
      );
      return response.data;
    },
    enabled: Boolean(sessionId),
  });

  const submitCorrectionsMutation = useMutation({
    mutationFn: async (corrections: CorrectionDto[]) => {
      const response = await apiService.post(
        `/hitl/sessions/${sessionId}/corrections`,
        { corrections },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hitl-session", sessionId] });
      queryClient.invalidateQueries({
        queryKey: ["hitl-session-corrections", sessionId],
      });
    },
  });

  const approveSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiService.post(
        `/hitl/sessions/${sessionId}/submit`,
        {},
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hitl-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["hitl-queue"] });
    },
  });

  const escalateSessionMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await apiService.post(
        `/hitl/sessions/${sessionId}/escalate`,
        { reason },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hitl-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["hitl-queue"] });
    },
  });

  const skipSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiService.post(
        `/hitl/sessions/${sessionId}/skip`,
        {},
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hitl-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["hitl-queue"] });
    },
  });

  const correctionsQuery = useQuery({
    queryKey: ["hitl-session-corrections", sessionId],
    queryFn: async () => {
      const response = await apiService.get<{
        sessionId: string;
        corrections: Array<{
          id: string;
          fieldKey: string;
          originalValue?: string;
          correctedValue?: string;
          originalConfidence?: number;
          action: string;
          createdAt: string;
        }>;
      }>(`/hitl/sessions/${sessionId}/corrections`);
      return response.data?.corrections || [];
    },
    enabled: Boolean(sessionId),
  });

  return {
    session: sessionQuery.data,
    corrections: correctionsQuery.data || [],
    isLoading: sessionQuery.isLoading,
    error: sessionQuery.error,
    submitCorrections: submitCorrectionsMutation.mutate,
    submitCorrectionsAsync: submitCorrectionsMutation.mutateAsync,
    approveSession: approveSessionMutation.mutate,
    approveSessionAsync: approveSessionMutation.mutateAsync,
    escalateSession: escalateSessionMutation.mutate,
    escalateSessionAsync: escalateSessionMutation.mutateAsync,
    skipSession: skipSessionMutation.mutate,
    skipSessionAsync: skipSessionMutation.mutateAsync,
    isSubmitting: submitCorrectionsMutation.isPending,
    isApproving: approveSessionMutation.isPending,
    isEscalating: escalateSessionMutation.isPending,
    isSkipping: skipSessionMutation.isPending,
  };
};
