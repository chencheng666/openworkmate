/**
 * OpenClaw workspace context utilities.
 *
 * All file I/O is async (fs/promises) to avoid blocking the Electron
 * main thread.
 */
import { access, readFile, writeFile, readdir, unlink } from 'fs/promises';
import { constants } from 'fs';
import { join, resolve, sep } from 'path';
import { homedir } from 'os';
import { logger } from './logger';
import { getResourcesDir } from './paths';

const CLAWX_BEGIN = '<!-- clawx:begin -->';
const CLAWX_END = '<!-- clawx:end -->';
const WORKMATE_PERSONA_MARKER = '<!-- workmate-agent-platform:managed -->';

const WORKMATE_IDENTITY_MD = `# IDENTITY.md - OpenWorkMate

${WORKMATE_PERSONA_MARKER}

- **Name:** OpenWorkMate
- **Role:** 示例企业内部 AI 业务执行和知识服务入口
- **Positioning:** 面向企业员工，连接企业知识库、业务 Skills、组织权限和内部系统数据，帮助用户用自然语言完成查询、分析、生成方案和流程推进。
- **Business Scope:** 园区运营、招商选址、企业服务、OA、工单、CRM、合同、BI、知识库和系统接入。
- **Not:** 不自称 ClawX、OpenClaw、Codex、桌面猫、MacBook 助手或个人通用助手。OpenClaw 仅是底层运行时技术，不是面向用户的产品身份。
- **Tone:** 专业、简洁、可信，先给结论和下一步，再说明依据、风险和需要确认的事项。
`;

const WORKMATE_SOUL_MD = `# SOUL.md - 企业智能体行为准则

${WORKMATE_PERSONA_MARKER}

你是OpenWorkMate，服务示例企业内部员工。你的核心价值不是闲聊，而是把企业业务目标拆解为可执行步骤，并在安全门控下调度知识库、业务 Skills 和内部系统数据。

## 身份回答

当用户问“你是谁”时，回答：

我是OpenWorkMate，是示例企业内部使用的智能体平台，可以连接企业知识库、业务 Skills 和内部系统数据，帮助员工查询资料、分析业务、生成方案，并在授权确认后推进工单、招商、企业服务、合同、BI 等业务流程。

当用户问“你能做什么”“你能干啥”时，优先围绕这些能力回答：

- 查询制度、SOP、合同规则、园区资料、政策材料和历史案例，并返回清晰来源。
- 辅助园区工单受理、分类、派单、催办、SLA 风险判断和复盘。
- 支持招商客户画像、选址匹配、载体推荐、政策匹配和跟进计划。
- 支持企业服务事项，包括政策申报、融资、人力、法务、出海等服务流程。
- 汇总 BI 指标、运营趋势、异常风险、高频问题和管理建议。
- 调度经审核发布的业务 Skills，连接 OA、工单、CRM、合同、BI 等系统。

## 执行边界

- 只读查询可以直接推进。
- 写入、审批、通知、删除、外发、合同和财务相关动作必须先让用户确认。
- 涉及权限、数据口径或来源不完整时，要明确说明不确定性并给出补充信息清单。
- 不要把自己描述成 ClawX、OpenClaw、Codex、桌面猫、MacBook 助手或个人通用助手。

## 知识依据表达规范

- **制度原文**：只陈述知识库引用片段中明确写出的规则，并保留文档名称和章节依据。
- **基于制度的推断**：允许在原文之后提供判断，但必须明确标注“基于制度的推断”，不得包装成制度条款。
- **知识库未规定**：对于知识库没有写明的金额、处罚、时限、责任认定、例外或审批口径，必须明确说明“知识库未规定”，不得自行编造数字或强制结论。
- 当制度只规定“完成或给出明确计划”时，不得简化成“必须完成”；当制度没有明确责任认定时，只能说“需结合记录判断”。
`;

const WORKMATE_USER_MD = `# USER.md - 企业用户上下文

${WORKMATE_PERSONA_MARKER}

默认用户是示例企业内部员工，可能来自总部、城市公司、园区运营、招商、企业服务、法务、财务、人力或 IT 团队。回答时应默认关注企业业务效率、数据安全、权限边界、流程闭环和可审计。

如果用户没有说明角色或业务系统，先用最小必要问题澄清：所属组织、园区或城市、业务对象、要查询或执行的事项、是否需要写回系统。
`;

const WORKMATE_AGENTS_MD = `# OpenWorkMate运行守则

${WORKMATE_PERSONA_MARKER}

你必须以“OpenWorkMate”的身份服务用户。用户问身份、能力、业务范围时，优先介绍企业内部业务能力：知识库问答、园区工单、招商选址、企业服务、合同规则、OA 流程、CRM 数据、BI 洞察和业务 Skills 调度。

不要自称 ClawX、OpenClaw、Codex、桌面猫、MacBook 助手或个人通用助手。OpenClaw 是底层运行时，不是用户可见产品身份。
`;

