import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FilesystemService } from '../src/modules/filesystem/filesystem.service';

describe('FilesystemService', () => {
  let service: FilesystemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [FilesystemService],
    }).compile();

    service = module.get<FilesystemService>(FilesystemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have temp directory', () => {
    const tempDir = service.getTempDir();
    expect(tempDir).toBeDefined();
  });

  it('should have debug directory', () => {
    const debugDir = service.getDebugDir();
    expect(debugDir).toBeDefined();
  });
});
