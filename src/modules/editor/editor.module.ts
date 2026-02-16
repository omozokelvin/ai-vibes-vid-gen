import { Module } from '@nestjs/common';
import { EditorService } from './editor.service';
import { FilesystemModule } from '../filesystem/filesystem.module';

@Module({
  imports: [FilesystemModule],
  providers: [EditorService],
  exports: [EditorService],
})
export class EditorModule {}
