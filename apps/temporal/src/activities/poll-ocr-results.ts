import axios from 'axios';
import type { OCRResponse, PollResult } from '../types';

/**
 * Normalize endpoint URL by removing trailing slash
 */
function normalizeEndpoint(url: string | undefined): string {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
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
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

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
    const errorDetails: Record<string, unknown> = {
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
