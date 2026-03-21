import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { Identity } from "@/auth/identity.decorator";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { GroupRole } from "@/generated/edge";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { AddDocumentDto } from "./dto/add-document.dto";
import {
  CreateTemplateModelDto,
  UpdateTemplateModelDto,
} from "./dto/create-template-model.dto";
import { ExportDto } from "./dto/export.dto";
import {
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
} from "./dto/field-definition.dto";
import { SaveLabelsDto } from "./dto/label.dto";
import {
  DeleteDocumentResponseDto,
  DeleteResponseDto,
  FieldDefinitionResponseDto,
  LabeledDocumentResponseDto,
  LabelResponseDto,
  TemplateModelResponseDto,
  UploadLabelingResponseDto,
} from "./dto/template-model-responses.dto";
import { LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelSuggestionDto } from "./dto/suggestion.dto";
import { TemplateModelService } from "./template-model.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";

@ApiTags("Template Models")
@Controller("api/template-models")
export class TemplateModelController {
  constructor(
    private readonly templateModelService: TemplateModelService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly labelingDocumentDbService: LabelingDocumentDbService,
  ) {}

  // ========== TEMPLATE MODEL ENDPOINTS ==========

  @Get()
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get all template models" })
  @ApiOkResponse({
    description: "List of template models with their field schemas",
    type: [TemplateModelResponseDto],
  })
  @ApiQuery({
    name: "group_id",
    required: false,
    description:
      "Filter template models by group ID. When provided, only template models for that group are returned and group membership is verified.",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getTemplateModels(
    @Req() req: Request,
    @Query("group_id") groupId?: string,
  ) {
    if (groupId) {
      identityCanAccessGroup(req.resolvedIdentity, groupId);
      return this.templateModelService.getTemplateModels([groupId]);
    }
    const groupIds = getIdentityGroupIds(req.resolvedIdentity);
    return this.templateModelService.getTemplateModels(groupIds);
  }

  @Post()
  @Identity({
    allowApiKey: true,
    groupIdFrom: { body: "group_id" },
    minimumRole: GroupRole.MEMBER,
  })
  @ApiOperation({ summary: "Create a new template model" })
  @ApiCreatedResponse({
    description: "Newly created template model",
    type: TemplateModelResponseDto,
  })
  async createTemplateModel(
    @Body() dto: CreateTemplateModelDto,
    @Req() req: Request,
  ) {
    return this.templateModelService.createTemplateModel(
      dto,
      req.resolvedIdentity.actorId,
    );
  }

  @Get(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get template model details with field schema" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiOkResponse({
    description: "Template model with full field schema",
    type: TemplateModelResponseDto,
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getTemplateModel(@Param("id") id: string, @Req() req: Request) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return templateModel;
  }

  @Put(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update template model" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiOkResponse({
    description: "Updated template model",
    type: TemplateModelResponseDto,
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async updateTemplateModel(
    @Param("id") id: string,
    @Body() dto: UpdateTemplateModelDto,
    @Req() req: Request,
  ) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.updateTemplateModel(id, dto);
  }

  @Delete(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete template model and all associated data" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiOkResponse({
    description: "Template model deleted successfully",
    type: DeleteResponseDto,
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteTemplateModel(@Param("id") id: string, @Req() req: Request) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.deleteTemplateModel(id);
  }

  // ========== FIELD SCHEMA ENDPOINTS ==========

  @Get(":id/fields")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get field schema for template model" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiOkResponse({
    description: "Ordered list of field definitions for the template model",
    type: [FieldDefinitionResponseDto],
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getFieldSchema(@Param("id") id: string, @Req() req: Request) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.getFieldSchema(id);
  }

  @Post(":id/fields")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Add a field to the template model schema" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiCreatedResponse({
    description: "Newly created field definition",
    type: FieldDefinitionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async addField(
    @Param("id") id: string,
    @Body() dto: CreateFieldDefinitionDto,
    @Req() req: Request,
  ) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.addField(id, dto);
  }

