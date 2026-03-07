import { Router } from 'express';
import multer from 'multer';
import { listJobListingsHandler, submitApplicationHandler } from '../controllers/careers.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB (video files can be large)
});

export const careersRouter = Router();

// GET /api/careers/listings - public, list active jobs
careersRouter.get('/listings', listJobListingsHandler);

// POST /api/careers/apply - public, submit application with optional resume and video
careersRouter.post('/apply', upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]), submitApplicationHandler);
