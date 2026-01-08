import { Router } from 'express';

import {
  createAnnouncementHandler,
  createFaqHandler,
  createTestimonialHandler,
  listAnnouncementsHandler,
  listFaqsHandler,
  listInstagramPostsHandler,
  listTestimonialsHandler,
  updateAnnouncementHandler,
  updateFaqHandler,
  updateTestimonialHandler,
} from '../controllers/content.controller';
import { supabaseAuthGuard, requireRoles } from '../middleware/supabase-auth.middleware';
import { cachePublic } from '../middleware/cache.middleware';

export const contentRouter = Router();

// Public content routes with caching (5 min cache, 10 min stale-while-revalidate)
contentRouter.get('/faqs', cachePublic(300), listFaqsHandler);
contentRouter.get('/testimonials', cachePublic(300), listTestimonialsHandler);
contentRouter.get('/announcements', cachePublic(60), listAnnouncementsHandler);
contentRouter.get('/instagram', cachePublic(300), listInstagramPostsHandler);

contentRouter.use(supabaseAuthGuard, requireRoles('admin', 'staff'));

contentRouter.post('/faqs', createFaqHandler);
contentRouter.put('/faqs/:faqId', updateFaqHandler);

contentRouter.post('/testimonials', createTestimonialHandler);
contentRouter.put('/testimonials/:testimonialId', updateTestimonialHandler);

contentRouter.post('/announcements', createAnnouncementHandler);
contentRouter.put('/announcements/:announcementId', updateAnnouncementHandler);
