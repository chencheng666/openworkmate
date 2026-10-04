import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { ConnectorDefinition, ConnectorDefinitionSchema } from '../connectors/connector.schema';
import { BiConnectorAdapter } from './adapters/bi-connector.adapter';
import { ConnectorAdapterRegistry } from './adapters/connector-adapter-registry.service';
import { ContractConnectorAdapter } from './adapters/contract-connector.adapter';
import { CrmConnectorAdapter } from './adapters/crm-connector.adapter';
import { GenericConnectorAdapter } from './adapters/generic-connector.adapter';
import { OaConnectorAdapter } from './adapters/oa-connector.adapter';
import { TicketingConnectorAdapter } from './adapters/ticketing-connector.adapter';
import { ConnectorConfirmation, ConnectorConfirmationSchema } from './connector-confirmation.schema';
import { ConnectorRuntimeController } from './connector-runtime.controller';
import { ConnectorRuntimeService } from './connector-runtime.service';

@Module({
  imports: [
    AuditModule,
    MongooseModule.forFeature([
      { name: ConnectorDefinition.name, schema: ConnectorDefinitionSchema },
      { name: ConnectorConfirmation.name, schema: ConnectorConfirmationSchema },
    ]),
  ],
  controllers: [ConnectorRuntimeController],
  providers: [
    ConnectorRuntimeService,
    ConnectorAdapterRegistry,
    OaConnectorAdapter,
    TicketingConnectorAdapter,
    CrmConnectorAdapter,
    ContractConnectorAdapter,
    BiConnectorAdapter,
    GenericConnectorAdapter,
  ],
  exports: [ConnectorRuntimeService],
})
export class ConnectorRuntimeModule {}