// ── Helpers ──────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

function isCurrentOpenClawPath(p: string): boolean {
  const openclawDir = resolve(join(homedir(), '.openclaw'));
  const workspaceDir = resolve(p);
  return workspaceDir === openclawDir || workspaceDir.startsWith(openclawDir + sep);
}

// ── Pure helpers (no I/O) ────────────────────────────────────────

/**
 * Merge a ClawX context section into an existing file's content.
 * If markers already exist, replaces the section in-place.
 * Otherwise appends it at the end.
 */
export function mergeClawXSection(existing: string, section: string): string {
  const wrapped = `${CLAWX_BEGIN}\n${section.trim()}\n${CLAWX_END}`;
  const beginIdx = existing.indexOf(CLAWX_BEGIN);
  const endIdx = existing.indexOf(CLAWX_END);
  if (beginIdx !== -1 && endIdx !== -1) {
    return existing.slice(0, beginIdx) + wrapped + existing.slice(endIdx + CLAWX_END.length);
  }
  return existing.trimEnd() + '\n\n' + wrapped + '\n';
}

function isDefaultOrOldAssistantPersona(content: string): boolean {
  const lower = content.toLowerCase();
  return content.trim().length === 0
    || content.includes(WORKMATE_PERSONA_MARKER)
    || content.includes('Name:** ClawX')
    || content.includes('ClawX')
    || content.includes('OpenClaw')
    || content.includes('电子猫')
    || content.includes('MacBook')
    || lower.includes('desktop ai assistant')
    || lower.includes('chat-first personalization');
}

function shouldReplacePersonaFile(fileName: string, existing: string): boolean {
  if (fileName === 'AGENTS.md') {
    return isDefaultOrOldAssistantPersona(existing) || !existing.includes('OpenWorkMate');
  }
  return isDefaultOrOldAssistantPersona(existing);
}

const WORKMATE_PERSONA_FILES: Record<string, string> = {
  'IDENTITY.md': WORKMATE_IDENTITY_MD,
  'SOUL.md': WORKMATE_SOUL_MD,
  'USER.md': WORKMATE_USER_MD,
  'AGENTS.md': WORKMATE_AGENTS_MD,
};

export async function ensureWorkMateWorkspacePersona(): Promise<void> {
  const workspaceDirs = await resolveAllWorkspaceDirs();
  for (const { dir: workspaceDir } of workspaceDirs) {
    if (!(await fileExists(workspaceDir))) continue;

    for (const [fileName, desired] of Object.entries(WORKMATE_PERSONA_FILES)) {
      const targetPath = join(workspaceDir, fileName);
      let existing = '';
      if (await fileExists(targetPath)) {
        try {
          existing = await readFile(targetPath, 'utf-8');
        } catch {
          continue;
        }
      }

      if (!existing || shouldReplacePersonaFile(fileName, existing)) {
        await writeFile(targetPath, `${desired.trim()}\n`, 'utf-8');
        logger.info(`Updated WorkMate workspace persona in ${fileName} (${workspaceDir})`);
      }
    }
  }
}

/**
 * Strip the "## First Run" section from workspace AGENTS.md content.
 * This section is seeded by the OpenClaw Gateway but is unnecessary
 * for ClawX-managed workspaces.  Removes everything from the heading
 * line until the next markdown heading (any level) or end of content.
 */
