export class TrainedModelDto {
  id: string;
  projectId: string;
  trainingJobId: string;
  modelId: string;
  description?: string;
  docTypes?: Record<string, unknown>;
  fieldCount: number;
  createdAt: Date;
}
