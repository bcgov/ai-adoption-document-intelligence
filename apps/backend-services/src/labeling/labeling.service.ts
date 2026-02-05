import { FieldType, LabelingStatus } from "@generated/client";
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { LabelingUploadDto } from "@/labeling/dto/labeling-upload.dto";
import { LabelingOcrService } from "@/labeling/labeling-ocr.service";
import { DatabaseService } from "../database/database.service";
import { AddDocumentDto } from "./dto/add-document.dto";
import { CreateProjectDto, UpdateProjectDto } from "./dto/create-project.dto";
import { ExportDto, ExportFormat } from "./dto/export.dto";
import {
  CreateFieldDefinitionDto,
  ReorderFieldsDto,
  UpdateFieldDefinitionDto,
} from "./dto/field-definition.dto";
import { SaveLabelsDto } from "./dto/label.dto";

@Injectable()
export class LabelingService {
  private readonly logger = new Logger(LabelingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly labelingOcrService: LabelingOcrService,
  ) {}

  // ========== PROJECT OPERATIONS ==========

  async getProjects(userId?: string) {
    this.logger.debug("Getting all projects");
    return this.db.findAllLabelingProjects(userId);
  }

  async createProject(dto: CreateProjectDto, userId: string) {
    this.logger.debug(`Creating project: ${dto.name}`);
    return this.db.createLabelingProject({
      name: dto.name,
      description: dto.description,
      created_by: userId,
    });
  }

  async getProject(id: string) {
    this.logger.debug(`Getting project: ${id}`);
    const project = await this.db.findLabelingProject(id);
    if (!project) {
      throw new NotFoundException(`Project with id ${id} not found`);
    }
    return project;
  }

  async updateProject(id: string, dto: UpdateProjectDto) {
    this.logger.debug(`Updating project: ${id}`);
    const project = await this.db.updateLabelingProject(id, dto);
    if (!project) {
      throw new NotFoundException(`Project with id ${id} not found`);
    }
    return project;
  }

  async deleteProject(id: string) {
    this.logger.debug(`Deleting project: ${id}`);
    const deleted = await this.db.deleteLabelingProject(id);
    if (!deleted) {
      throw new NotFoundException(`Project with id ${id} not found`);
    }
    return { success: true, id };
  }

  // ========== FIELD SCHEMA OPERATIONS ==========

