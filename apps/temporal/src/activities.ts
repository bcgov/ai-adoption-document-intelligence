/**
 * Temporal Activities for OCR Workflow
 * Activities handle non-deterministic operations (HTTP calls, file processing)
 */

// Load environment variables first (before reading them)
require('dotenv').config();

import axios, { AxiosResponse } from 'axios';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@generated/client';
import { getPrismaPgOptions } from './utils/database-url';
import type {
  PreparedFileData,
  SubmissionResult,
  PollResult,
  OCRResponse,
  OCRResult,
  OCRWorkflowInput,
} from './types';
import type { GraphWorkflowConfig } from './graph-workflow-types';

// Initialize Prisma client (singleton pattern)
let prismaClient: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const dbOptions = getPrismaPgOptions(databaseUrl);
    prismaClient = new PrismaClient({
      adapter: new PrismaPg(dbOptions),
      log: ['error', 'warn'],
    });
  }
  return prismaClient;
}

const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

/**
 * Normalize endpoint URL by removing trailing slash
 */
function normalizeEndpoint(url: string | undefined): string {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Activity: Prepare file data for Azure OCR
 * Validates binary data and extracts metadata
 */
export async function prepareFileData(input: OCRWorkflowInput): Promise<PreparedFileData> {
  const activityName = 'prepareFileData';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId: input.documentId,
    fileName: input.fileName || 'not provided',
    fileType: input.fileType || 'not provided',
    contentType: input.contentType || 'not provided',
    binaryDataLength: input.binaryData?.length || 0,
    timestamp: new Date().toISOString()
  }));

  let fileName = input.fileName || 'document';
  let fileType: 'pdf' | 'image' = input.fileType || 'pdf';
  let contentType = input.contentType || 'application/pdf';
  const binaryData = input.binaryData;

  if (!binaryData || typeof binaryData !== 'string') {
    throw new Error('No binary data provided. Binary data must be a base64-encoded string.');
  }

  // Validate base64 format
  try {
    Buffer.from(binaryData, 'base64');
  } catch (error) {
    throw new Error('Invalid base64-encoded binary data');
  }

  // Determine file type from filename or content type
  const lowerFileName = fileName.toLowerCase();
  if (contentType.includes('pdf') || lowerFileName.endsWith('.pdf')) {
    fileType = 'pdf';
    contentType = 'application/pdf';
  } else if (
    contentType.includes('image') ||
    lowerFileName.match(/\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i)
  ) {
    fileType = 'image';
    if (!contentType || contentType === 'application/pdf') {
      if (lowerFileName.endsWith('.png')) {
        contentType = 'image/png';
      } else if (lowerFileName.match(/\.(jpg|jpeg)$/i)) {
        contentType = 'image/jpeg';
      } else if (lowerFileName.endsWith('.gif')) {
        contentType = 'image/gif';
      } else {
        contentType = contentType || 'image/jpeg';
      }
    }
  }

  // Validate PDF signature if it's supposed to be a PDF
  if (fileType === 'pdf' || contentType.includes('pdf')) {
    try {
      const buffer = Buffer.from(binaryData, 'base64');
      const pdfSignature = buffer.slice(0, 4).toString();
      if (pdfSignature !== '%PDF' && buffer.length > 4) {
        console.warn(JSON.stringify({
          activity: activityName,
          event: 'warn',
          documentId: input.documentId,
          fileName,
          warning: 'File does not have valid PDF signature',
          pdfSignature,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (e) {
      console.warn(JSON.stringify({
        activity: activityName,
        event: 'warn',
        documentId: input.documentId,
        fileName,
        warning: 'Could not validate PDF signature',
        error: e instanceof Error ? e.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }));
    }
  }

  // Get modelId from input, default to "prebuilt-layout"
  const modelId = input.modelId || 'prebuilt-layout';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'complete',
    documentId: input.documentId,
    fileName,
    fileType,
    contentType,
    modelId,
    binaryDataLength: binaryData.length,
    timestamp: new Date().toISOString()
  }));

  return {
    fileName,
    fileType,
    contentType,
    binaryData,
    modelId
  };
}

/**
 * Activity: Submit document to Azure Document Intelligence OCR API
 * Returns serializable response data with headers including apim-request-id
 */
export async function submitToAzureOCR(
  fileData: PreparedFileData
): Promise<SubmissionResult> {
  const activityName = 'submitToAzureOCR';
  const startTime = Date.now();

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    fileName: fileData.fileName,
    fileType: fileData.fileType,
    contentType: fileData.contentType,
    modelId: fileData.modelId,
    dataSize: fileData.binaryData.length,
    timestamp: new Date().toISOString()
  }));
  
  if (!endpoint || !apiKey) {
    const duration = Date.now() - startTime;
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      error: 'missing_credentials',
      message: 'Azure Document Intelligence credentials not configured',
      durationMs: duration,
      timestamp: new Date().toISOString()
    }));
    throw new Error(
      'Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.'
    );
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const modelId = fileData.modelId || 'prebuilt-layout';
  
  // Build URL - only include features param for prebuilt models
  const isPrebuiltModel = modelId.startsWith('prebuilt-') || modelId === 'prebuilt-read';
  const url = isPrebuiltModel
    ? `${normalizedEndpoint}/documentModels/${modelId}:analyze?api-version=2024-11-30&features=keyValuePairs`
    : `${normalizedEndpoint}/documentModels/${modelId}:analyze?api-version=2024-11-30`;

  try {
    const fileBuffer = Buffer.from(fileData.binaryData, 'base64');
    const response: AxiosResponse = await axios.post(url, fileBuffer, {
      headers: {
        'api-key': apiKey,
        'Content-Type': fileData.contentType
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const statusCode = response.status;
    const apimRequestId =
      response.headers['apim-request-id'] ||
      response.headers['Apim-Request-Id'] ||
      response.headers['APIM-Request-Id'] ||
      null;

    // Validate status code
    if (statusCode !== 202) {
      console.error(JSON.stringify({
        activity: activityName,
        event: 'error',
        error: 'unexpected_status_code',
        statusCode,
        expectedStatusCode: 202,
        responseData: response.data,
        timestamp: new Date().toISOString()
      }));
      throw new Error(
        `Failed to submit document to Azure OCR. Expected status code 202, got ${statusCode}`
      );
    }

    if (!apimRequestId) {
      console.error(JSON.stringify({
        activity: activityName,
        event: 'error',
        error: 'missing_apim_request_id',
        availableHeaders: Object.keys(response.headers),
        timestamp: new Date().toISOString()
      }));
      throw new Error('APIM Request ID not found in response headers');
    }

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      statusCode,
      apimRequestId,
      timestamp: new Date().toISOString()
    }));

    // Return serializable result
    return {
      statusCode,
      apimRequestId: apimRequestId as string,
      headers: response.headers as Record<string, string | string[]>
    };
  } catch (error) {
    const errorDetails: any = {
      activity: activityName,
      event: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };

    if (axios.isAxiosError(error)) {
      errorDetails.axiosError = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        method: error.config?.method,
        responseData: error.response?.data
      };
    }

    if (error instanceof Error && error.stack) {
      errorDetails.stack = error.stack;
    }

    console.error(JSON.stringify(errorDetails));
    throw error;
  }
}

