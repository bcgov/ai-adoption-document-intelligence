import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import type { RejectionReason } from "../../shared/types";
import { apiService } from "../services/api.service";

interface ApprovalPayload {
  approved: boolean;
  reviewer?: string;
  comments?: string;
  rejectionReason?: RejectionReason;
  annotations?: string;
}

interface ApprovalResponse {
  success: boolean;
  message: string;
}

export function useDocumentApproval() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      documentId,
      ...payload
    }: ApprovalPayload & { documentId: string }): Promise<ApprovalResponse> => {
      const response = await apiService.post<ApprovalResponse>(
        `/documents/${documentId}/approve`,
        {
          ...payload,
          reviewer:
            payload.reviewer ||
            user?.profile?.email ||
            user?.profile?.name ||
            "unknown",
        },
      );
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to send approval");
    },
    onSuccess: () => {
      // Invalidate documents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
