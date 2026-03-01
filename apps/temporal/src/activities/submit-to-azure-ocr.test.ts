import { submitToAzureOCR } from './submit-to-azure-ocr';
import type { PreparedFileData } from '../types';
import DocumentIntelligence, { isUnexpected } from '@azure-rest/ai-document-intelligence';

jest.mock('@azure-rest/ai-document-intelligence', () => ({
  __esModule: true,
  default: jest.fn(),
  isUnexpected: jest.fn(),
}));

const mockBlobRead = jest.fn();
jest.mock('../blob-storage/blob-storage-client', () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
  }),
}));

const documentIntelligenceMock = DocumentIntelligence as jest.MockedFunction<typeof DocumentIntelligence>;
const isUnexpectedMock = isUnexpected as jest.MockedFunction<typeof isUnexpected>;

type AnalyzeResponse = {
  status: number | string;
  headers: Record<string, string | string[]>;
  body?: unknown;
};

const mockPost = jest.fn<Promise<AnalyzeResponse>, [Record<string, unknown>]>();
const mockPath = jest.fn(() => ({ post: mockPost }));

describe('submitToAzureOCR activity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://test.cognitiveservices.azure.com',
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: 'test-api-key',
    };
    mockBlobRead.mockResolvedValue(Buffer.from('test file content'));
    isUnexpectedMock.mockReturnValue(false);
    mockPost.mockReset();
    mockPath.mockClear();
    mockPath.mockReturnValue({ post: mockPost });
    documentIntelligenceMock.mockReset();
    documentIntelligenceMock.mockReturnValue({
      path: mockPath,
    } as unknown as ReturnType<typeof DocumentIntelligence>);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('submits document successfully with prebuilt model', async () => {
    const mockResponse = {
      status: 202,
      headers: {
        'apim-request-id': 'test-request-id-123',
      },
      body: {},
    };
    mockPost.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-1/test.pdf',
      modelId: 'prebuilt-layout',
    };

    const result = await submitToAzureOCR({ fileData });

    expect(result.statusCode).toBe(202);
    expect(result.apimRequestId).toBe('test-request-id-123');
    expect(result.headers).toHaveProperty('apim-request-id');
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
      '/documentModels/{modelId}:analyze',
      'prebuilt-layout',
    );
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'application/json',
        queryParameters: expect.objectContaining({
          features: ['keyValuePairs'],
        }),
      }),
    );
  });

  it('submits document with custom model without features parameter', async () => {
    const mockResponse = {
      status: 202,
      headers: {
        'apim-request-id': 'test-request-id-456',
      },
      body: {},
    };
    mockPost.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'invoice.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-2/invoice.pdf',
      modelId: 'custom-invoice-model',
    };

    const result = await submitToAzureOCR({ fileData });

    expect(result.statusCode).toBe(202);
    expect(result.apimRequestId).toBe('test-request-id-456');
    expect(mockPath).toHaveBeenCalledWith(
      '/documentModels/{modelId}:analyze',
      'custom-invoice-model',
    );
    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        queryParameters: expect.objectContaining({
          features: undefined,
        }),
      }),
    );
  });

  it('handles different case variations of apim-request-id header', async () => {
    const mockResponse = {
      status: 202,
      headers: {
        'Apim-Request-Id': 'test-request-id-789',
      },
      body: {},
    };
    mockPost.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-3/test.pdf',
      modelId: 'prebuilt-layout',
    };

    const result = await submitToAzureOCR({ fileData });

    expect(result.apimRequestId).toBe('test-request-id-789');
  });

  it('throws error when credentials are missing', async () => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-4/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await expect(submitToAzureOCR({ fileData })).rejects.toThrow(
      'Azure Document Intelligence credentials not configured'
    );
  });

  it('throws error when status code is not 202', async () => {
    const mockResponse = {
      status: 400,
      headers: {},
      body: { error: 'Bad request' },
    };
    mockPost.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-5/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await expect(submitToAzureOCR({ fileData })).rejects.toThrow(
      'Failed to submit document to Azure OCR. Expected status code 202, got 400'
    );
  });

  it('throws error when apim-request-id is missing', async () => {
    const mockResponse = {
      status: 202,
      headers: {},
      body: {},
    };
    mockPost.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-6/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await expect(submitToAzureOCR({ fileData })).rejects.toThrow(
      'APIM Request ID not found in response headers'
    );
  });

  it('rethrows SDK client errors with context', async () => {
    const sdkError = new Error('Request failed');
    mockPost.mockRejectedValue(sdkError);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-7/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await expect(submitToAzureOCR({ fileData })).rejects.toThrow('Request failed');
  });

  it('normalizes endpoint URL by removing trailing slash', async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test.cognitiveservices.azure.com/';

    const mockResponse = {
      status: 202,
      headers: {
        'apim-request-id': 'test-request-id',
      },
      body: {},
    };
    mockPost.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-8/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await submitToAzureOCR({ fileData });

    expect(documentIntelligenceMock).toHaveBeenCalledWith(
      'https://test.cognitiveservices.azure.com',
      expect.any(Object),
      expect.any(Object),
    );
  });
});
