import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "@/data/services/api.service";

const HEARTBEAT_INTERVAL_MS = 60_000;
const IDLE_WARNING_MS = 8 * 60 * 1000;

export const useSessionHeartbeat = (
  sessionId: string | undefined,
  queuePath: string,
) => {
  const navigate = useNavigate();
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

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
      try {
        await apiService.post(`/hitl/sessions/${sessionId}/heartbeat`, {});
      } catch {
        notifications.show({
          title: "Session expired",
          message: "Your session was released due to inactivity. Corrections have been saved.",
          color: "red",
          autoClose: 5000,
        });
        navigate(queuePath);
      }
    };

    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [sessionId, navigate, queuePath]);

  useEffect(() => {
    if (!sessionId) return;

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
  }, [sessionId, idleWarning]);

  return { idleWarning, resetActivity };
};
