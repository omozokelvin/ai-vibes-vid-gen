import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EditorService } from '../src/modules/editor/editor.service';
import { FilesystemModule } from '../src/modules/filesystem/filesystem.module';

describe('EditorService', () => {
  let service: EditorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), FilesystemModule],
      providers: [EditorService],
    }).compile();

    service = module.get<EditorService>(EditorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
