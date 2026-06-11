import { vi } from "vitest";

const notificationMocks = vi.hoisted(() => ({
  show: vi.fn(),
}));

vi.mock("@mantine/notifications", () => ({
  notifications: {
    show: notificationMocks.show,
  },
}));

export const mockNotificationsShow = notificationMocks.show;
