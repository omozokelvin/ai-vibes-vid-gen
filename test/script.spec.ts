import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScriptService } from '../src/modules/script/script.service';
import { FilesystemModule } from '../src/modules/filesystem/filesystem.module';

describe('ScriptService', () => {
  let service: ScriptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        FilesystemModule,
      ],
      providers: [
        ScriptService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GEMINI_API_KEY') {
                return undefined; // Return undefined to trigger fallback
              }
              return process.env[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ScriptService>(ScriptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate fallback script when API key is not configured', async () => {
    const jobId = 'test_job_' + Date.now();
    const prompt = 'test battleships';

    const script = await service.generateScript(prompt, jobId);

    expect(script).toBeDefined();
    expect(script.script).toBeDefined();
    expect(script.visual_prompts).toBeDefined();
    expect(script.timestamps).toBeDefined();
    expect(Array.isArray(script.visual_prompts)).toBe(true);
    expect(Array.isArray(script.timestamps)).toBe(true);
  });
});
