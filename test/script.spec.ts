import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ScriptService } from '../src/modules/script/script.service';
import { FilesystemModule } from '../src/modules/filesystem/filesystem.module';

describe('ScriptService', () => {
  let service: ScriptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), FilesystemModule],
      providers: [ScriptService],
    }).compile();

    service = module.get<ScriptService>(ScriptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate fallback script when API fails', async () => {
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