  async getFieldSchema(projectId: string) {
    this.logger.debug(`Getting field schema for project: ${projectId}`);
    const project = await this.db.findLabelingProject(projectId);
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }
    return project.field_schema;
  }

  async addField(projectId: string, dto: CreateFieldDefinitionDto) {
    this.logger.debug(`Adding field ${dto.field_key} to project: ${projectId}`);

    // Check project exists
    const project = await this.db.findLabelingProject(projectId);
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    // Check field key is unique within project
    const existingField = project.field_schema.find(
      (f) => f.field_key === dto.field_key,
    );
    if (existingField) {
      throw new ConflictException(
        `Field with key ${dto.field_key} already exists in project`,
      );
    }

    return this.db.createFieldDefinition(projectId, {
      field_key: dto.field_key,
      field_type: dto.field_type as unknown as FieldType,
      field_format: dto.field_format,
      display_order: dto.display_order,
      is_required: dto.is_required,
      is_table: dto.is_table,
      table_type: dto.table_type as any,
      column_headers: dto.column_headers,
    });
  }

  async updateField(
    projectId: string,
    fieldId: string,
    dto: UpdateFieldDefinitionDto,
  ) {
    this.logger.debug(`Updating field ${fieldId} in project: ${projectId}`);
    const field = await this.db.updateFieldDefinition(fieldId, {
      field_format: dto.field_format,
      display_order: dto.display_order,
      is_required: dto.is_required,
      column_headers: dto.column_headers,
    });
    if (!field) {
      throw new NotFoundException(`Field with id ${fieldId} not found`);
    }
    return field;
  }

  async deleteField(projectId: string, fieldId: string) {
    this.logger.debug(`Deleting field ${fieldId} from project: ${projectId}`);
    const deleted = await this.db.deleteFieldDefinition(fieldId);
    if (!deleted) {
      throw new NotFoundException(`Field with id ${fieldId} not found`);
    }
    return { success: true, id: fieldId };
  }

  async reorderFields(projectId: string, dto: ReorderFieldsDto) {
    this.logger.debug(`Reordering fields in project: ${projectId}`);
    await this.db.reorderFieldDefinitions(projectId, dto.fieldIds);
    return this.getFieldSchema(projectId);
  }

  // ========== DOCUMENT OPERATIONS ==========

  async getProjectDocuments(projectId: string) {
    this.logger.debug(`Getting documents for project: ${projectId}`);
    const project = await this.db.findLabelingProject(projectId);
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }
    return this.db.findLabeledDocuments(projectId);
  }

  async addDocumentToProject(projectId: string, dto: AddDocumentDto) {
    this.logger.debug(
      `Adding document ${dto.labelingDocumentId} to project: ${projectId}`,
    );

    // Check project exists
    const project = await this.db.findLabelingProject(projectId);
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    // Check labeling document exists
    const document = await this.db.findLabelingDocument(dto.labelingDocumentId);
    if (!document) {
      throw new NotFoundException(
        `Labeling document with id ${dto.labelingDocumentId} not found`,
      );
    }

    return this.db.addDocumentToProject(projectId, dto.labelingDocumentId);
  }

  async getProjectDocument(projectId: string, documentId: string) {
    this.logger.debug(
      `Getting document ${documentId} from project: ${projectId}`,
    );
    const labeledDoc = await this.db.findLabeledDocument(projectId, documentId);
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in project ${projectId}`,
      );
    }
    return labeledDoc;
  }

  async removeDocumentFromProject(projectId: string, documentId: string) {
    this.logger.debug(
      `Removing document ${documentId} from project: ${projectId}`,
    );
    const deleted = await this.db.removeDocumentFromProject(
      projectId,
      documentId,
    );
    if (!deleted) {
      throw new NotFoundException(
        `Document ${documentId} not found in project ${projectId}`,
      );
    }
    return { success: true, documentId };
  }

  // ========== LABEL OPERATIONS ==========

  async getDocumentLabels(projectId: string, documentId: string) {
    this.logger.debug(
      `Getting labels for document ${documentId} in project: ${projectId}`,
    );
    const labeledDoc = await this.db.findLabeledDocument(projectId, documentId);
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in project ${projectId}`,
      );
    }
    return labeledDoc.labels;
  }

  async saveDocumentLabels(
    projectId: string,
    documentId: string,
    dto: SaveLabelsDto,
  ) {
    this.logger.debug(
      `Saving labels for document ${documentId} in project: ${projectId}`,
    );

    const labeledDoc = await this.db.findLabeledDocument(projectId, documentId);
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in project ${projectId}`,
      );
    }

    // Save labels
    await this.db.saveDocumentLabels(
      labeledDoc.id,
      dto.labels.map((label) => ({
        field_key: label.field_key,
        label_name: label.label_name,
        value: label.value,
        page_number: label.page_number,
        bounding_box: label.bounding_box,
        confidence: label.confidence,
        is_manual: label.is_manual,
      })),
    );

    // Update document status
    const newStatus =
      dto.labels.length > 0
        ? LabelingStatus.labeled
        : LabelingStatus.in_progress;
    await this.db.updateLabeledDocumentStatus(labeledDoc.id, newStatus);

    return this.db.findLabeledDocument(projectId, documentId);
  }

  async deleteLabel(projectId: string, documentId: string, labelId: string) {
    this.logger.debug(
      `Deleting label ${labelId} from document ${documentId} in project: ${projectId}`,
    );
    const deleted = await this.db.deleteDocumentLabel(labelId);
    if (!deleted) {
      throw new NotFoundException(`Label with id ${labelId} not found`);
    }
    return { success: true, id: labelId };
  }

  // ========== OCR DATA ==========

  async getDocumentOcr(projectId: string, documentId: string) {
    this.logger.debug(
      `Getting OCR data for document ${documentId} in project: ${projectId}`,
    );

    const labeledDoc = await this.db.findLabeledDocument(projectId, documentId);
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in project ${projectId}`,
      );
    }
    if (!labeledDoc.labeling_document?.ocr_result) {
      throw new NotFoundException(
        `OCR result not found for labeling document ${documentId}`,
      );
    }

    return labeledDoc.labeling_document.ocr_result;
  }

  // ========== EXPORT ==========

  async exportProject(projectId: string, options: ExportDto) {
    this.logger.debug(
      `Exporting project ${projectId} in format: ${options.format}`,
    );

    const project = await this.db.findLabelingProject(projectId);
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    let documents = await this.db.findLabeledDocuments(projectId);

    // Filter by document IDs if provided
    if (options.documentIds?.length) {
      documents = documents.filter((d) =>
        options.documentIds!.includes(
          (d as any).labeling_document_id ?? d.labeling_document.id,
        ),
      );
    }

    // Filter by labeled status if requested
    if (options.labeledOnly) {
      documents = documents.filter((d) => d.status === LabelingStatus.labeled);
    }

    switch (options.format) {
      case ExportFormat.AZURE:
        return this.exportAzureFormat(project, documents);
      case ExportFormat.JSON:
      default:
        return this.exportJsonFormat(project, documents);
    }
  }

  private exportAzureFormat(project: any, documents: any[]) {
    // Generate fields.json (Azure Document Intelligence format)
    const fieldsJson = {
      fields: project.field_schema.map((field: any) => {
        const exportField: any = {
          fieldKey: field.field_key,
          fieldType: field.field_type,
        };

        // Only include fieldFormat for date fields
        if (field.field_type === "date" && field.field_format) {
          exportField.fieldFormat = field.field_format;
        }

        return exportField;
      }),
    };

    // Generate labels.json for each document
    const labelsFiles = documents.map((doc) => {
      // Group labels by field_key to handle multi-word fields
      const groupedLabels: Record<string, any[]> = {};
      doc.labels.forEach((label: any) => {
        if (!groupedLabels[label.field_key]) {
          groupedLabels[label.field_key] = [];
        }
        groupedLabels[label.field_key].push(label);
      });

      // Convert grouped labels to the export format
      const exportLabels = Object.entries(groupedLabels).map(
        ([fieldKey, labels]) => {
          // Sort labels by their original OCR order using span offset
          // This preserves the correct reading order from Azure Document Intelligence
          const sortedLabels = [...labels].sort((a: any, b: any) => {
            // First by page
            if (a.page_number !== b.page_number) {
              return a.page_number - b.page_number;
            }

            // Then by span offset (preserves OCR reading order)
            return (
              (a.bounding_box?.span?.offset ?? 0) -
              (b.bounding_box?.span?.offset ?? 0)
            );
          });

          const valueEntries = sortedLabels.map((label: any) => {
            // Normalize bounding box coordinates if page dimensions are available
            let normalizedPolygon = label.bounding_box.polygon;
            const pageWidth =
              label.bounding_box.pageWidth ??
              doc.labeling_document.ocr_result?.analyzeResult?.pages?.find(
                (page: any) => page.pageNumber === label.page_number,
              )?.width;
            const pageHeight =
              label.bounding_box.pageHeight ??
              doc.labeling_document.ocr_result?.analyzeResult?.pages?.find(
                (page: any) => page.pageNumber === label.page_number,
              )?.height;
            if (pageWidth && pageHeight) {
              normalizedPolygon = label.bounding_box.polygon.map(
                (coord: number, idx: number) => {
                  const divisor = idx % 2 === 0 ? pageWidth : pageHeight;
                  return coord / divisor;
                },
              );
            }

            // Format text for checkboxes
            let text = label.value;
            const field = project.field_schema.find(
              (f: any) => f.field_key === fieldKey,
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
      projectName: project.name,
      documentCount: documents.length,
      labeledCount: documents.filter((d) => d.status === LabelingStatus.labeled)
        .length,
    };
  }

  private exportJsonFormat(project: any, documents: any[]) {
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        created_at: project.created_at,
        fieldSchema: project.field_schema,
      },
      documents: documents.map((doc) => ({
        id: (doc as any).labeling_document_id ?? doc.labeling_document.id,
        filename: doc.labeling_document.original_filename,
        status: doc.status,
        labels: doc.labels,
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  async uploadLabelingDocument(projectId: string, dto: LabelingUploadDto) {
    this.logger.debug(`Uploading labeling document for project: ${projectId}`);

    const project = await this.db.findLabelingProject(projectId);
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    const labelingDocument =
      await this.labelingOcrService.createLabelingDocument(dto);

    const labeledDoc = await this.db.addDocumentToProject(
      projectId,
      labelingDocument.id,
    );

    void this.labelingOcrService.processOcrForLabelingDocument(
      labelingDocument.id,
    );

    return {
      labeledDocument: labeledDoc,
      labelingDocument,
    };
  }
}
