import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FilesystemService } from './filesystem.service';
import * as fs from 'fs';
import * as path from 'path';

describe('FilesystemService', () => {
  let service: FilesystemService;
  const testTempDir = './test-temp';
  const testDebugDir = './test-debug';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              TEMP_DIR: testTempDir,
              DEBUG_DIR: testDebugDir,
            }),
          ],
        }),
      ],
      providers: [FilesystemService],
    }).compile();

    service = module.get<FilesystemService>(FilesystemService);
    
    // Manually trigger onModuleInit to ensure directories are created
    await service.onModuleInit();
  });

  afterEach(() => {
    // Cleanup test directories
    [testTempDir, testDebugDir].forEach((dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Directory Management', () => {
    it('should create temp directory on module init', () => {
      expect(fs.existsSync(testTempDir)).toBe(true);
    });

    it('should create debug directory on module init', () => {
      expect(fs.existsSync(testDebugDir)).toBe(true);
    });

    it('should return correct temp directory path', () => {
      expect(service.getTempDir()).toBe(testTempDir);
    });

    it('should return correct debug directory path', () => {
      expect(service.getDebugDir()).toBe(testDebugDir);
    });
  });

  describe('File Path Operations', () => {
    it('should return correct temp file path', () => {
      const filename = 'test.txt';
      const expectedPath = path.join(testTempDir, filename);
      expect(service.getTempPath(filename)).toBe(expectedPath);
    });

    it('should return correct debug file path', () => {
      const filename = 'test.json';
      const expectedPath = path.join(testDebugDir, filename);
      expect(service.getDebugPath(filename)).toBe(expectedPath);
    });
  });

  describe('Save to Debug', () => {
    it('should save string content to debug directory', () => {
      const filename = 'test.txt';
      const content = 'Hello, World!';
      const filePath = service.saveToDebug(filename, content);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
    });

    it('should save JSON object to debug directory', () => {
      const filename = 'test.json';
      const content = { key: 'value', number: 42 };
      const filePath = service.saveToDebug(filename, content);

      expect(fs.existsSync(filePath)).toBe(true);
      const savedContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(savedContent).toEqual(content);
    });

    it('should save Buffer content to debug directory', () => {
      const filename = 'test.bin';
      const content = Buffer.from('Binary content');
      const filePath = service.saveToDebug(filename, content);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath)).toEqual(content);
    });
  });

  describe('Save to Temp', () => {
    it('should save string content to temp directory', () => {
      const filename = 'temp.txt';
      const content = 'Temporary content';
      const filePath = service.saveToTemp(filename, content);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
    });

    it('should save JSON object to temp directory', () => {
      const filename = 'temp.json';
      const content = { temp: true, data: [1, 2, 3] };
      const filePath = service.saveToTemp(filename, content);

      expect(fs.existsSync(filePath)).toBe(true);
      const savedContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(savedContent).toEqual(content);
    });

    it('should save Buffer content to temp directory', () => {
      const filename = 'temp.bin';
      const content = Buffer.from('Temporary binary');
      const filePath = service.saveToTemp(filename, content);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath)).toEqual(content);
    });
  });

  describe('Cleanup Temp', () => {
    it('should cleanup temp files matching job ID pattern', () => {
      const jobId = 'test_job_123';
      
      // Create multiple files
      service.saveToTemp(`${jobId}_file1.txt`, 'content1');
      service.saveToTemp(`${jobId}_file2.txt`, 'content2');
      service.saveToTemp('other_file.txt', 'other content');

      // Cleanup files for this job
      service.cleanupTemp(jobId);

      // Job files should be deleted
      expect(fs.existsSync(service.getTempPath(`${jobId}_file1.txt`))).toBe(
        false,
      );
      expect(fs.existsSync(service.getTempPath(`${jobId}_file2.txt`))).toBe(
        false,
      );

      // Other files should remain
      expect(fs.existsSync(service.getTempPath('other_file.txt'))).toBe(true);
    });

    it('should handle cleanup when no matching files exist', () => {
      const jobId = 'nonexistent_job';
      
      // Should not throw error
      expect(() => service.cleanupTemp(jobId)).not.toThrow();
    });
  });
});
