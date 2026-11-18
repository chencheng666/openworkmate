import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { defaultBrand, useBrandAppearance } from '../../ui/branding';
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

type Mode = 'enterprise' | 'general';
type Session = {
  mode: Mode;
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
const generalPrompts = [
  { title: '学个知识', text: '用一个生活中的例子解释为什么会有月相变化。', icon: BookOpen },
  { title: '帮我写作', text: '写一段简短的周末读书会邀请，语气自然一点。', icon: FileText },
  { title: '一起想想', text: '想学一门新语言，每天只有二十分钟，怎么安排第一周？', icon: Search },
];

import { apiBase as WEB_API_BASE, native } from './platform';
const FileResults = lazy(()=>import('./FileResults'));
const FeaturePanel = lazy(()=>import('./features/FeaturePanel'));
const hasFeatures=Object.keys(import.meta.glob('./features/generated/*.json')).length>0;
const MarkdownAnswer = lazy(() => import('./MarkdownAnswer'));

function createSession(mode: Mode = 'enterprise'): Session {
  return { id: crypto.randomUUID(), mode, title: '新对话', updatedAt: Date.now(), messages: [] };
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
  const [fileSource, setFileSource] = useState<string|null>(null);
  const [showFeatures,setShowFeatures]=useState(false);
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
  const [brand, setBrand] = useState(defaultBrand);
  const sessionToken = getAccessToken();
  const brandIcon = brand.logo || '/brand/logo.svg';
  useBrandAppearance(brand, '/');
  useEffect(() => {
    setBrand(defaultBrand);
    if (!hasSession) return;
    const controller = new AbortController();
    fetch(WEB_API_BASE + '/branding', { credentials: 'include', headers: getIdentityHeaders(), signal: controller.signal })
      .then(async res => { if (res.ok) { const value = await res.json(); if (!controller.signal.aborted) setBrand(value); } })
      .catch(() => undefined);
    return () => controller.abort();
  }, [hasSession, sessionToken]);
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
  const general = activeSession.mode === 'general';
  const switchMode = (mode: Mode) => {
    if (sending || mode === activeSession.mode) return;
    if (activeSession.messages.length === 0) {
      setSessions(list => list.map(s => s.id === activeId ? {...s, mode} : s));
    } else {
      // 不把已聊过的企业资料、引用或工具结果带进通用模型上下文。
      const next = createSession(mode);
      setSessions(list => [next, ...list]);
      setActiveId(next.id);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeSession?.messages.length, sending]);

  const updateActiveSession = (updater: (session: Session) => Session) => {
    setSessions((current) => current.map((session) => session.id === activeId ? updater(session) : session));
  };

  const clearConversations = () => {
    setFileSource(null);
    const next = createSession();
    setSessions([next]);
    setActiveId(next.id);
    setDraft('');
    setHistoryOpen(false);
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
    setStatusText(general ? '正在询问模型…' : '正在检索企业知识库…');

    try {
      if (!general && /^(?:\/升级(?:\s|$)|升级[：:])/.test(message)) {
        if(location.hostname!=='127.0.0.1' && location.hostname!=='localhost') throw new Error('源码升级只在维护者本机开放。');
        const request=message.replace(/^(?:\/升级|升级[：:])\s*/,'');
        const workspace='http://127.0.0.1:'+(import.meta.env.VITE_WORKSPACE_PORT||18790);
        const lab='http://127.0.0.1:'+Number(import.meta.env.VITE_UPGRADE_LAB_PORT||18794);
        if(location.origin===workspace || (workspace.endsWith(':18790')&&location.origin==='http://127.0.0.1:5180')){
          setStatusText('正在提交模型升级需求…');
          const r=await fetch(lab+'/jobs',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-Local-Upgrade':'1'},body:JSON.stringify({request})}).catch(()=>{throw Error('无法连接本地升级服务，请先启动 pnpm upgrade:lab。');});
          const j=await r.json();if(!r.ok||!/^\w{12}$/.test(j.id))throw Error(j.message||'提交失败');
          updateActiveSession(s=>({...s,messages:[...s.messages,{id:crypto.randomUUID(),role:'assistant',content:'升级任务已提交。可以[查看生成进度、代码差异和候选预览]('+lab+'/#job-'+j.id+')。只有你明确确认才会合并。'}]}));
          setStatusText('已提交本地升级任务');return;
        }
        const url=lab+'/#request='+encodeURIComponent(request);
        updateActiveSession(s=>({...s,messages:[...s.messages,{id:crypto.randomUUID(),role:'assistant',content:'[在本地升级对话中确认需求]('+url+')。提交后会创建独立分支、运行测试并提供试用地址。不会自动合并。'}]}));
        setStatusText('升级需求未发送到知识库');return;
      }
      const response = await fetch(`${WEB_API_BASE}/web-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getIdentityHeaders(),
        },
        body: JSON.stringify({
          sessionId: activeSession.id,
          mode: activeSession.mode,
          message,
          history: previousHistory.map(({ role, content }) => ({ role, content })),
        }),
      });
      const payload = await response.json() as { answer?: string; citations?: Citation[]; message?: string };
      if (response.status === 401) {
        clearAuthSession();
        clearConversations();
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
      setStatusText('服务已连接');
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
    const next = createSession(activeSession.mode);
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
      clearConversations();
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
    clearConversations();
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
          <strong title={brand.name}>{brand.name}</strong>
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
          <button className="user-chip" onClick={()=>setFileSource('')}>文件结果</button>
          {hasFeatures&&<button className="user-chip" onClick={()=>setShowFeatures(true)}>工作台工具</button>}
          {canManage && !native && <a className="user-chip" href="/admin/">管理后台</a>}
          <button className="user-chip user-name" onClick={() => setLoginOpen(true)} title="登录与身份设置"><LogIn size={13} /><span>{hasSession ? userName : '登录'}</span></button>
        </header>

        <div className="conversation" ref={scrollRef} data-testid="web-conversation" aria-label="对话消息区">
          {activeSession.messages.length === 0 ? (
            <section className="welcome-panel">
              <img className="welcome-mark" src={brandIcon} alt="" />
              <h1>{general ? '想聊点什么？' : '今天想查什么？'}</h1>
              <p className="welcome-copy">{general ? '学习、写作，或聊聊你感兴趣的问题。' : '查制度、找流程，或询问已接入的业务。'}</p>
              <div className="quick-grid">
                {(general ? generalPrompts : quickPrompts).map(({ title, text, icon: Icon }) => (
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
                      {message.role === 'assistant' ? (general ? [{content:message.content} as AnswerBlock] : splitAnswerBlocks(message.content)).map((block, index) => (
                        <div key={`${block.title ?? 'answer'}-${index}`} className={`answer-block ${block.kind ? `is-${block.kind}` : ''}`}>
                          {block.title && <span className="evidence-tag">{block.title}</span>}
                          <Suspense fallback={<span role="status">正在排版…</span>}><MarkdownAnswer>{block.content}</MarkdownAnswer></Suspense>
                        </div>
                      )) : message.content}
                    </div>
                    {message.role === 'assistant' && !message.pending && <button className="answer-export" onClick={()=>setFileSource(message.content)}>生成文件…</button>}
                    {message.role === 'assistant' && !message.pending && <button className="answer-export" type="button" onClick={() => {
                      void import('./MarkdownAnswer').then(({ downloadText }) => downloadText('工作台回答.md', message.content, 'text/markdown;charset=utf-8'));
                    }}>下载 Markdown</button>}
                    {message.citations && message.citations.length > 0 && (
                      <div className="citations"><span><BookOpen size={13} /> 检索到的参考资料</span>{message.citations.slice(0, 3).map((citation, index) => <details key={`${citation.title}-${index}`}><summary>{index + 1}. {citation.title}{citation.category ? ` / ${citation.category}` : ''}</summary><p>{citation.snippet || '此次检索未返回原文片段。'}</p></details>)}</div>
                    )}
                  </div>
                </article>
              ))}
              {sending && <div className="message-row assistant"><img className="assistant-avatar" src={brandIcon} alt="" /><div className="message-bubble loading-answer" role="status">正在生成回答…</div></div>}
            </section>
          )}
        </div>

        <div className="composer-wrap" data-testid="web-composer">
          <div className="chat-mode-switch" role="group" aria-label="问答模式">
            <button type="button" aria-pressed={!general} disabled={sending} onClick={()=>switchMode('enterprise')}>企业问答</button>
            <button type="button" aria-pressed={general} disabled={sending} onClick={()=>switchMode('general')}>通用问答</button>
          </div>
          <form className="composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <textarea aria-label="输入问题" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={general ? '直接问模型…' : '描述你要处理的企业业务…'} rows={2} disabled={sending} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} />
            <button className="send-button" type="submit" disabled={!draft.trim() || sending} title="发送" aria-label="发送"><Send size={18} /></button>
          </form>
          {general ? <small className="composer-note">{authConfig?.demoMode ? '演示模式未启用真实模型，暂不能使用通用问答。' : '直接询问模型，不读取企业知识库或调用业务工具。'}</small> : /^(?:\/升级|升级[：:])/.test(draft)?<small className="composer-note">升级模式 · 只发送需求给编程模型，请勿粘贴业务资料或密钥。候选不会自动合并。</small>:authConfig && <small className="composer-note">{authConfig.demoMode ? '演示模式 · 回答来自示例知识库的检索结果' : '请结合制度原文核对回答。'}</small>}
        </div>
      </main>
      {fileSource!==null && <Suspense fallback={<span role="status">正在打开文件结果…</span>}><FileResults source={fileSource} close={()=>setFileSource(null)} /></Suspense>}
      {showFeatures&&<Suspense fallback={<span role="status">正在加载工具…</span>}><FeaturePanel close={()=>setShowFeatures(false)}/></Suspense>}
      {loginOpen && <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
        <form className="auth-card" onSubmit={(event) => void submitLogin(event)}>
          <div className="auth-card-heading"><strong>登录 {brand.name}</strong><button type="button" className="auth-close" aria-label="关闭登录弹窗" onClick={() => setLoginOpen(false)}><X size={19} /></button></div>
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
