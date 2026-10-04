import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConnectorRuntimeModule } from '../connector-runtime/connector-runtime.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { OperationDemoController } from './operation-demo.controller';
import { OperationDemoService } from './operation-demo.service';

@Module({
  imports: [AuditModule, ConnectorRuntimeModule, KnowledgeModule],
  controllers: [OperationDemoController],
  providers: [OperationDemoService],
})
export class OperationDemoModule {}
