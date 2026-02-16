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

  describe('subtitle generation', () => {
    it('should generate subtitles with proper SRT formatting', async () => {
      const jobId = 'test_job_' + Date.now();
      const timestamps = [
        { start: 0, end: 2.5, text: 'First subtitle' },
        { start: 2.5, end: 5.0, text: 'Second subtitle' },
        { start: 65.5, end: 70.0, text: 'Third subtitle after one minute' },
      ];

      // Generate subtitles through the private method for this test
      const subtitlePath = await (service as any).generateSubtitles(
        timestamps,
        jobId,
      );

      expect(subtitlePath).toBeDefined();
      expect(subtitlePath).toContain('.srt');
      expect(fs.existsSync(subtitlePath)).toBe(true);

      // Verify the content has proper SRT formatting
      const content = fs.readFileSync(subtitlePath, 'utf-8');
      expect(content).toContain('00:00:00,000 --> 00:00:02,500');
      expect(content).toContain('00:00:02,500 --> 00:00:05,000');
      expect(content).toContain('00:01:05,500 --> 00:01:10,000');
      expect(content).toContain('First subtitle');
      expect(content).toContain('Second subtitle');

      // Cleanup
      if (fs.existsSync(subtitlePath)) {
        fs.unlinkSync(subtitlePath);
      }
    });
  });
});
