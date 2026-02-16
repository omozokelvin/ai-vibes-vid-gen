import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';

describe('AppController', () => {
  let controller: AppController;
  let mockQueue: any;

  beforeEach(async () => {
    // Create a mock queue
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'mock-queue-job-id' }),
      getJob: jest.fn().mockResolvedValue(null),
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

  it('should return welcome message', () => {
    const result = controller.getHello();
    expect(result).toBe('AI Vibes Video Generation API is running!');
  });

  it('should generate unique job IDs', async () => {
    const dto = {
      prompt: 'Test video',
      uploadToYoutube: false,
      uploadToTiktok: false,
      title: 'Test',
      description: 'Test description',
      tags: 'test, video',
    };

    const result1 = await controller.generateVideo(dto);
    const result2 = await controller.generateVideo(dto);

    expect(result1.jobId).toBeDefined();
    expect(result2.jobId).toBeDefined();
    expect(result1.jobId).not.toBe(result2.jobId);
    expect(result1.status).toBe('queued');
    expect(mockQueue.add).toHaveBeenCalledTimes(2);
  });

  it('should return job list information', async () => {
    const result = await controller.listJobs();

    expect(result).toBeDefined();
    expect(result.waiting).toBe(0);
    expect(result.active).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockQueue.getWaiting).toHaveBeenCalled();
    expect(mockQueue.getActive).toHaveBeenCalled();
  });
});
