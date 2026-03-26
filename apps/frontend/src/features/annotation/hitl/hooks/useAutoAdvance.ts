import { notifications } from "@mantine/notifications";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
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

interface AutoAdvanceFilters {
  modelId?: string;
  maxConfidence?: number;
  reviewStatus?: string;
}

export const useAutoAdvance = (filters?: AutoAdvanceFilters) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeGroup } = useGroup();

  const getBasePath = useCallback(() => {
    const benchmarkMatch = location.pathname.match(
      /^\/benchmarking\/datasets\/([^/]+)\/versions\/([^/]+)\/review/,
    );
    if (benchmarkMatch) {
      return `/benchmarking/datasets/${benchmarkMatch[1]}/versions/${benchmarkMatch[2]}/review`;
    }
    return "/review";
  }, [location.pathname]);

  const nextSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiService.post<NextSessionResponse>(
        "/hitl/sessions/next",
        { ...filters, group_id: activeGroup?.id },
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        navigate(`${getBasePath()}/${data.id}`);
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
