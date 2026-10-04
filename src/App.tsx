import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  KeyRound,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { GENDERS, PERSONALITIES, STAGES } from '../shared/catalog';
import { MIMO_ENDPOINTS, PROVIDERS } from '../shared/providers';
import type { ApiSettings, Companion, CompanionDraft } from '../shared/types';
import useApp from './hooks/useApp';
import Avatar from './components/Avatar';
import CompanionForm from './components/CompanionForm';
import Dialog from './components/Dialog';

type Page = 'chats' | 'contacts' | 'settings';
type Confirmation = { title: string; description: string; action: () => void; label: string };
const NAVIGATION = [
  { id: 'chats' as Page, label: '聊天', icon: MessageCircle },
  { id: 'contacts' as Page, label: '通讯录', icon: Users },
  { id: 'settings' as Page, label: '设置', icon: Settings },
];
const CONVERSATION_STARTERS = [
  { emoji: '☕', label: '分享今天的小事', text: '今天发生了一件小事，想跟你聊聊。' },
  { emoji: '☁️', label: '让心情歇一会儿', text: '今天有点累，可以陪我说说话吗？' },
  { emoji: '🎵', label: '聊聊我们的喜好', text: '最近在听什么歌？想跟你交换一下喜欢的音乐。' },
  { emoji: '🌙', label: '睡前的一句晚安', text: '准备睡觉了，想和你说声晚安。' },
];

