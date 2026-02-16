import { Module } from '@nestjs/common';
import { ScriptService } from './script.service';
import { FilesystemModule } from '../filesystem/filesystem.module';

@Module({
  imports: [FilesystemModule],
  providers: [ScriptService],
  exports: [ScriptService],
})
export class ScriptModule {}
