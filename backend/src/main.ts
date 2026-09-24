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
  
  // Security — CSP precisa permitir Auth/API do Supabase no browser
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: [
            "'self'",
            'https://*.supabase.co',
            'wss://*.supabase.co',
            config.supabase.url,
          ],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          scriptSrc: ["'self'"],
          frameSrc: ["'self'", 'https://*.supabase.co'],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );  
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
  
  // Serve static frontend (Docker: /app/public; local: frontend/dist)
  const frontendCandidates = [
    process.env.FRONTEND_DIST_PATH,
    join(__dirname, '../public'),
    join(__dirname, '../../frontend/dist'),
    join(process.cwd(), 'public'),
  ].filter((p): p is string => Boolean(p));

  const frontendDistPath = frontendCandidates.find((p) =>
    existsSync(join(p, 'index.html')),
  );

  if (frontendDistPath) {
    app.use(express.static(frontendDistPath));

    app.use((req: any, res: any, next: any) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
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
