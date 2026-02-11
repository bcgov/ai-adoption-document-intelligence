import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsFilterDto } from "./dto/queue-filter.dto";

describe("AnalyticsService", () => {
  let service: AnalyticsService;
  let mockDbService: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    const mockDb = {
      getReviewAnalytics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    mockDbService = module.get(DatabaseService);
  });

  describe("getAnalytics", () => {
    it("should return analytics with calculated metrics", async () => {
      const filters: AnalyticsFilterDto = {
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-12-31"),
        reviewerId: "reviewer-1",
      };

      const mockAnalyticsData = {
        totalSessions: 100,
        completedSessions: 80,
        totalCorrections: 50,
        correctionsByAction: {
          confirmed: 20,
          corrected: 15,
          flagged: 10,
          deleted: 5,
        },
        averageConfidence: 0.85,
      };

      mockDbService.getReviewAnalytics.mockResolvedValueOnce(mockAnalyticsData);

      const result = await service.getAnalytics(filters);

      expect(mockDbService.getReviewAnalytics).toHaveBeenCalledWith({
        startDate: filters.startDate,
        endDate: filters.endDate,
        reviewerId: filters.reviewerId,
      });

      expect(result).toEqual({
        totalDocuments: 100,
        reviewedDocuments: 80,
        averageConfidence: 0.85,
        correctionRate: 0.5, // (15 + 10) / 50
        correctionsByAction: mockAnalyticsData.correctionsByAction,
        summary: {
          totalSessions: 100,
          completedSessions: 80,
          totalCorrections: 50,
          confirmedFields: 20,
          correctedFields: 15,
          flaggedFields: 10,
          deletedFields: 5,
        },
      });
    });

    it("should calculate correction rate correctly", async () => {
      const mockAnalyticsData = {
        totalSessions: 10,
        completedSessions: 8,
        totalCorrections: 100,
        correctionsByAction: {
          confirmed: 40,
          corrected: 30,
          flagged: 20,
          deleted: 10,
        },
        averageConfidence: 0.9,
      };

      mockDbService.getReviewAnalytics.mockResolvedValueOnce(mockAnalyticsData);

      const result = await service.getAnalytics({});

      expect(result.correctionRate).toBe(0.5); // (30 + 20) / 100
    });

    it("should handle zero corrections", async () => {
      const mockAnalyticsData = {
        totalSessions: 10,
        completedSessions: 10,
        totalCorrections: 0,
        correctionsByAction: {},
        averageConfidence: 0.95,
      };

      mockDbService.getReviewAnalytics.mockResolvedValueOnce(mockAnalyticsData);

      const result = await service.getAnalytics({});

      expect(result.correctionRate).toBe(0);
      expect(result.summary.confirmedFields).toBe(0);
      expect(result.summary.correctedFields).toBe(0);
      expect(result.summary.flaggedFields).toBe(0);
      expect(result.summary.deletedFields).toBe(0);
    });

    it("should handle missing correction action types", async () => {
      const mockAnalyticsData = {
        totalSessions: 5,
        completedSessions: 5,
        totalCorrections: 15,
        correctionsByAction: {
          corrected: 10,
          // Missing other types
        },
        averageConfidence: 0.88,
      };

      mockDbService.getReviewAnalytics.mockResolvedValueOnce(mockAnalyticsData);

      const result = await service.getAnalytics({});

      expect(result.correctionRate).toBeCloseTo(0.67, 2); // 10 / 15
      expect(result.summary.confirmedFields).toBe(0);
      expect(result.summary.correctedFields).toBe(10);
      expect(result.summary.flaggedFields).toBe(0);
      expect(result.summary.deletedFields).toBe(0);
    });

    it("should pass filters to database service correctly", async () => {
      const filters: AnalyticsFilterDto = {
        startDate: new Date("2024-06-01"),
        endDate: new Date("2024-06-30"),
        reviewerId: "user-123",
      };

      mockDbService.getReviewAnalytics.mockResolvedValueOnce({
        totalSessions: 0,
        completedSessions: 0,
        totalCorrections: 0,
        correctionsByAction: {},
        averageConfidence: 0,
      });

      await service.getAnalytics(filters);

      expect(mockDbService.getReviewAnalytics).toHaveBeenCalledWith({
        startDate: filters.startDate,
        endDate: filters.endDate,
        reviewerId: filters.reviewerId,
      });
    });

    it("should handle partial filters", async () => {
      const filters: AnalyticsFilterDto = {
        reviewerId: "reviewer-2",
      };

      mockDbService.getReviewAnalytics.mockResolvedValueOnce({
        totalSessions: 5,
        completedSessions: 3,
        totalCorrections: 10,
        correctionsByAction: { confirmed: 10 },
        averageConfidence: 0.92,
      });

      await service.getAnalytics(filters);

      expect(mockDbService.getReviewAnalytics).toHaveBeenCalledWith({
        startDate: undefined,
        endDate: undefined,
        reviewerId: "reviewer-2",
      });
    });

    it("should round correction rate to 2 decimal places", async () => {
      const mockAnalyticsData = {
        totalSessions: 10,
        completedSessions: 8,
        totalCorrections: 3,
        correctionsByAction: {
          corrected: 1,
          flagged: 1,
        },
        averageConfidence: 0.9,
      };

      mockDbService.getReviewAnalytics.mockResolvedValueOnce(mockAnalyticsData);

      const result = await service.getAnalytics({});

      // (1 + 1) / 3 = 0.666666... should be rounded to 0.67
      expect(result.correctionRate).toBe(0.67);
    });

    it("should use average confidence from database service", async () => {
      const mockAnalyticsData = {
        totalSessions: 20,
        completedSessions: 15,
        totalCorrections: 30,
        correctionsByAction: { confirmed: 30 },
        averageConfidence: 0.7654,
      };

      mockDbService.getReviewAnalytics.mockResolvedValueOnce(mockAnalyticsData);

      const result = await service.getAnalytics({});

      expect(result.averageConfidence).toBe(0.7654);
    });
  });
});
