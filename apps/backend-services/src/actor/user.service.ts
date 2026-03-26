import { User, UserGroup } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { UserDbService } from "./user-db.service";

@Injectable()
export class UserService {
  constructor(private readonly userDb: UserDbService) {}

  /**
   * Returns true/false depending on user's system admin status.
   * @param userId - The user's id
   * @returns Promise<boolean> indicating user's system admin status
   */
  async isUserAdmin(userId: string): Promise<boolean> {
    return await this.userDb.isUserSystemAdmin(userId);
  }

  /**
   * Upserts a user by sub and email.
   * @param sub - The user's Keycloak-provided sub
   * @param email - The user's email
   * @returns Promise<User> The upserted user record
   */
  async upsertUser(sub: string, email: string): Promise<User> {
    return await this.userDb.upsertUser(sub, email);
  }

  /**
   * Finds a user and includes their groups.
   * @param userId - The user's id
   * @returns Promise<User & { userGroups: UserGroup[] } | null> The user with groups, or null if not found
   */
  async findUserWithGroups(
    userId: string,
  ): Promise<(User & { userGroups: UserGroup[] }) | null> {
    return await this.userDb.findUser(userId, true);
  }
}
