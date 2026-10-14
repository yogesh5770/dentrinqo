import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
const cookieParser = require('cookie-parser');
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('AksEliteDentalApi');

  // Enforce mandatory cryptographic SESSION_SECRET before application boot
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim().length < 32) {
    logger.error('FATAL SECURITY ERROR: SESSION_SECRET is missing or insufficiently random (< 32 chars). Halting startup.');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // Trust proxy for Nginx headers (X-Forwarded-For, X-Forwarded-Host, Host)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Security & Middleware
  app.use(cookieParser(process.env.COOKIE_SECRET || 'aks-cookie-secret-2026'));

  // Strict CORS configuration: explicit allowlist only, reject arbitrary origins
  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const defaultLocalOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  const allowedOriginsSet = new Set<string>([...defaultLocalOrigins, ...configuredOrigins]);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check against explicit trusted allowlist
      if (allowedOriginsSet.has(origin)) {
        return callback(null, true);
      }

      // Allow trusted tenant domains, DuckDNS staging domains, and direct server IPs
      try {
        const parsed = new URL(origin);
        const host = parsed.hostname.toLowerCase();
        if (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host.endsWith('.duckdns.org') ||
          host.endsWith('.elitedental.in') ||
          host.endsWith('.dentrinqo.com') ||
          /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
        ) {
          return callback(null, true);
        }
      } catch {
        // Invalid origin URL format
      }

      // Reject untrusted origin with an error - never reflect arbitrary origins
      logger.warn(`Rejected unauthorized CORS request from origin: ${origin}`);
      return callback(new Error(`CORS policy violation: Origin '${origin}' is not in trusted allowlist`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('Dentrinqo Multi-Tenant Dental Cloud API')
    .setDescription('Mission-critical Multi-Tenant Dental Healthcare Management System API')
    .setVersion('1.0.0')
    .addTag('Authentication')
    .addTag('Patient Management')
    .addTag('Appointment Scheduling')
    .addTag('Consultations')
    .addTag('Staff & User Management')
    .addTag('Clinic Settings')
    .addTag('Audit Logs')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(port, host);
  logger.log(`Clinic Management API running on http://${host}:${port}`);
  logger.log(`OpenAPI Swagger Docs available at http://${host}:${port}/api/docs`);
}

bootstrap();