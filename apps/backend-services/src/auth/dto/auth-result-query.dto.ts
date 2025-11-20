import { IsUUID } from "class-validator";

export class AuthResultQueryDto {
  @IsUUID("4")
  result!: string;
}

