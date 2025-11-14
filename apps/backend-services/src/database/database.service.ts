import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DocumentData {
  id?: string;
  title: string;
  original_filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  metadata?: Record<string, any>;
  source: string;
  status: 'pending' | 'processed' | 'failed';
  created_at?: Date;
  updated_at?: Date;
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly databaseApiUrl: string;

  constructor(private configService: ConfigService) {
    this.databaseApiUrl =
      this.configService.get<string>('DATABASE_API_URL') ||
      'http://localhost:3001/api/documents';
    this.logger.log(`Database API URL: ${this.databaseApiUrl}`);
  }

  async createDocument(data: Omit<DocumentData, 'id' | 'created_at' | 'updated_at'>): Promise<DocumentData> {
    this.logger.debug('=== DatabaseService.createDocument (STUBBED) ===');
    this.logger.debug(`Would POST to: ${this.databaseApiUrl}`);
    this.logger.debug(`Payload: ${JSON.stringify(data, null, 2)}`);

    // Stubbed implementation - logs the API call
    // In real implementation, this would make an HTTP POST request:
    // const response = await fetch(this.databaseApiUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(data),
    // });
    // return await response.json();

    // Return stubbed response
    const stubbedResponse: DocumentData = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...data,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.logger.debug(`Stubbed response: ${JSON.stringify(stubbedResponse, null, 2)}`);
    this.logger.debug('=== DatabaseService.createDocument completed ===');

    return stubbedResponse;
  }

  async findDocument(id: string): Promise<DocumentData | null> {
    this.logger.debug('=== DatabaseService.findDocument (STUBBED) ===');
    this.logger.debug(`Would GET: ${this.databaseApiUrl}/${id}`);

    // Stubbed implementation - logs the API call
    // In real implementation, this would make an HTTP GET request:
    // const response = await fetch(`${this.databaseApiUrl}/${id}`);
    // if (!response.ok) return null;
    // return await response.json();

    this.logger.debug('=== DatabaseService.findDocument completed (returning null) ===');
    return null;
  }

  async updateDocument(
    id: string,
    data: Partial<Omit<DocumentData, 'id' | 'created_at'>>,
  ): Promise<DocumentData | null> {
    this.logger.debug('=== DatabaseService.updateDocument (STUBBED) ===');
    this.logger.debug(`Would PATCH: ${this.databaseApiUrl}/${id}`);
    this.logger.debug(`Payload: ${JSON.stringify(data, null, 2)}`);

    // Stubbed implementation - logs the API call
    // In real implementation, this would make an HTTP PATCH request:
    // const response = await fetch(`${this.databaseApiUrl}/${id}`, {
    //   method: 'PATCH',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(data),
    // });
    // if (!response.ok) return null;
    // return await response.json();

    this.logger.debug('=== DatabaseService.updateDocument completed (returning null) ===');
    return null;
  }

  async findOcrResult(documentId: string): Promise<any | null> {
    this.logger.debug('=== DatabaseService.findOcrResult (STUBBED) ===');
    this.logger.debug(`Would GET: ${this.databaseApiUrl}/${documentId}/ocr`);

    // Stubbed implementation - logs the API call
    // In real implementation, this would make an HTTP GET request:
    // const response = await fetch(`${this.databaseApiUrl}/${documentId}/ocr`);
    // if (!response.ok) return null;
    // return await response.json();

    // Return stubbed OCR result
    const stubbedOcrResult = {
      documentId,
      status: 'success',
      extractedText: `[Stub] Extracted text for document ${documentId}`,
      pages: [
        {
          pageNumber: 1,
          text: `[Stub] Page 1 text for document ${documentId}`,
          words: [
            {
              text: 'Sample',
              boundingBox: [10, 20, 100, 30],
              confidence: 95,
            },
            {
              text: 'text',
              boundingBox: [110, 20, 150, 30],
              confidence: 92,
            },
          ],
          lines: [],
        },
      ],
      metadata: {
        modelId: 'prebuilt-read',
        processedBy: 'stub',
      },
      processedAt: new Date(),
    };

    this.logger.debug(`Stubbed OCR result: ${JSON.stringify(stubbedOcrResult, null, 2)}`);
    this.logger.debug('=== DatabaseService.findOcrResult completed ===');

    return stubbedOcrResult;
  }
}

