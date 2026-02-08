import axios, { AxiosResponse } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { PreparedFileData, SubmissionResult } from '../types';

const DEFAULT_BLOB_BASE_PATH = './data/blobs';

/**
 * Normalize endpoint URL by removing trailing slash
 */
function normalizeEndpoint(url: string | undefined): string {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function resolveBlobKeyToPath(blobKey: string): string {
  const basePath = process.env.LOCAL_BLOB_STORAGE_PATH ?? DEFAULT_BLOB_BASE_PATH;
  const normalized = path.normalize(blobKey);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error(`Invalid blob key: "${blobKey}"`);
  }
  return path.join(basePath, normalized);
}

async function readBlobData(blobKey: string): Promise<Buffer> {
  const filePath = resolveBlobKeyToPath(blobKey);
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    throw new Error(`Blob not found: "${blobKey}"`);
  }
}

/**
 * Activity: Submit document to Azure Document Intelligence OCR API
 * Returns serializable response data with headers including apim-request-id
 */
export async function submitToAzureOCR(params: {
  fileData: PreparedFileData;
}): Promise<SubmissionResult> {
  const activityName = 'submitToAzureOCR';
  const { fileData } = params;
  const startTime = Date.now();
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  const useMock = process.env.MOCK_AZURE_OCR === 'true';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    fileName: fileData.fileName,
    fileType: fileData.fileType,
    contentType: fileData.contentType,
    modelId: fileData.modelId,
    blobKey: fileData.blobKey,
    useMock,
    timestamp: new Date().toISOString()
  }));

  // Mock mode for testing
  if (useMock) {
    const mockRequestId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const duration = Date.now() - startTime;

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete_mock',
      apimRequestId: mockRequestId,
      durationMs: duration,
      timestamp: new Date().toISOString()
    }));

    return {
      statusCode: 202,
      apimRequestId: mockRequestId,
      headers: {
        'apim-request-id': mockRequestId,
        'operation-location': `https://mock.azure.com/results/${mockRequestId}`,
      },
    };
  }

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
    const fileBuffer = await readBlobData(fileData.blobKey);
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
    const errorDetails: Record<string, unknown> = {
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
