import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

@Global()
@Module({
  imports: [],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
