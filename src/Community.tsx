import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bookmark, Check, Code2, Copy, Flag, Heart, ImagePlus, MessageCircle, Send, Sparkles, Trash2 } from 'lucide-react';
import './community.css';

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://zera-hub-api.onrender.com' : 'http://localhost:4000');
type User = { id: string; name: string; username: string; avatar?: string } | null;
type Comment = { id: string; userId: string; content: string; createdAt: string; updatedAt?: string; author: NonNullable<User>; replies: Array<Comment> };
type Post = {
  id: string; author: NonNullable<User>; content: string; code: string; imageUrl: string; linkUrl: string; tags: string[];
  category: string; createdAt: string; updatedAt: string; reactionCount: number; reacted: boolean; bookmarked: boolean; comments: Comment[];
};
type Topic = { name: string; posts: number };
const categories = ['Discussion', 'Question', 'Code', 'Project', 'Learning'];

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem('zera_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}/api/community${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

async function submitReport(targetType: string, targetId: string, reason: string) {
  const token = localStorage.getItem('zera_token');
  const response = await fetch(`${API}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ targetType, targetId, reason }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not submit this report.');
}

function Avatar({ user }: { user: NonNullable<User> }) {
  return <div className="community-avatar">{user.avatar ? <img loading="lazy" src={user.avatar.startsWith('http') ? user.avatar : `${API}${user.avatar}`} alt="" /> : user.name.slice(0, 1).toUpperCase()}</div>;
}

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function CommunityHub({ user, onAuth }: { user: User; onAuth: (mode: 'developer' | 'hire' | 'signin') => void }) {
  useEffect(() => {
    document.title = 'Developer Community · ZERA HUB';
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = 'Share developer questions, code, projects, and ideas with the global ZERA HUB community.';
  }, []);
  const [searchParams] = useSearchParams();
  const postRefs = useRef<Record<string, HTMLElement | null>>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sort, setSort] = useState<'latest' | 'trending'>('latest');
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [content, setContent] = useState('');
  const [code, setCode] = useState('');
  const [tags, setTags] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [postCategory, setPostCategory] = useState('Discussion');
  const [image, setImage] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [draftError, setDraftError] = useState('');

  const loadFeed = () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ sort });
    if (search.trim()) params.set('search', search.trim());
    if (topic) params.set('topic', topic);
    if (category) params.set('category', category);
    const feedRequest = savedOnly ? request<Post[]>('/bookmarks') : request<Post[]>(`/posts?${params}`);
    feedRequest
      .then(setPosts)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadFeed(); }, [sort, search, topic, category, savedOnly]);
  useEffect(() => { request<Topic[]>('/topics').then(setTopics).catch(() => {}); }, [posts.length]);
  useEffect(() => {
    const postId = searchParams.get('post');
    if (!postId || loading) return;
    const post = postRefs.current[postId];
    if (post) post.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else if (posts.length && !savedOnly) {
      request<Post>(`/posts/${encodeURIComponent(postId)}`).then((shared) => {
        setPosts((current) => current.some((item) => item.id === shared.id) ? current : [shared, ...current]);
      }).catch((reason: Error) => setError(reason.message));
    }
  }, [loading, posts, searchParams]);

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) { onAuth('signin'); return; }
    setPosting(true); setDraftError('');
    try {
      const post = await request<Post>('/posts', {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim() || (image ? 'Shared an image.' : ''),
          code, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), linkUrl, category: postCategory,
        }),
      });
        if (image) {
          try {
            const form = new FormData();
            form.append('image', image);
            await request<Post>(`/posts/${encodeURIComponent(post.id)}/image`, { method: 'POST', body: form });
          } catch (reason) {
            setDraftError(`Post published, but image upload failed: ${reason instanceof Error ? reason.message : 'Unknown error'}`);
            setContent(''); setCode(''); setTags(''); setLinkUrl(''); setImage(null);
            loadFeed();
            return;
          }
        }
      setContent(''); setCode(''); setTags(''); setLinkUrl(''); setImage(null); setPostCategory('Discussion');
      loadFeed();
    } catch (reason) { setDraftError(reason instanceof Error ? reason.message : 'Could not publish this post.'); }
    finally { setPosting(false); }
  };

  const updatePost = (postId: string, patch: Partial<Post>) => setPosts((current) => current.map((post) => post.id === postId ? { ...post, ...patch } : post));
  const toggleReaction = async (post: Post) => {
    if (!user) { onAuth('signin'); return; }
    try {
      const result = await request<{ reacted: boolean; reactionCount: number }>(`/posts/${post.id}/reaction`, { method: 'PUT' });
      updatePost(post.id, { reacted: result.reacted, reactionCount: result.reactionCount });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update reaction.'); }
  };
  const toggleBookmark = async (post: Post) => {
    if (!user) { onAuth('signin'); return; }
    try {
      const result = await request<{ bookmarked: boolean }>(`/posts/${post.id}/bookmark`, { method: 'PUT' });
      updatePost(post.id, { bookmarked: result.bookmarked });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this post.'); }
  };
  const deletePost = async (post: Post) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await request(`/posts/${post.id}`, { method: 'DELETE' });
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this post.'); }
  };
  const assist = (post: Post) => {
    const prompt = post.category === 'Question' ? 'Help me understand and answer this developer question.'
      : post.code ? 'Explain this code and suggest improvements.'
        : 'Summarize the key ideas in this public developer discussion.';
    window.dispatchEvent(new CustomEvent('open-zera-ai', { detail: { prompt, context: `${post.content}\n\n${post.code}`.trim() } }));
  };
  const share = async (post: Post) => {
    const url = `${window.location.origin}/community?post=${encodeURIComponent(post.id)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this community post link', url);
    }
  };
  const reportPost = async (post: Post) => {
    if (!user) { onAuth('signin'); return; }
    const reason = window.prompt('Why are you reporting this post?');
    if (!reason?.trim()) return;
    try {
      await submitReport('post', post.id, reason);
      setNotice('Report submitted for review.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit this report.'); }
  };

  return <main className="page community-page"><div className="container page-inner">
    <div className="community-heading"><span className="page-kicker">Community · developers helping developers</span><h1>Share what you’re building.</h1><p className="page-caption">Ask technical questions, share solutions, discuss tools, and learn from people building across the world.</p></div>
    <div className="community-layout">
      <section className="community-main">
        <form className="community-composer" onSubmit={publish}>
          <div className="community-composer-top">{user ? <Avatar user={user}/> : <div className="community-avatar">Z</div>}<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={user ? 'What are you building, learning, or debugging?' : 'Sign in to share with the community.'} disabled={!user} rows={3}/></div>
          <div className="community-composer-tools">
            <label className="community-field">Post type<select value={postCategory} onChange={(event) => setPostCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="community-field">Topics<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="React, APIs, testing"/></label>
            <label className="community-field">Link<input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…"/></label>
          </div>
          <details className="community-code-entry"><summary><Code2 size={14}/> Add code snippet</summary><textarea value={code} onChange={(event) => setCode(event.target.value)} rows={6} maxLength={12000} placeholder="Paste a focused code example. Do not include secrets."/></details>
          <div className="community-composer-footer">
            <label className="community-image-pick"><ImagePlus size={15}/> {image ? image.name : 'Add image'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(event) => setImage(event.target.files?.[0] || null)}/></label>
            {draftError && <span className="community-error" role="alert">{draftError}</span>}
            <button className="btn btn-primary" type="submit" disabled={posting || (!!user && !content.trim() && !code.trim() && !image)}>{posting ? 'Publishing…' : user ? 'Publish' : 'Sign in to post'} <Send size={14}/></button>
          </div>
        </form>
        <div className="community-feed-tools">
          <div className="community-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search discussions, tags, or code"/></div>
          <select value={sort} onChange={(event) => setSort(event.target.value as 'latest' | 'trending')} aria-label="Sort community posts"><option value="latest">Latest</option><option value="trending">Trending</option></select>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by post type"><option value="">All topics</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
          {user && <button className={`community-saved-filter ${savedOnly ? 'active' : ''}`} onClick={() => setSavedOnly(!savedOnly)}>{savedOnly ? 'All discussions' : 'Saved posts'}</button>}
        </div>
        {error && <div className="community-state community-state-error" role="alert">{error}<button className="btn btn-ghost" onClick={loadFeed}>Retry</button></div>}
        {notice && <p className="community-state" role="status">{notice}</p>}
        {loading && <div className="community-state" role="status">Loading community discussions…</div>}
        {!loading && !error && !posts.length && <div className="community-state"><Sparkles/><h2>Your developer feed starts here.</h2><p>Start a discussion or adjust your search filters.</p></div>}
        <div className="community-feed">{posts.map((post) => <CommunityPost key={post.id} post={post} postRef={(element) => { postRefs.current[post.id] = element; }} currentUser={user} onReact={() => toggleReaction(post)} onBookmark={() => toggleBookmark(post)} onDelete={() => deletePost(post)} onAssist={() => assist(post)} onShare={() => share(post)} onReport={() => reportPost(post)} onUpdate={(patch) => updatePost(post.id, patch)} onAuth={onAuth}/>)}</div>
      </section>
      <aside className="community-aside">
        <section className="community-side-card"><h2>Technology topics</h2>{topics.length ? topics.map((item) => <button key={item.name} className={topic === item.name ? 'active' : ''} onClick={() => setTopic(topic === item.name ? '' : item.name)}><span>#{item.name}</span><small>{item.posts}</small></button>) : <p>Topics will appear as developers share posts.</p>}</section>
        <section className="community-side-card"><h2>Built for useful conversations</h2><p>Ask questions, share a solution, post a project update, or explain a tool that helped you build.</p><Link to="/developers">Find developers <Sparkles size={14}/></Link></section>
      </aside>
    </div>
  </div></main>;
}

function CommunityPost({ post, postRef, currentUser, onReact, onBookmark, onDelete, onAssist, onShare, onReport, onUpdate, onAuth }: {
  post: Post; postRef: (element: HTMLElement | null) => void; currentUser: User; onReact: () => void; onBookmark: () => void; onDelete: () => void; onAssist: () => void; onShare: () => void; onReport: () => void;
  onUpdate: (patch: Partial<Post>) => void; onAuth: (mode: 'developer' | 'hire' | 'signin') => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState('');
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const sendComment = async (event: FormEvent, parentId?: string) => {
    event.preventDefault();
    if (!currentUser) { onAuth('signin'); return; }
    const content = parentId ? reply.trim() : comment.trim();
    if (!content) return;
    setError('');
    try {
      const created = await request<Comment>(parentId
        ? `/posts/${post.id}/comments/${parentId}/replies`
        : `/posts/${post.id}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
      const updatedComments = parentId
        ? post.comments.map((item) => item.id === parentId ? { ...item, replies: [...item.replies, created] } : item)
        : [...post.comments, { ...created, replies: [] }];
      onUpdate({ comments: updatedComments });
      setComment(''); setReply(''); setReplyTo(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send comment.'); }
  };
  const deleteComment = async (commentId: string) => {
    try {
      await request(`/posts/${post.id}/comments/${commentId}`, { method: 'DELETE' });
      onUpdate({ comments: post.comments.filter((item) => item.id !== commentId) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete comment.'); }
  };
  const saveComment = async (commentId: string) => {
    try {
      const updated = await request<Comment>(`/posts/${post.id}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ content: editingComment }) });
      onUpdate({ comments: post.comments.map((item) => item.id === commentId ? { ...item, content: updated.content, updatedAt: updated.updatedAt } : item) });
      setEditingCommentId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not edit comment.'); }
  };
  const deleteReply = async (commentId: string, replyId: string) => {
    try {
      await request(`/posts/${post.id}/comments/${commentId}/replies/${replyId}`, { method: 'DELETE' });
      onUpdate({ comments: post.comments.map((item) => item.id === commentId ? { ...item, replies: item.replies.filter((child) => child.id !== replyId) } : item) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete reply.'); }
  };
  const saveReply = async (commentId: string, replyId: string) => {
    try {
      const updated = await request<Comment>(`/posts/${post.id}/comments/${commentId}/replies/${replyId}`, { method: 'PATCH', body: JSON.stringify({ content: editingReply }) });
      onUpdate({ comments: post.comments.map((item) => item.id === commentId ? { ...item, replies: item.replies.map((child) => child.id === replyId ? { ...child, content: updated.content, updatedAt: updated.updatedAt } : child) } : item) });
      setEditingReplyId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not edit reply.'); }
  };
  const saveEdit = async () => {
    try {
      const updated = await request<Post>(`/posts/${post.id}`, { method: 'PATCH', body: JSON.stringify({ content: editText }) });
      onUpdate({ content: updated.content }); setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not edit post.'); }
  };
  const reportComment = async (commentId: string) => {
    if (!currentUser) { onAuth('signin'); return; }
    const reason = window.prompt('Why are you reporting this comment or reply?');
    if (!reason?.trim()) return;
    try {
      await submitReport('comment', commentId, reason);
      setFeedback('Report submitted for review.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit this report.'); }
  };
  const postUrl = post.imageUrl.startsWith('http') ? post.imageUrl : `${API}${post.imageUrl}`;

  return <article className="community-post" ref={postRef}>
    <header className="community-post-header"><Link className="community-author" to={`/developers/${encodeURIComponent(post.author.id)}`}><Avatar user={post.author}/><span><b>{post.author.name}</b><small>@{post.author.username} · {timeAgo(post.createdAt)}</small></span></Link><span className="community-category">{post.category}</span></header>
    {editing ? <div className="community-edit"><textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={4}/><button className="btn btn-primary" onClick={saveEdit}>Save changes <Check size={14}/></button><button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button></div> : post.content && <p className="community-post-content">{post.content}</p>}
    {post.code && <pre className="community-code"><code>{post.code}</code><button aria-label="Copy code" title="Copy code" onClick={() => navigator.clipboard.writeText(post.code)}><Copy size={14}/></button></pre>}
    {post.imageUrl && <img loading="lazy" className="community-post-image" src={postUrl} alt="Community post attachment"/>}
    {post.linkUrl && <a className="community-post-link" href={post.linkUrl} target="_blank" rel="noreferrer">{post.linkUrl}</a>}
    {!!post.tags.length && <div className="community-tags">{post.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
    {error && <p className="community-error" role="alert">{error}</p>}
    {feedback && <p className="community-state" role="status">{feedback}</p>}
    <div className="community-post-actions">
      <button className={post.reacted ? 'active' : ''} onClick={onReact}><Heart size={15}/>{post.reactionCount}</button>
      <button onClick={() => setCommentsOpen(!commentsOpen)}><MessageCircle size={15}/>{post.comments.length}</button>
      <button className={post.bookmarked ? 'active' : ''} onClick={onBookmark}><Bookmark size={15}/>{post.bookmarked ? 'Saved' : 'Save'}</button>
      <button onClick={onShare}><Copy size={14}/>Share</button>
      <button onClick={onAssist}><Sparkles size={14}/>Ask ZERA AI</button>
      {currentUser?.id !== post.author.id && <button onClick={onReport}><Flag size={14}/>Report</button>}
      {currentUser?.id === post.author.id && <><button onClick={() => { setEditText(post.content); setEditing(true); }}>Edit</button><button onClick={onDelete} aria-label="Delete post"><Trash2 size={14}/></button></>}
    </div>
    {commentsOpen && <section className="community-comments">
      {post.comments.map((item) => <div className="community-comment" key={item.id}>
        <Avatar user={item.author}/><div className="community-comment-body"><div><b>{item.author.name}</b><small>@{item.author.username} · {timeAgo(item.createdAt)}</small></div>{editingCommentId === item.id ? <div className="community-edit"><textarea value={editingComment} onChange={(event) => setEditingComment(event.target.value)} rows={3}/><button className="btn btn-primary" onClick={() => saveComment(item.id)}>Save</button><button className="btn btn-ghost" onClick={() => setEditingCommentId(null)}>Cancel</button></div> : <p>{item.content}</p>}
          <div className="community-comment-actions"><button onClick={() => setReplyTo(replyTo === item.id ? null : item.id)}>Reply</button>{currentUser?.id !== item.userId && <button onClick={() => reportComment(item.id)}>Report</button>}{currentUser?.id === item.userId && <><button onClick={() => { setEditingCommentId(item.id); setEditingComment(item.content); }}>Edit</button><button onClick={() => deleteComment(item.id)}>Delete</button></>}</div>
          {item.replies.map((child) => <div className="community-reply" key={child.id}><b>{child.author.name}</b><small>@{child.author.username}</small>{editingReplyId === child.id ? <div className="community-edit"><textarea value={editingReply} onChange={(event) => setEditingReply(event.target.value)} rows={2}/><button className="btn btn-primary" onClick={() => saveReply(item.id, child.id)}>Save</button><button className="btn btn-ghost" onClick={() => setEditingReplyId(null)}>Cancel</button></div> : <p>{child.content}</p>}{currentUser?.id !== child.userId && <div className="community-comment-actions"><button onClick={() => reportComment(child.id)}>Report</button></div>}{currentUser?.id === child.userId && <div className="community-comment-actions"><button onClick={() => { setEditingReplyId(child.id); setEditingReply(child.content); }}>Edit</button><button onClick={() => deleteReply(item.id, child.id)}>Delete</button></div>}</div>)}
          {replyTo === item.id && <form className="community-comment-form" onSubmit={(event) => sendComment(event, item.id)}><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a helpful reply…"/><button className="btn btn-primary" type="submit" aria-label="Send reply"><Send size={14}/></button></form>}
        </div>
      </div>)}
      <form className="community-comment-form" onSubmit={(event) => sendComment(event)}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={currentUser ? 'Add a thoughtful comment…' : 'Sign in to comment'} onFocus={() => { if (!currentUser) onAuth('signin'); }}/><button className="btn btn-primary" type="submit" aria-label="Send comment" disabled={!currentUser}><Send size={14}/></button></form>
    </section>}
  </article>;
}
