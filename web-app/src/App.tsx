import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  ChevronRight,
  FileText,
  LogIn,
  MessageSquarePlus,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Waves,
} from 'lucide-react';
import { devLogin, getIdentityHeaders, getUserName, clearAuthSession, getAccessToken, consumeAuthCallback, getAuthConfig, getSession, logoutSession, startOidcLogin } from './auth-session';

type Citation = {
  title: string;
  category?: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  pending?: boolean;
};

type Session = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

type EvidenceKind = 'policy' | 'inference' | 'unknown';

type AnswerBlock = {
  kind?: EvidenceKind;
  title?: string;
  content: string;
};

const quickPrompts = [
  { title: '园区报修', text: '园区报修超过 24 小时未响应怎么办', icon: FileText },
  { title: '制度查询', text: '帮我查一下企业园区普通报修的响应和升级规则', icon: BookOpen },
  { title: '运营洞察', text: '帮我梳理园区工单超时的主要原因和改进建议', icon: Search },
];

const WEB_API_BASE = (import.meta.env.VITE_WEB_API_BASE || '/api').replace(/\/$/, '');

function createSession(): Session {
  return { id: crypto.randomUUID(), title: '新对话', updatedAt: Date.now(), messages: [] };
}

function messageTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 42 ? `${normalized.slice(0, 42)}…` : normalized || '新对话';
}

const evidenceHeadings: Array<{ kind: EvidenceKind; title: string; pattern: RegExp }> = [
  { kind: 'policy', title: '制度原文', pattern: /^制度原文[：:]?\s*/ },
  { kind: 'inference', title: '基于制度的推断', pattern: /^基于制度的推断[：:]?\s*/ },
  { kind: 'unknown', title: '知识库未规定', pattern: /^知识库未规定[：:]?\s*/ },
];

function splitAnswerBlocks(content: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let current: AnswerBlock = { content: '' };

  for (const line of content.split('\n')) {
    const heading = evidenceHeadings.find((item) => item.pattern.test(line.trim()));
    if (heading) {
      if (current.content.trim()) blocks.push({ ...current, content: current.content.trim() });
      current = { kind: heading.kind, title: heading.title, content: line.trim().replace(heading.pattern, '') };
      continue;
    }
    current.content += `${current.content ? '\n' : ''}${line}`;
  }

  if (current.content.trim()) blocks.push({ ...current, content: current.content.trim() });
  return blocks.length > 0 ? blocks : [{ content }];
}

