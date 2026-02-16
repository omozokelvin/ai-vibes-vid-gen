import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { FilesystemModule } from '../filesystem/filesystem.module';

@Module({
  imports: [FilesystemModule],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