  @Put(":id/fields/:fieldId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update a field definition" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "fieldId", description: "Field ID" })
  @ApiOkResponse({
    description: "Updated field definition",
    type: FieldDefinitionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async updateField(
    @Param("id") id: string,
    @Param("fieldId") fieldId: string,
    @Body() dto: UpdateFieldDefinitionDto,
    @Req() req: Request,
  ) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.updateField(id, fieldId, dto);
  }

  @Delete(":id/fields/:fieldId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a field from schema" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "fieldId", description: "Field ID" })
  @ApiOkResponse({
    description: "Field deleted successfully",
    type: DeleteResponseDto,
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteField(
    @Param("id") id: string,
    @Param("fieldId") fieldId: string,
    @Req() req: Request,
  ) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.deleteField(id, fieldId);
  }

  // ========== DOCUMENT ENDPOINTS ==========

  @Get(":id/documents")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get all documents in template model" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiOkResponse({
    description: "List of labeled documents with their labels",
    type: [LabeledDocumentResponseDto],
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getTemplateModelDocuments(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const templateModel = await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.getTemplateModelDocuments(id);
  }

  @Post(":id/documents")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Add a document to template model" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiCreatedResponse({
    description: "Document added to the template model",
    type: LabeledDocumentResponseDto,
  })
  @ApiNotFoundResponse({ description: "Labeling document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async addDocumentToTemplateModel(
    @Param("id") id: string,
    @Body() dto: AddDocumentDto,
    @Req() req: Request,
  ) {
    const labelingDoc =
      await this.labelingDocumentDbService.findLabelingDocument(
        dto.labelingDocumentId,
      );
    if (!labelingDoc) {
      throw new NotFoundException(
        `Labeling document with id ${dto.labelingDocumentId} not found`,
      );
    }
    identityCanAccessGroup(req.resolvedIdentity, labelingDoc.group_id);
    return this.templateModelService.addDocumentToTemplateModel(id, dto);
  }

  @Post(":id/upload")
  @HttpCode(HttpStatus.CREATED)
  @Identity({
    allowApiKey: true,
    groupIdFrom: { body: "group_id" },
    minimumRole: GroupRole.MEMBER,
  })
  @ApiOperation({
    summary: "Upload a document into a template model",
  })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiCreatedResponse({
    description: "Document uploaded and queued for OCR processing",
    type: UploadLabelingResponseDto,
  })
  async uploadLabelingDocument(
    @Param("id") id: string,
    @Body() dto: LabelingUploadDto,
    @Req() req: Request,
  ) {
    identityCanAccessGroup(req.resolvedIdentity, dto.group_id);
    return this.templateModelService.uploadLabelingDocument(id, dto);
  }

  @Get(":id/documents/:docId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get document with labels" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description:
      "Labeled document with all its labels and underlying document data",
    type: LabeledDocumentResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getTemplateModelDocument(
    @Param("id") id: string,
    @Param("docId") documentId: string,
    @Req() req: Request,
  ) {
    const labeledDoc =
      await this.templateModelService.getTemplateModelDocument(id, documentId);
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return labeledDoc;
  }

  @Get(":id/documents/:docId/download")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Download a labeling document file" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Labeling Document ID" })
  @ApiOkResponse({ description: "Binary file content (PDF or image)" })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async downloadLabelingDocument(
    @Param("id") id: string,
    @Param("docId") documentId: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const labeledDoc =
      await this.templateModelService.getTemplateModelDocument(id, documentId);
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    const labelingDocument = labeledDoc.labeling_document;
    const fileBuffer = await this.blobStorage.read(labelingDocument.file_path);

    const fileName =
      labelingDocument.original_filename || `document-${documentId}`;
    const mimeType =
      labelingDocument.file_type === "pdf"
        ? "application/pdf"
        : labelingDocument.file_type === "image"
          ? "image/jpeg"
          : "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", fileBuffer.length);
    res.send(fileBuffer);
  }

  @Delete(":id/documents/:docId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Remove document from template model" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Document removed from template model",
    type: DeleteDocumentResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async removeDocumentFromTemplateModel(
    @Param("id") id: string,
    @Param("docId") documentId: string,
    @Req() req: Request,
  ) {
    const labeledDoc =
      await this.templateModelService.getTemplateModelDocument(id, documentId);
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.templateModelService.removeDocumentFromTemplateModel(
      id,
      documentId,
    );
  }

  // ========== LABEL ENDPOINTS ==========

  @Get(":id/documents/:docId/labels")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get labels for document" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "All labels for the document",
    type: [LabelResponseDto],
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDocumentLabels(
    @Param("id") id: string,
    @Param("docId") documentId: string,
    @Req() req: Request,
  ) {
    const labeledDoc =
      await this.templateModelService.getTemplateModelDocument(id, documentId);
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.templateModelService.getDocumentLabels(id, documentId);
  }

  @Post(":id/documents/:docId/labels")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Save labels for document" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Updated labeled document with all saved labels",
    type: LabeledDocumentResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async saveDocumentLabels(
    @Param("id") id: string,
    @Param("docId") documentId: string,
    @Body() dto: SaveLabelsDto,
    @Req() req: Request,
  ) {
    const labeledDoc =
      await this.templateModelService.getTemplateModelDocument(id, documentId);
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.templateModelService.saveDocumentLabels(id, documentId, dto);
  }

  @Delete(":id/documents/:docId/labels/:labelId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a specific label" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiParam({ name: "labelId", description: "Label ID" })
  @ApiOkResponse({
    description: "Label deleted successfully",
    type: DeleteResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document or label not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteLabel(
    @Param("id") id: string,
    @Param("docId") documentId: string,
    @Param("labelId") labelId: string,
    @Req() req: Request,
  ) {
    const labeledDoc =
      await this.templateModelService.getTemplateModelDocument(id, documentId);
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.templateModelService.deleteLabel(id, documentId, labelId);
  }

  // ========== OCR ENDPOINTS ==========

  @Get(":id/documents/:docId/ocr")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get OCR data for document" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Raw OCR result from Azure Document Intelligence",
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDocumentOcr(
    @Param("id") id: string,
    @Param("docId") documentId: string,
    @Req() req: Request,
  ) {
    const labeledDoc =
      await this.templateModelService.getTemplateModelDocument(id, documentId);
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.templateModelService.getDocumentOcr(id, documentId);
  }

  @Post(":id/documents/:docId/suggestions")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Generate label suggestions mapped to existing words/selection marks",
  })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Generated label suggestions for the document",
    type: [LabelSuggestionDto],
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async generateDocumentSuggestions(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("docId") documentId: string,
  ): Promise<LabelSuggestionDto[]> {
    return this.templateModelService.generateDocumentSuggestions(
      id,
      documentId,
      req.resolvedIdentity,
    );
  }

  // ========== EXPORT ENDPOINTS ==========

  @Post(":id/export")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Export labeled data for training" })
  @ApiParam({ name: "id", description: "Template Model ID" })
  @ApiOkResponse({
    description:
      "Exported template model data. Shape depends on format: azure returns fieldsJson/labelsFiles, json returns templateModel/documents.",
    schema: {
      oneOf: [
        { $ref: "#/components/schemas/AzureExportResponseDto" },
        { $ref: "#/components/schemas/JsonExportResponseDto" },
      ],
    },
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async exportTemplateModel(
    @Param("id") id: string,
    @Body() options: ExportDto,
    @Req() req: Request,
  ) {
    const templateModel =
      await this.templateModelService.getTemplateModel(id);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.templateModelService.exportTemplateModel(id, options);
  }
}
