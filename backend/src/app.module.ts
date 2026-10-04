import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConnectorRuntimeModule } from './modules/connector-runtime/connector-runtime.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { HealthModule } from './modules/health/health.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { OperationDemoModule } from './modules/operation-demo/operation-demo.module';
import { SkillFactoryModule } from './modules/skill-factory/skill-factory.module';
import { WebChatModule } from './modules/web-chat/web-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI') ?? 'mongodb://127.0.0.1:27017/workmate_agent_platform',
      }),
    }),
    HealthModule,
    AuthModule,
    AuditModule,
    ConnectorsModule,
    ConnectorRuntimeModule,
    KnowledgeModule,
    OperationDemoModule,
    SkillFactoryModule,
    WebChatModule,
  ],
})
export class AppModule {}
