import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendContactInquiry } from '../services/email.service';

export const contactRouter = Router();

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  preferredDate: z.string().optional(),
  message: z.string().max(2000).optional(),
});

// POST /api/contact - Submit contact form
contactRouter.post('/', async (req: Request, res: Response) => {
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
