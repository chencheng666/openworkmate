import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  FileText,
  LogIn,
  Menu,
  MessageSquarePlus,
  Search,
  Send,
  X,
} from 'lucide-react';
import { devLogin, getIdentityHeaders, getUserName, clearAuthSession, getAccessToken, consumeAuthCallback, getAuthConfig, getSession, logoutSession, startOidcLogin, type AuthConfig } from './auth-session';

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
const MarkdownAnswer = lazy(() => import('./MarkdownAnswer'));
const brandIcon = '/brand/logo.svg';

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
  const [statusText, setStatusText] = useState('正在连接服务…');
  const [userName, setUserName] = useState(getUserName());
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginId, setLoginId] = useState(localStorage.getItem('workmate-web-user') || 'web-demo-user');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const historyClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (historyOpen) historyClose.current?.focus();
  }, [historyOpen]);

  const closeHistory = () => {
    setHistoryOpen(false);
    if (historyOpen) historyToggle.current?.focus();
  };

  useEffect(() => {
    void getAuthConfig().then(setAuthConfig).catch(() => setStatusText('暂时无法连接服务'));
    void getSession().then((session) => {
      const sessionUserName = session.context?.userName;
      if (session.authenticated && sessionUserName) setUserName(sessionUserName);
      setHasSession(session.authenticated);
      setCanManage(session.context?.roleIds?.some((role) => role === 'platform-admin' || role === 'business-owner') ?? false);
      setStatusText(session.authenticated ? '服务已连接' : '请先登录');
    }).catch((error: Error) => setStatusText(error.message));
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
        setHasSession(false);
        setCanManage(false);
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
    closeHistory();
  };

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    try {
      await devLogin({ userId: loginId.trim(), userName: userName.trim() || '企业员工' });
      setUserName(getUserName());
      setHasSession(true);
      setCanManage(false);
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
    setStatusText('已退出登录');
    setHasSession(false);
    setCanManage(false);
    setLoginOpen(false);
  };

  const beginSsoLogin = async () => {
    setLoginError('');
    try {
      if (authConfig?.oidcLoginUrl) window.location.assign(authConfig.oidcLoginUrl);
      else await startOidcLogin();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '无法发起统一登录');
    }
  };

  return (
    <div className="web-shell">
      {historyOpen && <button className="history-backdrop" type="button" onClick={closeHistory} aria-label="关闭对话列表" tabIndex={-1} />}
      <aside className={`web-sidebar ${historyOpen ? 'is-open' : ''}`} id="chat-sidebar" aria-label="对话列表" onKeyDown={(event) => { if (event.key === 'Escape') closeHistory(); }}>
        <div className="brand-block">
          <img className="brand-logo" src={brandIcon} alt="" />
          <strong>OpenWorkMate</strong>
          <button ref={historyClose} className="sidebar-close" type="button" onClick={closeHistory} aria-label="收起对话列表"><X size={18} /></button>
        </div>
        <button className="new-chat-button" onClick={startNewChat}>
          <MessageSquarePlus size={18} /> 新建对话
        </button>
        <div className="sidebar-label">最近对话</div>
        <div className="session-list">
          {sessions.map((session) => (
            <button key={session.id} className={`session-item ${session.id === activeId ? 'is-active' : ''}`} aria-current={session.id === activeId ? 'true' : undefined} onClick={() => { setActiveId(session.id); closeHistory(); }}>
              <span className="session-dot" />
              <span>{session.title}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="web-main">
        <header className="web-topbar">
          <button ref={historyToggle} className="history-toggle" type="button" aria-label="打开对话列表" aria-controls="chat-sidebar" aria-expanded={historyOpen} onClick={() => setHistoryOpen(true)}><Menu size={19} /></button>
          <strong className="topbar-title">工作助手</strong>
          <div className="topbar-spacer" />
          <div className="connection-state" role="status">{statusText}</div>
          {canManage && <a className="user-chip" href="/admin/">管理后台</a>}
          <button className="user-chip user-name" onClick={() => setLoginOpen(true)} title="登录与身份设置"><LogIn size={13} /><span>{hasSession ? userName : '登录'}</span></button>
        </header>

        <div className="conversation" ref={scrollRef} data-testid="web-conversation" aria-label="对话消息区">
          {activeSession.messages.length === 0 ? (
            <section className="welcome-panel">
              <img className="welcome-mark" src={brandIcon} alt="" />
              <h1>今天想查什么？</h1>
              <p className="welcome-copy">查制度、找流程，或询问已接入的业务。</p>
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
                  {message.role === 'assistant' && <img className="assistant-avatar" src={brandIcon} alt="" />}
                  <div className="message-content">
                    <div className="message-bubble">
                      {message.role === 'assistant' ? splitAnswerBlocks(message.content).map((block, index) => (
                        <div key={`${block.title ?? 'answer'}-${index}`} className={`answer-block ${block.kind ? `is-${block.kind}` : ''}`}>
                          {block.title && <span className="evidence-tag">{block.title}</span>}
                          <Suspense fallback={<span role="status">正在排版…</span>}><MarkdownAnswer>{block.content}</MarkdownAnswer></Suspense>
                        </div>
                      )) : message.content}
                    </div>
                    {message.citations && message.citations.length > 0 && (
                      <div className="citations"><span><BookOpen size={13} /> 知识库引用</span>{message.citations.slice(0, 3).map((citation, index) => <small key={`${citation.title}-${index}`}>{index + 1}. {citation.title}{citation.category ? ` / ${citation.category}` : ''}{typeof citation.metadata?.pages === 'number' ? ` · 共 ${citation.metadata.pages} 页` : ''}{typeof citation.metadata?.sheets === 'number' ? ` · ${citation.metadata.sheets} 个工作表` : ''}</small>)}</div>
                    )}
                  </div>
                </article>
              ))}
              {sending && <div className="message-row assistant"><img className="assistant-avatar" src={brandIcon} alt="" /><div className="message-bubble loading-answer" role="status">正在生成回答…</div></div>}
            </section>
          )}
        </div>

        <div className="composer-wrap" data-testid="web-composer">
          <form className="composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <textarea aria-label="输入问题" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="描述你要处理的企业业务…" rows={2} disabled={sending} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} />
            <button className="send-button" type="submit" disabled={!draft.trim() || sending} title="发送" aria-label="发送"><Send size={18} /></button>
          </form>
          {authConfig && <small className="composer-note">{authConfig.demoMode ? '演示模式 · 回答来自示例知识库的检索结果' : '请结合制度原文核对回答。'}</small>}
        </div>
      </main>
      {loginOpen && <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
        <form className="auth-card" onSubmit={(event) => void submitLogin(event)}>
          <div className="auth-card-heading"><strong>登录 OpenWorkMate</strong><button type="button" className="auth-close" aria-label="关闭登录弹窗" onClick={() => setLoginOpen(false)}><X size={19} /></button></div>
          {authConfig?.oidcEnabled && <button type="button" className="auth-submit" onClick={() => void beginSsoLogin()}>使用企业统一 SSO 登录</button>}
          {authConfig?.devLoginEnabled && !authConfig.oidcEnabled && <>
            <label>用户编号<input value={loginId} onChange={(event) => setLoginId(event.target.value)} required /></label>
            <label>显示姓名<input value={userName} onChange={(event) => setUserName(event.target.value)} required /></label>
            <button className="auth-submit" disabled={loginBusy}>{loginBusy ? '校验中…' : '登录'}</button>
          </>}
          {!authConfig?.oidcEnabled && !authConfig?.devLoginEnabled && !hasSession && <p>当前没有可用的登录方式，请联系管理员。</p>}
          {loginError && <small className="auth-error">{loginError}</small>}
          {(getAccessToken() || (hasSession && authConfig?.oidcEnabled)) && <button type="button" className="auth-logout" onClick={logout}>退出当前登录</button>}
        </form>
      </div>}
    </div>
  );
}
