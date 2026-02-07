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
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        update: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('updates document status without apimRequestId', async () => {
    prismaMock.document.update.mockResolvedValue({ id: 'doc-1', status: 'ongoing_ocr' });

    await updateDocumentStatus('doc-1', 'ongoing_ocr');

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

    await updateDocumentStatus('doc-2', 'ongoing_ocr', 'test-apim-id');

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

    await updateDocumentStatus('doc-3', 'completed_ocr');

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-3' },
      data: { status: 'completed_ocr' },
    });
  });

  it('throws error when database update fails', async () => {
    const dbError = new Error('Database connection failed');
    prismaMock.document.update.mockRejectedValue(dbError);

    await expect(updateDocumentStatus('doc-4', 'ongoing_ocr')).rejects.toThrow(
      'Database connection failed'
    );
  });

  it('throws error when document not found', async () => {
    const notFoundError = new Error('Record to update not found');
    prismaMock.document.update.mockRejectedValue(notFoundError);

    await expect(updateDocumentStatus('non-existent', 'ongoing_ocr')).rejects.toThrow(
      'Record to update not found'
    );
  });
});
