import { Context } from '@temporalio/activity';
import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from '@azure-rest/ai-document-intelligence';
import { createActivityLogger } from '../logger';
import type { OCRResponse, PollResult } from '../types';

/**
 * Activity: Poll Azure Document Intelligence for OCR results
 * Returns status and full response if available
 */
export async function pollOCRResults(params: {
  apimRequestId: string;
  modelId: string;
  requestId?: string;
}): Promise<PollResult> {
  const activityName = 'pollOCRResults';
  const { apimRequestId, modelId, requestId } = params;
  const workflowExecutionId = Context.current().info.workflowExecution?.workflowId;
  const log = createActivityLogger(activityName, {
    workflowExecutionId,
    requestId,
    apimRequestId,
    modelId,
  });

  log.info('Poll OCR start', { event: 'start', useMock: process.env.MOCK_AZURE_OCR === 'true' });

  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  const useMock = process.env.MOCK_AZURE_OCR === 'true';

  // Mock mode for testing
  if (useMock) {
    const mockResponse: OCRResponse = {
      status: 'succeeded',
      createdDateTime: new Date().toISOString(),
      lastUpdatedDateTime: new Date().toISOString(),
      analyzeResult: {
        apiVersion: '2024-11-30',
        modelId: modelId || 'prebuilt-layout',
        content: 'Mock OCR content for testing\nLine 2\nLine 3',
        pages: [{
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: [],
          lines: [],
          spans: [{ offset: 0, length: 50 }]
        }],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: []
      }
    };

    log.info('Poll OCR complete (mock)', { event: 'complete_mock', status: 'succeeded' });

    return {
      status: 'succeeded',
      response: mockResponse
    };
  }

  if (!endpoint || !apiKey) {
    log.error('Azure Document Intelligence credentials not configured', {
      event: 'error',
      error: 'missing_credentials',
    });
    throw new Error(
      'Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.'
    );
  }

  if (!apimRequestId || typeof apimRequestId !== 'string') {
    log.error('APIM Request ID not available for polling', {
      event: 'error',
      error: 'invalid_apim_request_id',
    });
    throw new Error('APIM Request ID not available for polling');
  }

  const normalizedModelId = modelId || 'prebuilt-layout';

  try {
    const client: DocumentIntelligenceClient = DocumentIntelligence(
      endpoint,
      { key: apiKey },
      {
        credentials: {
          apiKeyHeaderName: 'api-key',
        },
      }
    );

    // Poll for results
    const response = await client
      .path('/documentModels/{modelId}/analyzeResults/{resultId}', normalizedModelId, apimRequestId)
      .get();

    if (isUnexpected(response)) {
      log.error('Azure API error polling OCR', {
        event: 'error',
        error: 'azure_api_error',
        status: response.status,
      });
      throw new Error(
        `Failed to poll OCR results. Status: ${response.status}`
      );
    }

    const responseBody = response.body as OCRResponse;

    if (!responseBody) {
      log.error('Empty response from Azure OCR polling endpoint', {
        event: 'error',
        error: 'empty_response_body',
      });
      throw new Error('Empty response from Azure OCR polling endpoint');
    }

    const status = responseBody.status || 'unknown';
    log.info('Poll OCR complete', { event: 'complete', status });

    return {
      status: status as 'running' | 'succeeded' | 'failed',
      response: responseBody
    };
  } catch (error) {
    log.error('Poll OCR failed', {
      event: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