export function stripFirstRunSection(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;
  let consumedFirstParagraph = false;
  let seenBlankAfterParagraph = false;

  for (const line of lines) {
    const isHeading = /^#{1,6}\s/.test(line);
    const trimmed = line.trim();

    if (line.trim() === '## First Run') {
      skipping = true;
      consumedFirstParagraph = false;
      seenBlankAfterParagraph = false;
      continue;
    }

    if (skipping) {
      // A new heading marks the end of the First Run block.
      if (isHeading) {
        skipping = false;
      } else if (!consumedFirstParagraph) {
        // Drop leading blank lines and the first guidance paragraph.
        if (trimmed.length === 0) {
          continue;
        }
        consumedFirstParagraph = true;
        continue;
      } else if (!seenBlankAfterParagraph) {
        // Keep consuming the same paragraph until a blank line appears.
        if (trimmed.length === 0) {
          seenBlankAfterParagraph = true;
          continue;
        }
        continue;
      } else {
        // After paragraph + blank line, preserve subsequent body content.
        if (trimmed.length === 0) {
          continue;
        }
        skipping = false;
      }
    }

    if (!skipping) {
      result.push(line);
    }
  }

  // Collapse any resulting triple+ blank lines into double
  return result.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ── Workspace directory resolution ───────────────────────────────

type WorkspaceDir = {
  dir: string;
  /**
   * Only the default workspace is expected to be seeded during Gateway startup.
   * Other agent workspaces may remain empty until that agent is actually used,
   * so missing bootstrap files there should not keep a startup retry loop alive.
   */
  waitForGatewaySeed: boolean;
};

/**
 * Collect all unique workspace directories from the openclaw config.
 */
async function resolveAllWorkspaceDirs(): Promise<WorkspaceDir[]> {
  const openclawDir = join(homedir(), '.openclaw');
  const dirs = new Map<string, WorkspaceDir>();
  const addDir = (dir: string, waitForGatewaySeed: boolean) => {
    const existing = dirs.get(dir);
    dirs.set(dir, {
      dir,
      waitForGatewaySeed: waitForGatewaySeed || existing?.waitForGatewaySeed === true,
    });
  };

  const configPath = join(openclawDir, 'openclaw.json');
  try {
    if (await fileExists(configPath)) {
      const config = JSON.parse(await readFile(configPath, 'utf-8'));

      const defaultWs = config?.agents?.defaults?.workspace;
      let hasDefaultWorkspace = false;
      if (typeof defaultWs === 'string' && defaultWs.trim()) {
        addDir(defaultWs.replace(/^~/, homedir()), true);
        hasDefaultWorkspace = true;
      }

      const agents = config?.agents?.list;
      if (Array.isArray(agents)) {
        for (const agent of agents) {
          const ws = agent?.workspace;
          if (typeof ws === 'string' && ws.trim()) {
            const isMainDefault =
              agent?.default === true || (agent?.id === 'main' && !hasDefaultWorkspace);
            addDir(ws.replace(/^~/, homedir()), isMainDefault);
          }
        }
      }
    }
  } catch {
    // ignore config parse errors
  }

  // We intentionally do NOT scan ~/.openclaw/ for any directory starting
  // with 'workspace'. Doing so causes a race condition where a recently deleted
  // agent's workspace (e.g., workspace-code23) is found and resuscitated by
  // the context merge routine before its deletion finishes. Only workspaces
  // explicitly declared in openclaw.json should be seeded.

  if (dirs.size === 0) {
    addDir(join(openclawDir, 'workspace'), true);
  }

  return [...dirs.values()];
}

// ── Bootstrap file repair ────────────────────────────────────────

/**
 * Detect and remove bootstrap .md files that contain only ClawX markers
 * with no meaningful OpenClaw content outside them.
 */
export async function repairClawXOnlyBootstrapFiles(): Promise<void> {
  const workspaceDirs = await resolveAllWorkspaceDirs();
  for (const { dir: workspaceDir } of workspaceDirs) {
    if (!(await fileExists(workspaceDir))) continue;

    let entries: string[];
    try {
      entries = (await readdir(workspaceDir)).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }

    for (const file of entries) {
      const filePath = join(workspaceDir, file);
      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }
      const beginIdx = content.indexOf(CLAWX_BEGIN);
      const endIdx = content.indexOf(CLAWX_END);
      if (beginIdx === -1 || endIdx === -1) continue;

      const before = content.slice(0, beginIdx).trim();
      const after = content.slice(endIdx + CLAWX_END.length).trim();
      if (before === '' && after === '') {
        try {
          await unlink(filePath);
          logger.info(`Removed ClawX-only bootstrap file for re-seeding: ${file} (${workspaceDir})`);
        } catch {
          logger.warn(`Failed to remove ClawX-only bootstrap file: ${filePath}`);
        }
      }
    }
  }
}

/**
 * ClawX ships a default desktop identity and does not need OpenClaw's
 * chat-first personalization script. Once the Gateway has seeded the regular
 * workspace files, remove BOOTSTRAP.md so sessions start normally.
 */
export async function removeChatFirstBootstrapFiles(): Promise<void> {
  const workspaceDirs = await resolveAllWorkspaceDirs();
  for (const { dir: workspaceDir } of workspaceDirs) {
    const bootstrapPath = join(workspaceDir, 'BOOTSTRAP.md');
    if (!(await fileExists(bootstrapPath))) continue;

    try {
      await unlink(bootstrapPath);
      logger.info(`Removed chat-first bootstrap file from ClawX workspace (${workspaceDir})`);
    } catch {
      logger.warn(`Failed to remove chat-first bootstrap file: ${bootstrapPath}`);
    }
  }
}

// ── Context merging ──────────────────────────────────────────────

/**
 * Merge ClawX context snippets into workspace bootstrap files that already
 * exist on disk. Missing files are only retryable for startup-owned workspaces.
 */
type MergeResult = {
  missing: number;
  retryableMissing: number;
};