/**
 * Activity: Poll Azure Document Intelligence for OCR results
 * Returns status and full response if available
 */
export async function pollOCRResults(
  apimRequestId: string,
  modelId: string
): Promise<PollResult> {
  const activityName = 'pollOCRResults';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    apimRequestId,
    modelId,
    timestamp: new Date().toISOString()
  }));
  
  if (!endpoint || !apiKey) {
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      apimRequestId,
      modelId,
      error: 'missing_credentials',
      message: 'Azure Document Intelligence credentials not configured',
      timestamp: new Date().toISOString()
    }));
    throw new Error(
      'Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.'
    );
  }

  if (!apimRequestId || typeof apimRequestId !== 'string') {
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      apimRequestId,
      modelId,
      error: 'invalid_apim_request_id',
      message: 'APIM Request ID not available for polling',
      timestamp: new Date().toISOString()
    }));
    throw new Error('APIM Request ID not available for polling');
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const normalizedModelId = modelId || 'prebuilt-layout';
  const url = `${normalizedEndpoint}/documentModels/${normalizedModelId}/analyzeResults/${apimRequestId}?api-version=2024-11-30`;

  try {
    const response = await axios.get<OCRResponse>(url, {
      headers: {
        'api-key': apiKey
      }
    });

    const responseBody = response.data;

    if (!responseBody) {
      console.error(JSON.stringify({
        activity: activityName,
        event: 'error',
      apimRequestId,
      error: 'empty_response_body',
      message: 'Empty response from Azure OCR polling endpoint',
      timestamp: new Date().toISOString()
      }));
      throw new Error('Empty response from Azure OCR polling endpoint');
    }

    const status = responseBody.status || 'unknown';
    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      apimRequestId,
      status,
      timestamp: new Date().toISOString()
    }));

    return {
      status: status as 'running' | 'succeeded' | 'failed',
      response: responseBody
    };
  } catch (error) {
    const errorDetails: any = {
      activity: activityName,
      event: 'error',
      apimRequestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };

    if (axios.isAxiosError(error)) {
      errorDetails.axiosError = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        responseData: error.response?.data
      };
    }

    if (error instanceof Error && error.stack) {
      errorDetails.stack = error.stack;
    }

    console.error(JSON.stringify(errorDetails));
    throw error;
  }
}

