import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ScriptService } from './script.service';
import { FilesystemService } from '../filesystem/filesystem.service';

describe('ScriptService', () => {
  let service: ScriptService;
  let filesystemService: FilesystemService;

  const mockFilesystemService = {
    saveToDebug: jest.fn(),
    getTempDir: jest.fn().mockReturnValue('./temp'),
    getDebugDir: jest.fn().mockReturnValue('./debug'),
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
              // Don't set API key - will trigger fallback behavior
            }),
          ],
        }),
      ],
      providers: [
        ScriptService,
        {
          provide: FilesystemService,
          useValue: mockFilesystemService,
        },
      ],
    }).compile();

    service = module.get<ScriptService>(ScriptService);
    filesystemService = module.get<FilesystemService>(FilesystemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateScript', () => {
    it('should generate fallback script when API is not configured', async () => {
      const jobId = 'test_job_1';
      const prompt = 'test prompt';

      const script = await service.generateScript(prompt, jobId);

      expect(script).toBeDefined();
      expect(script.script).toContain(prompt);
      expect(script.visual_prompts).toHaveLength(3);
      expect(script.timestamps).toHaveLength(3);
      expect(mockFilesystemService.saveToDebug).toHaveBeenCalled();
    });

    it('should create fallback script with correct structure', async () => {
      const jobId = 'test_job_2';
      const prompt = 'space exploration';

      const script = await service.generateScript(prompt, jobId);

      expect(script.script).toBe(
        `This is a video about ${prompt}. We'll explore this fascinating topic in detail.`,
      );
      expect(script.visual_prompts).toHaveLength(3);
      expect(script.visual_prompts[0]).toEqual({
        index: 0,
        prompt: `Cinematic scene showing ${prompt}`,
        duration: 10,
      });
      expect(script.visual_prompts[1]).toEqual({
        index: 1,
        prompt: `Close-up details of ${prompt}`,
        duration: 10,
      });
      expect(script.visual_prompts[2]).toEqual({
        index: 2,
        prompt: `Wide angle view of ${prompt}`,
        duration: 10,
      });
      expect(script.timestamps).toHaveLength(3);
      expect(script.timestamps[0].start).toBe(0);
      expect(script.timestamps[0].end).toBe(10);
    });

    it('should include visual prompts with proper indices', async () => {
      const jobId = 'test_job_3';
      const prompt = 'test visual';

      const script = await service.generateScript(prompt, jobId);

      expect(script.visual_prompts[0].index).toBe(0);
      expect(script.visual_prompts[1].index).toBe(1);
      expect(script.visual_prompts[2].index).toBe(2);
    });

    it('should include timestamps with proper time ranges', async () => {
      const jobId = 'test_job_4';
      const prompt = 'test timing';

      const script = await service.generateScript(prompt, jobId);

      // Each timestamp should have start and end
      script.timestamps.forEach((ts) => {
        expect(ts.start).toBeDefined();
        expect(ts.end).toBeDefined();
        expect(ts.text).toBeDefined();
        expect(ts.end).toBeGreaterThan(ts.start);
      });
    });

    it('should save script to debug directory', async () => {
      const jobId = 'test_job_5';
      const prompt = 'test saving';

      await service.generateScript(prompt, jobId);

      expect(mockFilesystemService.saveToDebug).toHaveBeenCalledWith(
        `${jobId}_script.json`,
        expect.objectContaining({
          script: expect.any(String),
          visual_prompts: expect.any(Array),
          timestamps: expect.any(Array),
        }),
      );
    });

    it('should generate different prompts for each visual segment', async () => {
      const jobId = 'test_job_6';
      const prompt = 'nature documentary';

      const script = await service.generateScript(prompt, jobId);

      // Each visual prompt should be different
      const uniquePrompts = new Set(
        script.visual_prompts.map((vp) => vp.prompt),
      );
      expect(uniquePrompts.size).toBe(script.visual_prompts.length);
    });
  });
});
