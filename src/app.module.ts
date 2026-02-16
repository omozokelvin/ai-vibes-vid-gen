import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { ScriptModule } from './modules/script/script.module';
import { MediaModule } from './modules/media/media.module';
import { EditorModule } from './modules/editor/editor.module';
import { PublisherModule } from './modules/publisher/publisher.module';
import { FilesystemModule } from './modules/filesystem/filesystem.module';
import { VideoGenerationProcessor } from './queues/video-generation.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: configService.get<number>('REDIS_PORT') || 6379,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'video-generation',
    }),
    ScriptModule,
    MediaModule,
    EditorModule,
    PublisherModule,
    FilesystemModule,
  ],
  controllers: [AppController],
  providers: [VideoGenerationProcessor],
})
export class AppModule {}