function timeLabel(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
function personalityLabel(companion: Companion) {
  return companion.personalityIds
    .map((id) => PERSONALITIES.find((item) => item.id === id)?.label)
    .filter(Boolean);
}
function stageLabel(companion: Companion) {
  return STAGES.find((item) => item.id === companion.stage)?.label ?? '初识';
}

export default function App() {
  const app = useApp();
  const [page, setPage] = useState<Page>('chats');
  const [search, setSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [mobileChat, setMobileChat] = useState(false);
  const [editor, setEditor] = useState<Companion | 'create' | null>(null);
  const [profile, setProfile] = useState<Companion | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [composer, setComposer] = useState('');
  const [settings, setSettings] = useState<ApiSettings>(app.settings);
  const [showKey, setShowKey] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nativeBack = useRef(() => {});
  nativeBack.current = () => {
    if (confirmation) setConfirmation(null);
    else if (editor) setEditor(null);
    else if (profile) setProfile(null);
    else if (showMore) setShowMore(false);
    else if (showEmoji) setShowEmoji(false);
    else if (mobileChat) {
      app.stopGeneration();
      setMobileChat(false);
    } else if (page !== 'chats') setPage('chats');
    else void NativeApp.minimizeApp();
  };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const listener = NativeApp.addListener('backButton', () => {
      if (active) nativeBack.current();
    });
    return () => {
      active = false;
      void listener.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, []);
  const companion = app.activeCompanion;
  const hasKey = Boolean(app.settings.apiKey.trim());
  const provider = PROVIDERS.find((item) => item.id === settings.provider) ?? PROVIDERS[0];
  const isMiMo = provider.id === 'mimo';
  const mimoEndpoint =
    MIMO_ENDPOINTS.find((endpoint) => endpoint.url === settings.baseUrl.replace(/\/$/, '')) ??
    MIMO_ENDPOINTS[0];
  const isTokenPlan = isMiMo && mimoEndpoint.mode === 'token-plan';
  const providerConsole =
    isMiMo && !isTokenPlan ? 'https://platform.xiaomimimo.com/console/api-keys' : provider.console;
  const providerGuide =
    isMiMo && !isTokenPlan
      ? 'https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call'
      : provider.guide;
  const currentProviderConfigured =
    hasKey &&
    settings.provider === app.settings.provider &&
    settings.baseUrl === app.settings.baseUrl;
  const modelOptions = Array.from(
    new Set([provider.defaultModel, settings.model, ...app.models].filter(Boolean)),
  );
  const filteredCompanions = app.companions.filter((item) =>
    `${item.name} ${personalityLabel(item).join(' ')}`.toLowerCase().includes(search.toLowerCase()),
  );
  const contacts = app.companions.filter((item) =>
    `${item.name} ${personalityLabel(item).join(' ')}`
      .toLowerCase()
      .includes(contactSearch.toLowerCase()),
  );

  useEffect(() => {
    setSettings(app.settings);
  }, [app.settings]);
  useEffect(() => {
    messageEnd.current?.scrollIntoView({
      behavior: app.busy.chat ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [app.messages, app.busy.chat, app.activeId]);
  useEffect(() => {
    setComposer('');
    setShowMore(false);
    setShowEmoji(false);
  }, [app.activeId]);

  const selectCompanion = (id: string) => {
    app.setActiveId(id);
    setPage('chats');
    setMobileChat(true);
  };
  const selectPage = (next: Page) => {
    setPage(next);
    setShowMore(false);
    setMobileChat(false);
  };
  const fillMessage = (text: string) => {
    setComposer(text);
    composerRef.current?.focus();
  };
  const send = (event?: FormEvent) => {
    event?.preventDefault();
    if (!composer.trim() || app.busy.chat || !companion) return;
    if (!hasKey) {
      setPage('settings');
      setMobileChat(false);
      return;
    }
    const content = composer.trim();
    setComposer('');
    setShowEmoji(false);
    void app.sendMessage(content);
    composerRef.current?.focus();
  };
  const saveCompanion = (draft: CompanionDraft) => {
    if (editor && editor !== 'create') app.updateCompanion(editor.id, draft);
    else {
      const id = app.createCompanion(draft);
      if (!id) return;
      app.setActiveId(id);
      setPage('chats');
      setMobileChat(true);
    }
    setEditor(null);
  };
  const deleteCompanion = (item: Companion) => {
    setProfile(null);
    setConfirmation({
      title: `删除「${item.name}」？`,
      description: '这个对象的设定和所有聊天记录将一并删除，无法恢复。',
      label: '删除对象',
      action: () => {
        app.deleteCompanion(item.id);
        setMobileChat(false);
      },
    });
  };
  const clearHistory = () => {
    if (!companion) return;
    setShowMore(false);
    setConfirmation({
      title: '清空这段聊天？',
      description: `将删除与 ${companion.name} 的全部聊天记录，对象设定会保留。`,
      label: '清空聊天',
      action: () => app.clearHistory(companion.id),
    });
  };
  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await app.saveSettings(settings);
    setSaving(false);
  };

  if (!app.ready)
    return (
      <div className="boot-screen">
        <div className="brand-mark">
          <Heart size={27} />
        </div>
        <span>知心正在醒来…</span>
        <LoaderCircle className="spin" size={20} />
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            selectPage('chats');
          }}
          aria-label="知心，返回聊天"
        >
          <span className="brand-mark">
            <Heart size={27} strokeWidth={1.8} />
          </span>
          <span>
            <strong>
              知心<span className="brand-dot">.</span>
            </strong>
            <small>AI LOVER</small>
          </span>
        </a>
        <div className="sidebar-label">你的陪伴空间</div>
        <nav className="main-nav">
          {NAVIGATION.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => selectPage(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === 'chats' && app.companions.length > 0 && (
                <span className="nav-count">{app.companions.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-message">
          <span className="little-spark">✧</span>
          <p>
            总有一句话，
            <br />
            让心靠近一点。
          </p>
          <span className="sidebar-message-line" />
        </div>
        <div className="sidebar-footer">
          <div className="local-profile">
            <span className="user-avatar">
              <Leaf size={19} />
            </span>
            <span>
              <strong>我的小宇宙</strong>
              <small>自在做自己</small>
            </span>
            <button
              className="icon-button"
              onClick={() => selectPage('settings')}
              aria-label="打开设置"
            >
              <Settings size={17} />
            </button>
          </div>
          <span className="local-note">
            <span className="status-dot" />
            本地陪伴空间
          </span>
        </div>
      </aside>

      <main className={`main-area page-${page} ${mobileChat ? 'mobile-chat-open' : ''}`}>
        {page === 'chats' && (
          <>
            <section className="chat-list-panel" aria-label="聊天列表">
              <header className="list-header">
                <div>
                  <span className="eyebrow">A LITTLE CLOSER</span>
                  <h1>
                    聊天 <span>{app.companions.length}</span>
                  </h1>
                </div>
                <button
                  className="icon-button add-button"
                  onClick={() => setEditor('create')}
                  aria-label="创建陪伴对象"
                >
                  <Plus size={20} />
                </button>
              </header>
              <label className="search-field">
                <Search size={17} />
                <input
                  placeholder="搜索你的朋友"
                  aria-label="搜索聊天对象"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} aria-label="清除搜索">
                    <X size={14} />
                  </button>
                )}
              </label>
              <div className="list-section-title">
                最近的聊天<span>慢慢来，也很好</span>
              </div>
              <div className="conversation-list">
                {filteredCompanions.map((item) => {
                  const history = app.conversations[item.id] ?? [];
                  const last = history[history.length - 1];
                  return (
                    <button
                      key={item.id}
                      className={`conversation-item ${app.activeId === item.id ? 'active' : ''}`}
                      onClick={() => selectCompanion(item.id)}
                      aria-pressed={app.activeId === item.id}
                      aria-label={`${item.name}${last ? timeLabel(last.createdAt) : '新朋友'} ${last?.content || '开始聊天'}`}
                    >
                      <div className="avatar-wrap">
                        <Avatar emoji={item.avatar} color={item.color} />
                        <span className="companion-status" />
                      </div>
                      <div className="conversation-item-content">
                        <div className="conversation-item-top">
                          <strong>{item.name}</strong>
                          <time>{last ? timeLabel(last.createdAt) : '新朋友'}</time>
                        </div>
                        <p>{last?.content || `和${item.name}说声你好吧`}</p>
                        <div className="conversation-item-tags">
                          <span>{personalityLabel(item)[0]}</span>
                          <span className="small-separator">·</span>
                          <span>{stageLabel(item)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filteredCompanions.length === 0 && (
                  <div className="list-empty">
                    <MessageCircle size={28} />
                    <p>{search ? '没有找到这位朋友' : '还没有聊天对象'}</p>
                    <small>{search ? '换个名字试试吧' : '创建一位朋友，从你好开始'}</small>
                    {!search && (
                      <button className="text-button" onClick={() => setEditor('create')}>
                        <Plus size={14} />
                        认识新朋友
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button className="new-companion-card" onClick={() => setEditor('create')}>
                <span className="new-companion-icon">
                  <Plus size={19} />
                </span>
                <span>
                  <strong>再认识一位朋友</strong>
                  <small>每一种个性，都有独特的温度</small>
                </span>
                <ArrowRight size={15} />
              </button>
              <div className="list-footer">
                <ShieldCheck size={13} /> 你的对话，保存在这台设备
              </div>
            </section>

            <section
              className="chat-panel"
              aria-label={companion ? `与${companion.name}的会话` : '聊天空间'}
            >
              {companion ? (
                <>
                  <header className="chat-header">
                    <button
                      className="icon-button mobile-back"
                      onClick={() => setMobileChat(false)}
                      aria-label="返回聊天列表"
                    >
                      <ArrowLeft size={21} />
                    </button>
                    <button className="chat-person" onClick={() => setProfile(companion)}>
                      <Avatar emoji={companion.avatar} color={companion.color} size="small" />
                      <span>
                        <strong>
                          {companion.name}
                          <span className="ai-label">AI</span>
                        </strong>
                        <small>
                          <span className="status-dot" />
                          {personalityLabel(companion)[0]}
                          <span className="small-separator">·</span>
                          {stageLabel(companion)}
                        </small>
                      </span>
                    </button>
                    <div className="chat-header-actions">
                      <button className="relationship-pill" onClick={() => setEditor(companion)}>
                        <Heart size={13} />
                        {stageLabel(companion)}
                        <ChevronRight size={12} />
                      </button>
                      <div className="more-menu-wrap">
                        <button
                          className={`icon-button ${showMore ? 'pressed' : ''}`}
                          onClick={() => setShowMore(!showMore)}
                          aria-label="更多会话操作"
                          aria-expanded={showMore}
                        >
                          <Ellipsis size={23} />
                        </button>
                        {showMore && (
                          <div className="dropdown-menu">
                            <button
                              onClick={() => {
                                setProfile(companion);
                                setShowMore(false);
                              }}
                            >
                              <Users size={16} />
                              对象详情
                            </button>
                            <button
                              onClick={() => {
                                setEditor(companion);
                                setShowMore(false);
                              }}
                            >
                              <Settings size={16} />
                              编辑设定
                            </button>
                            <button
                              className="danger-text"
                              disabled={app.busy.chat}
                              onClick={clearHistory}
                            >
                              <Trash2 size={16} />
                              清空聊天
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </header>
                  <div className="conversation-context">
                    <Sparkles size={13} />
                    <span>和 {companion.name} 的专属空间</span>
                    <span className="context-tag">{personalityLabel(companion).join(' / ')}</span>
                  </div>
                  <div className="messages-scroll">
                    {app.messages.length === 0 ? (
                      <div className="conversation-welcome">
                        <div className="welcome-orbit">
                          <span className="orbit-dot one">✧</span>
                          <Avatar emoji={companion.avatar} color={companion.color} size="hero" />
                          <span className="orbit-dot two">✧</span>
                        </div>
                        <span className="welcome-eyebrow">
                          EVERY CONNECTION STARTS WITH A HELLO
                        </span>
                        <h2>和 {companion.name}，慢慢熟悉</h2>
                        <p>
                          开心的、平凡的，或者有点难过的。
                          <br />
                          生活里的小事，都可以从这里说起。
                        </p>
                        <div className="starter-grid">
                          {CONVERSATION_STARTERS.map((starter) => (
                            <button key={starter.label} onClick={() => fillMessage(starter.text)}>
                              <span>{starter.emoji}</span>
                              {starter.label}
                              <ArrowUp size={13} />
                            </button>
                          ))}
                        </div>
                        <div className="welcome-ai-note">
                          <Sparkles size={12} />
                          这是 AI 陪伴，给真实生活多一点温暖
                        </div>
                      </div>
                    ) : (
                      <div className="message-list">
                        <div className="history-start">
                          <span />
                          故事从这里开始
                          <span />
                        </div>
                        {app.messages.map((message, index) => (
                          <div
                            key={message.id}
                            className={`message-row ${message.role === 'user' ? 'outgoing' : 'incoming'}`}
                          >
                            {message.role === 'assistant' && (
                              <Avatar
                                emoji={companion.avatar}
                                color={companion.color}
                                size="small"
                              />
                            )}
                            <div className="message-stack">
                              {(index === 0 ||
                                message.createdAt - app.messages[index - 1].createdAt >
                                  300_000) && (
                                <time className="message-time">{timeLabel(message.createdAt)}</time>
                              )}
                              <div
                                className={`message-bubble ${message.status === 'error' ? 'message-error' : ''}`}
                              >
                                {message.content ||
                                  (message.status === 'streaming' ? (
                                    <span className="typing-dots" aria-label="正在等待回复">
                                      <i />
                                      <i />
                                      <i />
                                    </span>
                                  ) : message.status === 'error' ? (
                                    '这条回复没有完成。'
                                  ) : (
                                    '回复已停止。'
                                  ))}
                                {message.status === 'streaming' && Boolean(message.content) && (
                                  <span className="stream-cursor" />
                                )}
                              </div>
                              <div className="message-meta">
                                {message.status === 'error' ? (
                                  <>
                                    <span>{message.error || '回复失败，请检查连接后重试'}</span>
                                    {!app.busy.chat && index === app.messages.length - 1 && (
                                      <button
                                        className="text-button"
                                        onClick={() => void app.retryMessage()}
                                      >
                                        <RefreshCw size={12} />
                                        重试
                                      </button>
                                    )}
                                  </>
                                ) : message.status === 'stopped' ? (
                                  <>
                                    <span>已停止生成</span>
                                    {!app.busy.chat && index === app.messages.length - 1 && (
                                      <button
                                        className="text-button"
                                        onClick={() => void app.retryMessage()}
                                      >
                                        <RefreshCw size={12} />
                                        重试
                                      </button>
                                    )}
                                  </>
                                ) : message.role === 'user' ? (
                                  <CheckCheck size={12} />
                                ) : null}
                              </div>
                            </div>
                            {message.role === 'user' && (
                              <span className="user-avatar message-user-avatar">
                                <Leaf size={17} />
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div ref={messageEnd} />
                  </div>
                  {!hasKey && (
                    <button className="demo-banner" onClick={() => selectPage('settings')}>
                      <span>
                        <KeyRound size={14} />
                        <span>当前为本地演示，配置 API 后即可真实聊天</span>
                      </span>
                      <span>
                        去设置
                        <ArrowRight size={13} />
                      </span>
                    </button>
                  )}
                  <form className="composer" onSubmit={send}>
                    <div className="composer-top">
                      <div className="composer-tools">
                        <div className="emoji-menu-wrap">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="插入表情"
                            aria-expanded={showEmoji}
                            onClick={() => setShowEmoji(!showEmoji)}
                          >
                            <Smile size={20} />
                          </button>
                          {showEmoji && (
                            <div className="emoji-picker">
                              {[
                                '😊',
                                '🤍',
                                '🌷',
                                '✨',
                                '🥹',
                                '🌙',
                                '☕',
                                '🫂',
                                '😌',
                                '🐾',
                                '💌',
                                '🍀',
                              ].map((emoji) => (
                                <button
                                  type="button"
                                  key={emoji}
                                  aria-label={`插入${emoji}`}
                                  onClick={() => {
                                    setComposer((value) => value + emoji);
                                    setShowEmoji(false);
                                    composerRef.current?.focus();
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="composer-inspiration"
                          onClick={() =>
                            fillMessage(
                              CONVERSATION_STARTERS[
                                Math.floor(Math.random() * CONVERSATION_STARTERS.length)
                              ].text,
                            )
                          }
                        >
                          <Sparkles size={16} />
                          <span>聊点什么</span>
                        </button>
                      </div>
                      <span className="composer-status">
                        {app.busy.chat ? (
                          <>
                            <span className="status-dot pulse" />
                            {companion.name} 正在回复
                          </>
                        ) : (
                          <>
                            <Leaf size={12} />
                            慢慢说，我在听
                          </>
                        )}
                      </span>
                    </div>
                    <label className="sr-only" htmlFor="message-input">
                      发送给{companion.name}的消息
                    </label>
                    <textarea
                      ref={composerRef}
                      id="message-input"
                      value={composer}
                      maxLength={4000}
                      rows={3}
                      placeholder={`想和 ${companion.name} 说些什么…`}
                      onChange={(event) => setComposer(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'Enter' &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          send();
                        }
                      }}
                    />
                    <div className="composer-bottom">
                      <span>
                        Enter 发送 <span>·</span> Shift + Enter 换行
                      </span>
                      {app.busy.chat ? (
                        <button
                          type="button"
                          className="button stop-button"
                          onClick={app.stopGeneration}
                        >
                          <Square size={13} fill="currentColor" />
                          停止回复
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="button send-button"
                          disabled={!composer.trim()}
                        >
                          <span>发送</span>
                          <Send size={14} />
                        </button>
                      )}
                    </div>
                  </form>
                  <footer className="chat-footnote">
                    AI 的回复可能不准确，请照顾好真实的自己。
                    {app.lastMetrics && (
                      <span
                        title={`整条回复用时 ${(app.lastMetrics.totalMs / 1000).toFixed(1)} 秒`}
                      >
                        <Zap size={10} />
                        首字 {(app.lastMetrics.firstTokenMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </footer>
                </>
              ) : (
                <div className="no-conversation">
                  <div className="empty-brand-orbit">
                    <span className="brand-mark">
                      <Heart size={42} />
                    </span>
                    <span className="empty-spark">✧</span>
                  </div>
                  <span className="welcome-eyebrow">YOUR LITTLE SPACE OF CONNECTION</span>
                  <h2>有些话，想说给懂你的人听</h2>
                  <p>
                    创建一位有自己个性的 AI 朋友，
                    <br />
                    让平凡日常，多一点温暖的回声。
                  </p>
                  <button className="button primary" onClick={() => setEditor('create')}>
                    <Plus size={16} />
                    认识第一位朋友
                  </button>
                  <span className="welcome-ai-note">
                    <ShieldCheck size={13} />
                    本地保存对话 · 自由定义关系
                  </span>
                </div>
              )}
            </section>
          </>
        )}

        {page === 'contacts' && (
          <section className="full-page contacts-page">
            <header className="page-header">
              <div>
                <span className="eyebrow">PEOPLE IN YOUR LITTLE WORLD</span>
                <h1>
                  通讯录<span className="page-heading-dot">.</span>
                </h1>
                <p>每一位朋友，都是一种独特的陪伴。</p>
              </div>
              <button className="button primary" onClick={() => setEditor('create')}>
                <Plus size={16} />
                新朋友
              </button>
            </header>
            <div className="contacts-toolbar">
              <label className="search-field">
                <Search size={17} />
                <input
                  placeholder="搜索名字或个性"
                  aria-label="搜索通讯录"
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                />
              </label>
              <span>
                全部朋友 <strong>{app.companions.length}</strong>
              </span>
            </div>
            <div className="contact-grid">
              {contacts.map((item) => (
                <article key={item.id} className="contact-card">
                  <button
                    className="contact-details-button"
                    onClick={() => setProfile(item)}
                    aria-label={`查看${item.name}的详细信息`}
                  >
                    <Ellipsis size={21} />
                  </button>
                  <Avatar emoji={item.avatar} color={item.color} size="large" />
                  <h2>{item.name}</h2>
                  <p className="contact-personality">{personalityLabel(item).join(' · ')}</p>
                  <span className="contact-stage">
                    <Heart size={12} />
                    {stageLabel(item)}
                  </span>
                  <p className="contact-description">
                    {item.background ||
                      PERSONALITIES.find((personality) => personality.id === item.personalityIds[0])
                        ?.description ||
                      '一位等着认识你的新朋友'}
                  </p>
                  <button className="contact-chat-button" onClick={() => selectCompanion(item.id)}>
                    <MessageCircle size={16} />
                    聊一聊
                    <ArrowRight size={14} />
                  </button>
                </article>
              ))}
              <button className="contact-card add-contact-card" onClick={() => setEditor('create')}>
                <span className="add-contact-circle">
                  <Plus size={25} />
                </span>
                <h2>认识新朋友</h2>
                <p>为你的世界，添一点新颜色</p>
              </button>
            </div>
            {contactSearch && contacts.length === 0 && (
              <div className="search-empty">
                <Search size={26} />
                <p>没有找到相关朋友，换个关键词试试。</p>
              </div>
            )}
            <div className="page-bottom-note">
              <Heart size={14} />
              关系有很多种，相处的温度由你定义。
            </div>
          </section>
        )}

        {page === 'settings' && (
          <section className="full-page settings-page">
            <header className="page-header">
              <div>
                <span className="eyebrow">MAKE THIS SPACE YOURS</span>
                <h1>
                  设置<span className="page-heading-dot">.</span>
                </h1>
                <p>连接你的模型，让每一句话都有回应。</p>
              </div>
              <span className={`connection-badge ${currentProviderConfigured ? 'configured' : ''}`}>
                <span className="status-dot" />
                {currentProviderConfigured ? 'API 已配置' : '等待连接 API'}
              </span>
            </header>
            <div className="settings-layout">
              <div className="settings-main">
                <form onSubmit={saveSettings}>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <span className="setting-icon">
                        <Zap size={19} />
                      </span>
                      <div>
                        <h2>模型与连接</h2>
                        <p>
                          {isTokenPlan
                            ? '使用小米 MiMo Token Plan 专用密钥，按已开通的套餐额度使用。'
                            : isMiMo
                              ? '使用小米 MiMo 通用 API 密钥，按实际 token 用量计费。'
                              : '使用硅基流动 API 密钥，按供应商实际用量计费。'}
                        </p>
                      </div>
                    </div>
                    <fieldset className="provider-fieldset">
                      <legend>模型服务商</legend>
                      <div className="provider-options">
                        {PROVIDERS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`provider-option ${settings.provider === item.id ? 'selected' : ''}`}
                            aria-pressed={settings.provider === item.id}
                            disabled={app.busy.models || app.busy.test || saving}
                            onClick={() => {
                              if (settings.provider === item.id) return;
                              app.clearModels();
                              setManualModel(false);
                              setShowKey(false);
                              setSettings((current) => ({
                                ...current,
                                provider: item.id,
                                baseUrl: item.url,
                                model: item.defaultModel,
                                apiKey: '',
                              }));
                            }}
                          >
                            <span>
                              <span
                                className={`provider-symbol ${item.id === 'mimo' ? 'provider-symbol-mimo' : ''}`}
                              >
                                {item.id === 'mimo' ? 'mi' : 'S'}
                              </span>
                              <strong>{item.id === 'mimo' ? '小米 MiMo' : item.name}</strong>
                              {settings.provider === item.id && <Check size={15} />}
                            </span>
                            <small>
                              {item.id === 'mimo'
                                ? settings.provider === 'mimo'
                                  ? isTokenPlan
                                    ? 'Token Plan · 按套餐额度'
                                    : '通用 API · 按用量计费'
                                  : 'Token Plan / 通用 API'
                                : item.description}
                            </small>
                          </button>
                        ))}
                      </div>
                      <p className="provider-switch-note">
                        切换服务商会清空当前密钥，请使用对应服务的密钥。
                      </p>
                    </fieldset>
                    {isMiMo && (
                      <label className="field">
                        <span>MiMo 账户类型与服务区域</span>
                        <select
                          aria-label="MiMo 账户类型与服务区域"
                          value={settings.baseUrl || provider.url}
                          disabled={app.busy.models || app.busy.test || saving}
                          onChange={(event) => {
                            app.clearModels();
                            setManualModel(false);
                            setShowKey(false);
                            setSettings((current) => ({
                              ...current,
                              baseUrl: event.target.value,
                              apiKey: '',
                              model: provider.defaultModel,
                            }));
                          }}
                        >
                          {MIMO_ENDPOINTS.map((endpoint) => (
                            <option key={endpoint.url} value={endpoint.url}>
                              {endpoint.label}
                            </option>
                          ))}
                        </select>
                        <small>请与小米控制台的账户类型和区域保持一致；切换会清空当前密钥。</small>
                      </label>
                    )}
                    <label className="field">
                      <span>
                        API 密钥 <span className="required">*</span>
                        {providerConsole && (
                          <a href={providerConsole} target="_blank" rel="noreferrer">
                            获取密钥
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </span>
                      <div className="key-input">
                        <KeyRound size={16} />
                        <input
                          type={showKey ? 'text' : 'password'}
                          autoComplete="off"
                          spellCheck={false}
                          value={settings.apiKey}
                          placeholder={
                            isMiMo ? mimoEndpoint.keyPlaceholder : provider.keyPlaceholder
                          }
                          onChange={(event) =>
                            setSettings({ ...settings, apiKey: event.target.value })
                          }
                          aria-label="API 密钥"
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={showKey ? '隐藏 API 密钥' : '显示 API 密钥'}
                          aria-pressed={showKey}
                          onClick={() => setShowKey(!showKey)}
                        >
                          {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                      {isMiMo && (
                        <small>
                          Token Plan 一般限编程场景；本应用仅在获小米授权时使用，普通账户请选择按量
                          API。
                        </small>
                      )}
                    </label>
                    <div className="field">
                      <span>
                        接口地址 <span className="legend-note">Base URL</span>
                      </span>
                      <div className="provider-endpoint" aria-label="服务商接口地址">
                        <ShieldCheck size={15} />
                        <code>{settings.baseUrl || provider.url || '正在核验官方接口'}</code>
                      </div>
                      <small>
                        {isTokenPlan
                          ? '使用所选区域的官方 Token Plan 专用接口。密钥须与账户类型一致。'
                          : isMiMo
                            ? '使用小米 MiMo 官方通用 API 接口，地址由服务商固定。'
                            : '使用所选硅基流动站点的官方接口，地址由服务商固定。'}
                      </small>
                    </div>
                    <div className="model-field">
                      <label className="field">
                        <span>
                          对话模型
                          <span className="recommended-label">
                            {isTokenPlan ? 'Token Plan' : isMiMo ? 'MiMo Flash' : '轻快优先'}
                          </span>
                        </span>
                        <select
                          value={manualModel ? '__manual' : settings.model}
                          onChange={(event) => {
                            if (event.target.value === '__manual') setManualModel(true);
                            else {
                              setManualModel(false);
                              setSettings({ ...settings, model: event.target.value });
                            }
                          }}
                        >
                          {modelOptions.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                          <option value="__manual">手动输入模型名称…</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className="button secondary load-models"
                        disabled={app.busy.models || !settings.apiKey.trim()}
                        onClick={() => void app.loadModels(settings)}
                      >
                        {app.busy.models ? (
                          <LoaderCircle size={15} className="spin" />
                        ) : (
                          <RefreshCw size={15} />
                        )}
                        读取模型
                      </button>
                    </div>
                    {manualModel && (
                      <label className="field manual-model-field">
                        <span>模型名称</span>
                        <input
                          value={settings.model}
                          placeholder={
                            provider.defaultModel
                              ? `例如：${provider.defaultModel}`
                              : '填写此服务商支持的模型名称'
                          }
                          onChange={(event) =>
                            setSettings({ ...settings, model: event.target.value })
                          }
                          required
                        />
                        <small>仅支持当前服务商可用的模型；建议先读取模型列表确认。</small>
                      </label>
                    )}
                    <p className="model-cost-note">
                      <Zap size={12} />
                      {isTokenPlan
                        ? '套餐、可用模型和剩余额度请以小米 MiMo 控制台为准。'
                        : isMiMo
                          ? 'MiMo v2.6 Flash 参考价：输入 ¥1 / 输出 ¥2 每百万 token。'
                          : settings.provider === 'siliconflow-international'
                            ? '国际站 Qwen3.5-9B 参考价：输入 $0.10 / 输出 $0.15 每百万 token。'
                            : '国内站模型按实际 token 用量计费，请在控制台查看所选模型价格。'}
                      <a
                        href={
                          isMiMo
                            ? isTokenPlan
                              ? providerConsole
                              : 'https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go'
                            : settings.provider === 'siliconflow-international'
                              ? 'https://www.siliconflow.com/pricing'
                              : providerConsole
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        {isTokenPlan ? '查看套餐' : '价格以官方为准'}
                        <ExternalLink size={11} />
                      </a>
                    </p>
                    <div className="connection-actions">
                      <span>
                        <ShieldCheck size={14} />
                        密钥不会包含在聊天数据导出中
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={app.busy.test || !settings.apiKey.trim()}
                        onClick={() => void app.testConnection(settings)}
                      >
                        {app.busy.test ? (
                          <LoaderCircle size={15} className="spin" />
                        ) : (
                          <Zap size={15} />
                        )}
                        测试连接
                      </button>
                    </div>
                    <p className="connection-cost-note">
                      {isTokenPlan
                        ? '测试会实际调用所选模型，消耗少量套餐额度。'
                        : '测试会实际调用所选模型，消耗少量 token 并产生调用费用。'}
                    </p>
                  </section>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <span className="setting-icon">
                        <MessageCircle size={19} />
                      </span>
                      <div>
                        <h2>聊天偏好</h2>
                        <p>聊天时会将对象设定和必要对话通过本机服务转发给所选模型服务商。</p>
                      </div>
                    </div>
                    <div className="preference-row">
                      <div>
                        <h3>记住对话上下文</h3>
                        <p>携带近期聊天，让回复更连贯；会增加 token 用量。</p>
                      </div>
                      <button
                        type="button"
                        className={`switch ${settings.remember ? 'on' : ''}`}
                        role="switch"
                        aria-checked={settings.remember}
                        aria-label="记住对话上下文"
                        onClick={() => setSettings({ ...settings, remember: !settings.remember })}
                      >
                        <span />
                      </button>
                    </div>
                    <div className="temperature-setting">
                      <div>
                        <label htmlFor="temperature">表达的自由度</label>
                        <span>{settings.temperature.toFixed(1)}</span>
                      </div>
                      <input
                        id="temperature"
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.1"
                        value={settings.temperature}
                        onChange={(event) =>
                          setSettings({ ...settings, temperature: Number(event.target.value) })
                        }
                      />
                      <div className="range-labels">
                        <span>更稳定</span>
                        <span>更有想象力</span>
                      </div>
                    </div>
                  </section>
                  <div className="settings-save-row">
                    <span>更改后保存，下一次聊天生效</span>
                    <button className="button primary" type="submit" disabled={saving}>
                      {saving ? <LoaderCircle size={15} className="spin" /> : <Check size={16} />}
                      保存设置
                    </button>
                  </div>
                </form>
                <section className="settings-card data-card">
                  <div className="settings-card-heading">
                    <span className="setting-icon">
                      <ShieldCheck size={19} />
                    </span>
                    <div>
                      <h2>你的数据</h2>
                      <p>
                        对象设定与聊天记录存储在当前设备；换设备不会自动同步，清除应用数据可能丢失，请定期备份。
                      </p>
                    </div>
                  </div>
                  <div className="data-actions">
                    <button className="button secondary" onClick={app.exportData}>
                      <Download size={15} />
                      导出备份
                    </button>
                    <button className="button secondary" onClick={() => fileInput.current?.click()}>
                      <Upload size={15} />
                      导入备份
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="application/json,.json"
                      className="sr-only"
                      aria-label="导入聊天数据文件"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          setConfirmation({
                            title: '导入这份备份？',
                            description:
                              '导入后会替换当前设备的对象设定和聊天记录，建议先导出当前数据。API 设置不会被替换。',
                            label: '导入并替换',
                            action: () => void app.importData(file),
                          });
                        }
                        event.target.value = '';
                      }}
                    />
                    <button
                      className="text-button danger-text"
                      disabled={app.busy.chat}
                      onClick={() =>
                        setConfirmation({
                          title: '清除所有数据？',
                          description:
                            '所有对象、聊天记录和 API 设置将从此设备删除。此操作无法恢复，请先导出需要的备份。',
                          label: '清除所有数据',
                          action: () => {
                            void app.resetData();
                            setMobileChat(false);
                          },
                        })
                      }
                    >
                      <Trash2 size={14} />
                      清除所有数据
                    </button>
                  </div>
                </section>
              </div>
              <aside className="settings-help">
                <section className="help-card">
                  <span className="help-card-icon">
                    <Sparkles size={23} />
                  </span>
                  <span className="eyebrow">HELLO, REAL CONVERSATIONS</span>
                  <h2>只差一把小钥匙</h2>
                  <p>第一次使用？花一分钟连接 API，开启真正属于你的对话。</p>
                  <ol className="setup-steps">
                    <li>
                      <span>1</span>
                      <div>
                        <strong>
                          {isTokenPlan
                            ? '准备已授权的 Token Plan'
                            : isMiMo
                              ? '创建小米 MiMo 账号'
                              : '创建硅基流动账号'}
                        </strong>
                        <p>
                          {isTokenPlan
                            ? '在小米 MiMo 平台确认授权、套餐和服务区域。'
                            : isMiMo
                              ? '前往小米 MiMo 平台，开通通用 API 服务。'
                              : `前往${provider.name}控制台注册。`}
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <strong>
                          {isTokenPlan ? '复制 Token Plan 专用密钥' : '创建并复制 API 密钥'}
                        </strong>
                        <p>
                          {isTokenPlan
                            ? '个人账户使用 tp- 密钥，团队账户使用 ttp- 密钥。'
                            : isMiMo
                              ? '创建普通 API 密钥（sk-…），确认账户余额。'
                              : '在控制台的「API 密钥」中创建。'}
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>粘贴密钥，测试并保存</strong>
                        <p>选择模型，回到聊天说声你好。</p>
                      </div>
                    </li>
                  </ol>
                  {providerConsole && (
                    <a
                      className="button primary"
                      href={providerConsole}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {isMiMo ? '打开小米 MiMo 平台' : '打开硅基流动控制台'}
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {providerGuide && (
                    <a className="help-guide" href={providerGuide} target="_blank" rel="noreferrer">
                      <BookOpen size={14} />
                      查看官方使用指南
                      <ArrowRight size={13} />
                    </a>
                  )}
                </section>
                <section className="quiet-help-card">
                  <Leaf size={19} />
                  <h3>快一点，也暖一点</h3>
                  <p>
                    {isTokenPlan
                      ? '使用套餐支持的模型，以流式方式逐字显示。长对话只携带近期内容，减少等待和额度消耗。'
                      : '推荐较小的对话模型，以流式方式逐字显示。长对话只携带近期内容，减少等待和费用。'}
                  </p>
                </section>
                <div className="settings-version">
                  <Heart size={12} />
                  知心 AI Lover <span>v0.1.0</span>
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>

      {!(page === 'chats' && mobileChat && companion) && (
        <nav className="mobile-nav" aria-label="手机主导航">
          {NAVIGATION.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => selectPage(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {app.notice && (
        <div
          className={`toast toast-${app.notice.kind}`}
          role={app.notice.kind === 'error' ? 'alert' : 'status'}
        >
          <span>
            {app.notice.kind === 'success' ? (
              <Check size={17} />
            ) : app.notice.kind === 'error' ? (
              <CircleHelp size={17} />
            ) : (
              <Sparkles size={17} />
            )}
          </span>
          <p>{app.notice.message}</p>
          <button className="icon-button" onClick={app.dismissNotice} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
      {editor && (
        <CompanionForm
          initial={editor === 'create' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSave={saveCompanion}
        />
      )}
      {profile && (
        <Dialog title="朋友的名片" onClose={() => setProfile(null)}>
          <div className="profile-dialog-body">
            <Avatar emoji={profile.avatar} color={profile.color} size="hero" />
            <h3>{profile.name}</h3>
            <p>{personalityLabel(profile).join(' · ')}</p>
            <span className="contact-stage">
              <Heart size={12} />
              {stageLabel(profile)}
            </span>
            <dl className="profile-facts">
              <div>
                <dt>你的性别</dt>
                <dd>{GENDERS.find((item) => item.id === profile.userGender)?.label}</dd>
              </div>
              <div>
                <dt>TA 的性别</dt>
                <dd>
                  {GENDERS.find((item) => item.id === profile.gender)?.label}
                  {(profile.gender === 'animal' || profile.userGender === 'animal') &&
                    ` · ${profile.animalType}`}
                </dd>
              </div>
              <div>
                <dt>关系阶段</dt>
                <dd>{stageLabel(profile)}</dd>
              </div>
              <div>
                <dt>认识时间</dt>
                <dd>{new Date(profile.createdAt).toLocaleDateString('zh-CN')}</dd>
              </div>
            </dl>
            <div className="profile-background">
              <span>相处的小约定</span>
              <p>{profile.background || '还没有特别的约定。在相处中，慢慢了解彼此。'}</p>
            </div>
          </div>
          <footer className="dialog-footer profile-footer">
            <button className="text-button danger-text" onClick={() => deleteCompanion(profile)}>
              <Trash2 size={14} />
              删除对象
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setEditor(profile);
                setProfile(null);
              }}
            >
              编辑设定
            </button>
            <button
              className="button primary"
              onClick={() => {
                selectCompanion(profile.id);
                setProfile(null);
              }}
            >
              <MessageCircle size={15} />
              聊一聊
            </button>
          </footer>
        </Dialog>
      )}
      {confirmation && (
        <Dialog
          title={confirmation.title}
          description={confirmation.description}
          onClose={() => setConfirmation(null)}
        >
          <div className="confirmation-body">
            <span className="confirmation-icon">
              <Trash2 size={25} />
            </span>
            <p>请确认后继续。</p>
          </div>
          <footer className="dialog-footer">
            <button className="button secondary" onClick={() => setConfirmation(null)}>
              取消
            </button>
            <button
              className="button danger"
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              {confirmation.label}
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
