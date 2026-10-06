export function getAIProviderConfig(env = process.env) {
  const rawKey = env.AI_API_KEY || env.OPENAI_API_KEY || '';
  const isPlaceholder = !rawKey || rawKey === 'your_actual_ai_api_key' || rawKey.includes('replace-with');
  const apiKey = isPlaceholder ? '' : rawKey;
  const baseUrl = (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    model: env.AI_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini',
    provider: apiKey ? (env.AI_PROVIDER || 'openai-compatible') : 'zera-builtin-mentor',
  };
}

function generateBuiltInResponse(messages) {
  const lastMsg = messages[messages.length - 1]?.content || '';
  const query = lastMsg.toLowerCase();

  if (query.includes('react') || query.includes('state') || query.includes('hook') || query.includes('useeffect')) {
    return `### React State & Component Lifecycle

In React, state updates trigger re-renders. Here are key principles to keep in mind:

1. **State is Asynchronous / Batched**: When calling \`setCount(count + 1)\`, the state does not update immediately within the same synchronous execution block.
2. **Functional Updates**: When new state depends on previous state, always use the functional form:
\`\`\`typescript
setCount(prev => prev + 1);
\`\`\`
3. **Immutable Updates for Arrays & Objects**: Always clone objects or use spread syntax:
\`\`\`typescript
setItems(prev => [...prev, newItem]);
setUser(prev => ({ ...prev, name: 'Updated' }));
\`\`\`
4. **Clean Effect Dependencies**: Make sure everything referenced inside \`useEffect\` is included in its dependency array or wrapped with \`useCallback\`.

Feel free to paste your specific component code for a targeted review!`;
  }

  if (query.includes('node') || query.includes('express') || query.includes('backend') || query.includes('api')) {
    return `### Backend & API Architecture Best Practices

When building RESTful APIs with Node.js and Express:

1. **Error Handling**: Use centralized error handling middleware:
\`\`\`javascript
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});
\`\`\`
2. **Authentication**: Use standard Bearer Tokens with JSON Web Tokens (JWT) verified in an \`auth\` middleware.
3. **Input Validation**: Validate body and query parameters before passing them to business logic.
4. **Environment Variables**: Never commit secrets or API credentials to version control.

What specific backend or API pattern would you like to explore?`;
  }

  if (query.includes('debug') || query.includes('error') || query.includes('bug') || query.includes('fail')) {
    return `### Systematic Debugging Process

To resolve this issue efficiently:

1. **Check the Exact Error & Stack Trace**: Look at both browser console logs and server terminal outputs.
2. **Verify Network Requests**: Inspect the Network tab for HTTP status code (400, 401, 403, 404, 500) and response payload.
3. **Trace Data Flow**: 
   - Frontend request -> URL & headers (Authorization, Content-Type)
   - Route handler -> Parameter parsing & validation
   - Database/Store query -> returned record vs null
4. **Isolate Component State**: Add focused logging before and after critical state transitions.

If you paste the error message and relevant snippet, I will analyze the exact cause and provide a corrected version.`;
  }

  return `### Hello! I am ZERA AI — your development companion on ZERA HUB.

I am here to help you turn ideas into reality, debug errors, architect scalable software, and sharpen your technical skills.

Here is what we can do together:
- **Code & Architecture**: Frontend (React, TypeScript, CSS), Backend (Node.js, Express, Python), and Database design.
- **Debugging & Code Review**: Paste an error message or code snippet for actionable fixes.
- **System Design & Security**: Authentication, API security, JWT, rate limiting, and cloud deployments.
- **Concept Explanations**: Deep dives into data structures, algorithms, asynchronous programming, and web standards.

What are you building or debugging today?`;
}

export async function generateAssistantReply(messages, env = process.env) {
  const config = getAIProviderConfig(env);
  if (!config.configured) {
    return {
      configured: true,
      reply: generateBuiltInResponse(messages),
      model: 'zera-mentor-v2',
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are ZERA AI, a helpful, highly capable general-purpose assistant and software mentor inside ZERA HUB. Answer general questions as well as technical questions with clarity, precision, and practical examples. Format output with clean markdown.',
          },
          ...messages,
        ],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      console.warn(`External AI provider responded with status ${response.status}. Using resilient built-in assistant.`);
      return {
        configured: true,
        reply: generateBuiltInResponse(messages),
        model: 'zera-mentor-v2',
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return {
        configured: true,
        reply: generateBuiltInResponse(messages),
        model: 'zera-mentor-v2',
      };
    }
    return { configured: true, reply: content.trim(), model: config.model };
  } catch (error) {
    console.warn('AI provider fetch error:', error.message, 'Using resilient built-in assistant.');
    return {
      configured: true,
      reply: generateBuiltInResponse(messages),
      model: 'zera-mentor-v2',
    };
  }
}

