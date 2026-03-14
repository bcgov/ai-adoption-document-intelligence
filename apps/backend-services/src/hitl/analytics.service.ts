import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "../logging/app-logger.service";
import { AnalyticsFilterDto } from "./dto/queue-filter.dto";
import { ReviewDbService } from "./review-db.service";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly reviewDb: ReviewDbService,
    private readonly logger: AppLoggerService,
  ) {}

  async getAnalytics(filters: AnalyticsFilterDto, groupIds?: string[]) {
    this.logger.debug("Calculating analytics", { ...filters });

    const analyticsData = await this.reviewDb.getReviewAnalytics({
      startDate: filters.startDate,
      endDate: filters.endDate,
      reviewerId: filters.reviewerId,
      groupIds,
    });

    // Calculate average confidence from corrections
    const corrections = analyticsData.correctionsByAction;
    const totalCorrected =
      (corrections["corrected"] || 0) + (corrections["flagged"] || 0);
    const correctionRate =
      analyticsData.totalCorrections > 0
        ? totalCorrected / analyticsData.totalCorrections
        : 0;

    return {
      totalDocuments: analyticsData.totalSessions,
      reviewedDocuments: analyticsData.completedSessions,
      averageConfidence: analyticsData.averageConfidence,
      correctionRate: Math.round(correctionRate * 100) / 100,
      correctionsByAction: analyticsData.correctionsByAction,
      summary: {
        totalSessions: analyticsData.totalSessions,
        completedSessions: analyticsData.completedSessions,
        totalCorrections: analyticsData.totalCorrections,
        confirmedFields: corrections["confirmed"] || 0,
        correctedFields: corrections["corrected"] || 0,
        flaggedFields: corrections["flagged"] || 0,
        deletedFields: corrections["deleted"] || 0,
      },
    };
  }
}
