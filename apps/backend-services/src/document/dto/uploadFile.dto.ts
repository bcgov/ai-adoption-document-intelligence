import { IsString, IsNotEmpty } from "class-validator";

export class UploadFileDto {
  @IsString()
  @IsNotEmpty()
  title: string;
}
