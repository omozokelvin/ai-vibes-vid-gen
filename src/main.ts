import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation
  app.useGlobalPipes(new ValidationPipe());

  // Enable CORS
  app.enableCors();

  // Configure Swagger
  const config = new DocumentBuilder()
    .setTitle('AI Vibes Video Generation API')
    .setDescription(
      'AI-powered video generation system using free APIs. Generate videos from text prompts with AI script generation, video creation, audio synthesis, and optional social media distribution.',
    )
    .setVersion('1.0.0')
    .addTag('video', 'Video generation and management endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation available at: http://localhost:${port}/docs`);
}

bootstrap();
