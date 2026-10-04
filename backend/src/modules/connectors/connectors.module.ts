import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { ConnectorDefinition, ConnectorDefinitionSchema } from './connector.schema';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';

@Module({
  imports: [
    AuditModule,
    MongooseModule.forFeature([
      { name: ConnectorDefinition.name, schema: ConnectorDefinitionSchema },
    ]),
  ],
  controllers: [ConnectorsController],
  providers: [ConnectorsService],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
