import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpenText,
  Boxes,
  Building2,
  DatabaseZap,
  FileClock,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { adminApi } from '../api';
import type { PlatformHealth } from '../types';

export function OverviewPage() {
  const outlet = useOutletContext<{ health: PlatformHealth | null }>();
  const [health, setHealth] = useState<PlatformHealth | null>(outlet.health);

  useEffect(() => {
    setHealth(outlet.health);
  }, [outlet.health]);

  useEffect(() => {
    if (health) return;
    void adminApi.health().then(setHealth).catch(() => undefined);
  }, [health]);

  const metrics = [
    { label: '知识资产', value: health?.collections.knowledgeDocuments ?? '--', unit: '份文档', icon: BookOpenText, tone: 'blue' },
    { label: '已发布 Skills', value: health?.collections.installedSkills ?? '--', unit: '项能力', icon: Boxes, tone: 'cyan' },
    { label: '业务系统', value: health?.collections.connectors ?? '--', unit: '个接入', icon: DatabaseZap, tone: 'green' },
    { label: '审计事件', value: health?.collections.auditEvents ?? '--', unit: '条记录', icon: FileClock, tone: 'violet' },
  ];

  return (
    <div className="page-stack" data-testid="admin-overview-page">
      <section className="page-heading overview-heading">
        <div>
          <div className="eyebrow"><Sparkles size={14} />企业 AI 治理中枢</div>
          <h1>让企业知识、业务能力和系统连接可管理、可授权、可审计</h1>
          <p>管理后台负责资产治理，员工 Web / 桌面端保持轻量，只专注于通过自然语言调用数智员工完成工作。</p>
        </div>
        <div className="environment-card">
          <div className="environment-icon"><Building2 size={21} /></div>
          <div><span>当前租户</span><strong>示例企业</strong><small>本地演示空间 · 示例组织</small></div>
        </div>
      </section>

      <section className="metric-grid">
        {metrics.map(({ label, value, unit, icon: Icon, tone }) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon tone-${tone}`}><Icon size={19} /></div>
            <div className="metric-label">{label}</div>
            <div className="metric-value"><strong>{value}</strong><span>{unit}</span></div>
          </article>
        ))}
      </section>

      <section className="overview-grid">
        <article className="panel governance-panel">
          <div className="panel-heading"><div><span>产品边界</span><h2>管理与执行各归其位</h2></div><ShieldCheck size={20} /></div>
          <div className="boundary-flow">
            <div className="boundary-column">
              <div className="boundary-title"><Users size={17} /><strong>员工 Web / 桌面端</strong><span>执行工作</span></div>
              <ul><li>自然语言发起任务</li><li>选择数智员工与 Skill</li><li>查看过程、确认风险动作</li><li>接收结果和待办提醒</li></ul>
            </div>
            <ArrowRight className="boundary-arrow" size={21} />
            <div className="boundary-column is-admin">
              <div className="boundary-title"><ShieldCheck size={17} /><strong>系统管理后台</strong><span>治理资产</span></div>
              <ul><li>知识上传、权限与生命周期</li><li>Skill 提交、审核、发布</li><li>内部系统接入与健康检查</li><li>权限策略和全链路审计</li></ul>
            </div>
          </div>
        </article>

        <article className="panel todo-panel">
          <div className="panel-heading"><div><span>待处理事项</span><h2>治理工作台</h2></div></div>
          <div className="governance-tasks">
            <Link to="/knowledge"><BookOpenText size={17} /><span><strong>{health?.collections.knowledgeIngestionQueued ?? 0} 个知识任务处理中</strong><small>查看解析与索引状态</small></span><ArrowRight size={16} /></Link>
            <Link to="/skills"><Boxes size={17} /><span><strong>{health?.collections.skillSubmissions ?? 0} 个 Skill 提交</strong><small>进入审核与发布流程</small></span><ArrowRight size={16} /></Link>
            <Link to="/connectors"><DatabaseZap size={17} /><span><strong>检查系统连接状态</strong><small>确保运行时调用链路健康</small></span><ArrowRight size={16} /></Link>
          </div>
        </article>
      </section>

      <section className="panel capability-map">
        <div className="panel-heading"><div><span>治理能力</span><h2>从企业数据到数智员工的完整链路</h2></div></div>
        <div className="capability-steps">
          {[
            ['01', '企业知识', '制度、合同、SOP、园区资料统一入库并按组织权限检索'],
            ['02', '系统能力', 'OA、工单、CRM、合同、BI 通过连接器暴露受控 Tool'],
            ['03', '业务 Skills', '把员工经验、业务规则和调用流程沉淀为可审核能力'],
            ['04', '数智员工', '按人、岗、组织装配 Skills，形成可持续成长的数智分身'],
          ].map(([index, title, description]) => (
            <div className="capability-step" key={index}><span>{index}</span><strong>{title}</strong><p>{description}</p></div>
          ))}
        </div>
      </section>
    </div>
  );
}
