import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MediaService } from '../src/modules/media/media.service';
import { FilesystemModule } from '../src/modules/filesystem/filesystem.module';
import { FilesystemService } from '../src/modules/filesystem/filesystem.service';
import * as fs from 'fs';

describe('MediaService', () => {
  let service: MediaService;
  let filesystemService: FilesystemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), FilesystemModule],
      providers: [MediaService],
    }).compile();

    service = module.get<MediaService>(MediaService);
    filesystemService = module.get<FilesystemService>(FilesystemService);

    // Ensure temp directory exists
    const tempDir = filesystemService.getTempDir();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('formatSrtTime', () => {
    it('should format seconds to SRT time format correctly', () => {
      // Access the private method via reflection for testing
      const formatSrtTime = (service as any).formatSrtTime.bind(service);

      expect(formatSrtTime(0)).toBe('00:00:00,000');
      expect(formatSrtTime(65.5)).toBe('00:01:05,500');
      expect(formatSrtTime(3661.123)).toBe('01:01:01,123');
    });
  });

  describe('generateSubtitles', () => {
    it('should generate subtitles with proper formatting', async () => {
      const jobId = 'test_job_' + Date.now();
      const timestamps = [
        { start: 0, end: 2.5, text: 'First subtitle' },
        { start: 2.5, end: 5.0, text: 'Second subtitle' },
      ];

      const subtitlePath = await (service as any).generateSubtitles(
        timestamps,
        jobId,
      );

      expect(subtitlePath).toBeDefined();
      expect(subtitlePath).toContain('.srt');
      expect(fs.existsSync(subtitlePath)).toBe(true);

      // Cleanup
      if (fs.existsSync(subtitlePath)) {
        fs.unlinkSync(subtitlePath);
      }
    });
  });
});
