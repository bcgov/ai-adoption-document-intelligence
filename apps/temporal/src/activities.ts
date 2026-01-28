/**
 * Temporal Activities for OCR Workflow
 * Activities handle non-deterministic operations (HTTP calls, file processing)
 */

// Load environment variables first (before reading them)
require('dotenv').config();

import axios, { AxiosResponse } from 'axios';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';
import type {
  PreparedFileData,
  SubmissionResult,
  PollResult,
  OCRResponse,
  OCRResult,
  OCRWorkflowInput
} from './types';

// Initialize Prisma client (singleton pattern)
let prismaClient: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    prismaClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
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
        'Ocp-Apim-Subscription-Key': apiKey,
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
        'Ocp-Apim-Subscription-Key': apiKey
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
      figures: []
    };

    const result: OCRResult = {
      success: ocrResponseObj.status === 'succeeded',
      status: ocrResponseObj.status || 'unknown',
      apimRequestId: apimRequestId || '',
      fileName: fileName || 'document',
      fileType: fileType || 'pdf',
      extractedText: analyzeResult.content || '',
      pages: analyzeResult.pages || [],
      tables: analyzeResult.tables || [],
      paragraphs: analyzeResult.paragraphs || [],
      keyValuePairs: analyzeResult.keyValuePairs || [],
      sections: analyzeResult.sections || [],
      figures: analyzeResult.figures || [],
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
 * Activity: Upsert OCR result in database
 * Stores only keyValuePairs in the simplified schema format
 * Converts KeyValuePair[] array to ExtractedFields format (Record<string, DocumentField>)
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
    status: ocrResult.status,
    keyValuePairsCount: ocrResult.keyValuePairs?.length || 0,
    timestamp: new Date().toISOString()
  }));
  
  try {
    const prisma = getPrismaClient();
    
    // Convert keyValuePairs to JSON format for database
    // The simplified schema only stores keyValuePairs as JSON in ExtractedFields format
    const asJson = (obj: any) => obj as unknown as any;
    
    // Extract keyValuePairs from OCR result (array of KeyValuePair objects)
    const keyValuePairsArray = ocrResult.keyValuePairs || [];
    
    // Convert KeyValuePair[] array to ExtractedFields format (Record<string, DocumentField>)
    // This matches the format expected by the backend and frontend
    const extractedFields: Record<string, any> = {};
    
    for (const pair of keyValuePairsArray) {
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
      while (extractedFields[uniqueName]) {
        uniqueName = `${fieldName}_${counter}`;
        counter++;
      }
      
      extractedFields[uniqueName] = field;
    }
    
    const updateObject = {
      processed_at: new Date(ocrResult.processedAt),
      keyValuePairs: asJson(extractedFields),
    };
    
    // Upsert OCR result (only keyValuePairs field)
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
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'completed_ocr' as any },
    });

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      fileName: ocrResult.fileName,
      keyValuePairsCount: Object.keys(extractedFields).length,
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
