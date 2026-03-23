import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditDbService } from "./audit-db.service";

@Global()
@Module({
  imports: [],
  providers: [AuditDbService, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