/**
 * Activity: Extract OCR results from Azure response
 * Parses and structures the OCR data
 */
export async function extractOCRResults(
  apimRequestId: string,
  fileName: string,
  fileType: string,
  modelId: string,
  ocrResponse?: OCRResponse
): Promise<OCRResult> {
  const activityName = 'extractOCRResults';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    apimRequestId,
    fileName,
    fileType,
    modelId,
    timestamp: new Date().toISOString()
  }));

  try {
    let ocrResponseObj: OCRResponse | undefined = ocrResponse;

    // If response not provided, fetch it
    if (!ocrResponseObj) {
      if (!endpoint || !apiKey) {
        throw new Error(
          'Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.'
        );
      }
      const normalizedEndpoint = normalizeEndpoint(endpoint);
      const normalizedModelId = modelId || 'prebuilt-layout';
      const url = `${normalizedEndpoint}/documentModels/${normalizedModelId}/analyzeResults/${apimRequestId}?api-version=2024-11-30`;
      const response = await axios.get<OCRResponse>(url, {
        headers: { 'api-key': apiKey }
      });
      ocrResponseObj = response.data;
    }

    if (!ocrResponseObj) {
      throw new Error('No OCR response available to extract results.');
    }

    const analyzeResult = ocrResponseObj.analyzeResult || {
      apiVersion: '',
      modelId: '',
      content: '',
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: []
    };

    const result: OCRResult = {
      success: ocrResponseObj.status === 'succeeded',
      status: ocrResponseObj.status || 'unknown',
      apimRequestId: apimRequestId || '',
      fileName: fileName || 'document',
      fileType: fileType || 'pdf',
      modelId: analyzeResult.modelId || modelId || 'prebuilt-layout',
      extractedText: analyzeResult.content || '',
      pages: analyzeResult.pages || [],
      tables: analyzeResult.tables || [],
      paragraphs: analyzeResult.paragraphs || [],
      keyValuePairs: analyzeResult.keyValuePairs || [],
      sections: analyzeResult.sections || [],
      figures: analyzeResult.figures || [],
      documents: analyzeResult.documents || [],
      processedAt: new Date().toISOString()
    };

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      apimRequestId,
      fileName,
      status: result.status,
      pagesCount: result.pages.length,
      tablesCount: result.tables.length,
      timestamp: new Date().toISOString()
    }));

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      apimRequestId,
      fileName,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}

