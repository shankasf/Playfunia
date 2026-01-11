import { Request, Response, Router } from 'express';

import { appConfig } from '../config/env';

export const chatbotRouter = Router();

/**
 * Proxy endpoint for the chatbot service.
 * Forwards requests to the Python chatbot service running on a separate port.
 */
chatbotRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const chatbotUrl = `${appConfig.chatbotServiceUrl}/chat`;

    const response = await fetch(chatbotUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        message: errorText || 'Chatbot service error',
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Chatbot proxy error:', error);
    return res.status(502).json({
      message: 'Unable to connect to chatbot service',
    });
  }
});

/**
 * Health check for chatbot service
 */
chatbotRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${appConfig.chatbotServiceUrl}/health`);

    if (!response.ok) {
      return res.status(503).json({ status: 'unhealthy' });
    }

    const data = await response.json();
    return res.json(data);
  } catch {
    return res.status(503).json({ status: 'unreachable' });
  }
});
