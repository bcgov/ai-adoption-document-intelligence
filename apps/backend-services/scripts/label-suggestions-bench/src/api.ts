import type { AnalysisResponse } from "../../../src/ocr/azure-types";
import type { BenchSettings } from "./config";

export interface BenchDocument {
  labeling_document_id: string;
  labeling_document: {
    status: string;
    original_filename: string;
    ocr_result?: AnalysisResponse | null;
  };
}

export interface BenchLabelSuggestion {
  field_key: string;
  element_ids: string[];
}

export interface BenchSuggestedField {
  field_key: string;
  field_type: string;
  description: string;
  value: string | null;
  page_number: number | null;
  already_exists: boolean;
}

/** The backend allows 100 requests per 60 s; keep under it. */
const MIN_GAP_MS = 700;

export class BenchApi {
  private lastRequestAt = 0;

  constructor(private readonly settings: BenchSettings) {}

  listTemplateModels(): Promise<Array<{ id: string; name: string }>> {
    return this.request(
      "GET",
      `/template-models?group_id=${encodeURIComponent(this.settings.groupId)}`,
    );
  }

  createTemplateModel(name: string): Promise<{ id: string }> {
    return this.request("POST", "/template-models", {
      name,
      group_id: this.settings.groupId,
    });
  }

  addField(
    modelId: string,
    field: {
      field_key: string;
      field_type: "string" | "selectionMark";
      description?: string;
    },
  ): Promise<{ id: string }> {
    return this.request("POST", `/template-models/${modelId}/fields`, field);
  }

  uploadDocument(
    modelId: string,
    title: string,
    originalFilename: string,
    pdf: Uint8Array,
  ): Promise<{ labelingDocument: { id: string; status: string } }> {
    return this.request("POST", `/template-models/${modelId}/upload`, {
      title,
      file: Buffer.from(pdf).toString("base64"),
      file_type: "pdf",
      original_filename: originalFilename,
      group_id: this.settings.groupId,
    });
  }

  listDocuments(modelId: string): Promise<BenchDocument[]> {
    return this.request("GET", `/template-models/${modelId}/documents`);
  }

  suggestLabels(
    modelId: string,
    documentId: string,
  ): Promise<BenchLabelSuggestion[]> {
    return this.request(
      "POST",
      `/template-models/${modelId}/documents/${documentId}/suggestions`,
      {},
    );
  }

  suggestFields(
    modelId: string,
    documentId: string,
  ): Promise<BenchSuggestedField[]> {
    return this.request(
      "POST",
      `/template-models/${modelId}/field-suggestions`,
      {
        document_id: documentId,
      },
    );
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const wait = this.lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();

    const response = await fetch(`${this.settings.backendUrl}/api${path}`, {
      method,
      headers: {
        "x-api-key": this.settings.apiKey,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!response.ok) {
      const message =
        typeof parsed === "object" && parsed !== null && "message" in parsed
          ? String((parsed as { message: unknown }).message)
          : text.slice(0, 200);
      throw new Error(
        `${method} ${path} failed with ${response.status}: ${message}`,
      );
    }
    return parsed as T;
  }
}
