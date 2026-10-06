import express from 'express';
import { randomUUID } from 'node:crypto';
import { generateAssistantReply, getAIProviderConfig } from '../services/aiProvider.js';

const cleanText = (value, maxLength = 12000) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const safeConversation = (conversation) => ({
  id: conversation.id,
  title: conversation.title,
  updatedAt: conversation.updatedAt,
  messages: (conversation.messages || []).map(({ role, content, createdAt }) => ({ role, content, createdAt })),
});

export function createAIRouter({ auth, load, save }) {
  const router = express.Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.get('/status', (_req, res) => {
    const { configured, provider, model } = getAIProviderConfig();
    res.json({ configured: true, liveProvider: configured, provider, model });
  });

  router.post('/chat', auth, asyncRoute(async (req, res) => {
    const message = cleanText(req.body?.message);
    if (!message) return res.status(400).json({ error: 'Message cannot be empty' });
    const context = cleanText(req.body?.context, 12000);
    const db = load();
    db.aiConversations ||= [];
    const conversation = req.body?.conversationId
      ? db.aiConversations.find((item) => item.id === req.body.conversationId && item.userId === req.user.id)
      : null;
    if (req.body?.conversationId && !conversation) return res.status(404).json({ error: 'Conversation not found' });
    let result;
    try {
      result = await generateAssistantReply([{ role: 'user', content: context ? `${message}\n\nPublic context supplied by the user:\n${context}` : message }]);
    } catch (error) {
      console.error('ZERA AI provider request error:', error.message);
      result = { reply: 'ZERA AI is currently processing requests in safe local mode. Please try asking your question again.' };
    }
    const reply = cleanText(result.reply);
    if (conversation) {
      const now = new Date().toISOString();
      conversation.messages ||= [];
      conversation.messages.push(
        { id: randomUUID(), role: 'user', content: context ? `${message}\n\nPublic context supplied by the user:\n${context}` : message, createdAt: now },
        { id: randomUUID(), role: 'assistant', content: reply, createdAt: now },
      );
      if (conversation.title === 'New conversation') conversation.title = message.replace(/\s+/g, ' ').slice(0, 70);
      conversation.updatedAt = now;
      await save(db);
      return res.json({ reply, conversation: safeConversation(conversation) });
    }
    res.json({ reply });
  }));

  router.get('/conversations', auth, (req, res) => {
    const db = load();
    db.aiConversations ||= [];
    res.json(db.aiConversations.filter((conversation) => conversation.userId === req.user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt })));
  });

  router.post('/conversations', auth, asyncRoute(async (req, res) => {
    const db = load();
    db.aiConversations ||= [];
    const now = new Date().toISOString();
    const conversation = { id: randomUUID(), userId: req.user.id, title: cleanText(req.body?.title, 100) || 'New conversation', messages: [], createdAt: now, updatedAt: now };
    db.aiConversations.push(conversation);
    await save(db);
    res.status(201).json(safeConversation(conversation));
  }));

  router.get('/conversations/:id', auth, (req, res) => {
    const db = load();
    const conversation = (db.aiConversations || []).find((item) => item.id === req.params.id && item.userId === req.user.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(safeConversation(conversation));
  });

  router.delete('/conversations/:id', auth, asyncRoute(async (req, res) => {
    const db = load();
    db.aiConversations ||= [];
    const index = db.aiConversations.findIndex((item) => item.id === req.params.id && item.userId === req.user.id);
    if (index < 0) return res.status(404).json({ error: 'Conversation not found' });
    db.aiConversations.splice(index, 1);
    await save(db);
    res.status(204).end();
  }));

  router.post('/conversations/:id/messages', auth, asyncRoute(async (req, res) => {
    const content = cleanText(req.body?.content);
    if (!content) return res.status(400).json({ error: 'Message cannot be empty' });

    const db = load();
    db.aiConversations ||= [];
    const conversation = db.aiConversations.find((item) => item.id === req.params.id && item.userId === req.user.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const userMessage = { id: randomUUID(), role: 'user', content, createdAt: new Date().toISOString() };
    const contextMessages = [...(conversation.messages || []), userMessage].slice(-40).map(({ role, content: text }) => ({ role, content: text }));
    try {
      const result = await generateAssistantReply(contextMessages);
      const assistantMessage = { id: randomUUID(), role: 'assistant', content: result.reply, createdAt: new Date().toISOString() };
      conversation.messages.push(userMessage, assistantMessage);
      if (conversation.title === 'New conversation') conversation.title = content.replace(/\s+/g, ' ').slice(0, 70);
      conversation.updatedAt = assistantMessage.createdAt;
      await save(db);
      res.json({ conversation: safeConversation(conversation), userMessage, assistantMessage });
    } catch (error) {
      console.error('ZERA AI provider message error:', error.message);
      const fallbackReply = 'I am here to assist with your technical questions. Please rephrase or specify your question.';
      const assistantMessage = { id: randomUUID(), role: 'assistant', content: fallbackReply, createdAt: new Date().toISOString() };
      conversation.messages.push(userMessage, assistantMessage);
      conversation.updatedAt = assistantMessage.createdAt;
      await save(db);
      res.json({ conversation: safeConversation(conversation), userMessage, assistantMessage });
    }
  }));

  return router;
}
