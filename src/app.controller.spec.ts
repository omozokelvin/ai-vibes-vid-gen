import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { Queue } from 'bull';
import { GenerateVideoDto } from './common/dto/generate-video.dto';

describe('AppController', () => {
  let controller: AppController;
  let mockQueue: Partial<Queue>;

  const mockJob = {
    id: 'mock-queue-job-123',
    data: {},
    progress: jest.fn().mockReturnValue(0),
    getState: jest.fn().mockResolvedValue('completed'),
    returnvalue: { success: true },
  };

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue(mockJob),
      getJob: jest.fn().mockResolvedValue(mockJob),
      getWaiting: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: 'BullQueue_video-generation',
          useValue: mockQueue,
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /', () => {
    it('should return welcome message', () => {
      const result = controller.getHello();
      expect(result).toBe('AI Vibes Video Generation API is running!');
    });
  });

  describe('POST /video/generate', () => {
    it('should create a video generation job', async () => {
      const dto: GenerateVideoDto = {
        prompt: 'Test video about AI',
        uploadToYoutube: false,
        uploadToTiktok: false,
      };

      const result = await controller.generateVideo(dto);

      expect(result).toBeDefined();
      expect(result.message).toBe('Video generation job started');
      expect(result.jobId).toBeDefined();
      expect(result.queueJobId).toBe('mock-queue-job-123');
      expect(result.status).toBe('queued');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate',
        expect.objectContaining({
          prompt: dto.prompt,
        }),
        expect.any(Object),
      );
    });

    it('should generate unique job IDs', async () => {
      const dto: GenerateVideoDto = {
        prompt: 'First video',
      };

      const result1 = await controller.generateVideo(dto);
      const result2 = await controller.generateVideo(dto);

      expect(result1.jobId).toBeDefined();
      expect(result2.jobId).toBeDefined();
      expect(result1.jobId).not.toBe(result2.jobId);
    });

    it('should include upload options in job data', async () => {
      const dto: GenerateVideoDto = {
        prompt: 'Test video',
        uploadToYoutube: true,
        uploadToTiktok: true,
        title: 'My Video',
        description: 'Test description',
        tags: 'AI,Tech,Video',
      };

      await controller.generateVideo(dto);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate',
        expect.objectContaining({
          uploadToYoutube: true,
          uploadToTiktok: true,
          title: 'My Video',
          description: 'Test description',
          tags: 'AI,Tech,Video',
        }),
        expect.any(Object),
      );
    });

    it('should configure retry attempts', async () => {
      const dto: GenerateVideoDto = {
        prompt: 'Test',
      };

      await controller.generateVideo(dto);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate',
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }),
      );
    });
  });

  describe('GET /video/status/:jobId', () => {
    it('should return job status', async () => {
      const queueJobId = 'test-job-123';

      const result = await controller.getJobStatus(queueJobId);

      expect(result).toBeDefined();
      expect(result.jobId).toBe(queueJobId);
      expect(result.state).toBe('completed');
      expect(result.progress).toBe(0);
      expect(result.result).toEqual({ success: true });
      expect(mockQueue.getJob).toHaveBeenCalledWith(queueJobId);
    });

    it('should handle job not found', async () => {
      (mockQueue.getJob as jest.Mock).mockResolvedValueOnce(null);

      const result = await controller.getJobStatus('nonexistent');

      expect(result).toEqual({
        error: 'Job not found',
      });
    });

    it('should return job progress', async () => {
      const mockProgressJob = {
        ...mockJob,
        progress: jest.fn().mockReturnValue(50),
        getState: jest.fn().mockResolvedValue('active'),
      };
      (mockQueue.getJob as jest.Mock).mockResolvedValueOnce(mockProgressJob);

      const result = await controller.getJobStatus('in-progress-job');

      expect(result.progress).toBe(50);
      expect(result.state).toBe('active');
    });
  });

  describe('GET /video/jobs', () => {
    it('should list all jobs', async () => {
      const waitingJobs = [{ id: '1', data: { prompt: 'test1' } }];
      const activeJobs = [{ id: '2', data: { prompt: 'test2' } }];
      const completedJobs = [
        { id: '3', data: { prompt: 'test3' }, returnvalue: { success: true } },
      ];
      const failedJobs = [
        {
          id: '4',
          data: { prompt: 'test4' },
          failedReason: 'Error message',
        },
      ];

      (mockQueue.getWaiting as jest.Mock).mockResolvedValue(waitingJobs);
      (mockQueue.getActive as jest.Mock).mockResolvedValue(activeJobs);
      (mockQueue.getCompleted as jest.Mock).mockResolvedValue(completedJobs);
      (mockQueue.getFailed as jest.Mock).mockResolvedValue(failedJobs);

      const result = await controller.listJobs();

      expect(result.waiting).toBe(1);
      expect(result.active).toBe(1);
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.jobs.waiting).toHaveLength(1);
      expect(result.jobs.active).toHaveLength(1);
      expect(result.jobs.completed).toHaveLength(1);
      expect(result.jobs.failed).toHaveLength(1);
    });

    it('should limit completed and failed job details', async () => {
      const manyCompleted = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: `${i}`,
          data: { prompt: `test${i}` },
          returnvalue: {},
        }));

      (mockQueue.getCompleted as jest.Mock).mockResolvedValue(manyCompleted);
      (mockQueue.getFailed as jest.Mock).mockResolvedValue([]);

      const result = await controller.listJobs();

      // Should only return first 10
      expect(result.jobs.completed).toHaveLength(10);
    });

    it('should handle empty queues', async () => {
      (mockQueue.getWaiting as jest.Mock).mockResolvedValue([]);
      (mockQueue.getActive as jest.Mock).mockResolvedValue([]);
      (mockQueue.getCompleted as jest.Mock).mockResolvedValue([]);
      (mockQueue.getFailed as jest.Mock).mockResolvedValue([]);

      const result = await controller.listJobs();

      expect(result.waiting).toBe(0);
      expect(result.active).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
