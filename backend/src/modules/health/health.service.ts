import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

type CollectionCount = {
  connectors: number;
  knowledgeDocuments: number;
  knowledgeIngestionQueued: number;
  skillSubmissions: number;
  installedSkills: number;
  auditEvents: number;
};

@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async check() {
    const collections: CollectionCount = {
      connectors: 0,
      knowledgeDocuments: 0,
      knowledgeIngestionQueued: 0,
      skillSubmissions: 0,
      installedSkills: 0,
      auditEvents: 0,
    };

    if (this.connection.readyState === 1 && this.connection.db) {
      const db = this.connection.db;
      const [
        connectors,
        knowledgeDocuments,
        knowledgeIngestionQueued,
        skillSubmissions,
        installedSkills,
        auditEvents,
      ] = await Promise.all([
        db.collection('connectors').countDocuments({ tenantId: 'workmate' }),
        db.collection('knowledge_documents').countDocuments({ tenantId: 'workmate' }),
        db.collection('knowledge_ingestion_runs').countDocuments({
          tenantId: 'workmate',
          status: { $in: ['queued', 'parsing', 'embedding'] },
        }),
        db.collection('skill_submissions').countDocuments({ tenantId: 'workmate' }),
        db.collection('installed_skills').countDocuments({ tenantId: 'workmate' }),
        db.collection('audit_events').countDocuments({ tenantId: 'workmate' }),
      ]);

      collections.connectors = connectors;
      collections.knowledgeDocuments = knowledgeDocuments;
      collections.knowledgeIngestionQueued = knowledgeIngestionQueued;
      collections.skillSubmissions = skillSubmissions;
      collections.installedSkills = installedSkills;
      collections.auditEvents = auditEvents;
    }

    return {
      status: this.connection.readyState === 1 ? 'ok' : 'degraded',
      service: 'workmate-agent-platform-backend',
      timestamp: new Date().toISOString(),
      database: {
        readyState: this.connection.readyState,
        name: this.connection.name,
        host: this.connection.host,
      },
      collections,
    };
  }
}
