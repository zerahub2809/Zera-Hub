import express from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function initialize(db) {
  db.posts ||= [];
}

function recordTrustSignal(db, userId, contentType, risk) {
  db.moderationActions ||= [];
  const createdAt = new Date().toISOString();
  db.moderationActions.push({
    id: randomUUID(),
    type: risk.level === 'medium' ? `${contentType}_review_required` : `${contentType}_blocked`,
    userId,
    reason: risk.flags,
    riskLevel: risk.level,
    createdAt,
  });
  if (db.moderationActions.length > 1000) db.moderationActions.shift();
  const recentSignals = db.moderationActions.filter((action) =>
    action.userId === userId && /_(review_required|blocked)$/.test(action.type) &&
    Date.now() - Date.parse(action.createdAt) < 24 * 60 * 60 * 1000);
  const user = db.users.find((entry) => entry.id === userId);
  if (recentSignals.length >= 3 && user?.status === 'active') {
    user.status = 'restricted';
    user.restrictedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    user.moderationReason = 'Repeated high-risk or review-required community content';
    user.moderatedAt = createdAt;
    db.moderationActions.push({
      id: randomUUID(),
      type: 'user_temporarily_restricted',
      userId,
      reason: user.moderationReason,
      adminEmail: 'Automated trust safeguard',
      createdAt,
    });
  }
}

