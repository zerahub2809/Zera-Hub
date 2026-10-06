import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Copy, Lock, Menu, MessageSquarePlus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { BrandMark } from './BrandMark';
import './ai.css';

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://zera-hub-api.onrender.com' : 'http://localhost:4000');
type Message = { role: 'user' | 'assistant'; content: string; createdAt: string };
type Conversation = { id: string; title: string; updatedAt: string; messages: Message[] };
type Props = { user: { id: string } | null; site?: { logoUrl?: string } | null; initialPrompt?: string; initialContext?: string; isModal?: boolean; onClose?: () => void; onAuth?: (mode: 'developer' | 'hire' | 'signin') => void };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem('zera_token');
  if (!token) {
    const error = new Error('Sign in to use ZERA AI.');
    (error as Error & { code?: string }).code = 'AUTH_REQUIRED';
    throw error;
  }
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}/api/ai${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    (error as Error & { code?: string }).code = data.code;
    if (response.status === 401) {
      localStorage.removeItem('zera_token');
      localStorage.removeItem('zera_user');
      (error as Error & { code?: string }).code = 'AUTH_REQUIRED';
    }
    throw error;
  }
  return data as T;
}

function MarkdownText({ content }: { content: string }) {
  const blocks = content.split(/(```[^\n]*\n[\s\S]*?```)/g).filter(Boolean);
  return <div className="ai-markdown">{blocks.map((block, index) => {
    if (block.startsWith('```')) {
      const firstLine = block.slice(3, block.indexOf('\n')).trim();
      const code = block.slice(block.indexOf('\n') + 1, block.lastIndexOf('```')).replace(/\n$/, '');
      return <CodeBlock key={index} language={firstLine} code={code}/>;
    }
    return block.split('\n').map((line, lineIndex) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={`${index}-${lineIndex}`}/>;
      if (trimmed.startsWith('### ')) return <h4 key={`${index}-${lineIndex}`}>{inlineMarkdown(trimmed.slice(4))}</h4>;
      if (trimmed.startsWith('## ')) return <h3 key={`${index}-${lineIndex}`}>{inlineMarkdown(trimmed.slice(3))}</h3>;
      if (trimmed.startsWith('# ')) return <h2 key={`${index}-${lineIndex}`}>{inlineMarkdown(trimmed.slice(2))}</h2>;
      if (/^[-*]\s/.test(trimmed)) return <p className="ai-list-item" key={`${index}-${lineIndex}`}>• {inlineMarkdown(trimmed.slice(2))}</p>;
      if (/^\d+\.\s/.test(trimmed)) return <p className="ai-list-item" key={`${index}-${lineIndex}`}>{trimmed.match(/^\d+\./)?.[0]} {inlineMarkdown(trimmed.replace(/^\d+\.\s/, ''))}</p>;
      return <p key={`${index}-${lineIndex}`}>{inlineMarkdown(trimmed)}</p>;
    });
  })}</div>;
}

function inlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => part.startsWith('`') && part.endsWith('`')
    ? <code key={index}>{part.slice(1, -1)}</code>
    : part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part);
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }
    catch { window.prompt('Copy this code', code); }
  };
  return <pre className="ai-code-block"><div><span>{language || 'code'}</span><button onClick={copy} aria-label="Copy code">{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy'}</button></div><code>{code}</code></pre>;
}

