import { useCallback, useEffect, useRef, useState } from "react";
import { apiService } from "@/data/services/api.service";

interface UndoEntry {
  type: "field-edit" | "correction-delete";
  fieldKey: string;
  previousValue: string;
  correctionId?: string;
}

interface ReopenUndoEntry {
  sessionId: string;
  action: "approved" | "escalated" | "skipped";
}

// Module-level storage so pendingReopen survives navigation between sessions
let globalPendingReopen: ReopenUndoEntry | null = null;
let globalReopenTimer: ReturnType<typeof setTimeout> | undefined;

export const useUndoRedo = (sessionId: string | undefined) => {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [pendingReopen, setPendingReopen] = useState<ReopenUndoEntry | null>(globalPendingReopen);
  const reopenTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync local state with global on mount
  useEffect(() => {
    setPendingReopen(globalPendingReopen);
  }, []);

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
          .delete(`/hitl/sessions/${sessionId}/corrections/${popped.correctionId}`)
          .catch(() => {});
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

  const setPendingSessionReopen = useCallback(
    (completedSessionId: string, action: "approved" | "escalated" | "skipped", timeoutMs?: number) => {
      if (globalReopenTimer) clearTimeout(globalReopenTimer);
      if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current);

      const entry = { sessionId: completedSessionId, action };
      globalPendingReopen = entry;
      setPendingReopen(entry);

      if (timeoutMs) {
        const timer = setTimeout(() => {
          globalPendingReopen = null;
          setPendingReopen(null);
        }, timeoutMs);
        globalReopenTimer = timer;
        reopenTimerRef.current = timer;
      }
    },
    [],
  );

  const undoSessionAction = useCallback(async (): Promise<boolean> => {
    if (!pendingReopen) return false;
    try {
      await apiService.post(`/hitl/sessions/${pendingReopen.sessionId}/reopen`, {});
      globalPendingReopen = null;
      setPendingReopen(null);
      if (globalReopenTimer) clearTimeout(globalReopenTimer);
      if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current);
      return true;
    } catch {
      return false;
    }
  }, [pendingReopen]);

  const clearPendingReopen = useCallback(() => {
    globalPendingReopen = null;
    setPendingReopen(null);
    if (globalReopenTimer) clearTimeout(globalReopenTimer);
    if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current);
  }, []);

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
    pendingReopen,
    setPendingSessionReopen,
    undoSessionAction,
    clearPendingReopen,
  };
};
