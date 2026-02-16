import { pollOCRResults } from './poll-ocr-results';
import type { OCRResponse } from '../types';
import DocumentIntelligence, { isUnexpected } from '@azure-rest/ai-document-intelligence';

jest.mock('@azure-rest/ai-document-intelligence', () => ({
  __esModule: true,
  default: jest.fn(),
  isUnexpected: jest.fn(),
}));

const documentIntelligenceMock = DocumentIntelligence as jest.MockedFunction<typeof DocumentIntelligence>;
const isUnexpectedMock = isUnexpected as jest.MockedFunction<typeof isUnexpected>;

type PollResponse = {
  status: string | number;
  body: OCRResponse | null;
  headers?: Record<string, string | string[]>;
};

const mockGet = jest.fn<Promise<PollResponse>, []>();
const mockPath = jest.fn(() => ({ get: mockGet }));

describe('pollOCRResults activity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://test.cognitiveservices.azure.com',
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: 'test-api-key',
    };
    isUnexpectedMock.mockReturnValue(false);
    mockGet.mockReset();
    mockPath.mockReset();
    mockPath.mockReturnValue({ get: mockGet });
    documentIntelligenceMock.mockReset();
    documentIntelligenceMock.mockReturnValue({
      path: mockPath,
    } as unknown as ReturnType<typeof DocumentIntelligence>);
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

    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

    const result = await pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' });

    expect(result.status).toBe('succeeded');
    expect(result.response).toEqual(mockOCRResponse);
    expect(documentIntelligenceMock).toHaveBeenCalledWith(
      'https://test.cognitiveservices.azure.com',
      { key: 'test-api-key' },
      {
        credentials: {
          apiKeyHeaderName: 'api-key',
        },
      },
    );
    expect(mockPath).toHaveBeenCalledWith(
      '/documentModels/{modelId}/analyzeResults/{resultId}',
      'prebuilt-layout',
      'test-request-id',
    );
  });

  it('polls for results and returns running status', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'running',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:00:30Z',
    };

    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

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

    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

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
    mockGet.mockResolvedValue({ status: 200, body: null });

    await expect(pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' })).rejects.toThrow(
      'Empty response from Azure OCR polling endpoint'
    );
  });

  it('rethrows SDK client errors', async () => {
    const sdkError = new Error('Request failed');
    mockGet.mockRejectedValue(sdkError);

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
    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

    await pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'prebuilt-layout' });

    expect(documentIntelligenceMock).toHaveBeenCalledWith(
      'https://test.cognitiveservices.azure.com',
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('strips /documentintelligence from endpoint so SDK does not double it', async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT =
      'https://test.aihub.gov.bc.ca/sdpr-invoice-automation/documentintelligence';

    const mockOCRResponse: OCRResponse = {
      status: 'succeeded',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:01:00Z',
    };
    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

    await pollOCRResults({ apimRequestId: 'test-request-id', modelId: 'abc' });

    expect(documentIntelligenceMock).toHaveBeenCalledWith(
      'https://test.aihub.gov.bc.ca/sdpr-invoice-automation',
      expect.any(Object),
      expect.any(Object),
    );
  });
});