export function ZeraAIWorkspace({ user, site = null, initialPrompt = '', initialContext = '', isModal = false, onClose, onAuth }: Props) {
  const [currentUser, setCurrentUser] = useState<Props['user']>(user);
  const signedIn = Boolean((currentUser || user) && localStorage.getItem('zera_token'));
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<Omit<Conversation, 'messages'>[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [message, setMessage] = useState(initialPrompt);
  const [context, setContext] = useState(initialContext);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatScreenRef = useRef<HTMLElement>(null);
  const chatModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    const mobileViewport = window.matchMedia('(max-width: 760px)');
    const updateChatViewport = () => {
      const targets = [chatScreenRef.current, chatModalRef.current];
      if (!mobileViewport.matches) {
        targets.forEach((target) => {
          target?.style.removeProperty('--ai-visible-viewport-height');
          target?.style.removeProperty('--ai-visible-viewport-top');
        });
        return;
      }

      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      targets.forEach((target) => {
        target?.style.setProperty('--ai-visible-viewport-height', `${height}px`);
        target?.style.setProperty('--ai-visible-viewport-top', `${top}px`);
      });
    };
    const viewport = window.visualViewport;
    updateChatViewport();
    window.addEventListener('resize', updateChatViewport);
    viewport?.addEventListener('resize', updateChatViewport);
    viewport?.addEventListener('scroll', updateChatViewport);
    mobileViewport.addEventListener('change', updateChatViewport);
    return () => {
      window.removeEventListener('resize', updateChatViewport);
      viewport?.removeEventListener('resize', updateChatViewport);
      viewport?.removeEventListener('scroll', updateChatViewport);
      mobileViewport.removeEventListener('change', updateChatViewport);
      [chatScreenRef.current, chatModalRef.current].forEach((target) => {
        target?.style.removeProperty('--ai-visible-viewport-height');
        target?.style.removeProperty('--ai-visible-viewport-top');
      });
    };
  }, []);

  useEffect(() => {
    const handleAuthChange = () => {
      const stored = localStorage.getItem('zera_user');
      if (stored) {
        try {
          setCurrentUser(JSON.parse(stored));
        } catch {
          // ignore
        }
      }
      setError('');
    };
    window.addEventListener('zera-authenticated', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);
    return () => {
      window.removeEventListener('zera-authenticated', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  useEffect(() => {
    if (isModal) return;
    document.title = 'ZERA AI · ZERA HUB';
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = 'A general-purpose assistant for learning, problem-solving, and software development inside ZERA HUB.';
  }, [isModal]);

  useEffect(() => { setMessage(initialPrompt); setContext(initialContext); }, [initialPrompt, initialContext]);

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/ai/status`).then((response) => response.json()).then((result) => {
      if (active) setConfigured(Boolean(result.configured));
    }).catch(() => { if (active) setConfigured(false); });

    if (signedIn) {
      setLoadingHistory(true);
      request<Omit<Conversation, 'messages'>[]>('/conversations')
        .then((rows) => { if (active) setConversations(rows); })
        .catch((reason: Error & { code?: string }) => {
          if (!active) return;
          if (reason.code === 'AUTH_REQUIRED') {
            setError('Your sign-in session has expired. Sign in again to use ZERA AI.');
            onAuth?.('signin');
          } else setError(reason.message);
        })
        .finally(() => { if (active) setLoadingHistory(false); });
    } else {
      setLoadingHistory(false);
      setConversations([]);
    }
    return () => { active = false; };
  }, [user, currentUser, signedIn]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conversation?.messages, sending]);

  const startNew = async () => {
    if (!signedIn) { onAuth?.('signin'); return; }
    setError('');
    try {
      const created = await request<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ title: 'New conversation' }) });
      setConversations((current) => [created, ...current]);
      setConversation(created);
      setHistoryOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start a conversation.'); }
  };
  const openConversation = async (id: string) => {
    setError('');
    try {
      const selected = await request<Conversation>(`/conversations/${encodeURIComponent(id)}`);
      setConversation(selected);
      setHistoryOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open the conversation.'); }
  };
  const clearConversation = async () => {
    if (!conversation || !window.confirm('Delete this conversation and its history?')) return;
    try {
      await request(`/conversations/${encodeURIComponent(conversation.id)}`, { method: 'DELETE' });
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      setConversation(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete conversation.'); }
  };
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!message.trim() || sending) return;
    if (!signedIn) { setError('Sign in to use ZERA AI.'); onAuth?.('signin'); return; }
    if (!configured) { setError('Live AI is not connected yet. Your message has not been sent.'); return; }
    setSending(true); setError('');
    let active = conversation;
    try {
      if (!active) {
        active = await request<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ title: 'New conversation' }) });
        setConversation(active);
        setConversations((current) => [active!, ...current]);
      }
      const prompt = context ? `${message.trim()}\n\nPublic community context:\n${context}` : message.trim();
      const reply = await request<{ conversation: Conversation; reply: string }>('/chat', {
        method: 'POST', body: JSON.stringify({ message: prompt, conversationId: active.id }),
      });
      setConversation(reply.conversation);
      setConversations((current) => current.map((item) => item.id === active!.id ? { ...item, title: reply.conversation.title, updatedAt: reply.conversation.updatedAt } : item));
      setMessage(''); setContext('');
    } catch (reason) {
      const failure = reason as Error & { code?: string };
      if (failure.code === 'AUTH_REQUIRED') {
        setError('Your sign-in session has expired. Sign in again to continue.');
        onAuth?.('signin');
      } else setError(failure.message || 'ZERA AI could not respond.');
    } finally { setSending(false); }
  };
  const messageWithContext = context ? `${message}\n\nPublic community context:\n${context}` : message;
  const body = <div className={`ai-workspace ${isModal ? 'ai-workspace-modal' : ''}`}>
    <aside className={`ai-history ${historyOpen ? 'open' : ''}`}>
      <div className="ai-history-head"><Link to="/"><BrandMark site={site}/><span><b>ZERA AI</b><small>General assistant · developer mentor</small></span></Link><button className="ai-mobile-close" onClick={() => setHistoryOpen(false)} aria-label="Close history"><X size={17}/></button></div>
      <button className="ai-new-chat" onClick={startNew}><MessageSquarePlus size={15}/> New conversation</button>
      <div className="ai-history-label">RECENT HISTORY</div>
      {!signedIn ? <div className="ai-history-empty"><p>Sign in to keep conversation history private to your account.</p>{onAuth && <button className="ai-history-signin" onClick={() => onAuth('signin')}>Sign in</button>}</div> : loadingHistory ? <p className="ai-history-empty">Loading history…</p> : !conversations.length ? <p className="ai-history-empty">Your conversations will appear here.</p> : <div className="ai-history-list">{conversations.map((item) => <button className={conversation?.id === item.id ? 'selected' : ''} key={item.id} onClick={() => openConversation(item.id)}>{item.title}</button>)}</div>}
      {!isModal && <Link className="ai-back-link" to="/app">Back to workspace <ArrowUpRight size={13}/></Link>}
    </aside>
    <section className="ai-chat-area">
      <header className="ai-chat-header"><button className="ai-history-toggle" onClick={() => setHistoryOpen(!historyOpen)} aria-label="Toggle conversation history"><Menu size={18}/></button><div><b>{conversation?.title || 'A thoughtful place to work through ideas'}</b><span>{configured === null ? 'Checking AI connection…' : configured ? 'AI provider connected' : 'Live AI not connected'}</span></div>{conversation && <button className="ai-clear" onClick={clearConversation} aria-label="Delete conversation"><Trash2 size={15}/></button>}</header>
      {!signedIn && <div className="ai-availability" role="status"><Lock size={17}/><div><b>Sign in required</b><p>ZERA AI uses your existing ZERA HUB account to protect conversation history. Sign in to continue.</p>{onAuth && <button className="ai-history-signin" onClick={() => onAuth('signin')}>Sign in</button>}</div></div>}
      {!configured && configured !== null && <div className="ai-availability" role="status"><Sparkles size={17}/><div><b>Live AI is not connected yet</b><p>ZERA HUB is ready for an AI provider. A server-side <code>AI_API_KEY</code> or <code>OPENAI_API_KEY</code> and optional provider settings are needed to enable responses. No message will be sent until configured.</p></div></div>}
      {error && <div className="ai-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={14}/></button></div>}
      <div className="ai-messages">
        {!conversation?.messages.length ? <div className="ai-welcome"><span><Sparkles size={22}/></span><h2>How can I help you today?</h2><p>Ask general questions, learn a concept, explore an idea, or get help with code, debugging, architecture, testing, and deployment.</p><div>{['Explain a concept clearly', 'Help me reason through a problem', 'Review a code snippet'].map((example) => <button key={example} onClick={() => setMessage(example)}>{example}<ArrowUpRight size={13}/></button>)}</div>{!signedIn && onAuth && <button className="ai-signin-button" onClick={() => onAuth('signin')}>Sign in to continue</button>}</div>
          : conversation.messages.map((item, index) => <article className={`ai-message ${item.role === 'user' ? 'user' : 'assistant'}`} key={`${item.createdAt}-${index}`}><div className="ai-message-avatar">{item.role === 'user' ? 'You' : <Sparkles size={14}/>}</div><div className="ai-message-content"><span>{item.role === 'user' ? 'You' : 'ZERA AI'}</span><MarkdownText content={item.content}/></div></article>)}
        {sending && <div className="ai-message assistant"><div className="ai-message-avatar"><Sparkles size={14}/></div><div className="ai-message-content"><span>ZERA AI</span><p className="ai-typing">Thinking<span/><span/><span/></p></div></div>}
        <div ref={bottomRef}/>
      </div>
      <form className="ai-composer" onSubmit={send}>
        {context && <div className="ai-context-note">Using public community content for this question <button type="button" onClick={() => setContext('')} aria-label="Remove shared context"><X size={13}/></button></div>}
        <textarea aria-label="Message ZERA AI" value={messageWithContext} onChange={(event) => setMessage(context ? event.target.value.replace(/\n\nPublic community context:[\s\S]*$/, '') : event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={3} placeholder={!signedIn ? 'Sign in to use ZERA AI.' : configured ? 'Ask anything. Shift + Enter for a new line.' : 'AI responses will be available when a provider is connected.'} disabled={!signedIn || !configured || configured === null}/>
        <div><small>Do not include passwords, API keys, or other secrets.</small><button className="btn btn-primary" type="submit" disabled={!signedIn || !configured || configured === null || sending || !message.trim()}>{sending ? 'Thinking…' : 'Send'} <Send size={14}/></button></div>
      </form>
    </section>
  </div>;
  return isModal ? <div ref={chatModalRef} className="ai-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><div className="ai-modal-shell"><button className="ai-modal-close" onClick={onClose} aria-label="Close ZERA AI"><X size={18}/></button>{body}</div></div> : <main ref={chatScreenRef} className="page ai-page ai-page-fullscreen"><div className="container page-inner"><div className="ai-page-heading"><span className="page-kicker">ZERA AI · intelligent assistant</span><h1>Think through what’s next.</h1><p className="page-caption">A general-purpose assistant for questions, learning, creative problem-solving, and software development. Live responses are clearly marked when unavailable.</p></div>{body}</div></main>;
}
