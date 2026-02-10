import { ApiProperty } from "@nestjs/swagger";

export class UploadClassifierDocumentsResponseDto {
  @ApiProperty({ example: "Received files and data." })
  message: string;

  @ApiProperty({ example: 2 })
  fileCount: number;

  @ApiProperty({ type: [Object], example: [] })
  results: any[];
}

export class DeleteClassifierDocumentsResponseDto {}

export class RequestClassifierTrainingResponseDto {
  @ApiProperty({ example: "Training started" })
  message?: string;
  // Add more fields as needed based on actual return
}

export class RequestClassificationResponseDto {
  @ApiProperty({ example: "Classification complete" })
  status: string;

  @ApiProperty({ example: "result content" })
  content: string;

  @ApiProperty({ required: false })
  error?: any;
}

export class GetClassificationResultResponseDto {
  @ApiProperty({ example: "result content" })
  content: string;

  @ApiProperty({ example: "succeeded" })
  status: string;

  @ApiProperty({ required: false })
  error?: any;
}

export class GetTrainingResultResponseDto {
  @ApiProperty({ example: "READY" })
  status: string;

  @ApiProperty({ required: false })
  error?: any;
}
