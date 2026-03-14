import { GroupRole } from "@generated/client";
import {
  ForbiddenException,
  Injectable,
  ConflictException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";
import { AppLoggerService } from "../logging/app-logger.service";

interface BootstrapStatusResponse {
  needed: boolean;
  eligible: boolean;
}

interface BootstrapResult {
  groupId: string;
  groupName: string;
}

@Injectable()
export class BootstrapService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Checks whether bootstrap is needed (zero system admins exist) and whether
   * the given user's email matches BOOTSTRAP_ADMIN_EMAIL.
   */
  async getBootstrapStatus(
    userEmail: string | undefined,
  ): Promise<BootstrapStatusResponse> {
    const needed = await this.isBootstrapNeeded();
    if (!needed) {
      return { needed: false, eligible: false };
    }

    const bootstrapEmail = this.configService.get<string>(
      "BOOTSTRAP_ADMIN_EMAIL",
    );
    const eligible =
      !!bootstrapEmail &&
      !!userEmail &&
      bootstrapEmail.toLowerCase() === userEmail.toLowerCase();

    return { needed, eligible };
  }

  /**
   * Performs the bootstrap: promotes the user to system admin, creates a
   * "Default" group, and assigns the user as group admin.
   *
   * Guards:
   * - Bootstrap must be needed (zero admins exist)
   * - User's email must match BOOTSTRAP_ADMIN_EMAIL
   */
  async performBootstrap(
    userId: string,
    userEmail: string | undefined,
  ): Promise<BootstrapResult> {
    const needed = await this.isBootstrapNeeded();
    if (!needed) {
      throw new ConflictException(
        "Bootstrap has already been completed — a system admin exists",
      );
    }

    const bootstrapEmail = this.configService.get<string>(
      "BOOTSTRAP_ADMIN_EMAIL",
    );
    if (
      !bootstrapEmail ||
      !userEmail ||
      bootstrapEmail.toLowerCase() !== userEmail.toLowerCase()
    ) {
      throw new ForbiddenException(
        "Your email does not match the configured bootstrap admin email",
      );
    }

    // Promote user to system admin
    await this.databaseService.prisma.user.update({
      where: { id: userId },
      data: { is_system_admin: true },
    });

    // Create "Default" group
    const group = await this.databaseService.prisma.group.create({
      data: {
        name: "Default",
        description: "Initial group created during system setup",
        created_by: userId,
      },
    });

    // Assign user as group admin
    await this.databaseService.prisma.userGroup.create({
      data: {
        user_id: userId,
        group_id: group.id,
        role: GroupRole.ADMIN,
      },
    });

    await this.auditService.recordEvent({
      event_type: "system_bootstrap",
      resource_type: "system",
      resource_id: "bootstrap",
      actor_id: userId,
      group_id: group.id,
      payload: {
        user_email: userEmail,
        group_name: group.name,
      },
    });

    this.logger.log("System bootstrap completed", {
      userId,
      userEmail,
      groupId: group.id,
      groupName: group.name,
    });

    return { groupId: group.id, groupName: group.name };
  }

  private async isBootstrapNeeded(): Promise<boolean> {
    const adminCount = await this.databaseService.prisma.user.count({
      where: { is_system_admin: true },
    });
    return adminCount === 0;
  }
}
