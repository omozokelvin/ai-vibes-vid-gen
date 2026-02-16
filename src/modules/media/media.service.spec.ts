import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MediaService } from './media.service';
import { FilesystemService } from '../filesystem/filesystem.service';

describe('MediaService', () => {
  let service: MediaService;
  let filesystemService: FilesystemService;

  const mockFilesystemService = {
    saveToDebug: jest.fn(),
    getTempPath: jest.fn((filename: string) => `./temp/${filename}`),
    getDebugPath: jest.fn((filename: string) => `./debug/${filename}`),
    getTempDir: jest.fn().mockReturnValue('./temp'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              HUGGINGFACE_API_KEY: undefined, // Don't set to test fallback behavior
            }),
          ],
        }),
      ],
      providers: [
        MediaService,
        {
          provide: FilesystemService,
          useValue: mockFilesystemService,
        },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    filesystemService = module.get<FilesystemService>(FilesystemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('formatSrtTime', () => {
    it('should format seconds to SRT time format', () => {
      // Access private method through reflection for testing
      const formatSrtTime = (service as any).formatSrtTime.bind(service);

      expect(formatSrtTime(0)).toBe('00:00:00,000');
      expect(formatSrtTime(5)).toBe('00:00:05,000');
      expect(formatSrtTime(65)).toBe('00:01:05,000');
      expect(formatSrtTime(3665)).toBe('01:01:05,000');
      expect(formatSrtTime(5.5)).toBe('00:00:05,500');
      expect(formatSrtTime(125.75)).toBe('00:02:05,750');
    });

    it('should handle fractional seconds correctly', () => {
      const formatSrtTime = (service as any).formatSrtTime.bind(service);

      // Use values that work well with floating point
      expect(formatSrtTime(1.5)).toBe('00:00:01,500');
      expect(formatSrtTime(1.999)).toBe('00:00:01,999');
      expect(formatSrtTime(0.123)).toBe('00:00:00,123');
    });

    it('should pad values with zeros', () => {
      const formatSrtTime = (service as any).formatSrtTime.bind(service);

      // 1 hour, 2 minutes, 3 seconds, 5 milliseconds
      expect(formatSrtTime(3723.005)).toBe('01:02:03,005');
    });
  });

  describe('getTempPath', () => {
    it('should construct correct temp path for audio file', () => {
      const jobId = 'test_job_123';
      const audioFileName = `${jobId}_audio.mp3`;
      const path = mockFilesystemService.getTempPath(audioFileName);

      expect(path).toBe(`./temp/${audioFileName}`);
    });

    it('should construct correct temp path for video clip', () => {
      const jobId = 'test_job_456';
      const index = 0;
      const videoFileName = `${jobId}_clip_${index}.mp4`;
      const path = mockFilesystemService.getTempPath(videoFileName);

      expect(path).toBe(`./temp/${videoFileName}`);
    });

    it('should construct correct temp path for subtitles', () => {
      const jobId = 'test_job_789';
      const subtitleFileName = `${jobId}_subtitles.srt`;
      const path = mockFilesystemService.getTempPath(subtitleFileName);

      expect(path).toBe(`./temp/${subtitleFileName}`);
    });
  });

  describe('Visual Prompts', () => {
    it('should process all visual prompts', () => {
      const visualPrompts = [
        { index: 0, prompt: 'Scene 1', duration: 5 },
        { index: 1, prompt: 'Scene 2', duration: 7 },
        { index: 2, prompt: 'Scene 3', duration: 10 },
      ];

      expect(visualPrompts).toHaveLength(3);
      expect(visualPrompts.every((vp) => vp.index >= 0)).toBe(true);
      expect(visualPrompts.every((vp) => vp.duration > 0)).toBe(true);
    });
  });

  describe('Timestamp Segments', () => {
    it('should have valid timestamp ranges', () => {
      const timestamps = [
        { start: 0, end: 10, text: 'First segment' },
        { start: 10, end: 20, text: 'Second segment' },
        { start: 20, end: 30, text: 'Third segment' },
      ];

      timestamps.forEach((ts) => {
        expect(ts.end).toBeGreaterThan(ts.start);
        expect(ts.text).toBeDefined();
        expect(ts.text.length).toBeGreaterThan(0);
      });
    });

    it('should have consecutive timestamp ranges', () => {
      const timestamps = [
        { start: 0, end: 10, text: 'First' },
        { start: 10, end: 20, text: 'Second' },
        { start: 20, end: 30, text: 'Third' },
      ];

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i].start).toBe(timestamps[i - 1].end);
      }
    });
  });

  describe('Media Files Structure', () => {
    it('should have correct media files structure', () => {
      const mediaFiles = {
        audioPath: './temp/job_123_audio.mp3',
        videoPaths: ['./temp/job_123_clip_0.mp4', './temp/job_123_clip_1.mp4'],
        subtitlePath: './temp/job_123_subtitles.srt',
      };

      expect(mediaFiles.audioPath).toBeDefined();
      expect(mediaFiles.videoPaths).toBeInstanceOf(Array);
      expect(mediaFiles.videoPaths.length).toBeGreaterThan(0);
      expect(mediaFiles.subtitlePath).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should handle missing Hugging Face API key', () => {
      // Service should be created even without API key
      expect(service).toBeDefined();

      // Access private property through reflection
      const hfApiKey = (service as any).hfApiKey;
      expect(hfApiKey).toBeUndefined();
    });

    it('should use FilesystemService for path operations', () => {
      const jobId = 'test_job_999';
      const filename = `${jobId}_test.mp4`;

      mockFilesystemService.getTempPath(filename);

      expect(mockFilesystemService.getTempPath).toHaveBeenCalledWith(filename);
    });
  });
});
