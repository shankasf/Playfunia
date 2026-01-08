import { Router } from 'express';

import { getCurrentUserHandler, addChildHandler, deleteChildHandler } from '../controllers/user.controller';
import { supabaseAuthGuard } from '../middleware/supabase-auth.middleware';

export const userRouter = Router();

userRouter.get('/me', supabaseAuthGuard, getCurrentUserHandler);
userRouter.post('/me/children', supabaseAuthGuard, addChildHandler);
userRouter.delete('/me/children/:childId', supabaseAuthGuard, deleteChildHandler);
