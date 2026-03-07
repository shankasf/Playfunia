import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { sendContactInquiry } from '../services/email.service';

export const contactRouter = Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages. Please try again later.' },
});

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).regex(/^[A-Za-zÀ-ÿ\s'-]+$/, 'Name must contain only letters'),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  message: z.string().trim().max(2000).optional(),
});

// POST /api/contact - Submit contact form
contactRouter.post('/', contactLimiter, async (req: Request, res: Response) => {
  try {
    const data = contactSchema.parse(req.body);

    const sent = await sendContactInquiry({
      name: data.name,
      email: data.email,
      preferredDate: data.preferredDate,
      message: data.message,
    });

    if (sent) {
      res.json({ success: true, message: 'Your message has been sent. We will get back to you within one business day.' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: error.issues[0]?.message || 'Invalid input' });
    } else {
      console.error('Contact form error:', error);
      res.status(500).json({ success: false, message: 'An unexpected error occurred. Please try again.' });
    }
  }
});
