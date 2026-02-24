import { ApiProperty } from "@nestjs/swagger";

export class ApiKeyInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  keyPrefix: string;

  @ApiProperty({ required: false })
  userEmail?: string;

  @ApiProperty({
    description:
      "Roles inherited from the user table",
    type: [String],
    required: false,
  })
  roles?: string[];

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