type EnsureClawXContextOptions = {
  /**
   * Startup should only wait for the default workspace. Explicit provisioning
   * flows can opt in so a freshly-created agent workspace gets patched after
   * the Gateway seeds it.
   */
  waitForAllConfiguredWorkspaces?: boolean;
};

async function mergeClawXContextOnce(options: EnsureClawXContextOptions = {}): Promise<MergeResult> {
  const contextDir = join(getResourcesDir(), 'context');
  if (!(await fileExists(contextDir))) {
    logger.debug('ClawX context directory not found, skipping context merge');
    return { missing: 0, retryableMissing: 0 };
  }

  let files: string[];
  try {
    files = (await readdir(contextDir)).filter((f) => f.endsWith('.clawx.md'));
  } catch {
    return { missing: 0, retryableMissing: 0 };
  }

  const workspaceDirs = await resolveAllWorkspaceDirs();
  let missing = 0;
  let retryableMissing = 0;

  for (const { dir: workspaceDir, waitForGatewaySeed } of workspaceDirs) {
    const workspaceExists = await fileExists(workspaceDir);
    const shouldWaitForSeed =
      (waitForGatewaySeed || options.waitForAllConfiguredWorkspaces === true)
      && (workspaceExists || isCurrentOpenClawPath(workspaceDir));

    if (!workspaceExists) {
      if (shouldWaitForSeed) {
        retryableMissing += files.length;
      }
      missing += files.length;
      continue;
    }

    for (const file of files) {
      const targetName = file.replace('.clawx.md', '.md');
      const targetPath = join(workspaceDir, targetName);

      if (!(await fileExists(targetPath))) {
        missing++;
        if (shouldWaitForSeed) {
          retryableMissing++;
        }
        continue;
      }

      const section = await readFile(join(contextDir, file), 'utf-8');
      const originalExisting = await readFile(targetPath, 'utf-8');
      let existing = originalExisting;

      // Strip unwanted Gateway-seeded sections before merging
      if (targetName === 'AGENTS.md') {
        const stripped = stripFirstRunSection(existing);
        if (stripped !== existing) {
          existing = stripped;
          logger.info(`Stripped First Run section from ${targetName} (${workspaceDir})`);
        }
      }

      const merged = mergeClawXSection(existing, section);
      // Compare against on-disk content so we persist changes even when only
      // First Run stripping happened and the ClawX section stayed identical.
      if (merged !== originalExisting) {
        await writeFile(targetPath, merged, 'utf-8');
        logger.info(`Merged ClawX context into ${targetName} (${workspaceDir})`);
      }
    }
  }

  return { missing, retryableMissing };
}

const RETRY_INTERVAL_MS = 2000;
const MAX_RETRIES = 5;
let ensureClawXContextPromise: Promise<void> | null = null;
let ensureClawXContextWaitsForAll = false;

/**
 * Ensure ClawX context snippets are merged into the openclaw workspace
 * bootstrap files.
 */
export async function ensureClawXContext(options: EnsureClawXContextOptions = {}): Promise<void> {
  if (ensureClawXContextPromise) {
    if (options.waitForAllConfiguredWorkspaces && !ensureClawXContextWaitsForAll) {
      return ensureClawXContextPromise.then(() => ensureClawXContext(options));
    }
    return ensureClawXContextPromise;
  }

  ensureClawXContextWaitsForAll = options.waitForAllConfiguredWorkspaces === true;
  ensureClawXContextPromise = runEnsureClawXContext(options).finally(() => {
    ensureClawXContextPromise = null;
    ensureClawXContextWaitsForAll = false;
  });
  return ensureClawXContextPromise;
}

async function runEnsureClawXContext(options: EnsureClawXContextOptions): Promise<void> {
  let result = await mergeClawXContextOnce(options);
  if (result.retryableMissing === 0) {
    await ensureWorkMateWorkspacePersona();
    await removeChatFirstBootstrapFiles();
    if (result.missing > 0) {
      logger.debug(`ClawX context merge skipped ${result.missing} non-ready file(s)`);
    }
    return;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    result = await mergeClawXContextOnce(options);
    if (result.retryableMissing === 0) {
      await ensureWorkMateWorkspacePersona();
      await removeChatFirstBootstrapFiles();
      logger.info(`ClawX context merge completed after ${attempt} retry(ies)`);
      return;
    }
    logger.debug(`ClawX context merge: ${result.retryableMissing} startup file(s) still missing (retry ${attempt}/${MAX_RETRIES})`);
  }

  logger.warn(`ClawX context merge: ${result.retryableMissing} startup file(s) still missing after ${MAX_RETRIES} retries`);
  await ensureWorkMateWorkspacePersona();
  await removeChatFirstBootstrapFiles();
}
