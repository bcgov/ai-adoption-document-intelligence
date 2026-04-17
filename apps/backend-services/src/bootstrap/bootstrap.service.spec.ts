import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AuditService } from "../audit/audit.service";
import { BootstrapService } from "./bootstrap.service";

const mockAuditService = {
  recordEvent: jest.fn().mockResolvedValue(undefined),
} as unknown as AuditService;

function createMockPrisma(adminCount = 0) {
  const user = {
    id: "user-1",
    email: "admin@example.com",
    actor_id: "actor-1",
  };
  const group = {
    id: "group-1",
    name: "Default",
    description: "Initial group created during system setup",
  };
  const prisma = {
    user: {
      count: jest.fn().mockResolvedValue(adminCount),
      update: jest.fn().mockResolvedValue(user),
    },
    group: {
      upsert: jest.fn().mockResolvedValue(group),
    },
    userGroup: {
      upsert: jest.fn().mockResolvedValue(undefined),
    },
  };
  return {
    prisma,
    transaction: jest.fn(async (cb) => {
      // Simulate the callback with the tx mock (prisma)
      return cb(prisma);
    }),
  };
}

function createService(adminCount: number, bootstrapEmail: string | undefined) {
  const mockPrisma = createMockPrisma(adminCount);
  const configService = {
    get: jest.fn((key: string) => {
      if (key === "BOOTSTRAP_ADMIN_EMAIL") return bootstrapEmail;
      return undefined;
    }),
  } as unknown as ConfigService;

  const service = new BootstrapService(
    mockPrisma as never,
    configService,
    mockAppLogger,
    mockAuditService,
  );

  return { service, mockPrisma };
}

describe("BootstrapService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getBootstrapStatus", () => {
    it("should return needed=true, eligible=true when no admins and email matches", async () => {
      const { service } = createService(0, "admin@example.com");
      const result = await service.getBootstrapStatus("admin@example.com");
      expect(result).toEqual({ needed: true, eligible: true });
    });

    it("should return needed=true, eligible=false when no admins but email does not match", async () => {
      const { service } = createService(0, "admin@example.com");
      const result = await service.getBootstrapStatus("other@example.com");
      expect(result).toEqual({ needed: true, eligible: false });
    });

    it("should return needed=false when admins exist", async () => {
      const { service } = createService(1, "admin@example.com");
      const result = await service.getBootstrapStatus("admin@example.com");
      expect(result).toEqual({ needed: false, eligible: false });
    });

    it("should be case-insensitive for email matching", async () => {
      const { service } = createService(0, "Admin@Example.COM");
      const result = await service.getBootstrapStatus("admin@example.com");
      expect(result).toEqual({ needed: true, eligible: true });
    });

    it("should return eligible=false when BOOTSTRAP_ADMIN_EMAIL is not set", async () => {
      const { service } = createService(0, undefined);
      const result = await service.getBootstrapStatus("admin@example.com");
      expect(result).toEqual({ needed: true, eligible: false });
    });

    it("should return eligible=false when userEmail is undefined", async () => {
      const { service } = createService(0, "admin@example.com");
      const result = await service.getBootstrapStatus(undefined);
      expect(result).toEqual({ needed: true, eligible: false });
    });
  });

  describe("performBootstrap", () => {
    it("should promote user, create group, and assign as admin", async () => {
      const { service, mockPrisma } = createService(0, "admin@example.com");
      const result = await service.performBootstrap(
        "user-1",
        "admin@example.com",
      );

      expect(result).toEqual({ groupId: "group-1", groupName: "Default" });
      expect(mockPrisma.prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { is_system_admin: true },
      });
      expect(mockPrisma.prisma.group.upsert).toHaveBeenCalledWith({
        where: { name: "Default" },
        update: {},
        create: {
          name: "Default",
          description: "Initial group created during system setup",
          created_by: "actor-1",
        },
      });
      expect(mockPrisma.prisma.userGroup.upsert).toHaveBeenCalledWith({
        where: {
          user_id_group_id: { user_id: "user-1", group_id: "group-1" },
        },
        update: { role: "ADMIN" },
        create: {
          user_id: "user-1",
          group_id: "group-1",
          role: "ADMIN",
        },
      });
      expect(mockAuditService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "system_bootstrap",
          actor_id: "actor-1",
        }),
      );
    });

    it("should throw ConflictException when admins already exist", async () => {
      const { service } = createService(1, "admin@example.com");
      await expect(
        service.performBootstrap("user-1", "admin@example.com"),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw ForbiddenException when email does not match", async () => {
      const { service } = createService(0, "admin@example.com");
      await expect(
        service.performBootstrap("user-1", "other@example.com"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when BOOTSTRAP_ADMIN_EMAIL is not set", async () => {
      const { service } = createService(0, undefined);
      await expect(
        service.performBootstrap("user-1", "admin@example.com"),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
