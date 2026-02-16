import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FilesystemService } from './filesystem.service';

@Module({
  imports: [ConfigModule],
  providers: [FilesystemService],
  exports: [FilesystemService],
})
export class FilesystemModule {}
