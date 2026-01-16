import { ApiProperty } from "@nestjs/swagger";

export class ApiKeyInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  keyPrefix: string;

  @ApiProperty()
  userEmail: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: Date })
  lastUsed: Date | null;
}

export class GeneratedApiKeyDto extends ApiKeyInfoDto {
  @ApiProperty()
  key: string; // Full key, only returned once at creation
}

export class ApiKeyInfoWrapperDto {
  @ApiProperty({ type: ApiKeyInfoDto })
  apiKey: ApiKeyInfoDto | null;
}

export class GeneratedApiKeyWrapperDto {
  @ApiProperty({ type: GeneratedApiKeyDto })
  apiKey: GeneratedApiKeyDto | null;
}
