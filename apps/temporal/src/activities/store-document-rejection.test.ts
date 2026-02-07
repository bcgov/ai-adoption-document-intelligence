import { storeDocumentRejection } from './store-document-rejection';
import { getPrismaClient } from './database-client';

jest.mock('./database-client', () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe('storeDocumentRejection activity', () => {
  let prismaMock: {
    documentRejection: {
      upsert: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      documentRejection: {
        upsert: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('stores document rejection with all fields', async () => {
    prismaMock.documentRejection.upsert.mockResolvedValue({
      id: 1,
      document_id: 'doc-1',
      reason: 'poor_quality',
      reviewer: 'user@example.com',
      annotations: 'Image too blurry',
    });

    await storeDocumentRejection(
      'doc-1',
      'poor_quality',
      'user@example.com',
      'Image too blurry'
    );

    expect(prismaMock.documentRejection.upsert).toHaveBeenCalledWith({
      where: { document_id: 'doc-1' },
      update: {
        reason: 'poor_quality',
        reviewer: 'user@example.com',
        annotations: 'Image too blurry',
      },
      create: {
        document_id: 'doc-1',
        reason: 'poor_quality',
        reviewer: 'user@example.com',
        annotations: 'Image too blurry',
      },
    });
  });

  it('stores document rejection with only reason', async () => {
    prismaMock.documentRejection.upsert.mockResolvedValue({
      id: 2,
      document_id: 'doc-2',
      reason: 'invalid_format',
      reviewer: null,
      annotations: null,
    });

    await storeDocumentRejection('doc-2', 'invalid_format');

    expect(prismaMock.documentRejection.upsert).toHaveBeenCalledWith({
      where: { document_id: 'doc-2' },
      update: {
        reason: 'invalid_format',
        reviewer: null,
        annotations: null,
      },
      create: {
        document_id: 'doc-2',
        reason: 'invalid_format',
        reviewer: null,
        annotations: null,
      },
    });
  });

  it('updates existing rejection record', async () => {
    prismaMock.documentRejection.upsert.mockResolvedValue({
      id: 3,
      document_id: 'doc-3',
      reason: 'incorrect_data',
      reviewer: 'reviewer@example.com',
      annotations: 'Updated annotations',
    });

    await storeDocumentRejection(
      'doc-3',
      'incorrect_data',
      'reviewer@example.com',
      'Updated annotations'
    );

    expect(prismaMock.documentRejection.upsert).toHaveBeenCalled();
  });

  it('throws error when database operation fails', async () => {
    const dbError = new Error('Database connection failed');
    prismaMock.documentRejection.upsert.mockRejectedValue(dbError);

    await expect(
      storeDocumentRejection('doc-4', 'poor_quality')
    ).rejects.toThrow('Database connection failed');
  });
});
