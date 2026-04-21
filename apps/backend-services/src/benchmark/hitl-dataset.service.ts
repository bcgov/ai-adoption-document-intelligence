import * as path from "node:path";
import { getErrorMessage } from "@ai-di/shared-logging";
import {
  CorrectionAction,
  DocumentStatus,
  FieldCorrection,
  ReviewStatus,
} from "@generated/client";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import {
  buildBlobFilePath,
  OperationCategory,
  validateBlobFilePath,
} from "@/blob-storage/storage-path-builder";
import { DocumentField, ExtractedFields } from "@/ocr/azure-types";
import { ReviewDbService } from "../hitl/review-db.service";
import { AuditLogService } from "./audit-log.service";
import { DatasetService } from "./dataset.service";
import {
  AddVersionFromHitlDto,
  CreateDatasetFromHitlDto,
  DatasetResponseDto,
  EligibleDocumentDto,
  EligibleDocumentsFilterDto,
  EligibleDocumentsResponseDto,
  VersionResponseDto,
} from "./dto";

interface DocumentWithReview {
  id: string;
  original_filename: string;
  file_path: string;
  normalized_file_path: string | null;
  file_type: string;
  group_id: string;
  ocr_result: {
    keyValuePairs: unknown;
  } | null;
  review_sessions: Array<{
    id: string;
    reviewer_id: string;
    status: ReviewStatus;
    completed_at: Date | null;
    corrections: FieldCorrection[];
  }>;
}

export interface SkippedDocument {
  documentId: string;
  reason: string;
}

@Injectable()
export class HitlDatasetService {
  private readonly logger = new Logger(HitlDatasetService.name);

  constructor(
    private readonly reviewDbService: ReviewDbService,
    private readonly datasetService: DatasetService,
    private readonly auditLogService: AuditLogService,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorageInterface,
  ) {}

  /**
   * List documents eligible for dataset creation:
   * completed_ocr status + at least one approved review session.
   */
  async listEligibleDocuments(
    filters: EligibleDocumentsFilterDto,
    groupIds: string[],
  ): Promise<EligibleDocumentsResponseDto> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const documents = (await this.reviewDbService.findReviewQueue({
      status: DocumentStatus.completed_ocr,
      reviewStatus: "reviewed",
      limit: 1000,
      groupIds,
    })) as unknown as DocumentWithReview[];

