import {
  DocumentLabel,
  FieldDefinition,
  FieldType,
  LabelingStatus,
  Prisma,
} from "@generated/client";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { ResolvedIdentity } from "@/auth/types";
import { TemplateModelDbService } from "@/database/template-model-db.service";
import type {
  LabeledDocumentData,
  TemplateModelData,
} from "@/database/template-model-db.types";
import { AppLoggerService } from "@/logging/app-logger.service";
import { AnalysisResponse, Page } from "@/ocr/azure-types";
import { LabelingUploadDto } from "@/template-model/dto/labeling-upload.dto";
import { TemplateModelOcrService } from "@/template-model/template-model-ocr.service";
import { AddDocumentDto } from "./dto/add-document.dto";
import {
  CreateTemplateModelDto,
  UpdateTemplateModelDto,
} from "./dto/create-template-model.dto";
import { ExportDto, ExportFormat } from "./dto/export.dto";
import {
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
} from "./dto/field-definition.dto";
import { SaveLabelsDto } from "./dto/label.dto";
import { LabelSuggestionDto } from "./dto/suggestion.dto";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { SuggestionService } from "./suggestion.service";

@Injectable()
export class TemplateModelService {
  constructor(
    private readonly templateModelDb: TemplateModelDbService,
    private readonly templateModelOcrService: TemplateModelOcrService,
    private readonly logger: AppLoggerService,
    private readonly suggestionService: SuggestionService,
    private readonly labelingDocumentDb: LabelingDocumentDbService,
  ) {}

  // ========== MODEL ID GENERATION ==========

  /**
   * Generate an Azure-safe model_id from the template model name.
   * 1. Lowercase the name
   * 2. Replace spaces and non-alphanumeric chars with `-`
   * 3. Strip anything not in [a-z0-9._~-]
   * 4. Collapse consecutive `-` into one
   * 5. Trim leading/trailing `-`
   * 6. Truncate to 64 chars
   * 7. Ensure starts with letter/number
   * 8. On uniqueness collision, append `-2`, `-3`, etc.
   */
  generateModelIdBase(name: string): string {
    let modelId = name.toLowerCase();
    modelId = modelId.replace(/[^a-z0-9._~-]/g, "-");
    modelId = modelId.replace(/-{2,}/g, "-");
    modelId = modelId.replace(/^-+|-+$/g, "");
    modelId = modelId.slice(0, 64);
    modelId = modelId.replace(/^[^a-z0-9]+/, "");
    return modelId || "model";
  }

  async generateUniqueModelId(name: string): Promise<string> {
    const base = this.generateModelIdBase(name);
    const existing =
      await this.templateModelDb.findTemplateModelByModelId(base);
    if (!existing) {
      return base;
    }

    let suffix = 2;
    while (suffix <= 1000) {
      const candidate = `${base}-${suffix}`.slice(0, 64);
      const exists =
        await this.templateModelDb.findTemplateModelByModelId(candidate);
      if (!exists) {
        return candidate;
      }
      suffix++;
    }

    throw new ConflictException(
      `Could not generate unique model_id for name "${name}"`,
    );
  }

  // ========== TEMPLATE MODEL OPERATIONS ==========

  async getTemplateModels(groupIds?: string[]) {
    this.logger.debug("Getting all template models");
    return this.templateModelDb.findAllTemplateModels(groupIds);
  }

  async createTemplateModel(dto: CreateTemplateModelDto, actorId: string) {
    this.logger.debug(`Creating template model: ${dto.name}`);
    const modelId = await this.generateUniqueModelId(dto.name);
    return this.templateModelDb.createTemplateModel({
      name: dto.name,
      model_id: modelId,
      description: dto.description,
      created_by: actorId,
      group_id: dto.group_id,
    });
  }

  async getTemplateModel(id: string) {
    this.logger.debug(`Getting template model: ${id}`);
    const templateModel = await this.templateModelDb.findTemplateModel(id);
    if (!templateModel) {
      throw new NotFoundException(`Template model with id ${id} not found`);
    }
    return templateModel;
  }

  async updateTemplateModel(id: string, dto: UpdateTemplateModelDto) {
    this.logger.debug(`Updating template model: ${id}`);
    const templateModel = await this.templateModelDb.updateTemplateModel(id, {
      ...dto,
    });
    if (!templateModel) {
      throw new NotFoundException(`Template model with id ${id} not found`);
    }
    return templateModel;
  }

