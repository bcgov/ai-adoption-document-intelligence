import {
  BadRequestException,
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
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { AuditService } from "@/audit/audit.service";
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
import { getContentTypeFromFilename } from "../document/mime-from-filename";
import { AddDocumentDto } from "./dto/add-document.dto";
import { CreateProjectDto, UpdateProjectDto } from "./dto/create-project.dto";
import { ExportDto } from "./dto/export.dto";
import {
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
} from "./dto/field-definition.dto";
import { SaveLabelsDto } from "./dto/label.dto";
import { LabelingConversionFailedResponseDto } from "./dto/labeling-conversion-failed-response.dto";
import {
  DeleteDocumentResponseDto,
  DeleteResponseDto,
  FieldDefinitionResponseDto,
  LabeledDocumentResponseDto,
  LabelingProjectResponseDto,
  LabelResponseDto,
  UploadLabelingResponseDto,
} from "./dto/labeling-responses.dto";
import { LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelSuggestionDto } from "./dto/suggestion.dto";
import { LabelingService } from "./labeling.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";

@ApiTags("labeling")
@Controller("api/labeling")
export class LabelingController {
  constructor(
    private readonly labelingService: LabelingService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly labelingDocumentDbService: LabelingDocumentDbService,
    private readonly auditService: AuditService,
  ) {}

  // ========== PROJECT ENDPOINTS ==========

  @Get("projects")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get all labeling projects" })
  @ApiOkResponse({
    description: "List of labeling projects with their field schemas",
    type: [LabelingProjectResponseDto],
  })
  @ApiQuery({
    name: "group_id",
    required: false,
    description:
      "Filter projects by group ID. When provided, only projects for that group are returned and group membership is verified.",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getProjects(@Req() req: Request, @Query("group_id") groupId?: string) {
    if (groupId) {
      identityCanAccessGroup(req.resolvedIdentity, groupId);
      return this.labelingService.getProjects([groupId]);
    }
    const groupIds = getIdentityGroupIds(req.resolvedIdentity);
    return this.labelingService.getProjects(groupIds);
  }

  @Post("projects")
  @Identity({
    allowApiKey: true,
    groupIdFrom: { body: "group_id" },
    minimumRole: GroupRole.MEMBER,
  })
  @ApiOperation({ summary: "Create a new labeling project" })
  @ApiCreatedResponse({
    description: "Newly created labeling project",
    type: LabelingProjectResponseDto,
  })
  async createProject(@Body() dto: CreateProjectDto, @Req() req: Request) {
    return this.labelingService.createProject(
      dto,
      req.resolvedIdentity.actorId,
    );
  }

  @Get("projects/:id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get project details with field schema" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "Labeling project with full field schema",
    type: LabelingProjectResponseDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getProject(@Param("id") id: string, @Req() req: Request) {
    const project = await this.labelingService.getProject(id);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return project;
  }

  @Put("projects/:id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "Updated labeling project",
    type: LabelingProjectResponseDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async updateProject(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(id);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return this.labelingService.updateProject(id, dto);
  }

  @Delete("projects/:id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete project and all associated data" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "Project deleted successfully",
    type: DeleteResponseDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteProject(@Param("id") id: string, @Req() req: Request) {
    const project = await this.labelingService.getProject(id);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return this.labelingService.deleteProject(id);
  }

  // ========== FIELD SCHEMA ENDPOINTS ==========

  @Get("projects/:id/fields")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get field schema for project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "Ordered list of field definitions for the project",
    type: [FieldDefinitionResponseDto],
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getFieldSchema(@Param("id") id: string, @Req() req: Request) {
    const project = await this.labelingService.getProject(id);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return this.labelingService.getFieldSchema(id);
  }

  @Post("projects/:id/fields")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Add a field to the project schema" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiCreatedResponse({
    description: "Newly created field definition",
    type: FieldDefinitionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async addField(
    @Param("id") projectId: string,
    @Body() dto: CreateFieldDefinitionDto,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return this.labelingService.addField(projectId, dto);
  }

  @Put("projects/:id/fields/:fieldId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update a field definition" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "fieldId", description: "Field ID" })
  @ApiOkResponse({
    description: "Updated field definition",
    type: FieldDefinitionResponseDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async updateField(
    @Param("id") projectId: string,
    @Param("fieldId") fieldId: string,
    @Body() dto: UpdateFieldDefinitionDto,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return this.labelingService.updateField(projectId, fieldId, dto);
  }

  @Delete("projects/:id/fields/:fieldId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a field from schema" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "fieldId", description: "Field ID" })
  @ApiOkResponse({
    description: "Field deleted successfully",
    type: DeleteResponseDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteField(
    @Param("id") projectId: string,
    @Param("fieldId") fieldId: string,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return this.labelingService.deleteField(projectId, fieldId);
  }

  // ========== DOCUMENT ENDPOINTS ==========

  @Get("projects/:id/documents")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get all documents in project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "List of labeled documents with their labels",
    type: [LabeledDocumentResponseDto],
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getProjectDocuments(
    @Param("id") projectId: string,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return this.labelingService.getProjectDocuments(projectId);
  }

  @Post("projects/:id/documents")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Add a document to project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiCreatedResponse({
    description: "Document added to the project",
    type: LabeledDocumentResponseDto,
  })
  @ApiNotFoundResponse({ description: "Labeling document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async addDocumentToProject(
    @Param("id") projectId: string,
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
    return this.labelingService.addDocumentToProject(projectId, dto);
  }

  @Post("projects/:id/upload")
  @HttpCode(HttpStatus.CREATED)
  @Identity({
    allowApiKey: true,
    groupIdFrom: { body: "group_id" },
    minimumRole: GroupRole.MEMBER,
  })
  @ApiOperation({ summary: "Upload a document into a labeling project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiCreatedResponse({
    description: "Document uploaded and queued for OCR processing",
    type: UploadLabelingResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Original stored but PDF normalization failed (see response body)",
    type: LabelingConversionFailedResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      "group_id does not match the labeling project's group, or invalid body",
  })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async uploadLabelingDocument(
    @Param("id") projectId: string,
    @Body() dto: LabelingUploadDto,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    if (dto.group_id !== project.group_id) {
      throw new BadRequestException(
        "group_id must match the labeling project's group",
      );
    }
    return this.labelingService.uploadLabelingDocument(projectId, dto);
  }

  @Get("projects/:id/documents/:docId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get document with labels" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description:
      "Labeled document with all its labels and underlying document data",
    type: LabeledDocumentResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getProjectDocument(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Req() req: Request,
  ) {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
    );
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return labeledDoc;
  }

  @Get("projects/:id/documents/:docId/view")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "View labeling document as normalized PDF",
    description:
      "Streams the normalized PDF for in-app display. Content-Type is always application/pdf.",
  })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Labeling Document ID" })
  @ApiProduces("application/pdf")
  @ApiOkResponse({ description: "Normalized PDF bytes" })
  @ApiNotFoundResponse({ description: "Document or normalized PDF not found" })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async viewLabelingDocument(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
    );
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    const labelingDocument = labeledDoc.labeling_document;
    if (!labelingDocument.normalized_file_path) {
      throw new NotFoundException(
        `Normalized PDF is not available for labeling document: ${documentId}`,
      );
    }

    await this.auditService.recordEvent({
      event_type: "document_accessed",
      resource_type: "labeling_document",
      resource_id: documentId,
      actor_id: req.resolvedIdentity.actorId,
      document_id: documentId,
      group_id: labelingDocument.group_id ?? undefined,
      payload: { action: "view", labeling_project_id: projectId },
    });

    const fileBuffer = await this.blobStorage.read(
      labelingDocument.normalized_file_path,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');
    res.setHeader("Content-Length", fileBuffer.length);
    res.send(fileBuffer);
  }

  @Get("projects/:id/documents/:docId/download")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Download original labeling document file",
    description:
      "Serves the stored original upload. Type follows original_filename.",
  })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Labeling Document ID" })
  @ApiOkResponse({ description: "Original file bytes" })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async downloadLabelingDocument(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
    );
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    const labelingDocument = labeledDoc.labeling_document;
    const fileBuffer = await this.blobStorage.read(labelingDocument.file_path);

    const fileName =
      labelingDocument.original_filename || `document-${documentId}`;
    const mimeType = getContentTypeFromFilename(fileName);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", fileBuffer.length);
    res.send(fileBuffer);
  }

  @Delete("projects/:id/documents/:docId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Remove document from project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Document removed from project",
    type: DeleteDocumentResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async removeDocumentFromProject(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Req() req: Request,
  ) {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
    );
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.labelingService.removeDocumentFromProject(
      projectId,
      documentId,
    );
  }

  // ========== LABEL ENDPOINTS ==========

  @Get("projects/:id/documents/:docId/labels")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get labels for document" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "All labels for the document",
    type: [LabelResponseDto],
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDocumentLabels(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Req() req: Request,
  ) {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
    );
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.labelingService.getDocumentLabels(projectId, documentId);
  }

  @Post("projects/:id/documents/:docId/labels")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Save labels for document" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Updated labeled document with all saved labels",
    type: LabeledDocumentResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async saveDocumentLabels(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Body() dto: SaveLabelsDto,
    @Req() req: Request,
  ) {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
    );
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.labelingService.saveDocumentLabels(projectId, documentId, dto);
  }

  @Delete("projects/:id/documents/:docId/labels/:labelId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a specific label" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiParam({ name: "labelId", description: "Label ID" })
  @ApiOkResponse({
    description: "Label deleted successfully",
    type: DeleteResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document or label not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteLabel(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Param("labelId") labelId: string,
    @Req() req: Request,
  ) {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
    );
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.labelingService.deleteLabel(projectId, documentId, labelId);
  }

  // ========== OCR ENDPOINTS ==========

  @Get("projects/:id/documents/:docId/ocr")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get OCR data for document" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Raw OCR result from Azure Document Intelligence",
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDocumentOcr(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Req() req: Request,
  ) {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
    );
    identityCanAccessGroup(
      req.resolvedIdentity,
      labeledDoc.labeling_document.group_id,
    );
    return this.labelingService.getDocumentOcr(projectId, documentId);
  }

  @Post("projects/:id/documents/:docId/suggestions")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Generate label suggestions mapped to existing words/selection marks",
  })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Generated label suggestions for the document",
    type: [LabelSuggestionDto],
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async generateDocumentSuggestions(
    @Req() req: Request,
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
  ): Promise<LabelSuggestionDto[]> {
    return this.labelingService.generateDocumentSuggestions(
      projectId,
      documentId,
      req.resolvedIdentity,
    );
  }

  // ========== EXPORT ENDPOINTS ==========

  @Post("projects/:id/export")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Export labeled data for training" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description:
      "Exported project data. Shape depends on format: azure returns fieldsJson/labelsFiles, json returns project/documents.",
    schema: {
      oneOf: [
        { $ref: "#/components/schemas/AzureExportResponseDto" },
        { $ref: "#/components/schemas/JsonExportResponseDto" },
      ],
    },
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async exportProject(
    @Param("id") projectId: string,
    @Body() options: ExportDto,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.group_id);
    return this.labelingService.exportProject(projectId, options);
  }
}