/**
 * Activity: Update document status in database
 * Updates document status and optionally apim_request_id
 */
export async function updateDocumentStatus(
  documentId: string,
  status: string,
  apimRequestId?: string
): Promise<void> {
  const activityName = 'updateDocumentStatus';
  const startTime = Date.now();

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId,
    status,
    apimRequestId,
    timestamp: new Date().toISOString()
  }));
  
  try {
    const prisma = getPrismaClient();
    
    const updateData: any = {
      status: status as any, // Cast to DocumentStatus enum
    };
    
    if (apimRequestId) {
      updateData.apim_request_id = apimRequestId;
    }
    
    await prisma.document.update({
      where: { id: documentId },
      data: updateData,
    });

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      status,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      documentId,
      status,
      error: errorMessage,
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}

/**
 * Activity: Store document rejection data
 * Stores rejection reason, annotations, and reviewer information
 */
export async function storeDocumentRejection(
  documentId: string,
  reason: string,
  reviewer?: string,
  annotations?: string
): Promise<void> {
  const activityName = 'storeDocumentRejection';
  const startTime = Date.now();

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId,
    reason,
    reviewer,
    hasAnnotations: !!annotations,
    timestamp: new Date().toISOString()
  }));
  
  try {
    const prisma = getPrismaClient();
    // documentRejection: add DocumentRejection model to shared prisma schema and run migration when ready
    await (prisma as any).documentRejection.upsert({
      where: { document_id: documentId },
      update: {
        reason: reason as any,
        reviewer: reviewer || null,
        annotations: annotations || null,
      },
      create: {
        document_id: documentId,
        reason: reason as any,
        reviewer: reviewer || null,
        annotations: annotations || null,
      },
    });

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      reason,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      documentId,
      reason,
      error: errorMessage,
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}

/**
 * Activity: Upsert OCR result in database
 * Determines extracted fields based on model type:
 * - Custom models: use fields directly from documents[0].fields
 * - Prebuilt models: convert keyValuePairs to fields format
 */
export async function upsertOcrResult(
  documentId: string,
  ocrResult: OCRResult
): Promise<void> {
  const activityName = 'upsertOcrResult';
  const startTime = Date.now();

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId,
    fileName: ocrResult.fileName,
    modelId: ocrResult.modelId,
    status: ocrResult.status,
    keyValuePairsCount: ocrResult.keyValuePairs?.length || 0,
    documentsCount: ocrResult.documents?.length || 0,
    timestamp: new Date().toISOString()
  }));

  try {
    const prisma = getPrismaClient();

    // Convert to JSON format for database
    const asJson = (obj: any) => obj as unknown as any;

    // Determine extracted fields based on model type (matches database.service.ts logic)
    let extractedFields: Record<string, any> | null = null;

    if (ocrResult.documents && ocrResult.documents.length > 0) {
      // Custom model: use fields directly from documents[0].fields
      extractedFields = ocrResult.documents[0].fields;
      console.log(JSON.stringify({
        activity: activityName,
        event: 'fields_extracted',
        source: 'custom_model_documents',
        fieldCount: Object.keys(extractedFields).length,
        timestamp: new Date().toISOString()
      }));
    } else if (ocrResult.keyValuePairs && ocrResult.keyValuePairs.length > 0) {
      // Prebuilt model: convert keyValuePairs to fields format
      const fields: Record<string, any> = {};

      for (const pair of ocrResult.keyValuePairs) {
        const fieldName = pair.key?.content || "unknown";
        const field = {
          type: "string",
          content: pair.value?.content || null,
          confidence: pair.confidence,
          boundingRegions: pair.value?.boundingRegions || pair.key?.boundingRegions,
          spans: pair.value?.spans || pair.key?.spans,
        };

        // Handle duplicate field names by appending a suffix
        let uniqueName = fieldName;
        let counter = 1;
        while (fields[uniqueName]) {
          uniqueName = `${fieldName}_${counter}`;
          counter++;
        }

        fields[uniqueName] = field;
      }

      extractedFields = fields;
      console.log(JSON.stringify({
        activity: activityName,
        event: 'fields_extracted',
        source: 'prebuilt_model_keyValuePairs',
        keyValuePairsCount: ocrResult.keyValuePairs.length,
        fieldCount: Object.keys(extractedFields).length,
        timestamp: new Date().toISOString()
      }));
    }

    const updateObject = {
      processed_at: new Date(ocrResult.processedAt),
      keyValuePairs: asJson(extractedFields),
    };

    // Upsert OCR result
    await prisma.ocrResult.upsert({
      where: {
        document_id: documentId,
      },
      update: updateObject,
      create: {
        document_id: documentId,
        ...updateObject,
      },
    });

    // Update document status to completed_ocr
    // Note: The workflow status "awaiting_review" is used by the frontend to determine if review is needed
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'completed_ocr' as any },
    });

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      fileName: ocrResult.fileName,
      modelId: ocrResult.modelId,
      fieldCount: extractedFields ? Object.keys(extractedFields).length : 0,
      dataSize: extractedFields ? JSON.stringify(extractedFields).length : 0,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      documentId,
      error: errorMessage,
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}

