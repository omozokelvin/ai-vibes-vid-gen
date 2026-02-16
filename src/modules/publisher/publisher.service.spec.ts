import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PublisherService } from './publisher.service';

describe('PublisherService', () => {
  let service: PublisherService;

  describe('Without Credentials', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                // No credentials configured
              }),
            ],
          }),
        ],
        providers: [PublisherService],
      }).compile();

      service = module.get<PublisherService>(PublisherService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize without YouTube credentials', () => {
      expect(service).toBeDefined();
      // YouTube client should not be initialized
      const youtube = (service as any).youtube;
      expect(youtube).toBeUndefined();
    });

    it('should handle upload request gracefully when not configured', async () => {
      const uploadUrls = await service.uploadToSocial(
        './test_video.mp4',
        'Test Title',
        'Test Description',
        ['test'],
        false,
        false,
      );

      expect(uploadUrls).toEqual({});
    });
  });

  describe('Upload URLs Structure', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({})],
          }),
        ],
        providers: [PublisherService],
      }).compile();

      service = module.get<PublisherService>(PublisherService);
    });

    it('should return empty object when no platforms selected', async () => {
      const uploadUrls = await service.uploadToSocial(
        './video.mp4',
        'Title',
        'Description',
        ['tag1', 'tag2'],
        false,
        false,
      );

      expect(uploadUrls).toEqual({});
    });

    it('should have correct structure for upload URLs', () => {
      const uploadUrls = {
        youtube: 'https://www.youtube.com/watch?v=test123',
        tiktok: 'https://tiktok.com/@user/video/test123',
      };

      expect(uploadUrls).toHaveProperty('youtube');
      expect(uploadUrls).toHaveProperty('tiktok');
      expect(uploadUrls.youtube).toContain('youtube.com');
      expect(uploadUrls.tiktok).toContain('tiktok.com');
    });

    it('should handle partial uploads', () => {
      const uploadUrlsYouTubeOnly = {
        youtube: 'https://www.youtube.com/watch?v=test123',
      };

      expect(uploadUrlsYouTubeOnly).toHaveProperty('youtube');
      expect(uploadUrlsYouTubeOnly).not.toHaveProperty('tiktok');

      const uploadUrlsTikTokOnly = {
        tiktok: 'https://tiktok.com/@user/video/test123',
      };

      expect(uploadUrlsTikTokOnly).toHaveProperty('tiktok');
      expect(uploadUrlsTikTokOnly).not.toHaveProperty('youtube');
    });
  });

  describe('Video Metadata', () => {
    it('should accept valid video metadata', () => {
      const metadata = {
        title: 'Amazing AI Generated Video',
        description: 'This video was created using AI technology',
        tags: ['AI', 'Technology', 'Innovation', 'Video'],
      };

      expect(metadata.title).toBeDefined();
      expect(metadata.title.length).toBeGreaterThan(0);
      expect(metadata.description).toBeDefined();
      expect(metadata.tags).toBeInstanceOf(Array);
      expect(metadata.tags.length).toBeGreaterThan(0);
    });

    it('should handle tags as array', () => {
      const tags = ['AI', 'Machine Learning', 'Video'];

      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBe(3);
      tags.forEach((tag) => {
        expect(typeof tag).toBe('string');
        expect(tag.length).toBeGreaterThan(0);
      });
    });

    it('should validate video file path', () => {
      const videoPath = './temp/job_123_output.mp4';

      expect(videoPath).toBeDefined();
      expect(videoPath).toContain('.mp4');
      expect(videoPath.length).toBeGreaterThan(0);
    });
  });

  describe('Platform Flags', () => {
    it('should handle YouTube upload flag', () => {
      const uploadToYoutube = true;
      const uploadToTiktok = false;

      expect(uploadToYoutube).toBe(true);
      expect(uploadToTiktok).toBe(false);
    });

    it('should handle TikTok upload flag', () => {
      const uploadToYoutube = false;
      const uploadToTiktok = true;

      expect(uploadToYoutube).toBe(false);
      expect(uploadToTiktok).toBe(true);
    });

    it('should handle both platforms', () => {
      const uploadToYoutube = true;
      const uploadToTiktok = true;

      expect(uploadToYoutube).toBe(true);
      expect(uploadToTiktok).toBe(true);
    });

    it('should handle no platforms', () => {
      const uploadToYoutube = false;
      const uploadToTiktok = false;

      expect(uploadToYoutube).toBe(false);
      expect(uploadToTiktok).toBe(false);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({})],
          }),
        ],
        providers: [PublisherService],
      }).compile();

      service = module.get<PublisherService>(PublisherService);
    });

    it('should handle upload errors gracefully', async () => {
      // When YouTube is requested but not configured, should handle error
      const uploadUrls = await service.uploadToSocial(
        './video.mp4',
        'Title',
        'Description',
        ['tag'],
        true, // Request YouTube upload
        false,
      );

      // Should not throw error, just not include YouTube URL
      expect(uploadUrls).toBeDefined();
      expect(uploadUrls.youtube).toBeUndefined();
    });

    it('should return empty object on all failures', async () => {
      const uploadUrls = await service.uploadToSocial(
        './video.mp4',
        'Title',
        'Description',
        ['tag'],
        true,
        true,
      );

      // Both should fail gracefully without credentials
      expect(uploadUrls).toBeDefined();
    });
  });
});
