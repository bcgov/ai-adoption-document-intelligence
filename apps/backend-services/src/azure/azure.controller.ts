import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";
import { AzureService } from "@/azure/azure.service";
import { Public } from "@/auth/public.decorator";
import { ClassifierService } from "@/azure/classifier.service";

// @ApiTags("OCR")
@Controller("api/azure")
export class AzureController {

  constructor(
    private configService: ConfigService, 
    private readonly azureService: AzureService,
    private readonly classifierServie: ClassifierService,
  ) {

  }

  @Get("")
  @Public()
  async test() {
    return await new Promise((resolve, reject) => {
      this.azureService.pollOperationUntilResolved(
        "https://ai-services-hub-test-apim.azure-api.net/sdpr-invoice-automation/documentintelligence/documentClassifiers/monthly-report-classifier/analyzeResults/41c963ab-2f86-4ab8-8262-418e502a6f02?api-version=2024-11-30",
        (r) => resolve(r),
        (err) => reject(err)
      );
    });
  }

  // Request Training

  // Upload Training documents

  // Remove training documents

  // Request Classification

  // Check Classification status

  // Check Training status

  // Update training configuration
}
