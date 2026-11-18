import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

async function mountWeb(app: NestFastifyApplication) {
  const employee = resolve(__dirname, '../../web-app/dist');
  const admin = resolve(__dirname, '../../admin-web/dist');
  const employeeEntry = resolve(employee, 'index.html'), adminEntry = resolve(admin, 'index.html');
  await Promise.all([
    access(employeeEntry),
    access(adminEntry),
  ]).catch(() => {
    throw new Error('缺少员工端或管理端构建产物，请先运行 pnpm build。');
  });

  for (const [root, prefix] of [
    [resolve(employee, 'assets'), '/assets/'],
    [resolve(employee, 'brand'), '/brand/'],
    [resolve(admin, 'assets'), '/admin/assets/'],
    [resolve(admin, 'brand'), '/admin/brand/'],
  ]) {
    app.useStaticAssets({ root, prefix, decorateReply: false });
  }

  const server = app.getHttpAdapter().getInstance();
  // 首页清单跟随当前构建；不要让长时间运行的服务引用已被替换的资源。
  server.get('/', async (_request, reply) => reply.type('text/html').header('Cache-Control', 'no-cache').send(await readFile(employeeEntry,'utf8')));
  server.get('/admin', (_request, reply) => reply.redirect('/admin/'));
  server.get('/admin/*', async (_request, reply) => reply.type('text/html').header('Cache-Control', 'no-cache').send(await readFile(adminEntry,'utf8')));
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 12 * 1024 * 1024 }),
  );
  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173,http://localhost:5174,http://localhost:5180';

  app.enableCors({
    origin: [...corsOrigin.split(',').map((origin) => origin.trim()), ...(hostAllowsLocalDesktop(config) ? ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'] : [])],
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OpenWorkMate Backend API')
    .setDescription('Knowledge Hub, Skill Factory, connector governance, and audit APIs.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  if (process.argv.includes('--web')) await mountWeb(app);

  const port = config.get<number>('PORT') ?? 18790;
  const host = config.get<string>('HOST') ?? '127.0.0.1';
  await app.listen(port, host);
}

void bootstrap();

function hostAllowsLocalDesktop(config: ConfigService) {
  return ['127.0.0.1','localhost','::1'].includes(config.get<string>('HOST') || '127.0.0.1');
}
