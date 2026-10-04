import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ConnectorRuntimeModule } from '../connector-runtime/connector-runtime.module';
import {
  InstalledSkill,
  InstalledSkillSchema,
  SkillSubmission,
  SkillSubmissionSchema,
} from './skill-factory.schema';
import { SkillFactoryController } from './skill-factory.controller';
import { SkillFactoryService } from './skill-factory.service';

@Module({
  imports: [
    AuditModule,
    ConnectorsModule,
    ConnectorRuntimeModule,
    MongooseModule.forFeature([
      { name: SkillSubmission.name, schema: SkillSubmissionSchema },
      { name: InstalledSkill.name, schema: InstalledSkillSchema },
    ]),
  ],
  controllers: [SkillFactoryController],
  providers: [SkillFactoryService],
  exports: [SkillFactoryService],
})
export class SkillFactoryModule {}
