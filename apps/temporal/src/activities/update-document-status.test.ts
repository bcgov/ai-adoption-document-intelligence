import { updateDocumentStatus } from './update-document-status';
import { getPrismaClient } from './database-client';

jest.mock('./database-client', () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe('updateDocumentStatus activity', () => {
  let prismaMock: {
    document: {
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('updates document status without apimRequestId', async () => {
    prismaMock.document.update.mockResolvedValue({ id: 'doc-1', status: 'ongoing_ocr' });

    await updateDocumentStatus({ documentId: 'doc-1', status: 'ongoing_ocr' });

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'ongoing_ocr' },
    });
  });

  it('updates document status with apimRequestId', async () => {
    prismaMock.document.update.mockResolvedValue({
      id: 'doc-2',
      status: 'ongoing_ocr',
      apim_request_id: 'test-apim-id',
    });

    await updateDocumentStatus({ documentId: 'doc-2', status: 'ongoing_ocr', apimRequestId: 'test-apim-id' });

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-2' },
      data: {
        status: 'ongoing_ocr',
        apim_request_id: 'test-apim-id',
      },
    });
  });

  it('updates to completed_ocr status', async () => {
    prismaMock.document.update.mockResolvedValue({ id: 'doc-3', status: 'completed_ocr' });

    await updateDocumentStatus({ documentId: 'doc-3', status: 'completed_ocr' });

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-3' },
      data: { status: 'completed_ocr' },
    });
  });

  it('throws error when database update fails', async () => {
    const dbError = new Error('Database connection failed');
    prismaMock.document.update.mockRejectedValue(dbError);

    await expect(updateDocumentStatus({ documentId: 'doc-4', status: 'ongoing_ocr' })).rejects.toThrow(
      'Database connection failed'
    );
  });

  it('skips gracefully when benchmark-mode document not found in DB (early check)', async () => {
    // Document not found — early exit before Prisma update
    prismaMock.document.findUnique.mockResolvedValue(null);

    // Should NOT throw — just log and return
    await expect(
      updateDocumentStatus({ documentId: 'benchmark-Receipt', status: 'ongoing_ocr' }),
    ).resolves.toBeUndefined();

    // Should NOT have attempted the update at all
    expect(prismaMock.document.update).not.toHaveBeenCalled();
  });

  it('proceeds normally for benchmark- prefixed docs that DO exist in DB', async () => {
    prismaMock.document.findUnique.mockResolvedValue({ id: 'benchmark-Receipt' });
    prismaMock.document.update.mockResolvedValue({ id: 'benchmark-Receipt', status: 'ongoing_ocr' });

    await updateDocumentStatus({ documentId: 'benchmark-Receipt', status: 'ongoing_ocr' });

    expect(prismaMock.document.update).toHaveBeenCalled();
  });

  it('skips gracefully when document not found (P2025 - benchmark mode fallback)', async () => {
    // Document exists at early check time but disappears by the time update runs
    prismaMock.document.findUnique.mockResolvedValue({ id: 'benchmark-Receipt' });
    const prismaNotFound = new Error('Record to update not found');
    Object.assign(prismaNotFound, { code: 'P2025' });
    prismaMock.document.update.mockRejectedValue(prismaNotFound);

    // Should NOT throw — just log and return
    await expect(
      updateDocumentStatus({ documentId: 'benchmark-Receipt', status: 'ongoing_ocr' }),
    ).resolves.toBeUndefined();
  });

  it('throws error when document not found without P2025 code', async () => {
    const notFoundError = new Error('Record to update not found');
    prismaMock.document.update.mockRejectedValue(notFoundError);

    await expect(updateDocumentStatus({ documentId: 'non-existent', status: 'ongoing_ocr' })).rejects.toThrow(
      'Record to update not found'
    );
  });
});