    // Filter to only approved sessions and optionally by search term
    const eligible = documents.filter((doc) => {
      const hasApprovedSession = doc.review_sessions?.some(
        (s) => s.status === ReviewStatus.approved,
      );
      if (!hasApprovedSession) return false;
      if (!doc.ocr_result) return false;

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return doc.original_filename?.toLowerCase().includes(searchLower);
      }
      return true;
    });

    const total = eligible.length;
    const paged = eligible.slice(offset, offset + limit);

    const result: EligibleDocumentDto[] = paged.map((doc) => {
      const approvedSession = doc.review_sessions
        .filter((s) => s.status === ReviewStatus.approved)
        .sort(
          (a, b) =>
            (b.completed_at?.getTime() ?? 0) - (a.completed_at?.getTime() ?? 0),
        )[0];

      const fields = doc.ocr_result?.keyValuePairs as ExtractedFields | null;
      const fieldCount = fields ? Object.keys(fields).length : 0;

      return {
        id: doc.id,
        originalFilename: doc.original_filename,
        fileType: doc.file_type,
        approvedAt: approvedSession.completed_at ?? new Date(),
        reviewerId: approvedSession.reviewer_id,
        fieldCount,
        correctionCount: approvedSession.corrections?.length ?? 0,
      };
    });

    return {
      documents: result,
      total,
      page,
      limit,
    };
  }

  /**
   * Create a new dataset and version from selected HITL-verified documents.
   */
  async createDatasetFromHitl(
    dto: CreateDatasetFromHitlDto,
    actorId: string,
  ): Promise<{
    dataset: DatasetResponseDto;
    version: VersionResponseDto;
    skipped: SkippedDocument[];
  }> {
    this.logger.log(
      `Creating dataset "${dto.name}" from ${dto.documentIds.length} HITL documents`,
    );

    // Create the dataset
    const dataset = await this.datasetService.createDataset(
      {
        name: dto.name,
        description: dto.description,
        metadata: { ...dto.metadata, source: "hitl" },
        groupId: dto.groupId,
      },
      actorId,
    );

    // Create version and package documents
    const { version, skipped } = await this.packageDocumentsIntoVersion(
      dataset.id,
      dto.documentIds,
      actorId,
      dto.groupId,
    );

    return { dataset, version, skipped };
  }

  /**
   * Add a new version to an existing dataset from HITL-verified documents.
   */
  async addVersionFromHitl(
    datasetId: string,
    dto: AddVersionFromHitlDto,
    actorId: string,
    groupId: string,
  ): Promise<{ version: VersionResponseDto; skipped: SkippedDocument[] }> {
    this.logger.log(
      `Adding HITL version to dataset ${datasetId} from ${dto.documentIds.length} documents`,
    );

    return this.packageDocumentsIntoVersion(
      datasetId,
      dto.documentIds,
      actorId,
      groupId,
      dto.version,
      dto.name,
    );
  }

  /**
   * Core method: creates a version and packages verified documents into it.
   */
  private async packageDocumentsIntoVersion(
    datasetId: string,
    documentIds: string[],
    actorId: string,
    groupId: string,
    versionLabel?: string,
    versionName?: string,
  ): Promise<{ version: VersionResponseDto; skipped: SkippedDocument[] }> {
    // Fetch all reviewed documents once, scoped to the dataset's group to
    // prevent cross-tenant packaging (a caller in group A cannot pull
    // documents belonging to group B into their dataset).
    const allDocuments = (await this.reviewDbService.findReviewQueue({
      status: DocumentStatus.completed_ocr,
      reviewStatus: "reviewed",
      limit: 10000,
      groupIds: [groupId],
    })) as unknown as DocumentWithReview[];

    const documentMap = new Map(allDocuments.map((d) => [d.id, d]));

    // Create the version
    const version = await this.datasetService.createVersion(
      datasetId,
      {
        version: versionLabel,
        name: versionName,
      },
      actorId,
    );

    const storagePrefix = `datasets/${datasetId}/${version.id}`;
    const skipped: SkippedDocument[] = [];
    const manifestSamples: Array<{
      id: string;
      inputs: Array<{ path: string; mimeType: string }>;
      groundTruth: Array<{ path: string; format: string }>;
      metadata: Record<string, unknown>;
    }> = [];

    // Track used sample IDs to deduplicate
    const usedSampleIds = new Set<string>();

    // Process each document
    for (const documentId of documentIds) {
      try {
        const doc = documentMap.get(documentId);
        if (!doc) {
          throw new Error("Document not found or not in completed_ocr status");
        }

        // Defense-in-depth: the findReviewQueue call above already filters
        // by groupId, so this should never trigger. If it does, the query
        // filter was bypassed and we refuse to write cross-tenant blobs.
        if (doc.group_id !== groupId) {
          throw new Error(
            `Document belongs to a different group than the dataset`,
          );
        }

        const result = await this.processDocument(
          doc,
          storagePrefix,
          usedSampleIds,
        );

        if (result) {
          manifestSamples.push(result);
        }
      } catch (error) {
        const message = getErrorMessage(error);
        this.logger.warn(`Skipping document ${documentId}: ${message}`);
        skipped.push({ documentId, reason: message });
      }
    }

    if (manifestSamples.length === 0) {
      throw new BadRequestException(
        "No documents could be processed. All were skipped due to missing data.",
      );
    }

    // Write the manifest
    const manifest = {
      schemaVersion: "1.0",
      samples: manifestSamples,
    };

    const manifestKey = buildBlobFilePath(
      groupId,
      OperationCategory.BENCHMARK,
      [storagePrefix],
      "dataset-manifest.json",
    );
    await this.blobStorage.write(
      manifestKey,
      Buffer.from(JSON.stringify(manifest, null, 2)),
    );

    // Update the version record with storagePrefix and document count
    const updatedVersion =
      await this.datasetService.updateVersionAfterHitlImport(
        datasetId,
        version.id,
        storagePrefix,
        manifestSamples.length,
      );

    // Audit log
    await this.auditLogService.logVersionPublished(
      actorId,
      version.id,
      datasetId,
      {
        source: "hitl",
        documentCount: manifestSamples.length,
        skippedCount: skipped.length,
      },
    );

    this.logger.log(
      `HITL dataset version created: ${manifestSamples.length} samples, ${skipped.length} skipped`,
    );

    return { version: updatedVersion, skipped };
  }

  /**
   * Process a single document: validate, copy file, build ground truth.
   */
  private async processDocument(
    doc: DocumentWithReview,
    storagePrefix: string,
    usedSampleIds: Set<string>,
  ): Promise<{
    id: string;
    inputs: Array<{ path: string; mimeType: string }>;
    groundTruth: Array<{ path: string; format: string }>;
    metadata: Record<string, unknown>;
  }> {
    // Find the latest approved session
    const approvedSession = doc.review_sessions
      ?.filter((s) => s.status === ReviewStatus.approved)
      .sort(
        (a, b) =>
          (b.completed_at?.getTime() ?? 0) - (a.completed_at?.getTime() ?? 0),
      )[0];

    if (!approvedSession) {
      throw new Error("No approved review session found");
    }

    if (!doc.ocr_result) {
      throw new Error("No OCR result available");
    }

    const ocrFields = doc.ocr_result.keyValuePairs as ExtractedFields | null;
    if (!ocrFields || typeof ocrFields !== "object") {
      throw new Error("OCR result has no extractable fields");
    }

    // Generate sample ID from filename
    const ext = path.extname(doc.original_filename);
    let sampleId = path.basename(doc.original_filename, ext);

    // Deduplicate sample ID
    if (usedSampleIds.has(sampleId)) {
      let counter = 2;
      while (usedSampleIds.has(`${sampleId}_${counter}`)) {
        counter++;
      }
      sampleId = `${sampleId}_${counter}`;
    }
    usedSampleIds.add(sampleId);

    if (!doc.normalized_file_path) {
      throw new Error(
        "Document has no normalized PDF; cannot export to dataset",
      );
    }

    const inputFilename = `${sampleId}.pdf`;
    const inputRelativePath = `inputs/${inputFilename}`;
    const inputBlobKey = buildBlobFilePath(
      doc.group_id,
      OperationCategory.BENCHMARK,
      [storagePrefix, "inputs"],
      inputFilename,
    );

    const normalizedPdfBuffer = await this.blobStorage.read(
      validateBlobFilePath(doc.normalized_file_path),
    );
    await this.blobStorage.write(inputBlobKey, normalizedPdfBuffer);

    // Build ground truth as flat key-value pairs (same format as uploaded
    // ground truth and as predictions produced by buildFlatPredictionMapFromCtx
    // in the Temporal benchmark workflow).
    const groundTruth = this.buildGroundTruth(
      ocrFields,
      approvedSession.corrections,
    );

    // Write ground truth file
    const gtRelativePath = `ground-truth/${sampleId}.json`;
    const gtBlobKey = buildBlobFilePath(
      doc.group_id,
      OperationCategory.BENCHMARK,
      [storagePrefix, "ground-truth"],
      `${sampleId}.json`,
    );
    await this.blobStorage.write(
      gtBlobKey,
      Buffer.from(JSON.stringify(groundTruth, null, 2)),
    );

    const mimeType = "application/pdf";

    return {
      id: sampleId,
      inputs: [{ path: inputRelativePath, mimeType }],
      groundTruth: [{ path: gtRelativePath, format: "json" }],
      metadata: {
        sourceDocumentId: doc.id,
        reviewSessionId: approvedSession.id,
        reviewerId: approvedSession.reviewer_id,
        approvedAt: approvedSession.completed_at?.toISOString() ?? null,
        correctionCount: approvedSession.corrections?.length ?? 0,
      },
    };
  }

  /**
   * Build ground truth as flat key-value pairs by applying corrections to OCR
   * fields. Output matches the format of manually uploaded ground truth and
   * predictions produced by buildFlatPredictionMapFromCtx (benchmark-workflow.ts).
   */
  buildGroundTruth(
    ocrFields: ExtractedFields,
    corrections: FieldCorrection[],
  ): Record<string, unknown> {
    // Deep clone so we can mutate safely
    const fields: ExtractedFields = JSON.parse(JSON.stringify(ocrFields));

    // Apply corrections to the ExtractedFields structure first
    for (const correction of corrections) {
      if (correction.field_key.startsWith("_")) continue;

      switch (correction.action) {
        case CorrectionAction.confirmed:
          // Verified correct — keep as-is
          break;

        case CorrectionAction.corrected:
          if (fields[correction.field_key]) {
            const field = fields[correction.field_key];
            field.content = correction.corrected_value ?? null;
            // Clear all typed values so flattening resolves to content
            delete field.valueString;
            delete field.valueNumber;
            delete field.valueDate;
            delete field.valueSelectionMark;
          } else {
            // Field added during correction (not in original OCR)
            fields[correction.field_key] = {
              type: "string",
              content: correction.corrected_value ?? null,
              confidence: 1.0,
            };
          }
          break;

        case CorrectionAction.deleted:
          delete fields[correction.field_key];
          break;

        case CorrectionAction.flagged:
          // Flagged but approved — keep as-is
          break;
      }
    }

    // Flatten to simple key-value pairs using the same resolution logic as
    // extractAzureFieldDisplayValue (apps/temporal/src/azure-ocr-field-display-value.ts)
    const groundTruth: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(fields)) {
      groundTruth[key] = extractFieldValue(field);
    }

    return groundTruth;
  }
}

/**
 * Extract the display value from a DocumentField.
 *
 * Mirrors extractAzureFieldDisplayValue (temporal azure-ocr-field-display-value.ts) so that
 * HITL-generated ground truth uses the same field resolution as predictions.
 */
function extractFieldValue(field: DocumentField): unknown {
  if (field.valueSelectionMark !== undefined) {
    return field.valueSelectionMark === "selected" ? "selected" : "unselected";
  }
  if (field.valueNumber !== undefined) {
    return field.valueNumber;
  }
  if (field.valueDate !== undefined) {
    return field.valueDate;
  }
  if (field.valueString !== undefined) {
    return field.valueString;
  }
  return field.content ?? null;
}
