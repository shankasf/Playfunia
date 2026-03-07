import type { Request, Response, NextFunction } from 'express';
import { listActiveJobListings, submitJobApplication } from '../services/careers.service';
import {
  submitJobApplicationSchema,
  ALLOWED_RESUME_MIMETYPES,
  MAX_RESUME_SIZE_BYTES,
  ALLOWED_VIDEO_MIMETYPES,
  MAX_VIDEO_SIZE_BYTES,
} from '../schemas/careers.schema';
import { AppError } from '../utils/app-error';

export async function listJobListingsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const listings = await listActiveJobListings();
    res.json({ listings });
  } catch (error) {
    next(error);
  }
}

export async function submitApplicationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const resumeFile = files?.resume?.[0];
    const videoFile = files?.video?.[0];

    // Validate resume file if present
    if (resumeFile) {
      if (!ALLOWED_RESUME_MIMETYPES.includes(resumeFile.mimetype)) {
        throw new AppError('Invalid file type. Please upload a PDF, DOCX, or TXT file.', 400);
      }
      if (resumeFile.size > MAX_RESUME_SIZE_BYTES) {
        throw new AppError('Resume file is too large. Maximum size is 5MB.', 400);
      }
    }

    // Validate video file if present
    if (videoFile) {
      if (!ALLOWED_VIDEO_MIMETYPES.includes(videoFile.mimetype)) {
        throw new AppError('Invalid video type. Please upload an MP4, MOV, AVI, or WebM file.', 400);
      }
      if (videoFile.size > MAX_VIDEO_SIZE_BYTES) {
        throw new AppError('Video file is too large. Maximum size is 100MB.', 400);
      }
    }

    // Parse and validate form data
    const parsed = submitJobApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues ?? (parsed.error as any).errors ?? [];
      const firstError = issues[0];
      throw new AppError(
        `Validation error: ${firstError?.path?.join('.') ?? 'unknown'} - ${firstError?.message ?? 'Invalid input'}`,
        400,
      );
    }

    // Require at least a video URL or video file
    if (!parsed.data.videoUrl && !videoFile) {
      throw new AppError('A video introduction is required. Please provide a video link or upload a video file.', 400);
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';

    const result = await submitJobApplication(
      parsed.data,
      resumeFile ? {
        buffer: resumeFile.buffer,
        originalname: resumeFile.originalname,
        mimetype: resumeFile.mimetype,
        size: resumeFile.size,
      } : undefined,
      videoFile ? {
        buffer: videoFile.buffer,
        originalname: videoFile.originalname,
        mimetype: videoFile.mimetype,
        size: videoFile.size,
      } : undefined,
      ipAddress,
    );

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