  async deleteTemplateModel(id: string) {
    this.logger.debug(`Deleting template model: ${id}`);
    const deleted = await this.templateModelDb.deleteTemplateModel(id);
    if (!deleted) {
      throw new NotFoundException(`Template model with id ${id} not found`);
    }
    return { success: true, id };
  }

  // ========== FIELD SCHEMA OPERATIONS ==========

  async getFieldSchema(templateModelId: string) {
    this.logger.debug(
      `Getting field schema for template model: ${templateModelId}`,
    );
    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }
    return templateModel.field_schema;
  }

  async addField(templateModelId: string, dto: CreateFieldDefinitionDto) {
    this.logger.debug(
      `Adding field ${dto.field_key} to template model: ${templateModelId}`,
    );

    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }

    const existingField = templateModel.field_schema.find(
      (f) => f.field_key === dto.field_key,
    );
    if (existingField) {
      throw new ConflictException(
        `Field with key ${dto.field_key} already exists in template model`,
      );
    }

    return this.templateModelDb.createFieldDefinition(templateModelId, {
      field_key: dto.field_key,
      field_type: dto.field_type as unknown as FieldType,
      field_format: dto.field_format,
      display_order: dto.display_order,
    });
  }

  async updateField(
    templateModelId: string,
    fieldId: string,
    dto: UpdateFieldDefinitionDto,
  ) {
    this.logger.debug(
      `Updating field ${fieldId} in template model: ${templateModelId}`,
    );
    const field = await this.templateModelDb.updateFieldDefinition(fieldId, {
      field_format: dto.field_format,
      display_order: dto.display_order,
    });
    if (!field) {
      throw new NotFoundException(`Field with id ${fieldId} not found`);
    }
    return field;
  }

  async deleteField(templateModelId: string, fieldId: string) {
    this.logger.debug(
      `Deleting field ${fieldId} from template model: ${templateModelId}`,
    );
    const deleted = await this.templateModelDb.deleteFieldDefinition(fieldId);
    if (!deleted) {
      throw new NotFoundException(`Field with id ${fieldId} not found`);
    }
    return { success: true, id: fieldId };
  }

  // ========== DOCUMENT OPERATIONS ==========

  async getTemplateModelDocuments(templateModelId: string) {
    this.logger.debug(
      `Getting documents for template model: ${templateModelId}`,
    );
    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }
    return this.templateModelDb.findLabeledDocuments(templateModelId);
  }

  async addDocumentToTemplateModel(
    templateModelId: string,
    dto: AddDocumentDto,
  ) {
    this.logger.debug(
      `Adding document ${dto.labelingDocumentId} to template model: ${templateModelId}`,
    );

    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }

    const document = await this.labelingDocumentDb.findLabelingDocument(
      dto.labelingDocumentId,
    );
    if (!document) {
      throw new NotFoundException(
        `Labeling document with id ${dto.labelingDocumentId} not found`,
      );
    }

    return this.templateModelDb.addDocumentToTemplateModel(
      templateModelId,
      dto.labelingDocumentId,
    );
  }

  async getTemplateModelDocument(templateModelId: string, documentId: string) {
    this.logger.debug(
      `Getting document ${documentId} from template model: ${templateModelId}`,
    );
    const labeledDoc = await this.templateModelDb.findLabeledDocument(
      templateModelId,
      documentId,
    );
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in template model ${templateModelId}`,
      );
    }
    return labeledDoc;
  }

  async removeDocumentFromTemplateModel(
    templateModelId: string,
    documentId: string,
  ) {
    this.logger.debug(
      `Removing document ${documentId} from template model: ${templateModelId}`,
    );
    const deleted = await this.templateModelDb.removeDocumentFromTemplateModel(
      templateModelId,
      documentId,
    );
    if (!deleted) {
      throw new NotFoundException(
        `Document ${documentId} not found in template model ${templateModelId}`,
      );
    }
    return { success: true, documentId };
  }

  // ========== LABEL OPERATIONS ==========

  async getDocumentLabels(templateModelId: string, documentId: string) {
    this.logger.debug(
      `Getting labels for document ${documentId} in template model: ${templateModelId}`,
    );
    const labeledDoc = await this.templateModelDb.findLabeledDocument(
      templateModelId,
      documentId,
    );
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in template model ${templateModelId}`,
      );
    }
    return labeledDoc.labels;
  }

  async saveDocumentLabels(
    templateModelId: string,
    documentId: string,
    dto: SaveLabelsDto,
  ) {
    this.logger.debug(
      `Saving labels for document ${documentId} in template model: ${templateModelId}`,
    );

    const labeledDoc = await this.templateModelDb.findLabeledDocument(
      templateModelId,
      documentId,
    );
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in template model ${templateModelId}`,
      );
    }

    await this.templateModelDb.upsertDocumentLabels(
      labeledDoc.id,
      dto.labels.map((label) => ({
        field_key: label.field_key,
        label_name: label.label_name,
        value: label.value,
        page_number: label.page_number,
        bounding_box: label.bounding_box,
      })),
    );

    const newStatus =
      dto.labels.length > 0
        ? LabelingStatus.labeled
        : LabelingStatus.in_progress;
    await this.templateModelDb.updateLabeledDocument(labeledDoc.id, newStatus);

    return this.templateModelDb.findLabeledDocument(
      templateModelId,
      documentId,
    );
  }

  async deleteLabel(
    templateModelId: string,
    documentId: string,
    labelId: string,
  ) {
    this.logger.debug(
      `Deleting label ${labelId} from document ${documentId} in template model: ${templateModelId}`,
    );
    const deleted = await this.templateModelDb.deleteDocumentLabel(labelId);
    if (!deleted) {
      throw new NotFoundException(`Label with id ${labelId} not found`);
    }
    return { success: true, id: labelId };
  }

  // ========== OCR DATA ==========

  async getDocumentOcr(templateModelId: string, documentId: string) {
    this.logger.debug(
      `Getting OCR data for document ${documentId} in template model: ${templateModelId}`,
    );

    const labeledDoc = await this.templateModelDb.findLabeledDocument(
      templateModelId,
      documentId,
    );
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in template model ${templateModelId}`,
      );
    }
    if (!labeledDoc.labeling_document?.ocr_result) {
      throw new NotFoundException(
        `OCR result not found for labeling document ${documentId}`,
      );
    }

    return labeledDoc.labeling_document.ocr_result;
  }

  async generateDocumentSuggestions(
    templateModelId: string,
    documentId: string,
    identity: ResolvedIdentity,
  ): Promise<LabelSuggestionDto[]> {
    this.logger.debug(
      `Generating suggestions for document ${documentId} in template model: ${templateModelId}`,
    );

    const labeledDoc = await this.templateModelDb.findLabeledDocument(
      templateModelId,
      documentId,
    );
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in template model ${templateModelId}`,
      );
    }

    if (!labeledDoc.labeling_document?.ocr_result) {
      throw new NotFoundException(
        `OCR result not found for labeling document ${documentId}`,
      );
    }

    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }

    identityCanAccessGroup(identity, templateModel.group_id);

    const ocrResult = labeledDoc.labeling_document
      .ocr_result as unknown as AnalysisResponse;
    return this.suggestionService.generateSuggestions(
      ocrResult,
      templateModel.field_schema,
      null,
    );
  }

  // ========== EXPORT ==========

  async exportTemplateModel(templateModelId: string, options: ExportDto) {
    this.logger.debug(
      `Exporting template model ${templateModelId} in format: ${options.format}`,
    );

    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }

    let documents =
      await this.templateModelDb.findLabeledDocuments(templateModelId);

    if (options.documentIds?.length) {
      documents = documents.filter((d: LabeledDocumentData) =>
        options.documentIds!.includes(d.labeling_document.id),
      );
    }

    if (options.labeledOnly) {
      documents = documents.filter((d) => d.status === LabelingStatus.labeled);
    }

    switch (options.format) {
      case ExportFormat.AZURE:
        return this.exportAzureFormat(templateModel, documents);
      case ExportFormat.JSON:
      default:
        return this.exportJsonFormat(templateModel, documents);
    }
  }

  private exportAzureFormat(
    templateModel: TemplateModelData,
    documents: LabeledDocumentData[],
  ) {
    const fieldsJson = {
      fields: templateModel.field_schema.map((field) => {
        const exportField: {
          fieldKey: string;
          fieldType: string;
          fieldFormat?: string;
        } = {
          fieldKey: field.field_key,
          fieldType: field.field_type,
        };

        if (field.field_type === "date" && field.field_format) {
          exportField.fieldFormat = field.field_format;
        }

        return exportField;
      }),
    };

    const labelsFiles = documents.map((doc) => {
      const groupedLabels: Record<string, DocumentLabel[]> = {};
      doc.labels.forEach((label: DocumentLabel) => {
        if (!groupedLabels[label.field_key]) {
          groupedLabels[label.field_key] = [];
        }
        groupedLabels[label.field_key].push(label);
      });

      const exportLabels = Object.entries(groupedLabels).map(
        ([fieldKey, labels]) => {
          const sortedLabels = [...labels].sort(
            (a: DocumentLabel, b: DocumentLabel) => {
              if (a.page_number !== b.page_number) {
                return a.page_number - b.page_number;
              }

              const aBoundingBox = a.bounding_box as {
                span?: { offset?: number };
              };
              const bBoundingBox = b.bounding_box as {
                span?: { offset?: number };
              };
              return (
                (aBoundingBox?.span?.offset ?? 0) -
                (bBoundingBox?.span?.offset ?? 0)
              );
            },
          );

          const valueEntries = sortedLabels.map((label: DocumentLabel) => {
            const boundingBox = label.bounding_box as {
              polygon: number[];
              pageWidth?: number;
              pageHeight?: number;
            };

            let normalizedPolygon = boundingBox.polygon;
            const ocrResult = doc.labeling_document.ocr_result as {
              analyzeResult?: { pages?: Page[] };
            } | null;
            const pageWidth =
              boundingBox.pageWidth ??
              ocrResult?.analyzeResult?.pages?.find(
                (page: Page) => page.pageNumber === label.page_number,
              )?.width;
            const pageHeight =
              boundingBox.pageHeight ??
              ocrResult?.analyzeResult?.pages?.find(
                (page: Page) => page.pageNumber === label.page_number,
              )?.height;
            if (pageWidth && pageHeight) {
              normalizedPolygon = boundingBox.polygon.map(
                (coord: number, idx: number) => {
                  const divisor = idx % 2 === 0 ? pageWidth : pageHeight;
                  return coord / divisor;
                },
              );
            }

            let text = label.value;
            const field = templateModel.field_schema.find(
              (f: FieldDefinition) => f.field_key === fieldKey,
            );
            if (field?.field_type === "selectionMark") {
              text = label.value === "selected" ? ":selected:" : ":unselected:";
            }

            return {
              page: label.page_number,
              text: text,
              boundingBoxes: [normalizedPolygon],
            };
          });

          return {
            label: fieldKey,
            value: valueEntries,
          };
        },
      );

      return {
        filename: `${doc.labeling_document.original_filename}.labels.json`,
        content: {
          document: doc.labeling_document.original_filename,
          labels: exportLabels,
        },
      };
    });

    return {
      fieldsJson,
      labelsFiles,
      templateModelName: templateModel.name,
      documentCount: documents.length,
      labeledCount: documents.filter((d) => d.status === LabelingStatus.labeled)
        .length,
    };
  }

  private exportJsonFormat(
    templateModel: TemplateModelData,
    documents: LabeledDocumentData[],
  ) {
    return {
      templateModel: {
        id: templateModel.id,
        name: templateModel.name,
        description: templateModel.description,
        created_at: templateModel.created_at,
        fieldSchema: templateModel.field_schema,
      },
      documents: documents.map((doc: LabeledDocumentData) => ({
        id: doc.labeling_document.id,
        filename: doc.labeling_document.original_filename,
        status: doc.status,
        labels: doc.labels,
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  async uploadLabelingDocument(
    templateModelId: string,
    dto: LabelingUploadDto,
  ) {
    this.logger.debug(
      `Uploading labeling document for template model: ${templateModelId}`,
    );

    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }

    const labelingDocument =
      await this.templateModelOcrService.createLabelingDocument(dto);

    const labeledDoc = await this.templateModelDb.addDocumentToTemplateModel(
      templateModelId,
      labelingDocument.id,
    );

    void this.templateModelOcrService.processOcrForLabelingDocument(
      labelingDocument.id,
    );

    return {
      labeledDocument: labeledDoc,
      labelingDocument,
    };
  }
}
