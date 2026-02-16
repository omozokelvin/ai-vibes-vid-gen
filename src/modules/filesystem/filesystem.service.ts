import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FilesystemService implements OnModuleInit {
  private readonly logger = new Logger(FilesystemService.name);
  private tempDir: string;
  private debugDir: string;

  constructor(private configService: ConfigService) {
    this.tempDir = this.configService.get<string>('TEMP_DIR') || './temp';
    this.debugDir = this.configService.get<string>('DEBUG_DIR') || './debug';
  }

  onModuleInit() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.tempDir, this.debugDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.log(`Created directory: ${dir}`);
      }
    });
  }

  getTempDir(): string {
    return this.tempDir;
  }

  getDebugDir(): string {
    return this.debugDir;
  }

  saveToDebug(filename: string, content: any): string {
    const filePath = path.join(this.debugDir, filename);

    if (typeof content === 'string') {
      fs.writeFileSync(filePath, content, 'utf-8');
    } else if (Buffer.isBuffer(content)) {
      fs.writeFileSync(filePath, content);
    } else {
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
    }

    this.logger.log(`Saved debug file: ${filePath}`);
    return filePath;
  }

  saveToTemp(filename: string, content: any): string {
    const filePath = path.join(this.tempDir, filename);

    if (typeof content === 'string') {
      fs.writeFileSync(filePath, content, 'utf-8');
    } else if (Buffer.isBuffer(content)) {
      fs.writeFileSync(filePath, content);
    } else {
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
    }

    this.logger.log(`Saved temp file: ${filePath}`);
    return filePath;
  }

  getTempPath(filename: string): string {
    return path.join(this.tempDir, filename);
  }

  getDebugPath(filename: string): string {
    return path.join(this.debugDir, filename);
  }

  cleanupTemp(jobId: string) {
    const pattern = new RegExp(`^${jobId}_`);
    const files = fs.readdirSync(this.tempDir);

    files.forEach((file) => {
      if (pattern.test(file)) {
        const filePath = path.join(this.tempDir, file);
        fs.unlinkSync(filePath);
        this.logger.log(`Cleaned up: ${filePath}`);
      }
    });
  }
}
