import { pollOCRResults } from './poll-ocr-results';
import type { OCRResponse } from '../types';
import axios from 'axios';

jest.mock('axios');

const axiosMock = axios as jest.Mocked<typeof axios>;

describe('pollOCRResults activity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://test.cognitiveservices.azure.com',
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: 'test-api-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('polls for results and returns succeeded status', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'succeeded',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:01:00Z',
      analyzeResult: {
        apiVersion: '2024-11-30',
        modelId: 'prebuilt-layout',
        content: 'Test content',
        pages: [],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
        documents: [],
      },
    };

    axiosMock.get.mockResolvedValue({ data: mockOCRResponse });

    const result = await pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' });

    expect(result.status).toBe('succeeded');
    expect(result.response).toEqual(mockOCRResponse);
    expect(axiosMock.get).toHaveBeenCalledWith(
      expect.stringContaining('/analyzeResults/test-request-id'),
      expect.objectContaining({
        headers: { 'api-key': 'test-api-key' },
      })
    );
  });

  it('polls for results and returns running status', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'running',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:00:30Z',
    };

    axiosMock.get.mockResolvedValue({ data: mockOCRResponse });

    const result = await pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' });

    expect(result.status).toBe('running');
    expect(result.response).toEqual(mockOCRResponse);
  });

  it('polls for results and returns failed status', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'failed',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:00:30Z',
    };

    axiosMock.get.mockResolvedValue({ data: mockOCRResponse });

    const result = await pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' });

    expect(result.status).toBe('failed');
    expect(result.response).toEqual(mockOCRResponse);
  });

  it('throws error when credentials are missing', async () => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

    await expect(pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' })).rejects.toThrow(
      'Azure Document Intelligence credentials not configured'
    );
  });

  it('throws error when apimRequestId is missing', async () => {
    await expect(pollOCRResults({ apimRequestId: '', modelId: 'prebuilt-layout' })).rejects.toThrow(
      'APIM Request ID not available for polling'
    );
  });

  it('throws error when response body is empty', async () => {
    axiosMock.get.mockResolvedValue({ data: null });

    await expect(pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' })).rejects.toThrow(
      'Empty response from Azure OCR polling endpoint'
    );
  });

  it('handles axios errors', async () => {
    const axiosError = new Error('Request failed');
    Object.assign(axiosError, {
      isAxiosError: true,
      response: {
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Request not found' },
      },
      config: {
        url: 'https://test.cognitiveservices.azure.com/documentModels/prebuilt-layout/analyzeResults/test-request-id',
      },
    });
    axiosMock.get.mockRejectedValue(axiosError);
    (axiosMock.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

    await expect(pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' })).rejects.toThrow(
      'Request failed'
    );
  });

  it('normalizes endpoint URL by removing trailing slash', async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test.cognitiveservices.azure.com/';

    const mockOCRResponse: OCRResponse = {
      status: 'succeeded',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:01:00Z',
    };

    axiosMock.get.mockResolvedValue({ data: mockOCRResponse });

    await pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' });

    const calledUrl = axiosMock.get.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('//documentModels');
    expect(calledUrl).toContain('/documentModels');
  });
});
