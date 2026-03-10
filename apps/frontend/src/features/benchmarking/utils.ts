export function getStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "blue";
    case "running":
      return "yellow";
    case "completed":
      return "green";
    case "failed":
      return "red";
    case "cancelled":
      return "gray";
    default:
      return "gray";
  }
}

export function formatDurationMs(durationMs: number | null): string {
  if (!durationMs) return "-";
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function formatDurationFromDates(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  return formatDurationMs(Math.max(0, end - start));
}

export function getElapsedTime(startedAt: string | null): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return formatDurationMs(now - start);
}
