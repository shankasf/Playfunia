import { Router } from 'express';

import { getCurrentUserHandler, addChildHandler, deleteChildHandler } from '../controllers/user.controller';
import { authGuard } from '../middleware/auth.middleware';

export const userRouter = Router();

userRouter.get('/me', authGuard, getCurrentUserHandler);
userRouter.post('/me/children', authGuard, addChildHandler);
userRouter.delete('/me/children/:childId', authGuard, deleteChildHandler);
