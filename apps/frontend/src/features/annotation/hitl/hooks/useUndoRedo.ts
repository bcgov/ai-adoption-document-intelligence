import { useCallback, useState } from "react";
import { apiService } from "@/data/services/api.service";

interface UndoEntry {
  type: "field-edit" | "correction-delete";
  fieldKey: string;
  previousValue: string;
  correctionId?: string;
}

export const useUndoRedo = (sessionId: string | undefined) => {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoStack((prev) => [...prev, entry]);
    setRedoStack([]);
  }, []);

  const undo = useCallback((): UndoEntry | null => {
    const poppedRef: { current: UndoEntry | null } = { current: null };
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      poppedRef.current = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    const popped = poppedRef.current;
    if (popped) {
      setRedoStack((prev) => [...prev, popped]);
      if (popped.correctionId && sessionId) {
        apiService
          .delete(
            `/hitl/sessions/${sessionId}/corrections/${popped.correctionId}`,
          )
          .catch(() => {
            /* fire-and-forget */
          });
      }
    }
    return popped;
  }, [sessionId]);

  const redo = useCallback((): UndoEntry | null => {
    const poppedRef: { current: UndoEntry | null } = { current: null };
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      poppedRef.current = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    const popped = poppedRef.current;
    if (popped) {
      setUndoStack((prev) => [...prev, popped]);
    }
    return popped;
  }, []);

  const markCorrectionIds = useCallback(
    (corrections: Array<{ id: string; field_key: string }>) => {
      setUndoStack((prev) =>
        prev.map((entry) => {
          if (entry.correctionId) return entry;
          const match = corrections.find((c) => c.field_key === entry.fieldKey);
          if (match) return { ...entry, correctionId: match.id };
          return entry;
        }),
      );
    },
    [],
  );

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    undoStack,
    redoStack,
    pushUndo,
    undo,
    redo,
    markCorrectionIds,
    clear,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
};
