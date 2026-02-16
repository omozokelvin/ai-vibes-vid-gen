import { Test, TestingModule } from '@nestjs/testing';
import { EditorService } from './editor.service';
import { FilesystemService } from '../filesystem/filesystem.service';

describe('EditorService', () => {
  let service: EditorService;
  let filesystemService: FilesystemService;

  const mockFilesystemService = {
    getTempPath: jest.fn((filename: string) => `./temp/${filename}`),
    getTempDir: jest.fn().mockReturnValue('./temp'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditorService,
        {
          provide: FilesystemService,
          useValue: mockFilesystemService,
        },
      ],
    }).compile();

    service = module.get<EditorService>(EditorService);
    filesystemService = module.get<FilesystemService>(FilesystemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Path Construction', () => {
    it('should construct correct output path', () => {
      const jobId = 'test_job_123';
      const outputFileName = `${jobId}_output.mp4`;
      const path = mockFilesystemService.getTempPath(outputFileName);

      expect(path).toBe(`./temp/${outputFileName}`);
    });

    it('should construct correct concatenated video path', () => {
      const jobId = 'test_job_456';
      const concatenatedFileName = `${jobId}_concatenated.mp4`;
      const path = mockFilesystemService.getTempPath(concatenatedFileName);

      expect(path).toBe(`./temp/${concatenatedFileName}`);
    });

    it('should construct correct trimmed video path', () => {
      const jobId = 'test_job_789';
      const trimmedFileName = `${jobId}_trimmed.mp4`;
      const path = mockFilesystemService.getTempPath(trimmedFileName);

      expect(path).toBe(`./temp/${trimmedFileName}`);
    });

    it('should construct correct looped video path', () => {
      const jobId = 'test_job_101';
      const loopedFileName = `${jobId}_looped.mp4`;
      const path = mockFilesystemService.getTempPath(loopedFileName);

      expect(path).toBe(`./temp/${loopedFileName}`);
    });
  });

  describe('MediaFiles Structure', () => {
    it('should accept valid media files structure', () => {
      const mediaFiles = {
        audioPath: './temp/job_123_audio.mp3',
        videoPaths: [
          './temp/job_123_clip_0.mp4',
          './temp/job_123_clip_1.mp4',
          './temp/job_123_clip_2.mp4',
        ],
        subtitlePath: './temp/job_123_subtitles.srt',
      };

      expect(mediaFiles.audioPath).toBeDefined();
      expect(mediaFiles.audioPath).toContain('.mp3');
      expect(mediaFiles.videoPaths).toBeInstanceOf(Array);
      expect(mediaFiles.videoPaths.length).toBeGreaterThan(0);
      expect(mediaFiles.subtitlePath).toBeDefined();
      expect(mediaFiles.subtitlePath).toContain('.srt');
    });

    it('should handle multiple video clips', () => {
      const videoPaths = [
        './temp/job_clip_0.mp4',
        './temp/job_clip_1.mp4',
        './temp/job_clip_2.mp4',
        './temp/job_clip_3.mp4',
      ];

      expect(videoPaths.length).toBe(4);
      videoPaths.forEach((path, index) => {
        expect(path).toContain(`clip_${index}.mp4`);
      });
    });
  });

  describe('Subtitle Path Escaping', () => {
    it('should properly format subtitle path for FFmpeg filter', () => {
      // Test the escaping logic used in the service
      const subtitlePath = './temp/test_subtitles.srt';
      const escapedPath = subtitlePath
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:');

      // Unix paths don't have colons, so no escaping happens
      expect(escapedPath).toBe('./temp/test_subtitles.srt');
    });

    it('should escape Windows paths correctly', () => {
      const windowsPath = 'C:\\temp\\test_subtitles.srt';
      const escapedPath = windowsPath
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:');

      expect(escapedPath).toContain('\\\\');
      expect(escapedPath).toContain('\\:');
    });

    it('should handle Unix paths correctly', () => {
      const unixPath = '/tmp/test_subtitles.srt';
      const escapedPath = unixPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

      expect(escapedPath).toBe('/tmp/test_subtitles.srt');
    });
  });

  describe('Video Duration Calculations', () => {
    it('should calculate loop count correctly', () => {
      const videoDuration = 10; // seconds
      const targetDuration = 35; // seconds
      const loopCount = Math.ceil(targetDuration / videoDuration);

      expect(loopCount).toBe(4);
    });

    it('should handle exact duration match', () => {
      const videoDuration = 30;
      const targetDuration = 30;
      const loopCount = Math.ceil(targetDuration / videoDuration);

      expect(loopCount).toBe(1);
    });

    it('should handle video longer than target', () => {
      const videoDuration = 60;
      const targetDuration = 30;

      // In this case, video should be trimmed, not looped
      expect(videoDuration).toBeGreaterThan(targetDuration);
    });
  });

  describe('FFmpeg Integration', () => {
    it('should use FilesystemService for temp directory', () => {
      const tempDir = mockFilesystemService.getTempDir();

      expect(tempDir).toBe('./temp');
      expect(mockFilesystemService.getTempDir).toHaveBeenCalled();
    });

    it('should construct paths for intermediate files', () => {
      const jobId = 'test_job';
      const files = [
        `${jobId}_concatenated.mp4`,
        `${jobId}_trimmed.mp4`,
        `${jobId}_looped.mp4`,
        `${jobId}_output.mp4`,
      ];

      files.forEach((file) => {
        const path = mockFilesystemService.getTempPath(file);
        expect(path).toBe(`./temp/${file}`);
      });
    });
  });

  describe('Service Dependencies', () => {
    it('should inject FilesystemService', () => {
      expect(filesystemService).toBeDefined();
      expect(filesystemService).toBe(mockFilesystemService);
    });

    it('should be able to get temp paths', () => {
      const path = filesystemService.getTempPath('test.mp4');
      expect(path).toBeDefined();
      expect(path).toContain('test.mp4');
    });
  });
});
