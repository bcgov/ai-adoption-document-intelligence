import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "@/data/services/api.service";
import { notifications } from "../../../../ui";

const HEARTBEAT_INTERVAL_MS = 60_000;
const IDLE_WARNING_MS = 8 * 60 * 1000;

/** True when a failed request's error body carries HTTP 409 Conflict. */
const isConflict = (body: unknown): boolean =>
  typeof body === "object" &&
  body !== null &&
  "statusCode" in body &&
  body.statusCode === 409;

export const useSessionHeartbeat = (
  sessionId: string | undefined,
  queuePath: string,
  enabled = true,
) => {
  const navigate = useNavigate();
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleWarning(false);
  }, []);

  useEffect(() => {
    const events = ["keydown", "mousedown", "mousemove", "click"] as const;
    const handler = () => resetActivity();
    for (const event of events) {
      document.addEventListener(event, handler, { passive: true });
    }
    return () => {
      for (const event of events) {
        document.removeEventListener(event, handler);
      }
    };
  }, [resetActivity]);

  useEffect(() => {
    if (!sessionId) return;

    const sendHeartbeat = async () => {
      const response = await apiService.post(
        `/hitl/sessions/${sessionId}/heartbeat`,
        {},
      );
      // A 409 means the lock is gone: it lapsed and the session was reclaimed.
      // Any other failure may be passing, so the reviewer stays on the page.
      if (!response.success && isConflict(response.data)) {
        notifications.show({
          title: "Session expired",
          message:
            "Your session was released due to inactivity. Changes you hadn't saved were not kept.",
          color: "red",
          autoClose: 5000,
        });
        navigate(queuePath);
      }
    };

    if (!enabled) return;
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [sessionId, navigate, queuePath, enabled]);

  useEffect(() => {
    if (!sessionId || !enabled) return;

    idleCheckRef.current = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= IDLE_WARNING_MS && !idleWarning) {
        setIdleWarning(true);
        notifications.show({
          title: "Idle warning",
          message: "Session will be released in 2 minutes due to inactivity.",
          color: "yellow",
          autoClose: false,
          id: "idle-warning",
        });
      }
    }, 10_000);

    return () => {
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);
    };
  }, [sessionId, idleWarning, enabled]);

  return { idleWarning, resetActivity };
};
