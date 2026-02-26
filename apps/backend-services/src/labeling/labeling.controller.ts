import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { LocalBlobStorageService } from "../blob-storage/local-blob-storage.service";
import { DatabaseService } from "../database/database.service";
import { AddDocumentDto } from "./dto/add-document.dto";
import { CreateProjectDto, UpdateProjectDto } from "./dto/create-project.dto";
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
  LabelingProjectResponseDto,
  LabelResponseDto,
  UploadLabelingResponseDto,
} from "./dto/labeling-responses.dto";
import { LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelingService } from "./labeling.service";

@ApiTags("labeling")
@Controller("api/labeling")
export class LabelingController {
  constructor(
    private readonly labelingService: LabelingService,
    private readonly blobStorage: LocalBlobStorageService,
    private readonly databaseService: DatabaseService,
  ) {}

  // ========== PROJECT ENDPOINTS ==========

  @Get("projects")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get all labeling projects" })
  @ApiQuery({
    name: "userId",
    required: false,
    description: "Filter by creator",
  })
  @ApiOkResponse({
    description: "List of labeling projects with their field schemas",
    type: [LabelingProjectResponseDto],
  })
  async getProjects(@Query("userId") userId?: string) {
    return this.labelingService.getProjects(userId);
  }

  @Post("projects")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Create a new labeling project" })
  @ApiCreatedResponse({
    description: "Newly created labeling project",
    type: LabelingProjectResponseDto,
  })
  async createProject(
    @Body() dto: CreateProjectDto,
    @Req() req: Request,
  ) {
    const userId = req.user?.sub || (req.user as { id?: string })?.id || "anonymous";
    await identityCanAccessGroup(
      req.resolvedIdentity,
      dto.group_id,
      this.databaseService,
    );
    return this.labelingService.createProject(dto, userId);
  }