/**
 * Activity: Post-OCR processing cleanup
 * Performs text cleanup including unicode/encoding fixes, dehyphenation, and number/date normalization
 */
export async function postOcrCleanup(ocrResult: OCRResult): Promise<OCRResult> {
  const activityName = 'postOcrCleanup';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    fileName: ocrResult.fileName,
    extractedTextLength: ocrResult.extractedText.length,
    timestamp: new Date().toISOString()
  }));

  try {
    // Create a deep copy of the OCR result to avoid mutating the original
    const cleanedResult: OCRResult = {
      ...ocrResult,
      extractedText: ocrResult.extractedText,
      pages: ocrResult.pages.map(page => ({ ...page })),
      paragraphs: ocrResult.paragraphs.map(para => ({ ...para })),
      tables: ocrResult.tables.map(table => ({ ...table })),
      keyValuePairs: ocrResult.keyValuePairs.map(kvp => ({ ...kvp })),
      sections: ocrResult.sections.map(section => ({ ...section })),
      figures: ocrResult.figures.map(figure => ({ ...figure }))
    };

    // Helper function to clean text
    const cleanText = (text: string): string => {
      if (!text) return text;

      let cleaned = text;

      // 1. Unicode/encoding fix
      // Normalize unicode characters (NFD to NFC)
      cleaned = cleaned.normalize('NFC');
      
      // Fix common encoding issues
      // Replace common encoding artifacts
      cleaned = cleaned
        .replace(/\u00A0/g, ' ') // Non-breaking space to regular space
        .replace(/\u200B/g, '') // Zero-width space
        .replace(/\u200C/g, '') // Zero-width non-joiner
        .replace(/\u200D/g, '') // Zero-width joiner
        .replace(/\uFEFF/g, '') // Zero-width no-break space (BOM)
        .replace(/\u2028/g, '\n') // Line separator
        .replace(/\u2029/g, '\n\n') // Paragraph separator
        .replace(/[\u2000-\u200A]/g, ' ') // Various space characters
        .replace(/\u2013/g, '-') // En dash to hyphen
        .replace(/\u2014/g, '--') // Em dash to double hyphen
        .replace(/\u2018/g, "'") // Left single quotation mark
        .replace(/\u2019/g, "'") // Right single quotation mark
        .replace(/\u201C/g, '"') // Left double quotation mark
        .replace(/\u201D/g, '"') // Right double quotation mark
        .replace(/\u2026/g, '...') // Ellipsis
        .replace(/\u00AD/g, '') // Soft hyphen (invisible hyphen)
        .replace(/[\u00A0-\u00FF]/g, (char) => {
          // Keep common Latin-1 characters, but normalize some
          const map: Record<string, string> = {
            '\u00E9': 'é',
            '\u00E8': 'è',
            '\u00E0': 'à',
            '\u00E1': 'á',
            '\u00F1': 'ñ',
            '\u00FC': 'ü',
            '\u00F6': 'ö',
            '\u00E4': 'ä',
          };
          return map[char] || char;
        });

      // 2. Dehyphenation + line join
      // Remove hyphens at end of lines and join words
      // Pattern: word-hyphen followed by newline/space and continuation
      cleaned = cleaned
        // Remove soft hyphens (already removed above, but keep for safety)
        .replace(/\u00AD/g, '')
        // Handle hyphenated words split across lines
        // Pattern: word- followed by whitespace and lowercase letter
        .replace(/([a-zA-Z])-\s+([a-z])/g, '$1$2')
        // Handle hyphenated words split across lines with newlines
        .replace(/([a-zA-Z])-\n\s*([a-z])/g, '$1$2')
        // Handle hyphenated words with multiple spaces
        .replace(/([a-zA-Z])-\s{2,}([a-z])/g, '$1$2')
        // Clean up multiple consecutive spaces
        .replace(/\s{2,}/g, ' ')
        // Clean up spaces around newlines
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n');

      // 3. Number/date cleanup
      // Normalize number formats
      cleaned = cleaned
        // Fix common OCR number errors (O vs 0, I vs 1, l vs 1 in number contexts)
        // This is conservative - only fix obvious cases
        .replace(/([^a-zA-Z])O(?=\d)/g, '$10') // O before digit -> 0
        .replace(/(\d)O(?=[^a-zA-Z0-9])/g, '$10') // O after digit -> 0
        // Normalize date separators
        .replace(/(\d{1,2})[.\s]+(\d{1,2})[.\s]+(\d{2,4})/g, (_match, d, m, y) => {
          // Normalize dates - keep format but normalize separators
          return `${d}/${m}/${y}`;
        })
        // Normalize time separators
        .replace(/(\d{1,2})[.\s]+(\d{2})[.\s]*([ap]m)?/gi, (_match, h, m, ampm) => {
          return ampm ? `${h}:${m} ${ampm}` : `${h}:${m}`;
        })
        // Fix common decimal point issues (comma to period in number contexts)
        .replace(/(\d),(\d)/g, (match, before, after) => {
          // Only replace if it looks like a decimal (not thousands separator)
          // If after has 1-2 digits, likely decimal; if 3+, likely thousands
          if (after.length <= 2) {
            return `${before}.${after}`;
          }
          return match;
        })
        // Normalize currency formats
        .replace(/([£$€¥])\s*(\d)/g, '$1$2') // Remove space after currency symbol
        .replace(/(\d)\s*([£$€¥])/g, '$1$2'); // Remove space before currency symbol

      return cleaned;
    };

    // Clean extracted text
    cleanedResult.extractedText = cleanText(cleanedResult.extractedText);

    // Clean text in pages (words and lines)
    cleanedResult.pages = cleanedResult.pages.map(page => ({
      ...page,
      words: page.words.map(word => ({
        ...word,
        content: cleanText(word.content)
      })),
      lines: page.lines.map(line => ({
        ...line,
        content: cleanText(line.content)
      }))
    }));

    // Clean text in paragraphs
    cleanedResult.paragraphs = cleanedResult.paragraphs.map(para => ({
      ...para,
      content: cleanText(para.content)
    }));

    // Clean text in table cells
    cleanedResult.tables = cleanedResult.tables.map(table => ({
      ...table,
      cells: table.cells.map(cell => ({
        ...cell,
        content: cleanText(cell.content)
      }))
    }));

    // Clean text in key-value pairs
    cleanedResult.keyValuePairs = cleanedResult.keyValuePairs.map(kvp => ({
      ...kvp,
      key: {
        ...kvp.key,
        content: cleanText(kvp.key.content)
      },
      value: kvp.value ? {
        ...kvp.value,
        content: cleanText(kvp.value.content)
      } : undefined
    }));

    // Clean text in sections
    cleanedResult.sections = cleanedResult.sections.map(section => ({
      ...section,
      content: cleanText(section.content)
    }));

    // Clean text in figures
    cleanedResult.figures = cleanedResult.figures.map(figure => ({
      ...figure,
      content: cleanText(figure.content)
    }));

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      fileName: cleanedResult.fileName,
      originalTextLength: ocrResult.extractedText.length,
      cleanedTextLength: cleanedResult.extractedText.length,
      timestamp: new Date().toISOString()
    }));

    return cleanedResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      fileName: ocrResult.fileName,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    // Return original result if cleanup fails
    return ocrResult;
  }
}

