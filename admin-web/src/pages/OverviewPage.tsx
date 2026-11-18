import { ArrowRight, BookOpenText, Boxes, DatabaseZap, FileClock } from 'lucide-react';
import { Link } from 'react-router-dom';

const tasks = [
  { to: '/knowledge?upload=1', label: '上传知识', description: '导入 PDF、Word、表格或文本', icon: BookOpenText },
  { to: '/connectors?create=1', label: '接入业务系统', description: '登记一个 HTTP 查询接口', icon: DatabaseZap },
  { to: '/skills', label: '管理 Skill', description: '审核、发布与启停', icon: Boxes },
  { to: '/audit', label: '查看审计', description: '按操作与结果查询记录', icon: FileClock },
];

export function OverviewPage() {
  return (
    <div className="page-stack" data-testid="admin-overview-page">
      <section className="page-heading compact-heading">
        <div>
          <h1>管理工作台</h1>
          <p>管理员工可以查询的资料和调用的业务能力。</p>
        </div>
        <a className="button secondary" href="/">返回员工对话</a>
      </section>
      <section className="panel todo-panel" aria-label="常用操作">
        <div className="governance-tasks">
          {tasks.map(({ to, label, description, icon: Icon }) => (
            <Link key={to} to={to}><Icon size={19} /><span><strong>{label}</strong><small>{description}</small></span><ArrowRight size={16} /></Link>
          ))}
        </div>
      </section>
    </div>
  );
}
