import { Resolver, Query, Mutation, Args, ID, Float, Int } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { GraphQLJSON } from 'graphql-type-json';
import { Document } from '../models/document.model';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DocumentFileType,
  IntakeMethod,
  DocumentStatus,
  ValidationStatus,
  Ministry,
  Priority,
} from '@prisma/client';

@Resolver(() => Document)
export class DocumentResolver {
  private readonly logger = new Logger(DocumentResolver.name);

  constructor(private prisma: PrismaService) {}

  @Query(() => [Document])
  async documents(
    @Args('workspace_id', { type: () => ID, nullable: true }) workspace_id?: string,
    @Args('status', { type: () => DocumentStatus, nullable: true })
    status?: DocumentStatus,
    @Args('ministry', { type: () => Ministry, nullable: true }) ministry?: Ministry,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<Document[]> {
    const where: any = {};
    if (workspace_id) where.workspace_id = workspace_id;
    if (status) where.status = status;
    if (ministry) where.ministry = ministry;

    return this.prisma.document.findMany({
      where,
      include: { workspace: true },
      orderBy: { created_date: 'desc' },
      take: limit,
    });
  }

  @Query(() => Document, { nullable: true })
  async document(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Document | null> {
    return this.prisma.document.findUnique({
      where: { id },
      include: { workspace: true },
    });
  }

  @Mutation(() => Document)
  async createDocument(
    @Args('title') title: string,
    @Args('file_url') file_url: string,
    @Args('file_type', { type: () => DocumentFileType }) file_type: DocumentFileType,
    @Args('intake_method', { type: () => IntakeMethod })
    intake_method: IntakeMethod,
    @Args('ministry', { type: () => Ministry }) ministry: Ministry,
    @Args('workspace_id', { type: () => ID, nullable: true }) workspace_id?: string,
    @Args('status', { type: () => DocumentStatus, nullable: true })
    status?: DocumentStatus,
    @Args('confidence_score', { type: () => Float, nullable: true })
    confidence_score?: number,
    @Args('extracted_data', { type: () => GraphQLJSON, nullable: true }) extracted_data?: any,
    @Args('validation_status', { type: () => ValidationStatus, nullable: true })
    validation_status?: ValidationStatus,
    @Args('priority', { type: () => Priority, nullable: true }) priority?: Priority,
    @Args('retention_date', { nullable: true }) retention_date?: Date,
  ): Promise<Document> {
    this.logger.debug('=== createDocument called ===');
    this.logger.debug(`Received parameters:
      - title: ${title}
      - file_url: ${file_url}
      - file_type: ${file_type}
      - intake_method: ${intake_method}
      - ministry: ${ministry}
      - workspace_id: ${workspace_id || '(not provided)'}
      - status: ${status || '(not provided, will default to uploaded)'}
      - confidence_score: ${confidence_score || '(not provided)'}
      - validation_status: ${validation_status || '(not provided, will default to pending)'}
      - priority: ${priority || '(not provided, will default to medium)'}`);

    try {
      const documentData = {
        title,
        file_url,
        file_type,
        intake_method,
        ministry,
        workspace_id: workspace_id || null,
        status: status || DocumentStatus.uploaded,
        confidence_score: confidence_score || null,
        extracted_data: extracted_data || null,
        validation_status: validation_status || ValidationStatus.pending,
        priority: priority || Priority.medium,
        retention_date: retention_date || null,
      };

      this.logger.debug(`Creating document with data: ${JSON.stringify(documentData, null, 2)}`);

      const result = await this.prisma.document.create({
        data: documentData,
        include: { workspace: true },
      });

      this.logger.debug(`Document created successfully with ID: ${result.id}`);
      this.logger.debug(`Created document: ${JSON.stringify(result, null, 2)}`);
      this.logger.debug('=== createDocument completed ===');

      return result;
    } catch (error) {
      this.logger.error('=== createDocument ERROR ===');
      this.logger.error(`Error creating document: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      this.logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);
      this.logger.error('=== createDocument ERROR END ===');
      throw error;
    }
  }

  @Mutation(() => Document, { nullable: true })
  async updateDocument(
    @Args('id', { type: () => ID }) id: string,
    @Args('title', { nullable: true }) title?: string,
    @Args('status', { type: () => DocumentStatus, nullable: true })
    status?: DocumentStatus,
    @Args('confidence_score', { type: () => Float, nullable: true })
    confidence_score?: number,
    @Args('extracted_data', { type: () => GraphQLJSON, nullable: true }) extracted_data?: any,
    @Args('validation_status', { type: () => ValidationStatus, nullable: true })
    validation_status?: ValidationStatus,
    @Args('priority', { type: () => Priority, nullable: true }) priority?: Priority,
    @Args('retention_date', { nullable: true }) retention_date?: Date,
  ): Promise<Document | null> {
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (status !== undefined) updateData.status = status;
    if (confidence_score !== undefined)
      updateData.confidence_score = confidence_score;
    if (extracted_data !== undefined)
      updateData.extracted_data = extracted_data || null;
    if (validation_status !== undefined)
      updateData.validation_status = validation_status;
    if (priority !== undefined) updateData.priority = priority;
    if (retention_date !== undefined) updateData.retention_date = retention_date;

    return this.prisma.document.update({
      where: { id },
      data: updateData,
      include: { workspace: true },
    });
  }

  @Mutation(() => Boolean)
  async deleteDocument(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    try {
      await this.prisma.document.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }
}