/**
 * Activity: Calculate OCR confidence and prepare for human review if needed
 * Returns average confidence and whether human review is required
 */
export async function checkOcrConfidence(
  documentId: string,
  ocrResult: OCRResult,
  confidenceThreshold: number = 0.95
): Promise<{ averageConfidence: number; requiresReview: boolean }> {
  const activityName = 'checkOcrConfidence';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId,
    fileName: ocrResult.fileName,
    confidenceThreshold,
    timestamp: new Date().toISOString()
  }));

  try {
    // Calculate average confidence from words
    let totalConfidence = 0;
    let wordCount = 0;

    for (const page of ocrResult.pages) {
      for (const word of page.words) {
        if (word.confidence !== undefined && word.confidence !== null) {
          totalConfidence += word.confidence;
          wordCount++;
        }
      }
    }

    // Also consider key-value pair confidence
    for (const kvp of ocrResult.keyValuePairs) {
      if (kvp.confidence !== undefined && kvp.confidence !== null) {
        totalConfidence += kvp.confidence;
        wordCount++;
      }
    }

    // Calculate average (confidence is typically 0-1, but Azure might return 0-100)
    const averageConfidence = wordCount > 0 ? totalConfidence / wordCount : 1.0;
    
    // Normalize to 0-1 range if it appears to be in 0-100 range
    const normalizedConfidence = averageConfidence > 1 ? averageConfidence / 100 : averageConfidence;
    
    const requiresReview = normalizedConfidence < confidenceThreshold;

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      fileName: ocrResult.fileName,
      averageConfidence: normalizedConfidence,
      requiresReview,
      wordCount,
      timestamp: new Date().toISOString()
    }));

    // Update document status if review is required
    // Note: We keep status as 'ongoing_ocr' since the workflow is still in progress
    // The workflow itself tracks the 'awaiting_review' state separately
    if (requiresReview) {
      const prisma = getPrismaClient();
      await prisma.document.update({
        where: { id: documentId },
        data: { 
          status: 'ongoing_ocr',
        },
      });

      console.log(JSON.stringify({
        activity: activityName,
        event: 'status_updated',
        documentId,
        status: 'ongoing_ocr',
        requiresReview: true,
        timestamp: new Date().toISOString()
      }));
    }

    return {
      averageConfidence: normalizedConfidence,
      requiresReview
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      documentId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    // Default to requiring review if we can't calculate confidence
    return {
      averageConfidence: 0,
      requiresReview: true
    };
  }
}

/**
 * Activity: Load a graph workflow config by ID
 *
 * Used by childWorkflow nodes to load library workflows from the database.
 */
export async function getWorkflowGraphConfig(input: {
  workflowId: string;
}): Promise<{ graph: GraphWorkflowConfig }> {
  const prisma = getPrismaClient();
  const workflow = await prisma.workflow.findUnique({
    where: { id: input.workflowId },
    select: { config: true },
  });

  if (!workflow || !workflow.config) {
    throw new Error(`Workflow not found: ${input.workflowId}`);
  }

  return { graph: workflow.config as GraphWorkflowConfig };
}

export { splitDocument } from "./activities/split-document";
export { classifyDocument } from "./activities/classify-document";
export { validateDocumentFields } from "./activities/document-validate-fields";
