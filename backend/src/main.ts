import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadConfig } from './infrastructure/config/env';
import helmet from 'helmet';
import { join } from 'path';
import { existsSync } from 'fs';
import * as express from 'express';

async function bootstrap() {
  const config = loadConfig();
  
  const app = await NestFactory.create(AppModule);
  
  // Security
  app.use(helmet());
  
  // CORS
  app.enableCors({
    origin: config.app.corsOrigin,
    credentials: true,
  });
  
  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  
  // Serve static frontend in production
  const frontendDistPath = join(__dirname, '../../frontend/dist');
  if (existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));
    
    // SPA fallback
    app.use((req: any, res: any, next: any) => {
      if (!req.url.startsWith('/api')) {
        res.sendFile(join(frontendDistPath, 'index.html'));
      } else {
        next();
      }
    });
  }
  
  await app.listen(config.app.port);
  
  console.log(`🚀 Server running on http://localhost:${config.app.port}`);
  console.log(`📊 API available at http://localhost:${config.app.port}/api`);
  if (config.demo.enabled) {
    console.log('🎭 Demo mode enabled');
  }
}

bootstrap();
