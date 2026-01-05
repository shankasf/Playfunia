import type { Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getUserProfile, addChildForUser, deleteChildForUser } from '../services/auth.service';
import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/app-error';

export const getCurrentUserHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const profile = await getUserProfile(req.user.id);
  return res.status(200).json({ user: profile });
});

export const addChildHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { firstName, lastName, birthDate, gender } = req.body;
  if (!firstName || typeof firstName !== 'string') {
    throw new AppError('First name is required', 400);
  }

  const child = await addChildForUser(req.user.id, {
    firstName: firstName.trim(),
    lastName: typeof lastName === 'string' ? lastName.trim() : undefined,
    birthDate: typeof birthDate === 'string' ? birthDate : undefined,
    gender: typeof gender === 'string' ? gender : undefined,
  });

  return res.status(201).json({ child });
});

export const deleteChildHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const childIdParam = req.params.childId;
  if (!childIdParam) {
    throw new AppError('Child ID is required', 400);
  }

  const childId = parseInt(childIdParam, 10);
  if (isNaN(childId)) {
    throw new AppError('Invalid child ID', 400);
  }

  await deleteChildForUser(req.user.id, childId);
  return res.status(200).json({ success: true });
});
