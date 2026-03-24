import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import { UserDbService } from "./user-db.service";

@Injectable()
export class UserService {
  constructor(
    private readonly userDb: UserDbService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Returns true/false depending no user's system admin status.
   * @param userId A user's id
   * @returns A boolean value indicating user's system admin status
   */
  async isUserAdmin(userId){
    return await this.userDb.isUserSystemAdmin(userId);
  }

  async upsertUser(sub: string, email: string) {
    return await this.userDb.upsertUser(sub, email);
  }

  async findUserWithGroups(userId){
    return await this.userDb.findUser(userId, true)
  }
}
