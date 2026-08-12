import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { GroupBillingConfigDto } from "./dto/group-billing-config.dto";

/**
 * Service for managing group billing configuration, including monthly spending caps.
 */
@Injectable()
export class BillingConfigService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Retrieves the billing configuration for a group.
   * Returns null if no configuration row exists.
   *
   * @param groupId - The group ID to look up.
   * @returns The billing config record or null.
   */
  async getBillingConfig(
    groupId: string,
  ): Promise<GroupBillingConfigDto | null> {
    const config =
      await this.prismaService.prisma.groupBillingConfig.findUnique({
        where: { group_id: groupId },
      });
    if (!config) return null;
    return this.toDto(config);
  }

  /**
   * Creates or updates a group's monthly spending cap.
   *
   * @param groupId - The group to configure.
   * @param monthlyCap - The new cap in dollars, or null to remove the cap.
   * @param configuredBy - Actor ID of the platform admin making the change.
   * @returns The upserted billing config DTO.
   * @throws {NotFoundException} If the group does not exist.
   */
  async upsertBillingCap(
    groupId: string,
    monthlyCap: number | null | undefined,
    configuredBy: string,
  ): Promise<GroupBillingConfigDto> {
    const group = await this.prismaService.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }

    const capValue = monthlyCap === undefined ? null : monthlyCap;
    const config = await this.prismaService.transaction(async (tx) => {
      await this.auditService.recordEvent(
        {
          event_type: "billing_cap_update",
          resource_type: "billing",
          resource_id: "",
          actor_id: configuredBy,
          group_id: groupId,
          payload: { monthlyCap },
        },
        tx,
      );
      return await tx.groupBillingConfig.upsert({
        where: { group_id: groupId },
        create: {
          group_id: groupId,
          monthly_cap_dollars: capValue,
          cap_configured_by: configuredBy,
          cap_configured_at: new Date(),
        },
        update: {
          monthly_cap_dollars: capValue,
          cap_configured_by: configuredBy,
          cap_configured_at: new Date(),
        },
      });
    });

    return this.toDto(config);
  }

  /**
   * Maps a Prisma GroupBillingConfig record to the response DTO.
   *
   * @param config - Raw Prisma record.
   * @returns The DTO representation.
   */
  private toDto(config: {
    id: string;
    group_id: string;
    monthly_cap_dollars: { toNumber: () => number } | null;
    cap_configured_by: string | null;
    cap_configured_at: Date | null;
    created_at: Date;
  }): GroupBillingConfigDto {
    return {
      id: config.id,
      group_id: config.group_id,
      monthly_cap_dollars:
        config.monthly_cap_dollars !== null
          ? config.monthly_cap_dollars.toNumber()
          : null,
      cap_configured_by: config.cap_configured_by,
      cap_configured_at: config.cap_configured_at,
      created_at: config.created_at,
    };
  }
}
