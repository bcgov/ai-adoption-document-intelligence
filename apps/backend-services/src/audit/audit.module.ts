import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { AuditService } from "./audit.service";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