export function App() {
  consumeAuthCallback();
  const initialSession = useMemo(createSession, []);
  const [sessions, setSessions] = useState<Session[]>([initialSession]);
  const [activeId, setActiveId] = useState(initialSession.id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState('企业知识库已连接');
  const [userName, setUserName] = useState(getUserName());
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginId, setLoginId] = useState(localStorage.getItem('workmate-web-user') || 'web-demo-user');
  const [authConfig, setAuthConfig] = useState<{ mode: string; oidcEnabled: boolean; oidcLoginUrl?: string; devLoginEnabled: boolean }>({ mode: 'development', oidcEnabled: false, devLoginEnabled: true });

  useEffect(() => {
    void getAuthConfig().then(setAuthConfig).catch(() => undefined);
    void getSession().then((session) => {
      const sessionUserName = session.context?.userName;
      if (session.authenticated && sessionUserName) setUserName(sessionUserName);
    }).catch(() => undefined);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((session) => session.id === activeId) ?? sessions[0];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeSession?.messages.length, sending]);

  const updateActiveSession = (updater: (session: Session) => Session) => {
    setSessions((current) => current.map((session) => session.id === activeId ? updater(session) : session));
  };

  const sendMessage = async (text = draft) => {
    const message = text.trim();
    if (!message || sending || !activeSession) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: message };
    const previousHistory = activeSession.messages.filter((item) => !item.pending);
    updateActiveSession((session) => ({
      ...session,
      title: session.messages.length === 0 ? messageTitle(message) : session.title,
      updatedAt: Date.now(),
      messages: [...session.messages, userMessage],
    }));
    setDraft('');
    setSending(true);
    setStatusText('正在检索企业知识库…');

    try {
      const response = await fetch(`${WEB_API_BASE}/web-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getIdentityHeaders(),
        },
        body: JSON.stringify({
          sessionId: activeSession.id,
          message,
          history: previousHistory.map(({ role, content }) => ({ role, content })),
        }),
      });
      const payload = await response.json() as { answer?: string; citations?: Citation[]; message?: string };
      if (response.status === 401) {
        clearAuthSession();
        setUserName('企业员工');
        setLoginOpen(true);
        throw new Error('登录已过期，请重新登录后再继续。');
      }
      if (!response.ok || !payload.answer) throw new Error(payload.message || '企业智能体暂时无法回答。');

      updateActiveSession((session) => ({
        ...session,
        updatedAt: Date.now(),
        messages: [...session.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: payload.answer!,
          citations: payload.citations,
        }],
      }));
      setStatusText('企业知识库已连接');
    } catch (error) {
      updateActiveSession((session) => ({
        ...session,
        messages: [...session.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: error instanceof Error ? error.message : '企业智能体暂时无法回答，请稍后重试。',
        }],
      }));
      setStatusText('服务连接需要检查');
    } finally {
      setSending(false);
    }
  };

  const startNewChat = () => {
    const next = createSession();
    setSessions((current) => [next, ...current]);
    setActiveId(next.id);
    setDraft('');
  };

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    try {
      await devLogin({ userId: loginId.trim(), userName: userName.trim() || '企业员工' });
      setUserName(getUserName());
      setLoginOpen(false);
      setStatusText('已通过登录身份校验');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = () => {
    void logoutSession();
    setUserName('企业员工');
    setStatusText('演示身份');
    setLoginOpen(false);
  };

  const beginSsoLogin = async () => {
    setLoginError('');
    try {
      if (authConfig.oidcLoginUrl) window.location.assign(authConfig.oidcLoginUrl);
      else await startOidcLogin();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '无法发起统一登录');
    }
  };

  return (
    <div className="web-shell">
      <aside className="web-sidebar">
        <div className="brand-block">
          <img src="/brand/logo.svg" alt="企业" />
          <div><strong>OpenWorkMate</strong><span>企业业务 AI 工作入口</span></div>
        </div>
        <button className="new-chat-button" onClick={startNewChat}>
          <MessageSquarePlus size={18} /> 新建对话
        </button>
        <div className="sidebar-label">最近对话</div>
        <div className="session-list">
          {sessions.map((session) => (
            <button key={session.id} className={`session-item ${session.id === activeId ? 'is-active' : ''}`} onClick={() => setActiveId(session.id)}>
              <span className="session-dot" />
              <span>{session.title}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-foot">
          <ShieldCheck size={16} />
          <span>企业权限已启用<br />回答受知识库和组织权限约束</span>
        </div>
      </aside>

      <main className="web-main">
        <header className="web-topbar">
          <div className="topbar-copy"><span>OpenWorkMate</span><strong>企业业务对话</strong></div>
          <div className="topbar-spacer" />
          <div className="connection-state"><i />{statusText}</div>
          <button className="user-chip" onClick={() => setLoginOpen(true)} title="登录与身份设置"><LogIn size={13} />{userName}{getAccessToken() ? '' : '（演示）'}</button>
        </header>

        <div className="conversation" ref={scrollRef} data-testid="web-conversation" aria-label="对话消息区">
          {activeSession.messages.length === 0 ? (
            <section className="welcome-panel">
              <div className="welcome-mark"><Waves size={28} /></div>
              <p className="eyebrow"><Sparkles size={14} /> 企业内部 AI 业务入口</p>
              <h1>让企业知识，变成工作助力</h1>
              <p className="welcome-copy">查询制度、推进工单、分析运营数据，让每位员工用自然语言连接企业知识库和内部业务。</p>
              <div className="quick-grid">
                {quickPrompts.map(({ title, text, icon: Icon }) => (
                  <button key={title} className="quick-card" onClick={() => void sendMessage(text)}>
                    <span><Icon size={18} /></span><strong>{title}</strong><small>{text}</small><ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="message-list">
              {activeSession.messages.map((message) => (
                <article key={message.id} className={`message-row ${message.role}`}>
                  {message.role === 'assistant' && <div className="assistant-avatar"><Waves size={16} /></div>}
                  <div className="message-content">
                    <div className="message-bubble">
                      {message.role === 'assistant' ? splitAnswerBlocks(message.content).map((block, index) => (
                        <div key={`${block.title ?? 'answer'}-${index}`} className={`answer-block ${block.kind ? `is-${block.kind}` : ''}`}>
                          {block.title && <span className="evidence-tag">{block.title}</span>}
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
                        </div>
                      )) : message.content}
                    </div>
                    {message.citations && message.citations.length > 0 && (
                      <div className="citations"><span><BookOpen size={13} /> 知识库引用</span>{message.citations.slice(0, 3).map((citation, index) => <small key={`${citation.title}-${index}`}>{index + 1}. {citation.title}{citation.category ? ` / ${citation.category}` : ''}{typeof citation.metadata?.pages === 'number' ? ` · 共 ${citation.metadata.pages} 页` : ''}{typeof citation.metadata?.sheets === 'number' ? ` · ${citation.metadata.sheets} 个工作表` : ''}</small>)}</div>
                    )}
                  </div>
                </article>
              ))}
              {sending && <div className="message-row assistant"><div className="assistant-avatar"><Waves size={16} /></div><div className="message-bubble loading-answer"><span /> <span /> <span /> 正在生成回答</div></div>}
            </section>
          )}
        </div>

        <div className="composer-wrap" data-testid="web-composer">
          <form className="composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="描述你要处理的企业业务…" rows={2} disabled={sending} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} />
            <div className="composer-actions"><button type="button" className="tool-button" title="附件"><Paperclip size={18} /></button><span>企业知识库 · 组织权限</span><button className="send-button" type="submit" disabled={!draft.trim() || sending} title="发送"><Send size={17} /></button></div>
          </form>
          <small className="composer-note">{import.meta.env.VITE_DEMO_MODE === 'true' ? '本地演示模式 · 使用示例资料与检索片段，未调用大模型' : '回答由 AI 生成，请结合制度原文和实际业务权限判断。'}</small>
        </div>
      </main>
      {loginOpen && <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
        <form className="auth-card" onSubmit={(event) => void submitLogin(event)}>
          <div className="auth-card-heading"><div><span>OpenWorkMate</span><strong>登录与身份校验</strong></div><button type="button" className="auth-close" onClick={() => setLoginOpen(false)}>×</button></div>
          <p>{authConfig.oidcEnabled ? '请使用企业统一身份认证登录，平台不会接触您的企业密码。' : '开发环境使用演示登录；生产环境将由企业统一 SSO 签发访问令牌。'}</p>
          {authConfig.oidcEnabled ? <button type="button" className="auth-submit" onClick={() => void beginSsoLogin()}>使用企业统一 SSO 登录</button> : <>
            <label>用户编号<input value={loginId} onChange={(event) => setLoginId(event.target.value)} required /></label>
            <label>显示姓名<input value={userName} onChange={(event) => setUserName(event.target.value)} required /></label>
            {loginError && <small className="auth-error">{loginError}</small>}
            <button className="auth-submit" disabled={loginBusy}>{loginBusy ? '校验中…' : '登录'}</button>
          </>}
          {authConfig.oidcEnabled && loginError && <small className="auth-error">{loginError}</small>}
          {getAccessToken() && <button type="button" className="auth-logout" onClick={logout}>退出当前登录</button>}
        </form>
      </div>}
    </div>
  );
}
