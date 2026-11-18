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
      <section className="page-heading workspace-heading">
        <div>
          <h1>管理工作台</h1>
          <p>管理员工可以查询的资料和调用的业务能力。</p>
        </div>
      </section>
      <section className="governance-tasks" aria-label="常用操作">
          {tasks.map(({ to, label, description, icon: Icon }) => (
            <Link key={to} to={to}><span className="task-icon"><Icon size={22} /></span><span className="task-copy"><strong>{label}</strong><small>{description}</small></span><ArrowRight size={17} /></Link>
          ))}
      </section>
    </div>
  );
}
