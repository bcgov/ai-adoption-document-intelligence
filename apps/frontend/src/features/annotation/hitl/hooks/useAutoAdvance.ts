import { notifications } from "@mantine/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";

interface NextSessionResponse {
  id: string;
  documentId: string;
  reviewerId: string;
  status: string;
  startedAt: string;
}

interface ReviewQueueDocument {
  id: string;
  [key: string]: unknown;
}

interface ReviewQueueResponse {
  documents: ReviewQueueDocument[];
  total: number;
}

interface AutoAdvanceFilters {
  modelId?: string;
  maxConfidence?: number;
  reviewStatus?: string;
}

export const useAutoAdvance = (filters?: AutoAdvanceFilters) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeGroup } = useGroup();
  const queryClient = useQueryClient();

  const benchmarkMatch = useMemo(
    () =>
      location.pathname.match(
        /^\/benchmarking\/datasets\/([^/]+)\/versions\/([^/]+)\/review/,
      ),
    [location.pathname],
  );

  const getBasePath = useCallback(() => {
    if (benchmarkMatch) {
      return `/benchmarking/datasets/${benchmarkMatch[1]}/versions/${benchmarkMatch[2]}/review`;
    }
    return "/review";
  }, [benchmarkMatch]);

  const nextSessionMutation = useMutation({
    mutationFn: async (): Promise<NextSessionResponse | null> => {
      if (benchmarkMatch) {
        // Dataset labeling mode: fetch next pending document from dataset queue
        const datasetId = benchmarkMatch[1];
        const versionId = benchmarkMatch[2];
        const queueEndpoint = `/benchmark/datasets/${datasetId}/versions/${versionId}/ground-truth-generation/review/queue?reviewStatus=pending&limit=1`;
        const queueResponse =
          await apiService.get<ReviewQueueResponse>(queueEndpoint);
        const nextDoc = queueResponse.data?.documents?.[0];
        if (!nextDoc) return null;

        // Start a session for the next document
        const sessionResponse = await apiService.post<NextSessionResponse>(
          "/hitl/sessions",
          { documentId: nextDoc.id },
        );
        return sessionResponse.data;
      }

      // Standard HITL mode
      const params = new URLSearchParams();
      if (filters?.modelId) params.append("modelId", filters.modelId);
      if (filters?.maxConfidence)
        params.append("maxConfidence", String(filters.maxConfidence));
      if (filters?.reviewStatus)
        params.append("reviewStatus", filters.reviewStatus);
      if (activeGroup?.id) params.append("group_id", activeGroup.id);
      const query = params.toString();
      const response = await apiService.post<NextSessionResponse>(
        `/hitl/sessions/next${query ? `?${query}` : ""}`,
        {},
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        navigate(`${getBasePath()}/${data.id}`);
        queryClient.invalidateQueries({ queryKey: ["dataset-review-queue"] });
        queryClient.invalidateQueries({ queryKey: ["dataset-review-stats"] });
      } else {
        notifications.show({
          title: "Queue complete",
          message: "No more documents to review.",
          color: "blue",
          autoClose: 3000,
        });
        navigate(getBasePath());
      }
    },
    onError: () => {
      notifications.show({
        title: "Queue complete",
        message: "No more documents to review.",
        color: "blue",
        autoClose: 3000,
      });
      navigate(getBasePath());
    },
  });

  const advance = useCallback(() => {
    nextSessionMutation.mutate();
  }, [nextSessionMutation]);

  return { advance, isAdvancing: nextSessionMutation.isPending };
};
