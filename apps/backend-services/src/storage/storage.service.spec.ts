import { StorageService, Operation } from './storage.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

describe('StorageService', () => {
  let service: StorageService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = { get: jest.fn() } as any;
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
    service = new StorageService(configService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ensureStorageDirectory', () => {
    it('should create storage directory if not exists', async () => {
      const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      await service['ensureStorageDirectory']();
      expect(mkdirSpy).toHaveBeenCalled();
    });
    it('should throw and log error if mkdir fails', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs.promises, 'mkdir').mockRejectedValue(new Error('fail mkdir'));
      const loggerError = jest.spyOn(service['logger'], 'error').mockImplementation();
      await expect(service['ensureStorageDirectory']()).rejects.toThrow('fail mkdir');
      expect(loggerError).toHaveBeenCalled();
    });
  });

  describe('saveFile', () => {
    it('should save a file', async () => {
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      const buffer = Buffer.from('test');
      const result = await service.saveFile('test.txt', buffer);
      expect(result).toContain('test.txt');
    });
    it('should throw if writeFile fails', async () => {
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs.promises, 'writeFile').mockRejectedValue(new Error('fail write'));
      const buffer = Buffer.from('test');
      await expect(service.saveFile('test.txt', buffer)).rejects.toThrow('fail write');
    });
  });

  describe('saveFilesBulk', () => {
    it('should save multiple files', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);
      const files = [
        { originalname: 'a.txt', buffer: Buffer.from('a') },
        { originalname: 'b.txt', buffer: Buffer.from('b') },
      ];
      const result = await service.saveFilesBulk(files as any, 'folder');
      expect(result.length).toBe(2);
      expect(result[0]).toContain('a.txt');
      expect(result[1]).toContain('b.txt');
    });
    it('should throw if writeFile fails for any file', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      jest.spyOn(fs.promises, 'writeFile').mockRejectedValue(new Error('fail bulk'));
      const files = [
        { originalname: 'a.txt', buffer: Buffer.from('a') },
      ];
      await expect(service.saveFilesBulk(files as any, 'folder')).rejects.toThrow('fail bulk');
    });
  });

  describe('readFile', () => {
    it('should read a file with absolute path', async () => {
      jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('data'));
      const result = await service.readFile('/abs/path/file.txt');
      expect(result.toString()).toBe('data');
    });
    it('should read a file with relative path', async () => {
      jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('data'));
      const result = await service.readFile('file.txt');
      expect(result.toString()).toBe('data');
    });
    it('should throw if file does not exist', async () => {
      jest.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('fail read'));
      await expect(service.readFile('file.txt')).rejects.toThrow('fail read');
    });
  });

  describe('deleteFile', () => {
    it('should delete a file', async () => {
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);
      await expect(service.deleteFile('test.txt')).resolves.toBeUndefined();
    });
    it('should throw if unlink fails', async () => {
      jest.spyOn(fs.promises, 'unlink').mockRejectedValue(new Error('fail unlink'));
      await expect(service.deleteFile('test.txt')).rejects.toThrow('fail unlink');
    });
  });

  describe('deleteFolderRecursive', () => {
    it('should delete a folder recursively', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs.promises, 'rm').mockResolvedValue(undefined as any);
      const loggerLog = jest.spyOn(service['logger'], 'log').mockImplementation();
      await expect(service.deleteFolderRecursive('folder')).resolves.toBeUndefined();
      expect(loggerLog).toHaveBeenCalled();
    });
    it('should warn if folder does not exist when deleting', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const loggerWarn = jest.spyOn(service['logger'], 'warn').mockImplementation();
      await service.deleteFolderRecursive('folder');
      expect(loggerWarn).toHaveBeenCalled();
    });
  });

  describe('getStoragePath', () => {
    it('should get storage path', () => {
      const result = service.getStoragePath('gid', Operation.CLASSIFICATION, 'sub');
      expect(result).toContain('gid');
      expect(result).toContain('classification');
      expect(result).toContain('sub');
      expect(result).toEqual(path.join('gid', 'classification', 'sub'));
    });
  });

  describe('getAllFilesFromFolder', () => {
    it('should return empty array for empty folder', async () => {
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue([]);
      const result = await service.getAllFilesFromFolder('empty', false);
      expect(result).toEqual([]);
    });
    it('should return files for single-level folder', async () => {
      jest.spyOn(fs.promises, 'readdir').mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false } as any,
        { name: 'file2.txt', isDirectory: () => false } as any,
      ] as any);
      const result = await service.getAllFilesFromFolder('folder', false);
      expect(result.some(f => f.endsWith('file1.txt'))).toBe(true);
      expect(result.some(f => f.endsWith('file2.txt'))).toBe(true);
    });
    it('should recurse into subfolders if recurse=true', async () => {
      const mockReaddir = jest.spyOn(fs.promises, 'readdir');
      mockReaddir.mockImplementation(async (dir) => {
      if (dir.toString().endsWith('folder')) {
        return [
          { name: 'file1.txt', isDirectory: () => false },
          { name: 'sub', isDirectory: () => true },
        ] as any;
      } else if (dir.toString().endsWith('sub')) {
        return [
          { name: 'file2.txt', isDirectory: () => false },
        ] as any;
      }
      return [];
    });
      const result = await service.getAllFilesFromFolder('folder', true);
      expect(result.some(f => f.endsWith('file1.txt'))).toBe(true);
      expect(result.some(f => f.endsWith('file2.txt'))).toBe(true);
    });
  });

describe('getAllFileNamesAndPaths', () => {
  it('should return empty array for empty folder', async () => {
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([]);
    const result = await service.getAllFileNamesAndPaths('empty', false);
    expect(result).toEqual([]);
  });
  it('should return file name and path for single-level folder', async () => {
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([
      { name: 'file1.txt', isDirectory: () => false } as any,
      { name: 'file2.txt', isDirectory: () => false } as any,
    ] as any);
    const result = await service.getAllFileNamesAndPaths('folder', false);
    expect(result.some(f => f.name === 'file1.txt')).toBe(true);
    expect(result.some(f => f.name === 'file2.txt')).toBe(true);
  });
  it('should recurse into subfolders if recurse=true', async () => {
    const mockReaddir = jest.spyOn(fs.promises, 'readdir');
    mockReaddir.mockImplementation(async (dir) => {
      if (dir.toString().endsWith('folder')) {
        return [
          { name: 'file1.txt', isDirectory: () => false },
          { name: 'sub', isDirectory: () => true },
        ] as any;
      } else if (dir.toString().endsWith('sub')) {
        return [
          { name: 'file2.txt', isDirectory: () => false },
        ] as any;
      }
      return [];
    });
    const result = await service.getAllFileNamesAndPaths('folder', true);
    expect(result.some(f => f.name === 'file1.txt')).toBe(true);
    expect(result.some(f => f.name === 'file2.txt')).toBe(true);
  });
});
});
