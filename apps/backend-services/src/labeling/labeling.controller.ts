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
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { LocalBlobStorageService } from "../blob-storage/local-blob-storage.service";
import { AddDocumentDto } from "./dto/add-document.dto";
import { CreateProjectDto, UpdateProjectDto } from "./dto/create-project.dto";
import { ExportDto } from "./dto/export.dto";
import {
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
} from "./dto/field-definition.dto";
import { SaveLabelsDto } from "./dto/label.dto";
import { LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelingService } from "./labeling.service";

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    id?: string;
  };
}

@ApiTags("labeling")
@Controller("api/labeling")
export class LabelingController {
  constructor(
    private readonly labelingService: LabelingService,
    private readonly blobStorage: LocalBlobStorageService,
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
  async getProjects(@Query("userId") userId?: string) {
    return this.labelingService.getProjects(userId);
  }

  @Post("projects")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Create a new labeling project" })
  async createProject(
    @Body() dto: CreateProjectDto,
    @Req() req: AuthenticatedRequest,
  ) {
    // Extract user ID from request (set by auth guard)
    const userId = req.user?.sub || req.user?.id || "anonymous";
    return this.labelingService.createProject(dto, userId);
  }

  @Get("projects/:id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get project details with field schema" })
  @ApiParam({ name: "id", description: "Project ID" })
  async getProject(@Param("id") id: string) {
    return this.labelingService.getProject(id);
  }

  @Put("projects/:id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Update project" })
  @ApiParam({ name: "id", description: "Project ID" })
  async updateProject(@Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.labelingService.updateProject(id, dto);
  }

  @Delete("projects/:id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Delete project and all associated data" })
  @ApiParam({ name: "id", description: "Project ID" })
  async deleteProject(@Param("id") id: string) {
    return this.labelingService.deleteProject(id);
  }

  // ========== FIELD SCHEMA ENDPOINTS ==========

  @Get("projects/:id/fields")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get field schema for project" })
  @ApiParam({ name: "id", description: "Project ID" })
  async getFieldSchema(@Param("id") id: string) {
    return this.labelingService.getFieldSchema(id);
  }

  @Post("projects/:id/fields")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Add a field to the project schema" })
  @ApiParam({ name: "id", description: "Project ID" })
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
  async getProjectDocuments(@Param("id") projectId: string) {
    return this.labelingService.getProjectDocuments(projectId);
  }

  @Post("projects/:id/documents")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Add a document to project" })
  @ApiParam({ name: "id", description: "Project ID" })
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
  async uploadLabelingDocument(
    @Param("id") projectId: string,
    @Body() dto: LabelingUploadDto,
  ) {
    return this.labelingService.uploadLabelingDocument(projectId, dto);
  }

  @Get("projects/:id/documents/:docId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get document with labels" })
  @ApiParam({ name: "id", description: "Project ID" })
  @ApiParam({ name: "docId", description: "Document ID" })
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
  async exportProject(
    @Param("id") projectId: string,
    @Body() options: ExportDto,
  ) {
    return this.labelingService.exportProject(projectId, options);
  }
}
