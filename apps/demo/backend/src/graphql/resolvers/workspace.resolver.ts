import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { Workspace } from '../models/workspace.model';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Ministry,
  WorkspaceStatus,
  AccessLevel,
  RetentionPolicy,
} from '@prisma/client';

@Resolver(() => Workspace)
export class WorkspaceResolver {
  private readonly logger = new Logger(WorkspaceResolver.name);

  constructor(private prisma: PrismaService) {}

  @Query(() => [Workspace])
  async workspaces(): Promise<Workspace[]> {
    return this.prisma.workspace.findMany({
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => Workspace, { nullable: true })
  async workspace(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Workspace | null> {
    return this.prisma.workspace.findUnique({
      where: { id },
      include: { documents: true },
    });
  }

  @Mutation(() => Workspace)
  async createWorkspace(
    @Args('name') name: string,
    @Args('ministry', { type: () => Ministry }) ministry: Ministry,
    @Args('description', { nullable: true }) description?: string,
    @Args('status', { type: () => WorkspaceStatus, nullable: true })
    status?: WorkspaceStatus,
    @Args('intake_methods', { type: () => [String], nullable: true })
    intake_methods?: string[],
    @Args('retention_policy', { type: () => RetentionPolicy, nullable: true })
    retention_policy?: RetentionPolicy,
    @Args('access_level', { type: () => AccessLevel, nullable: true })
    access_level?: AccessLevel,
  ): Promise<Workspace> {
    this.logger.debug('=== createWorkspace called ===');
    this.logger.debug(`Received parameters:
      - name: ${name}
      - ministry: ${ministry}
      - description: ${description || '(not provided)'}
      - status: ${status || '(not provided, will default to active)'}
      - intake_methods: ${JSON.stringify(intake_methods) || '(not provided, will default to [])'}
      - retention_policy: ${retention_policy || '(not provided, will default to seven_years)'}
      - access_level: ${access_level || '(not provided, will default to internal)'}`);

    try {
      const workspaceData = {
        name,
        ministry,
        description,
        status: status || WorkspaceStatus.active,
        intake_methods: intake_methods || [],
        retention_policy: retention_policy || RetentionPolicy.seven_years,
        access_level: access_level || AccessLevel.internal,
      };

      this.logger.debug(`Creating workspace with data: ${JSON.stringify(workspaceData, null, 2)}`);

      const result = await this.prisma.workspace.create({
        data: workspaceData,
      });

      this.logger.debug(`Workspace created successfully with ID: ${result.id}`);
      this.logger.debug(`Created workspace: ${JSON.stringify(result, null, 2)}`);
      this.logger.debug('=== createWorkspace completed ===');

      return result;
    } catch (error) {
      this.logger.error('=== createWorkspace ERROR ===');
      this.logger.error(`Error creating workspace: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      this.logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);
      this.logger.error('=== createWorkspace ERROR END ===');
      throw error;
    }
  }

  @Mutation(() => Workspace, { nullable: true })
  async updateWorkspace(
    @Args('id', { type: () => ID }) id: string,
    @Args('name', { nullable: true }) name?: string,
    @Args('description', { nullable: true }) description?: string,
    @Args('status', { type: () => WorkspaceStatus, nullable: true })
    status?: WorkspaceStatus,
    @Args('intake_methods', { type: () => [String], nullable: true })
    intake_methods?: string[],
    @Args('retention_policy', { type: () => RetentionPolicy, nullable: true })
    retention_policy?: RetentionPolicy,
    @Args('access_level', { type: () => AccessLevel, nullable: true })
    access_level?: AccessLevel,
  ): Promise<Workspace | null> {
    return this.prisma.workspace.update({
      where: { id },
      data: {
        name,
        description,
        status,
        intake_methods,
        retention_policy,
        access_level,
      },
      include: { documents: true },
    });
  }

  @Mutation(() => Boolean)
  async deleteWorkspace(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    try {
      await this.prisma.workspace.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }
}





