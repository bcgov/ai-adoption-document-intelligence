import { useQuery } from "@tanstack/react-query";
import { apiService } from "../../../../data/services/api.service";
import { TrainingInfo } from "../types/training.types";

/**
 * Fetches Azure Document Intelligence resource info (region + neural quota).
 * Used by TrainingPanel to show an FYI banner when the user picks neural
 * mode. Disabled until `enabled` is true so the call doesn't fire on every
 * page mount.
 */
export function useTrainingInfo(enabled: boolean) {
  return useQuery({
    queryKey: ["training-info"],
    queryFn: async () => {
      const response = await apiService.get<TrainingInfo>(
        "/template-models/training/info",
      );
      return response.data;
    },
    enabled,
    staleTime: 60_000,
  });
}
