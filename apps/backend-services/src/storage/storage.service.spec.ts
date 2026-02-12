import { Test, TestingModule } from '@nestjs/testing';
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create storage directory if not exists', async () => {
    const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
    await service['ensureStorageDirectory']();
    expect(mkdirSpy).toHaveBeenCalled();
  });

  it('should save a file', async () => {
    jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);
    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
    const buffer = Buffer.from('test');
    const result = await service.saveFile('test.txt', buffer);
    expect(result).toContain('test.txt');
  });

  it('should delete a file', async () => {
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);
    await expect(service.deleteFile('test.txt')).resolves.toBeUndefined();
  });

  it('should delete a folder recursively', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs.promises, 'rm').mockResolvedValue(undefined as any);
    await expect(service.deleteFolderRecursive('folder')).resolves.toBeUndefined();
  });

  it('should warn if folder does not exist when deleting', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const loggerWarn = jest.spyOn(service['logger'], 'warn').mockImplementation();
    await service.deleteFolderRecursive('folder');
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('should get storage path', () => {
    const result = service.getStoragePath('gid', Operation.CLASSIFICATION, 'sub');
    expect(result).toContain('gid');
    expect(result).toContain('classification');
    expect(result).toContain('sub');
    expect(result).toEqual(path.join('gid', 'classification', 'sub'));
  });
});
