import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import { UserDbService } from "./user-db.service";

@Injectable()
export class UserService {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly userDbService: UserDbService,
  ) {}

  async getUserWithGroups(sub: string) {
    return await this.userDbService.getUser(sub, true);
  }

  async upsertUser(sub: string, email: string) {
    return await this.userDbService.upsertUser(sub, email);
  }
}