  @Get("projects/:id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get project details with field schema" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "Labeling project with full field schema",
    type: LabelingProjectResponseDto,
  })
  async getProject(@Param("id") id: string) {
    return this.labelingService.getProject(id);
  }

  @Put("projects/:id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Update project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "Updated labeling project",
    type: LabelingProjectResponseDto,
  })
  async updateProject(@Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.labelingService.updateProject(id, dto);
  }

  @Delete("projects/:id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Delete project and all associated data" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "Project deleted successfully",
    type: DeleteResponseDto,
  })
  async deleteProject(@Param("id") id: string) {
    return this.labelingService.deleteProject(id);
  }

  // ========== FIELD SCHEMA ENDPOINTS ==========

  @Get("projects/:id/fields")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get field schema for project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "Ordered list of field definitions for the project",
    type: [FieldDefinitionResponseDto],
  })
  async getFieldSchema(@Param("id") id: string) {
    return this.labelingService.getFieldSchema(id);
  }

  @Post("projects/:id/fields")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Add a field to the project schema" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiCreatedResponse({
    description: "Newly created field definition",
    type: FieldDefinitionResponseDto,
  })
  async addField(
    @Param("id") projectId: string,
    @Body() dto: CreateFieldDefinitionDto,
  ) {
    return this.labelingService.addField(projectId, dto);
  }

  @Put("projects/:id/fields/:fieldId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Update a field definition" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "fieldId", description: "Field ID" })
  @ApiOkResponse({
    description: "Updated field definition",
    type: FieldDefinitionResponseDto,
  })
  async updateField(
    @Param("id") projectId: string,
    @Param("fieldId") fieldId: string,
    @Body() dto: UpdateFieldDefinitionDto,
  ) {
    return this.labelingService.updateField(projectId, fieldId, dto);
  }

  @Delete("projects/:id/fields/:fieldId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Delete a field from schema" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "fieldId", description: "Field ID" })
  @ApiOkResponse({
    description: "Field deleted successfully",
    type: DeleteResponseDto,
  })
  async deleteField(
    @Param("id") projectId: string,
    @Param("fieldId") fieldId: string,
  ) {
    return this.labelingService.deleteField(projectId, fieldId);
  }

  // ========== DOCUMENT ENDPOINTS ==========

  @Get("projects/:id/documents")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get all documents in project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiOkResponse({
    description: "List of labeled documents with their labels",
    type: [LabeledDocumentResponseDto],
  })
  async getProjectDocuments(@Param("id") projectId: string) {
    return this.labelingService.getProjectDocuments(projectId);
  }

  @Post("projects/:id/documents")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Add a document to project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiCreatedResponse({
    description: "Document added to the project",
    type: LabeledDocumentResponseDto,
  })
  async addDocumentToProject(
    @Param("id") projectId: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.labelingService.addDocumentToProject(projectId, dto);
  }

  @Post("projects/:id/upload")
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Upload a document into a labeling project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiCreatedResponse({
    description: "Document uploaded and queued for OCR processing",
    type: UploadLabelingResponseDto,
  })
  async uploadLabelingDocument(
    @Param("id") projectId: string,
    @Body() dto: LabelingUploadDto,
    @Req() req: Request,
  ) {
    await identityCanAccessGroup(
      req.resolvedIdentity,
      dto.group_id,
      this.databaseService,
    );
    return this.labelingService.uploadLabelingDocument(projectId, dto);
  }

  @Get("projects/:id/documents/:docId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get document with labels" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description:
      "Labeled document with all its labels and underlying document data",
    type: LabeledDocumentResponseDto,
  })
  async getProjectDocument(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
  ) {
    return this.labelingService.getProjectDocument(projectId, documentId);
  }

  @Get("projects/:id/documents/:docId/download")
  @HttpCode(HttpStatus.OK)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Download a labeling document file" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Labeling Document ID" })
  @ApiOkResponse({ description: "Binary file content (PDF or image)" })
  async downloadLabelingDocument(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Res() res: Response,
  ) {
    const labeledDoc = await this.labelingService.getProjectDocument(
      projectId,
      documentId,
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

  @Delete("projects/:id/documents/:docId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Remove document from project" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Document removed from project",
    type: DeleteDocumentResponseDto,
  })
  async removeDocumentFromProject(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
  ) {
    return this.labelingService.removeDocumentFromProject(
      projectId,
      documentId,
    );
  }

  // ========== LABEL ENDPOINTS ==========

  @Get("projects/:id/documents/:docId/labels")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get labels for document" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "All labels for the document",
    type: [LabelResponseDto],
  })
  async getDocumentLabels(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
  ) {
    return this.labelingService.getDocumentLabels(projectId, documentId);
  }

  @Post("projects/:id/documents/:docId/labels")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Save labels for document" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Updated labeled document with all saved labels",
    type: LabeledDocumentResponseDto,
  })
  async saveDocumentLabels(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Body() dto: SaveLabelsDto,
  ) {
    return this.labelingService.saveDocumentLabels(projectId, documentId, dto);
  }

  @Delete("projects/:id/documents/:docId/labels/:labelId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Delete a specific label" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiParam({ name: "labelId", description: "Label ID" })
  @ApiOkResponse({
    description: "Label deleted successfully",
    type: DeleteResponseDto,
  })
  async deleteLabel(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
    @Param("labelId") labelId: string,
  ) {
    return this.labelingService.deleteLabel(projectId, documentId, labelId);
  }

  // ========== OCR ENDPOINTS ==========

  @Get("projects/:id/documents/:docId/ocr")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get OCR data for document" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
  @ApiOkResponse({
    description: "Raw OCR result from Azure Document Intelligence",
  })
  async getDocumentOcr(
    @Param("id") projectId: string,
    @Param("docId") documentId: string,
  ) {
    return this.labelingService.getDocumentOcr(projectId, documentId);
  }

  // ========== EXPORT ENDPOINTS ==========

  @Post("projects/:id/export")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  async exportProject(
    @Param("id") projectId: string,
    @Body() options: ExportDto,
  ) {
    return this.labelingService.exportProject(projectId, options);
  }
}
