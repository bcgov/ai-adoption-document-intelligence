import type { Prisma } from "@generated/client";

export type LabelingDocumentData = {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  metadata?: Record<string, unknown> | null;
  source: string;
  status: import("@generated/client").DocumentStatus;
  created_at: Date;
  updated_at: Date;
  apim_request_id?: string | null;
  model_id: string;
  ocr_result?: Prisma.JsonValue | null;
  group_id: string;
};
