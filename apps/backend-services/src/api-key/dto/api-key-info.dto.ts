import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class GenerateApiKeyRequestDto {
  @ApiProperty({
    description: "The ID of the group this API key should be scoped to",
  })
  @IsString()
  @IsNotEmpty()
  groupId: string;
}

export class ApiKeyInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  keyPrefix: string;

  @ApiProperty({ required: false })
  userEmail?: string;

  @ApiProperty({
    description: "Roles inherited from the user table",
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
