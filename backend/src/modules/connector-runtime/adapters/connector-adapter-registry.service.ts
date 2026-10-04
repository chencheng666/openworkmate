import { Injectable } from '@nestjs/common';
import { ConnectorType } from '../../connectors/connector.schema';
import { BiConnectorAdapter } from './bi-connector.adapter';
import { ConnectorRuntimeAdapter, ConnectorRuntimeAdapterInput } from './connector-adapter.types';
import { ContractConnectorAdapter } from './contract-connector.adapter';
import { CrmConnectorAdapter } from './crm-connector.adapter';
import { GenericConnectorAdapter } from './generic-connector.adapter';
import { OaConnectorAdapter } from './oa-connector.adapter';
import { TicketingConnectorAdapter } from './ticketing-connector.adapter';

@Injectable()
export class ConnectorAdapterRegistry {
  private readonly adapters: Partial<Record<ConnectorType, ConnectorRuntimeAdapter>>;

  constructor(
    private readonly oa: OaConnectorAdapter,
    private readonly ticketing: TicketingConnectorAdapter,
    private readonly crm: CrmConnectorAdapter,
    private readonly contract: ContractConnectorAdapter,
    private readonly bi: BiConnectorAdapter,
    private readonly generic: GenericConnectorAdapter,
  ) {
    this.adapters = {
      oa,
      ticketing,
      crm,
      contract,
      bi,
    };
  }

  resolve(type: ConnectorType): ConnectorRuntimeAdapter {
    return this.adapters[type] ?? this.generic;
  }

  execute(input: ConnectorRuntimeAdapterInput) {
    // 已配置通用 HTTP 契约时，除工单专用查询外优先走通用 Adapter，避免类型专用演示实现吞掉真实配置。
    if (input.connector.metadata.transport === 'http' && input.connector.type !== 'ticketing') {
      return this.generic.execute(input);
    }
    return this.resolve(input.connector.type).execute(input);
  }
}
