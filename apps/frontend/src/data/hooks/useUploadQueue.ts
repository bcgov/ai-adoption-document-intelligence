import { useCallback, useState } from "react";
import { generateId } from "@/shared/utils";

export type UploadStatus = "queued" | "uploading" | "success" | "error";

export interface UploadQueueItem<TResult = unknown> {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  message?: string;
  progress: number;
  result?: TResult;
}

interface UseUploadQueueOptions<TResult> {
  onUploadSuccess?: (item: UploadQueueItem<TResult>, result: TResult) => void;
  onUploadError?: (item: UploadQueueItem<TResult>, error: Error) => void;
}

export const useUploadQueue = <TResult = unknown>(
  options: UseUploadQueueOptions<TResult> = {},
) => {
  const [queue, setQueue] = useState<UploadQueueItem<TResult>[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback((files: File[]) => {
    const newItems = files.map<UploadQueueItem<TResult>>((file) => ({
      id: generateId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      progress: 0,
    }));
    setQueue((prev) => [...newItems, ...prev]);
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const uploadFiles = useCallback(
    async (
      uploadFile: (file: File) => Promise<TResult>,
      itemsToUpload?: UploadQueueItem<TResult>[],
    ) => {
      const pending =
        itemsToUpload ??
        queue.filter((item) => item.status === "queued" || item.status === "error");

      if (pending.length === 0) {
        return;
      }

      setIsUploading(true);

      for (const item of pending) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "uploading", progress: 10, message: undefined }
              : q,
          ),
        );

        try {
          const result = await uploadFile(item.file);

          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: "success",
                    progress: 100,
                    result,
                  }
                : q,
            ),
          );

          options.onUploadSuccess?.({ ...item, status: "success" }, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          const err = error instanceof Error ? error : new Error(message);

          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: "error",
                    message,
                    progress: 0,
                  }
                : q,
            ),
          );

          options.onUploadError?.({ ...item, status: "error", message }, err);
        }
      }

      setIsUploading(false);
    },
    [options, queue],
  );

  return {
    queue,
    isUploading,
    addFiles,
    removeFromQueue,
    clearQueue,
    uploadFiles,
  };
};
