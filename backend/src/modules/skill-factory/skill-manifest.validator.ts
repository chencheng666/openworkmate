import { BadRequestException } from '@nestjs/common';
import { SkillManifest } from './skill-manifest.types';

const skillNamePattern = /^[a-z][a-z0-9-]{2,63}$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

export function validateSkillManifest(manifest: SkillManifest): void {
  const errors: string[] = [];
  if (manifest.schemaVersion !== '1.0') errors.push('schemaVersion must be 1.0');
  if (!skillNamePattern.test(manifest.name)) errors.push('name must be kebab-case and 3-64 chars');
  if (!manifest.displayName?.trim()) errors.push('displayName is required');
  if (!manifest.description || manifest.description.length < 10) errors.push('description must be at least 10 chars');
  if (!semverPattern.test(manifest.version)) errors.push('version must be semver like 1.0.0');
  if (!['low', 'medium', 'high'].includes(manifest.riskLevel)) errors.push('riskLevel is invalid');
  if (!Array.isArray(manifest.inputFields)) errors.push('inputFields must be an array');
  if (!Array.isArray(manifest.tools)) errors.push('tools must be an array');
  if (!manifest.promptTemplate?.trim()) errors.push('promptTemplate is required');
  if (!manifest.outputContract?.type) errors.push('outputContract.type is required');
  if (!manifest.governance?.auditLevel) errors.push('governance.auditLevel is required');

  for (const tool of manifest.tools ?? []) {
    if (tool.riskLevel === 'high' && !tool.confirmationRequired) {
      errors.push(`tool ${tool.name} is high risk and must require confirmation`);
    }
    if (['write', 'approve'].includes(tool.actionKind) && manifest.governance.humanConfirmation === 'never') {
      errors.push(`tool ${tool.name} performs ${tool.actionKind} but governance disables human confirmation`);
    }
  }

  if (errors.length > 0) {
    throw new BadRequestException({ message: 'Invalid skill manifest', errors });
  }
}
