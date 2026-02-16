import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from '@azure-rest/ai-document-intelligence';
import * as fs from 'fs/promises';
import type { PreparedFileData, SubmissionResult } from '../types';
import { resolveBlobKeyToPath } from '../blob-storage/blob-path-resolver';

/**
 * Normalize endpoint for the Azure SDK. The SDK appends "/documentintelligence" to the
 * endpoint, so if the env var already includes that path (e.g. APIM), strip it to avoid
 * double segment and 404.
 */
function normalizeEndpointForSdk(url: string | undefined): string {
  if (!url) return '';
  let normalized = url.endsWith('/') ? url.slice(0, -1) : url;
  const suffix = '/documentintelligence';
  if (normalized.toLowerCase().endsWith(suffix)) {
    normalized = normalized.slice(0, -suffix.length);
  }
  return normalized;
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

  const normalizedEndpoint = normalizeEndpointForSdk(endpoint);
  const modelId = fileData.modelId || 'prebuilt-layout';

  try {
    // Initialize Azure Document Intelligence client (SDK appends /documentintelligence to endpoint)
    const client: DocumentIntelligenceClient = DocumentIntelligence(
      normalizedEndpoint,
      { key: apiKey },
      {
        credentials: {
          apiKeyHeaderName: 'api-key',
        },
      }
    );

    const fileBuffer = await readBlobData(fileData.blobKey);

    // Build analyze options - only include features for prebuilt models
    const isPrebuiltModel = modelId.startsWith('prebuilt-') || modelId === 'prebuilt-read';
    const features = isPrebuiltModel ? ['keyValuePairs'] : undefined;

    // Submit document for analysis using base64 encoding (APIM compatible)
    const initialResponse = await client.path('/documentModels/{modelId}:analyze', modelId).post({
      contentType: 'application/json',
      queryParameters: {
        features: features as any,
      },
      body: {
        base64Source: fileBuffer.toString('base64'),
      },
    });

    if (isUnexpected(initialResponse)) {
      const status = initialResponse.status;
      console.error(JSON.stringify({
        activity: activityName,
        event: 'error',
        error: 'azure_api_error',
        status,
        body: initialResponse.body,
        timestamp: new Date().toISOString()
      }));
      const hint =
        Number(status) === 404
          ? ` Model "${modelId}" may not exist in this resource, or the model ID may be wrong. For custom models, use the exact model ID returned when the model was built (e.g. from GET documentModels or the build response). Verify AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT points to the same resource where the model was created.`
          : '';
      throw new Error(
        `Failed to submit document to Azure OCR. Status: ${status}${hint}`,
      );
    }

    const statusCode = Number(initialResponse.status);
    const apimRequestId =
      initialResponse.headers['apim-request-id'] ||
      initialResponse.headers['Apim-Request-Id'] ||
      initialResponse.headers['APIM-Request-Id'] ||
      null;

    // Validate status code
    if (statusCode !== 202) {
      console.error(JSON.stringify({
        activity: activityName,
        event: 'error',
        error: 'unexpected_status_code',
        statusCode,
        expectedStatusCode: 202,
        responseBody: initialResponse.body,
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
        availableHeaders: Object.keys(initialResponse.headers),
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
      headers: initialResponse.headers as Record<string, string | string[]>
    };
  } catch (error) {
    const errorDetails: Record<string, unknown> = {
      activity: activityName,
      event: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };

    if (error instanceof Error && error.stack) {
      errorDetails.stack = error.stack;
    }

    console.error(JSON.stringify(errorDetails));
    throw error;
  }
}
