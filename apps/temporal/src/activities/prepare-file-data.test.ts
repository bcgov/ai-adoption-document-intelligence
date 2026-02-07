import { prepareFileData } from './prepare-file-data';
import type { PrepareFileDataInput } from './prepare-file-data';
import * as fs from 'fs/promises';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

const readFileMock = fs.readFile as jest.Mock;

describe('prepareFileData activity', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    process.env.LOCAL_BLOB_STORAGE_PATH = '/tmp/blobs';
  });

  it('prepares PDF file data with defaults', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\ntest content');
    readFileMock.mockResolvedValue(pdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: 'doc-1',
      blobKey: 'documents/doc-1/test.pdf',
    };

    const result = await prepareFileData(input);

    expect(result.fileName).toBe('test.pdf');
    expect(result.fileType).toBe('pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(result.blobKey).toBe('documents/doc-1/test.pdf');
    expect(result.modelId).toBe('prebuilt-layout');
  });

  it('prepares image file data', async () => {
    const imageBuffer = Buffer.from('fake image data');
    readFileMock.mockResolvedValue(imageBuffer);

    const input: PrepareFileDataInput = {
      documentId: 'doc-2',
      blobKey: 'documents/doc-2/scan.png',
      fileName: 'scan.png',
      fileType: 'image',
      contentType: 'image/png',
    };

    const result = await prepareFileData(input);

    expect(result.fileName).toBe('scan.png');
    expect(result.fileType).toBe('image');
    expect(result.contentType).toBe('image/png');
    expect(result.blobKey).toBe('documents/doc-2/scan.png');
  });

  it('accepts custom modelId', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\ntest content');
    readFileMock.mockResolvedValue(pdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: 'doc-3',
      blobKey: 'documents/doc-3/invoice.pdf',
      modelId: 'custom-invoice-model',
    };

    const result = await prepareFileData(input);

    expect(result.modelId).toBe('custom-invoice-model');
  });

  it('detects file type from filename extension', async () => {
    const imageBuffer = Buffer.from('fake jpeg data');
    readFileMock.mockResolvedValue(imageBuffer);

    const input: PrepareFileDataInput = {
      documentId: 'doc-4',
      blobKey: 'documents/doc-4/photo.jpg',
    };

    const result = await prepareFileData(input);

    expect(result.fileType).toBe('image');
    expect(result.contentType).toBe('image/jpeg');
  });

  it('throws error for missing blobKey', async () => {
    const input: PrepareFileDataInput = {
      documentId: 'doc-5',
      blobKey: '',
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      'No blobKey provided. blobKey is required to read file data.',
    );
  });

  it('throws error for file not found', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT: no such file'));

    const input: PrepareFileDataInput = {
      documentId: 'doc-6',
      blobKey: 'documents/doc-6/missing.pdf',
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      'Blob not found: "documents/doc-6/missing.pdf"',
    );
  });

  it('throws error for invalid blob key with path traversal', async () => {
    const input: PrepareFileDataInput = {
      documentId: 'doc-7',
      blobKey: '../../../etc/passwd',
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      'Invalid blob key: "../../../etc/passwd"',
    );
  });

  it('warns for invalid PDF signature', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalidPdfBuffer = Buffer.from('not a pdf file content');
    readFileMock.mockResolvedValue(invalidPdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: 'doc-8',
      blobKey: 'documents/doc-8/fake.pdf',
      fileType: 'pdf',
    };

    const result = await prepareFileData(input);

    expect(result).toBeDefined();
    expect(consoleSpy).toHaveBeenCalled();
    const warnCall = consoleSpy.mock.calls.find(call =>
      call[0].includes('File does not have valid PDF signature')
    );
    expect(warnCall).toBeDefined();

    consoleSpy.mockRestore();
  });
});
