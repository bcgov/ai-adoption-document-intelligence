import { submitToAzureOCR } from './submit-to-azure-ocr';
import type { PreparedFileData } from '../types';
import axios from 'axios';
import * as fs from 'fs/promises';

jest.mock('axios');
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

const axiosMock = axios as jest.Mocked<typeof axios>;
const readFileMock = fs.readFile as jest.Mock;

describe('submitToAzureOCR activity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://test.cognitiveservices.azure.com',
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: 'test-api-key',
      LOCAL_BLOB_STORAGE_PATH: '/tmp/blobs',
    };
    readFileMock.mockResolvedValue(Buffer.from('test file content'));
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
      data: {},
    };
    axiosMock.post.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-1/test.pdf',
      modelId: 'prebuilt-layout',
    };

    const result = await submitToAzureOCR(fileData);

    expect(result.statusCode).toBe(202);
    expect(result.apimRequestId).toBe('test-request-id-123');
    expect(result.headers).toHaveProperty('apim-request-id');
    expect(axiosMock.post).toHaveBeenCalledWith(
      expect.stringContaining('prebuilt-layout:analyze'),
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({
          'api-key': 'test-api-key',
          'Content-Type': 'application/pdf',
        }),
      })
    );
    expect(axiosMock.post.mock.calls[0][0]).toContain('features=keyValuePairs');
  });

  it('submits document with custom model without features parameter', async () => {
    const mockResponse = {
      status: 202,
      headers: {
        'apim-request-id': 'test-request-id-456',
      },
      data: {},
    };
    axiosMock.post.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'invoice.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-2/invoice.pdf',
      modelId: 'custom-invoice-model',
    };

    const result = await submitToAzureOCR(fileData);

    expect(result.statusCode).toBe(202);
    expect(result.apimRequestId).toBe('test-request-id-456');
    expect(axiosMock.post.mock.calls[0][0]).toContain('custom-invoice-model:analyze');
    expect(axiosMock.post.mock.calls[0][0]).not.toContain('features=');
  });

  it('handles different case variations of apim-request-id header', async () => {
    const mockResponse = {
      status: 202,
      headers: {
        'Apim-Request-Id': 'test-request-id-789',
      },
      data: {},
    };
    axiosMock.post.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-3/test.pdf',
      modelId: 'prebuilt-layout',
    };

    const result = await submitToAzureOCR(fileData);

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

    await expect(submitToAzureOCR(fileData)).rejects.toThrow(
      'Azure Document Intelligence credentials not configured'
    );
  });

  it('throws error when status code is not 202', async () => {
    const mockResponse = {
      status: 400,
      headers: {},
      data: { error: 'Bad request' },
    };
    axiosMock.post.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-5/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await expect(submitToAzureOCR(fileData)).rejects.toThrow(
      'Failed to submit document to Azure OCR. Expected status code 202, got 400'
    );
  });

  it('throws error when apim-request-id is missing', async () => {
    const mockResponse = {
      status: 202,
      headers: {},
      data: {},
    };
    axiosMock.post.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-6/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await expect(submitToAzureOCR(fileData)).rejects.toThrow(
      'APIM Request ID not found in response headers'
    );
  });

  it('handles axios errors with additional context', async () => {
    const axiosError = new Error('Request failed');
    Object.assign(axiosError, {
      isAxiosError: true,
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Service unavailable' },
      },
      config: {
        url: 'https://test.cognitiveservices.azure.com/documentModels/prebuilt-layout:analyze',
        method: 'post',
      },
    });
    axiosMock.post.mockRejectedValue(axiosError);
    (axiosMock.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-7/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await expect(submitToAzureOCR(fileData)).rejects.toThrow('Request failed');
  });

  it('normalizes endpoint URL by removing trailing slash', async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test.cognitiveservices.azure.com/';

    const mockResponse = {
      status: 202,
      headers: {
        'apim-request-id': 'test-request-id',
      },
      data: {},
    };
    axiosMock.post.mockResolvedValue(mockResponse);

    const fileData: PreparedFileData = {
      fileName: 'test.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      blobKey: 'documents/doc-8/test.pdf',
      modelId: 'prebuilt-layout',
    };

    await submitToAzureOCR(fileData);

    const calledUrl = axiosMock.post.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('//documentModels');
    expect(calledUrl).toContain('/documentModels');
  });
});
