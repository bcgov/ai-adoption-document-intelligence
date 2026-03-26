import { GroupRole } from "@generated/client";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DocumentService } from "../document/document.service";
import { EscalateDto, SubmitCorrectionsDto } from "./dto/correction.dto";
import { ReviewSessionDto } from "./dto/review-session.dto";
import { HitlController } from "./hitl.controller";
import { HitlService } from "./hitl.service";

describe("HitlController", () => {
  let controller: HitlController;
  let hitlService: jest.Mocked<HitlService>;
  let documentService: jest.Mocked<DocumentService>;

  const mockDocument = {
    id: "doc-1",
    group_id: "group-1",
    original_filename: "test.pdf",
    status: "completed_ocr" as any,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockSession = {
    id: "session-1",
    document_id: "doc-1",
    reviewer_id: "user-1",
    status: "in_progress" as any,
    started_at: new Date(),
    completed_at: null,
    document: mockDocument,
    corrections: [],
  };

  beforeEach(async () => {
    hitlService = {
      startSession: jest.fn(),
      getSession: jest.fn(),
      submitCorrections: jest.fn(),
      getCorrections: jest.fn(),
      approveSession: jest.fn(),
      escalateSession: jest.fn(),
      skipSession: jest.fn(),
      getQueue: jest.fn(),
      getQueueStats: jest.fn(),
      getAnalytics: jest.fn(),
      findReviewSession: jest.fn().mockResolvedValue(mockSession),
      heartbeat: jest.fn(),
      deleteCorrection: jest.fn(),
      reopenSession: jest.fn(),
      getNextSession: jest.fn(),
    } as unknown as jest.Mocked<HitlService>;

    documentService = {
      findDocument: jest.fn().mockResolvedValue(mockDocument),
    } as unknown as jest.Mocked<DocumentService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HitlController],
      providers: [
        {
          provide: HitlService,
          useValue: hitlService,
        },
        {
          provide: DocumentService,
          useValue: documentService,
        },
      ],
    }).compile();

    controller = module.get<HitlController>(HitlController);
  });

  describe("getQueue", () => {
    it("delegates to service with group IDs from JWT identity", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { documents: [], total: 0 };
      hitlService.getQueue.mockResolvedValue(mockResult as any);
      const result = await controller.getQueue({} as any, req);
      expect(result).toEqual(mockResult);
      expect(hitlService.getQueue).toHaveBeenCalledWith({}, ["group-1"]);
    });

    it("delegates to service with group ID from API key identity", async () => {
      const req = {
        resolvedIdentity: { groupRoles: { "group-1": GroupRole.MEMBER } },
      } as unknown as Request;
      hitlService.getQueue.mockResolvedValue({
        documents: [],
        total: 0,
      } as any);
      await controller.getQueue({} as any, req);
      expect(hitlService.getQueue).toHaveBeenCalledWith({}, ["group-1"]);
    });

    it("scopes to a single group when group_id is provided and user is a member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      hitlService.getQueue.mockResolvedValue({
        documents: [],
        total: 0,
      } as any);
      await controller.getQueue({ group_id: "group-1" } as any, req);
      expect(hitlService.getQueue).toHaveBeenCalledWith(
        { group_id: "group-1" },
        ["group-1"],
      );
    });

    it("throws ForbiddenException when group_id is provided but user is not a member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      await expect(
        controller.getQueue({ group_id: "group-2" } as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.getQueue).not.toHaveBeenCalled();
    });
  });

  describe("getQueueStats", () => {
    it("delegates to service with group IDs from JWT identity", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = {
        totalDocuments: 0,
        requiresReview: 0,
        averageConfidence: 0,
        reviewedToday: 0,
      };
      hitlService.getQueueStats.mockResolvedValue(mockResult as any);
      const result = await controller.getQueueStats(undefined, req);
      expect(result).toEqual(mockResult);
      expect(hitlService.getQueueStats).toHaveBeenCalledWith(undefined, [
        "group-1",
      ]);
    });

    it("scopes stats to a single group when group_id is provided and user is a member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      hitlService.getQueueStats.mockResolvedValue({
        totalDocuments: 0,
        requiresReview: 0,
        averageConfidence: 0,
        reviewedToday: 0,
      } as any);
      await controller.getQueueStats(undefined, req, "group-1");
      expect(hitlService.getQueueStats).toHaveBeenCalledWith(undefined, [
        "group-1",
      ]);
    });

    it("throws ForbiddenException when group_id is provided but user is not a member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      await expect(
        controller.getQueueStats(undefined, req, "group-2"),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.getQueueStats).not.toHaveBeenCalled();
    });
  });

  describe("getAnalytics", () => {
    it("delegates to service with group IDs from JWT identity", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { totalDocuments: 0 };
      hitlService.getAnalytics.mockResolvedValue(mockResult as any);
      const result = await controller.getAnalytics({} as any, req);
      expect(result).toEqual(mockResult);
      expect(hitlService.getAnalytics).toHaveBeenCalledWith({}, ["group-1"]);
    });

    it("delegates to service with empty groupIds when no identity", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      hitlService.getAnalytics.mockResolvedValue({} as any);
      await controller.getAnalytics({} as any, req);
      expect(hitlService.getAnalytics).toHaveBeenCalledWith({}, []);
    });

    it("scopes analytics to a single group when group_id is provided and user is a member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      hitlService.getAnalytics.mockResolvedValue({ totalDocuments: 0 } as any);
      await controller.getAnalytics({ group_id: "group-1" } as any, req);
      expect(hitlService.getAnalytics).toHaveBeenCalledWith(
        { group_id: "group-1" },
        ["group-1"],
      );
    });

    it("throws ForbiddenException when group_id is provided but user is not a member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      await expect(
        controller.getAnalytics({ group_id: "group-2" } as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.getAnalytics).not.toHaveBeenCalled();
    });
  });

  describe("startSession", () => {
    const dto: ReviewSessionDto = { documentId: "doc-1" };

    it("starts session for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { id: "session-1", documentId: "doc-1" };
      hitlService.startSession.mockResolvedValue(mockResult as any);
      const result = await controller.startSession(dto, req);
      expect(result).toEqual(mockResult);
      expect(hitlService.startSession).toHaveBeenCalledWith(dto, "user-1");
      expect(documentService.findDocument).toHaveBeenCalledWith("doc-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(controller.startSession(dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.startSession).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      await expect(controller.startSession(dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.startSession).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when document does not exist", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (documentService.findDocument as jest.Mock).mockResolvedValueOnce(null);
      await expect(controller.startSession(dto, req)).rejects.toThrow(
        NotFoundException,
      );
      expect(hitlService.startSession).not.toHaveBeenCalled();
    });
  });

  describe("getSession", () => {
    it("returns session for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { id: "session-1" };
      hitlService.getSession.mockResolvedValue(mockResult as any);
      const result = await controller.getSession("session-1", req);
      expect(result).toEqual(mockResult);
      expect(hitlService.getSession).toHaveBeenCalledWith("session-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(controller.getSession("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.getSession).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      await expect(controller.getSession("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.getSession).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(controller.getSession("session-1", req)).rejects.toThrow(
        NotFoundException,
      );
      expect(hitlService.getSession).not.toHaveBeenCalled();
    });
  });

  describe("submitCorrections", () => {
    const dto: SubmitCorrectionsDto = { corrections: [] };

    it("submits corrections for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { sessionId: "session-1", corrections: [] };
      hitlService.submitCorrections.mockResolvedValue(mockResult as any);
      const result = await controller.submitCorrections("session-1", dto, req);
      expect(result).toEqual(mockResult);
      expect(hitlService.submitCorrections).toHaveBeenCalledWith(
        "session-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(
        controller.submitCorrections("session-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.submitCorrections).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      await expect(
        controller.submitCorrections("session-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.submitCorrections).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        controller.submitCorrections("session-1", dto, req),
      ).rejects.toThrow(NotFoundException);
      expect(hitlService.submitCorrections).not.toHaveBeenCalled();
    });
  });

  describe("getCorrections", () => {
    it("returns corrections for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { sessionId: "session-1", corrections: [] };
      hitlService.getCorrections.mockResolvedValue(mockResult as any);
      const result = await controller.getCorrections("session-1", req);
      expect(result).toEqual(mockResult);
      expect(hitlService.getCorrections).toHaveBeenCalledWith("session-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(controller.getCorrections("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.getCorrections).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      await expect(controller.getCorrections("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.getCorrections).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(controller.getCorrections("session-1", req)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("approveSession", () => {
    it("approves session for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = {
        id: "session-1",
        status: "approved",
        message: "Review session approved",
      };
      hitlService.approveSession.mockResolvedValue(mockResult as any);
      const result = await controller.approveSession("session-1", req);
      expect(result).toEqual(mockResult);
      expect(hitlService.approveSession).toHaveBeenCalledWith("session-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(controller.approveSession("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.approveSession).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      await expect(controller.approveSession("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.approveSession).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(controller.approveSession("session-1", req)).rejects.toThrow(
        NotFoundException,
      );
      expect(hitlService.approveSession).not.toHaveBeenCalled();
    });
  });

  describe("escalateSession", () => {
    const dto: EscalateDto = { reason: "Needs expert review" };

    it("escalates session for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = {
        id: "session-1",
        status: "escalated",
        message: "Review session escalated",
      };
      hitlService.escalateSession.mockResolvedValue(mockResult as any);
      const result = await controller.escalateSession("session-1", dto, req);
      expect(result).toEqual(mockResult);
      expect(hitlService.escalateSession).toHaveBeenCalledWith(
        "session-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(
        controller.escalateSession("session-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.escalateSession).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      await expect(
        controller.escalateSession("session-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.escalateSession).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        controller.escalateSession("session-1", dto, req),
      ).rejects.toThrow(NotFoundException);
      expect(hitlService.escalateSession).not.toHaveBeenCalled();
    });
  });

  describe("skipSession", () => {
    it("skips session for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = {
        id: "session-1",
        status: "skipped",
        message: "Review session skipped",
      };
      hitlService.skipSession.mockResolvedValue(mockResult as any);
      const result = await controller.skipSession("session-1", req);
      expect(result).toEqual(mockResult);
      expect(hitlService.skipSession).toHaveBeenCalledWith("session-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(controller.skipSession("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.skipSession).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      await expect(controller.skipSession("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.skipSession).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(controller.skipSession("session-1", req)).rejects.toThrow(
        NotFoundException,
      );
      expect(hitlService.skipSession).not.toHaveBeenCalled();
    });
  });

  describe("heartbeat", () => {
    it("extends lock for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { ok: true, expiresAt: new Date() };
      hitlService.heartbeat.mockResolvedValue(mockResult);
      const result = await controller.heartbeat("session-1", req);
      expect(result).toEqual(mockResult);
      expect(hitlService.heartbeat).toHaveBeenCalledWith("session-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(controller.heartbeat("session-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(hitlService.heartbeat).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(controller.heartbeat("session-1", req)).rejects.toThrow(
        NotFoundException,
      );
      expect(hitlService.heartbeat).not.toHaveBeenCalled();
    });
  });

  describe("deleteCorrection", () => {
    it("deletes a correction for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { deleted: true };
      hitlService.deleteCorrection.mockResolvedValue(mockResult);
      const result = await controller.deleteCorrection(
        "session-1",
        "correction-1",
        req,
      );
      expect(result).toEqual(mockResult);
      expect(hitlService.deleteCorrection).toHaveBeenCalledWith(
        "session-1",
        "correction-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(
        controller.deleteCorrection("session-1", "correction-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.deleteCorrection).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        controller.deleteCorrection("session-1", "correction-1", req),
      ).rejects.toThrow(NotFoundException);
      expect(hitlService.deleteCorrection).not.toHaveBeenCalled();
    });
  });

  describe("reopenSession", () => {
    it("reopens session for the original reviewer", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = {
        id: "session-1",
        status: "in_progress",
        message: "Review session reopened",
      };
      hitlService.reopenSession.mockResolvedValue(mockResult as any);
      const result = await controller.reopenSession("session-1", req);
      expect(result).toEqual(mockResult);
      expect(hitlService.reopenSession).toHaveBeenCalledWith(
        "session-1",
        "user-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      await expect(
        controller.reopenSession("session-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.reopenSession).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when session does not exist", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      (hitlService.findReviewSession as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        controller.reopenSession("session-1", req),
      ).rejects.toThrow(NotFoundException);
      expect(hitlService.reopenSession).not.toHaveBeenCalled();
    });
  });

  describe("getNextSession", () => {
    it("delegates to service with group IDs from JWT identity", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockResult = { id: "session-1", documentId: "doc-1" };
      hitlService.getNextSession.mockResolvedValue(mockResult as any);
      const result = await controller.getNextSession({} as any, req);
      expect(result).toEqual(mockResult);
      expect(hitlService.getNextSession).toHaveBeenCalledWith(
        {},
        "user-1",
        ["group-1"],
      );
    });

    it("scopes to a single group when group_id is provided", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      hitlService.getNextSession.mockResolvedValue(null);
      await controller.getNextSession({ group_id: "group-1" } as any, req);
      expect(hitlService.getNextSession).toHaveBeenCalledWith(
        { group_id: "group-1" },
        "user-1",
        ["group-1"],
      );
    });

    it("throws ForbiddenException when group_id is provided but user is not a member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      await expect(
        controller.getNextSession({ group_id: "group-2" } as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(hitlService.getNextSession).not.toHaveBeenCalled();
    });
  });
});
