import { Test, TestingModule } from '@nestjs/testing';
import { VideoGenerationProcessor } from './video-generation.processor';
import { ScriptService } from '../modules/script/script.service';
import { MediaService } from '../modules/media/media.service';
import { EditorService } from '../modules/editor/editor.service';
import { PublisherService } from '../modules/publisher/publisher.service';
import { FilesystemService } from '../modules/filesystem/filesystem.service';
import { Job } from 'bull';

describe('VideoGenerationProcessor', () => {
  let processor: VideoGenerationProcessor;

  const mockScriptService = {
    generateScript: jest.fn().mockResolvedValue({
      script: 'Test script',
      visual_prompts: [{ index: 0, prompt: 'Test prompt', duration: 10 }],
      timestamps: [{ start: 0, end: 10, text: 'Test' }],
    }),
  };

  const mockMediaService = {
    generateMedia: jest.fn().mockResolvedValue({
      audioPath: './temp/audio.mp3',
      videoPaths: ['./temp/clip_0.mp4'],
      subtitlePath: './temp/subtitles.srt',
    }),
  };

  const mockEditorService = {
    assembleVideo: jest.fn().mockResolvedValue('./temp/output.mp4'),
  };

  const mockPublisherService = {
    uploadToSocial: jest.fn().mockResolvedValue({
      youtube: 'https://youtube.com/watch?v=test',
    }),
  };

  const mockFilesystemService = {
    cleanupTemp: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoGenerationProcessor,
        { provide: ScriptService, useValue: mockScriptService },
        { provide: MediaService, useValue: mockMediaService },
        { provide: EditorService, useValue: mockEditorService },
        { provide: PublisherService, useValue: mockPublisherService },
        { provide: FilesystemService, useValue: mockFilesystemService },
      ],
    }).compile();

    processor = module.get<VideoGenerationProcessor>(VideoGenerationProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleVideoGeneration', () => {
    const mockJob = {
      data: {
        jobId: 'test_job_123',
        prompt: 'Test video about AI',
        uploadToYoutube: false,
        uploadToTiktok: false,
      },
      progress: jest.fn(),
    } as unknown as Job;

    it('should process video generation successfully', async () => {
      const result = await processor.handleVideoGeneration(mockJob);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.jobId).toBe('test_job_123');
      expect(result.finalVideoPath).toBe('./temp/output.mp4');
      expect(result.scriptData).toBeDefined();
    });

    it('should call all services in correct order', async () => {
      await processor.handleVideoGeneration(mockJob);

      expect(mockScriptService.generateScript).toHaveBeenCalledWith(
        'Test video about AI',
        'test_job_123',
      );
      expect(mockMediaService.generateMedia).toHaveBeenCalledWith(
        expect.any(Object),
        'test_job_123',
      );
      expect(mockEditorService.assembleVideo).toHaveBeenCalledWith(
        expect.any(Object),
        'test_job_123',
      );
    });

    it('should update progress during processing', async () => {
      await processor.handleVideoGeneration(mockJob);

      expect(mockJob.progress).toHaveBeenCalledWith(10);
      expect(mockJob.progress).toHaveBeenCalledWith(25);
      expect(mockJob.progress).toHaveBeenCalledWith(50);
      expect(mockJob.progress).toHaveBeenCalledWith(75);
      expect(mockJob.progress).toHaveBeenCalledWith(90);
      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should skip upload when not requested', async () => {
      const result = await processor.handleVideoGeneration(mockJob);

      expect(mockPublisherService.uploadToSocial).not.toHaveBeenCalled();
      expect(result.uploadUrls).toEqual({});
    });

    it('should upload to YouTube when requested', async () => {
      const jobWithUpload = {
        ...mockJob,
        data: {
          ...mockJob.data,
          uploadToYoutube: true,
          title: 'Test Video',
          description: 'Test Description',
          tags: 'AI,Test',
        },
      } as unknown as Job;

      const result = await processor.handleVideoGeneration(jobWithUpload);

      expect(mockPublisherService.uploadToSocial).toHaveBeenCalledWith(
        './temp/output.mp4',
        'Test Video',
        'Test Description',
        ['AI', 'Test'],
        true,
        false,
      );
      expect(result.uploadUrls).toBeDefined();
    });

    it('should use default title and description if not provided', async () => {
      const jobWithUpload = {
        ...mockJob,
        data: {
          ...mockJob.data,
          uploadToYoutube: true,
        },
      } as unknown as Job;

      await processor.handleVideoGeneration(jobWithUpload);

      expect(mockPublisherService.uploadToSocial).toHaveBeenCalledWith(
        expect.any(String),
        'AI Generated Video: Test video about AI',
        'This video was automatically generated about: Test video about AI',
        ['AI', 'Generated', 'Video'],
        true,
        false,
      );
    });

    it('should parse tags from comma-separated string', async () => {
      const jobWithTags = {
        ...mockJob,
        data: {
          ...mockJob.data,
          uploadToYoutube: true,
          tags: 'AI, Machine Learning, Technology, Video',
        },
      } as unknown as Job;

      await processor.handleVideoGeneration(jobWithTags);

      expect(mockPublisherService.uploadToSocial).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        ['AI', 'Machine Learning', 'Technology', 'Video'],
        true,
        false,
      );
    });

    it('should handle errors and rethrow', async () => {
      mockScriptService.generateScript.mockRejectedValueOnce(
        new Error('Script generation failed'),
      );

      await expect(processor.handleVideoGeneration(mockJob)).rejects.toThrow(
        'Script generation failed',
      );
    });

    it('should upload to both platforms when requested', async () => {
      const jobWithBothUploads = {
        ...mockJob,
        data: {
          ...mockJob.data,
          uploadToYoutube: true,
          uploadToTiktok: true,
        },
      } as unknown as Job;

      await processor.handleVideoGeneration(jobWithBothUploads);

      expect(mockPublisherService.uploadToSocial).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        true,
        true,
      );
    });

    it('should return script data in result', async () => {
      const result = await processor.handleVideoGeneration(mockJob);

      expect(result.scriptData).toEqual({
        script: 'Test script',
        visual_prompts: [{ index: 0, prompt: 'Test prompt', duration: 10 }],
        timestamps: [{ start: 0, end: 10, text: 'Test' }],
      });
    });

    it('should return final video path in result', async () => {
      const result = await processor.handleVideoGeneration(mockJob);

      expect(result.finalVideoPath).toBe('./temp/output.mp4');
    });
  });
});
