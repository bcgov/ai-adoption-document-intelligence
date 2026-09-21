import { vi } from "vitest";

const notificationMocks = vi.hoisted(() => ({
  show: vi.fn(),
}));

vi.mock("@mantine/notifications", () => ({
  notifications: {
    show: notificationMocks.show,
  },
  // Stub the provider component so tests that render `<Notifications />`
  // (e.g. workflow-builder settings) don't blow up on the missing export.
  Notifications: () => null,
}));

export const mockNotificationsShow = notificationMocks.show;
