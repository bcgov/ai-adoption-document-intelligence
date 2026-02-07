import { splitDocument } from './split-document';
import type { SplitDocumentInput } from './split-document';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  mkdtemp: jest.fn(),
  rm: jest.fn(),
}));

const execFileMock = execFile as unknown as jest.Mock;
const accessMock = fs.access as jest.Mock;
const mkdirMock = fs.mkdir as jest.Mock;
const mkdtempMock = fs.mkdtemp as jest.Mock;
const rmMock = fs.rm as jest.Mock;

describe('splitDocument activity', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    accessMock.mockReset();
    mkdirMock.mockReset();
    mkdtempMock.mockReset();
    rmMock.mockReset();
    process.env.LOCAL_BLOB_STORAGE_PATH = '/tmp/blobs';
    accessMock.mockResolvedValue(undefined);
    mkdtempMock.mockResolvedValue('/tmp/split-document-test');
    rmMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
  });

  it('splits per-page', async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === 'qpdf' && args[0] === '--show-npages') {
        cb(null, { stdout: '3\n', stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    });

    const input: SplitDocumentInput = {
      blobKey: 'documents/doc-1/original.pdf',
      documentId: 'doc-1',
      strategy: 'per-page',
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 1 });
    expect(result.segments[2].pageRange).toEqual({ start: 3, end: 3 });
    expect(result.segments[0].blobKey).toContain(
      'documents/doc-1/segments/segment-001-pages-1-1.pdf',
    );
  });

  it('splits fixed range', async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === 'qpdf' && args[0] === '--show-npages') {
        cb(null, { stdout: '23\n', stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    });

    const input: SplitDocumentInput = {
      blobKey: 'documents/doc-2/original.pdf',
      documentId: 'doc-2',
      strategy: 'fixed-range',
      fixedRangeSize: 5,
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(5);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 5 });
    expect(result.segments[4].pageRange).toEqual({ start: 21, end: 23 });
  });

  it('splits using boundary detection', async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === 'qpdf' && args[0] === '--show-npages') {
        cb(null, { stdout: '4\n', stderr: '' });
        return;
      }
      if (cmd === 'pdftotext') {
        const filePath = args[2] as string;
        if (filePath.includes('page-1.pdf')) {
          cb(null, { stdout: 'Page 1 of 2\nReport', stderr: '' });
          return;
        }
        if (filePath.includes('page-2.pdf')) {
          cb(null, { stdout: 'Continued', stderr: '' });
          return;
        }
        if (filePath.includes('page-3.pdf')) {
          cb(null, { stdout: 'Page 1 of 2\nInvoice', stderr: '' });
          return;
        }
        cb(null, { stdout: 'More', stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    });

    const input: SplitDocumentInput = {
      blobKey: 'documents/doc-3/original.pdf',
      documentId: 'doc-3',
      strategy: 'boundary-detection',
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 2 });
    expect(result.segments[1].pageRange).toEqual({ start: 3, end: 4 });
  });

  it('handles large documents up to 2000 pages', async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === 'qpdf' && args[0] === '--show-npages') {
        cb(null, { stdout: '2000\n', stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    });

    const input: SplitDocumentInput = {
      blobKey: 'documents/doc-4/original.pdf',
      documentId: 'doc-4',
      strategy: 'per-page',
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(2000);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 1 });
    expect(result.segments[1999].pageRange).toEqual({ start: 2000, end: 2000 });
  });
});