function cleanText(value, max = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanTags(value) {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) return null;
  return [...new Set(value.map((tag) => tag.trim().replace(/^#/, '').slice(0, 40)).filter(Boolean))].slice(0, 10);
}

function publicAuthor(db, userId, publicUser) {
  const user = db.users.find((entry) => entry.id === userId && entry.status === 'active');
  if (!user) return { id: userId, name: 'ZERA member', username: 'member', avatar: '' };
  const safe = publicUser(user);
  return { id: safe.id, name: safe.name, username: safe.username, avatar: safe.avatar };
}

function presentPost(db, post, viewerId, publicUser) {
  const comments = (post.comments || []).map((comment) => ({
    ...comment,
    author: publicAuthor(db, comment.userId, publicUser),
    replies: (comment.replies || []).map((reply) => ({ ...reply, author: publicAuthor(db, reply.userId, publicUser) })),
  })).filter((comment) => comment.moderationStatus !== 'hidden' && comment.moderationStatus !== 'review_required');
  for (const comment of comments) {
    comment.replies = (comment.replies || []).filter((reply) => reply.moderationStatus !== 'hidden' && reply.moderationStatus !== 'review_required');
  }
  return {
    id: post.id,
    author: publicAuthor(db, post.userId, publicUser),
    content: post.content,
    code: post.code || '',
    imageUrl: post.imageUrl || '',
    linkUrl: post.linkUrl || '',
    tags: post.tags || [],
    category: post.category || 'Discussion',
    createdAt: post.createdAt,
    updatedAt: post.updatedAt || post.createdAt,
    reactionCount: (post.reactions || []).length,
    reacted: (post.reactions || []).some((reaction) => reaction.userId === viewerId),
    bookmarked: (post.bookmarks || []).some((bookmark) => bookmark.userId === viewerId),
    comments,
  };
}

function validateUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createCommunityRouter({ auth, load, save, publicUser, upload, riskText }) {
  const router = express.Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const optionalAuth = (req, res, next) => req.headers.authorization ? auth(req, res, next) : next();

  router.get('/topics', (req, res) => {
    const db = load();
    initialize(db);
    const totals = new Map();
    for (const post of db.posts) {
      if (post.moderationStatus === 'hidden' || post.moderationStatus === 'review_required') continue;
      for (const tag of post.tags || []) totals.set(tag, (totals.get(tag) || 0) + 1);
    }
    res.json([...totals].map(([name, posts]) => ({ name, posts })).sort((a, b) => b.posts - a.posts).slice(0, 20));
  });

  router.get('/posts', optionalAuth, (req, res) => {
    const db = load();
    initialize(db);
    const search = cleanText(req.query.search, 120).toLowerCase();
    const topic = cleanText(req.query.topic, 40).replace(/^#/, '').toLowerCase();
    const category = cleanText(req.query.category, 40).toLowerCase();
    const sort = req.query.sort === 'trending' ? 'trending' : 'latest';
    let posts = db.posts.filter((post) => {
      if (post.moderationStatus === 'hidden' || post.moderationStatus === 'review_required') return false;
      const matchesText = `${post.content} ${post.code || ''} ${(post.tags || []).join(' ')}`.toLowerCase().includes(search);
      return matchesText && (!topic || (post.tags || []).some((tag) => tag.toLowerCase() === topic)) &&
        (!category || (post.category || 'Discussion').toLowerCase() === category);
    });
    if (sort === 'trending') {
      posts = posts.slice().sort((a, b) =>
        ((b.reactions || []).length * 2 + (b.comments || []).length) - ((a.reactions || []).length * 2 + (a.comments || []).length) ||
        b.createdAt.localeCompare(a.createdAt));
    } else posts = posts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(posts.slice(0, 60).map((post) => presentPost(db, post, req.user?.id, publicUser)));
  });

  router.get('/posts/:postId', optionalAuth, (req, res) => {
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    if (!post || post.moderationStatus === 'hidden' || post.moderationStatus === 'review_required') return res.status(404).json({ error: 'Post not found' });
    res.json(presentPost(db, post, req.user?.id, publicUser));
  });

  router.post('/posts', auth, asyncRoute(async (req, res) => {
    const content = cleanText(req.body?.content);
    const code = cleanText(req.body?.code, 12000);
    const tags = cleanTags(req.body?.tags ?? []);
    const category = cleanText(req.body?.category || 'Discussion', 30);
    const linkUrl = validateUrl(cleanText(req.body?.linkUrl, 1000));
    const imageUrl = validateUrl(cleanText(req.body?.imageUrl, 1000));
    if (!content && !code && !imageUrl) return res.status(400).json({ error: 'Add post text, a code snippet, or an image' });
    if (!tags) return res.status(400).json({ error: 'Tags must be a list of text values' });
    if (linkUrl === null || imageUrl === null) return res.status(400).json({ error: 'Links must use a valid http or https URL' });
    if (!['Discussion', 'Question', 'Code', 'Project', 'Learning'].includes(category)) return res.status(400).json({ error: 'Unsupported community post category' });
    const db = load();
    initialize(db);
    const risk = riskText(`${content}\n${code}`);
    if (risk.level === 'critical' || risk.level === 'high') {
      recordTrustSignal(db, req.user.id, 'post', risk);
      await save(db);
      return res.status(422).json({ error: 'Post blocked by ZERA Trust & Safety', risk });
    }
    const post = {
      id: randomUUID(), userId: req.user.id, content, code, imageUrl, linkUrl, tags, category,
      reactions: [], bookmarks: [], comments: [], createdAt: new Date().toISOString(),
    };
    if (risk.level === 'medium') {
      post.moderationStatus = 'review_required';
      recordTrustSignal(db, req.user.id, 'post', risk);
    }
    db.posts.unshift(post);
    await save(db);
    res.status(201).json(presentPost(db, post, req.user.id, publicUser));
  }));

  router.post('/posts/:postId/image', auth, upload.single('image'), asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Select an image to upload' });
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    if (!post) {
      await fs.promises.unlink(req.file.path);
      return res.status(404).json({ error: 'Post not found' });
    }
    if (post.userId !== req.user.id) {
      await fs.promises.unlink(req.file.path);
      return res.status(403).json({ error: 'Only the post author can add an image' });
    }
    post.imageUrl = `/uploads/${path.basename(req.file.filename)}`;
    post.updatedAt = new Date().toISOString();
    await save(db);
    res.json(presentPost(db, post, req.user.id, publicUser));
  }));

  router.patch('/posts/:postId', auth, asyncRoute(async (req, res) => {
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.userId !== req.user.id) return res.status(403).json({ error: 'Only the post author can edit this post' });
    if (req.body.content !== undefined) {
      if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'Post content must be text' });
      post.content = cleanText(req.body.content);
    }
    if (req.body.code !== undefined) {
      if (typeof req.body.code !== 'string') return res.status(400).json({ error: 'Code must be text' });
      post.code = cleanText(req.body.code, 12000);
    }
    if (req.body.linkUrl !== undefined) {
      const url = validateUrl(cleanText(req.body.linkUrl, 1000));
      if (url === null) return res.status(400).json({ error: 'Link must use a valid http or https URL' });
      post.linkUrl = url;
    }
    if (req.body.tags !== undefined) {
      const tags = cleanTags(req.body.tags);
      if (!tags) return res.status(400).json({ error: 'Tags must be a list of text values' });
      post.tags = tags;
    }
    if (!post.content && !post.code && !post.imageUrl) return res.status(400).json({ error: 'A post must contain text, code, or an image' });
    const risk = riskText(`${post.content}\n${post.code}`);
    if (risk.level === 'critical' || risk.level === 'high') return res.status(422).json({ error: 'Post blocked by ZERA Trust & Safety', risk });
    post.updatedAt = new Date().toISOString();
    await save(db);
    res.json(presentPost(db, post, req.user.id, publicUser));
  }));

  router.delete('/posts/:postId', auth, asyncRoute(async (req, res) => {
    const db = load();
    initialize(db);
    const index = db.posts.findIndex((item) => item.id === req.params.postId);
    if (index < 0) return res.status(404).json({ error: 'Post not found' });
    if (db.posts[index].userId !== req.user.id) return res.status(403).json({ error: 'Only the post author can delete this post' });
    db.posts.splice(index, 1);
    await save(db);
    res.status(204).end();
  }));

  router.put('/posts/:postId/reaction', auth, asyncRoute(async (req, res) => {
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.reactions ||= [];
    const index = post.reactions.findIndex((reaction) => reaction.userId === req.user.id);
    if (index < 0) post.reactions.push({ userId: req.user.id, createdAt: new Date().toISOString() });
    else post.reactions.splice(index, 1);
    await save(db);
    res.json({ reacted: index < 0, reactionCount: post.reactions.length });
  }));

  router.put('/posts/:postId/bookmark', auth, asyncRoute(async (req, res) => {
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.bookmarks ||= [];
    const index = post.bookmarks.findIndex((bookmark) => bookmark.userId === req.user.id);
    if (index < 0) post.bookmarks.push({ userId: req.user.id, createdAt: new Date().toISOString() });
    else post.bookmarks.splice(index, 1);
    await save(db);
    res.json({ bookmarked: index < 0 });
  }));

  router.get('/bookmarks', auth, (req, res) => {
    const db = load();
    initialize(db);
    res.json(db.posts.filter((post) => post.moderationStatus !== 'hidden' && post.moderationStatus !== 'review_required' &&
      (post.bookmarks || []).some((bookmark) => bookmark.userId === req.user.id))
      .map((post) => presentPost(db, post, req.user.id, publicUser)));
  });

  router.post('/posts/:postId/comments', auth, asyncRoute(async (req, res) => {
    const content = cleanText(req.body?.content, 3000);
    if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const risk = riskText(content);
    if (risk.level === 'critical' || risk.level === 'high') {
      recordTrustSignal(db, req.user.id, 'comment', risk);
      await save(db);
      return res.status(422).json({ error: 'Comment blocked by ZERA Trust & Safety', risk });
    }
    post.comments ||= [];
    const comment = { id: randomUUID(), userId: req.user.id, content, replies: [], createdAt: new Date().toISOString() };
    if (risk.level === 'medium') {
      comment.moderationStatus = 'review_required';
      recordTrustSignal(db, req.user.id, 'comment', risk);
    }
    post.comments.push(comment);
    await save(db);
    res.status(201).json({ ...comment, author: publicAuthor(db, req.user.id, publicUser), replies: [] });
  }));

  router.patch('/posts/:postId/comments/:commentId', auth, asyncRoute(async (req, res) => {
    const content = cleanText(req.body?.content, 3000);
    if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
    const risk = riskText(content);
    if (risk.level === 'critical' || risk.level === 'high') return res.status(422).json({ error: 'Comment blocked by ZERA Trust & Safety', risk });
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    const comment = post?.comments?.find((item) => item.id === req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.userId !== req.user.id) return res.status(403).json({ error: 'Only the comment author can edit it' });
    comment.content = content;
    comment.updatedAt = new Date().toISOString();
    await save(db);
    res.json({ ...comment, author: publicAuthor(db, comment.userId, publicUser) });
  }));

  router.delete('/posts/:postId/comments/:commentId', auth, asyncRoute(async (req, res) => {
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    const index = post?.comments?.findIndex((item) => item.id === req.params.commentId) ?? -1;
    if (!post || index < 0) return res.status(404).json({ error: 'Comment not found' });
    const comment = post.comments[index];
    if (comment.userId !== req.user.id && post.userId !== req.user.id) return res.status(403).json({ error: 'Only the comment author or post author can delete it' });
    post.comments.splice(index, 1);
    await save(db);
    res.status(204).end();
  }));

  router.post('/posts/:postId/comments/:commentId/replies', auth, asyncRoute(async (req, res) => {
    const content = cleanText(req.body?.content, 2000);
    if (!content) return res.status(400).json({ error: 'Reply cannot be empty' });
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    const comment = post?.comments?.find((item) => item.id === req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const risk = riskText(content);
    if (risk.level === 'critical' || risk.level === 'high') {
      recordTrustSignal(db, req.user.id, 'reply', risk);
      await save(db);
      return res.status(422).json({ error: 'Reply blocked by ZERA Trust & Safety', risk });
    }
    comment.replies ||= [];
    const reply = { id: randomUUID(), userId: req.user.id, content, createdAt: new Date().toISOString() };
    if (risk.level === 'medium') {
      reply.moderationStatus = 'review_required';
      recordTrustSignal(db, req.user.id, 'reply', risk);
    }
    comment.replies.push(reply);
    await save(db);
    res.status(201).json({ ...reply, author: publicAuthor(db, req.user.id, publicUser) });
  }));

  router.patch('/posts/:postId/comments/:commentId/replies/:replyId', auth, asyncRoute(async (req, res) => {
    const content = cleanText(req.body?.content, 2000);
    if (!content) return res.status(400).json({ error: 'Reply cannot be empty' });
    const risk = riskText(content);
    if (risk.level === 'critical' || risk.level === 'high') return res.status(422).json({ error: 'Reply blocked by ZERA Trust & Safety', risk });
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    const comment = post?.comments?.find((item) => item.id === req.params.commentId);
    const reply = comment?.replies?.find((item) => item.id === req.params.replyId);
    if (!reply) return res.status(404).json({ error: 'Reply not found' });
    if (reply.userId !== req.user.id) return res.status(403).json({ error: 'Only the reply author can edit it' });
    reply.content = content;
    reply.updatedAt = new Date().toISOString();
    await save(db);
    res.json({ ...reply, author: publicAuthor(db, reply.userId, publicUser) });
  }));

  router.delete('/posts/:postId/comments/:commentId/replies/:replyId', auth, asyncRoute(async (req, res) => {
    const db = load();
    initialize(db);
    const post = db.posts.find((item) => item.id === req.params.postId);
    const comment = post?.comments?.find((item) => item.id === req.params.commentId);
    const index = comment?.replies?.findIndex((item) => item.id === req.params.replyId) ?? -1;
    if (!comment || index < 0) return res.status(404).json({ error: 'Reply not found' });
    if (comment.replies[index].userId !== req.user.id && post.userId !== req.user.id) return res.status(403).json({ error: 'Only the reply author or post author can delete it' });
    comment.replies.splice(index, 1);
    await save(db);
    res.status(204).end();
  }));

  return router;
}
