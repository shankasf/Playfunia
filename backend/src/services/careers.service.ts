import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { JobListingRepository, JobApplicationRepository } from '../repositories';
import { sendJobApplicationNotification, sendJobApplicationConfirmation } from './email.service';
import type { SubmitJobApplicationInput } from '../schemas/careers.schema';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

type ResumeFile = UploadedFile;
type VideoFile = UploadedFile;

export async function listActiveJobListings() {
  const listings = await JobListingRepository.findAllActive();
  return listings.map((l: Record<string, unknown>) => ({
    id: l.listing_id,
    title: l.title,
    slug: l.slug,
    department: l.department,
    employmentType: l.employment_type,
    location: l.location,
    description: l.description,
    responsibilities: l.responsibilities ?? [],
    qualifications: l.qualifications ?? [],
    niceToHave: l.nice_to_have ?? [],
    perks: l.perks ?? [],
    payRange: l.pay_range,
    minimumAge: l.minimum_age,
    scheduleNotes: l.schedule_notes,
    publishedAt: l.published_at,
    closesAt: l.closes_at,
  }));
}

export async function submitJobApplication(
  input: SubmitJobApplicationInput,
  resumeFile?: ResumeFile,
  videoFile?: VideoFile,
  ipAddress?: string,
) {
  // 1. Verify listing exists and is active
  const listing = await JobListingRepository.findById(input.listingId);
  if (!listing || !listing.is_active) {
    throw new AppError('Job listing not found or no longer accepting applications', 404);
  }

  // Check if listing has expired
  if (listing.closes_at && new Date(listing.closes_at as string) < new Date()) {
    throw new AppError('This position is no longer accepting applications', 404);
  }

  // 2. Validate minimum age if DOB provided
  if (input.dateOfBirth && listing.minimum_age) {
    const dob = new Date(input.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    if (age < listing.minimum_age) {
      throw new AppError(`Applicants must be at least ${listing.minimum_age} years old for this position`, 400);
    }
  }

  // 3. Check for duplicate application
  const isDuplicate = await JobApplicationRepository.checkDuplicateApplication(
    input.email,
    input.listingId,
  );
  if (isDuplicate) {
    throw new AppError('You have already applied for this position', 409);
  }

  // 4. Upload resume to Supabase Storage if provided
  let resumeStoragePath: string | null = null;
  let resumeOriginalName: string | null = null;
  let resumeMimeType: string | null = null;
  let resumeSizeBytes: number | null = null;

  if (resumeFile) {
    await ensureResumeBucket();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const uuid = crypto.randomUUID();
    const safeName = resumeFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    resumeStoragePath = `resumes/${year}/${month}/${uuid}-${safeName}`;

    const { error: uploadError } = await supabaseAny.storage
      .from('resumes')
      .upload(resumeStoragePath, resumeFile.buffer, {
        contentType: resumeFile.mimetype,
        upsert: false,
      });

    if (uploadError) {
      logger.error({ error: uploadError }, 'Failed to upload resume to storage');
      throw new AppError('Failed to upload resume', 500);
    }

    resumeOriginalName = resumeFile.originalname;
    resumeMimeType = resumeFile.mimetype;
    resumeSizeBytes = resumeFile.size;
  }

  // 5. Upload video to Supabase Storage if provided
  let videoStoragePath: string | null = null;
  let videoOriginalName: string | null = null;
  let videoMimeType: string | null = null;
  let videoSizeBytes: number | null = null;
  let videoPublicUrl: string | null = null;

  if (videoFile) {
    await ensureVideoBucket();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const uuid = crypto.randomUUID();
    const safeName = videoFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    videoStoragePath = `videos/${year}/${month}/${uuid}-${safeName}`;

    const { error: uploadError } = await supabaseAny.storage
      .from('application-videos')
      .upload(videoStoragePath, videoFile.buffer, {
        contentType: videoFile.mimetype,
        upsert: false,
      });

    if (uploadError) {
      logger.error({ error: uploadError }, 'Failed to upload video to storage');
      throw new AppError('Failed to upload video', 500);
    }

    // Generate a signed URL valid for 30 days for admin viewing
    const { data: signedData } = await supabaseAny.storage
      .from('application-videos')
      .createSignedUrl(videoStoragePath, 30 * 24 * 60 * 60); // 30 days

    videoPublicUrl = signedData?.signedUrl ?? null;
    videoOriginalName = videoFile.originalname;
    videoMimeType = videoFile.mimetype;
    videoSizeBytes = videoFile.size;
  }

  // Determine the video link for admin (URL takes priority, then uploaded file's signed URL)
  const videoLinkForAdmin = input.videoUrl || videoPublicUrl || null;

  // 6. Save application to DB
  const application = await JobApplicationRepository.create({
    listing_id: input.listingId,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email.toLowerCase(),
    phone: input.phone,
    date_of_birth: input.dateOfBirth ?? null,
    resume_storage_path: resumeStoragePath,
    resume_original_name: resumeOriginalName,
    resume_mime_type: resumeMimeType,
    resume_size_bytes: resumeSizeBytes,
    cover_letter: input.coverLetter ?? null,
    schedule_preference: input.schedulePreference ?? null,
    available_start_date: input.availableStartDate ?? null,
    has_experience_with_children: input.hasExperienceWithChildren ?? false,
    gender: input.gender ?? null,
    pronouns: input.pronouns ?? null,
    how_heard: input.howHeard ?? null,
    emergency_contact_name: input.emergencyContactName ?? null,
    emergency_contact_phone: input.emergencyContactPhone ?? null,
    ip_address: ipAddress ?? null,
    video_url: input.videoUrl ?? null,
    video_storage_path: videoStoragePath,
    video_original_name: videoOriginalName,
    video_mime_type: videoMimeType,
    video_size_bytes: videoSizeBytes,
  });

  // 7. Fire-and-forget admin email
  sendJobApplicationNotification({
    jobTitle: listing.title as string,
    department: listing.department as string,
    applicantName: `${input.firstName} ${input.lastName}`,
    applicantEmail: input.email,
    applicantPhone: input.phone,
    dateOfBirth: input.dateOfBirth,
    schedulePreference: input.schedulePreference,
    availableStartDate: input.availableStartDate,
    hasExperienceWithChildren: input.hasExperienceWithChildren ?? false,
    coverLetter: input.coverLetter,
    howHeard: input.howHeard,
    gender: input.gender,
    pronouns: input.pronouns,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    resumeFile: resumeFile ? {
      filename: resumeFile.originalname,
      content: resumeFile.buffer,
      contentType: resumeFile.mimetype,
    } : undefined,
    videoLink: videoLinkForAdmin ?? undefined,
  }).catch(err => {
    logger.error({ error: err }, 'Failed to send job application notification email');
  });

  // 8. Fire-and-forget applicant confirmation email
  sendJobApplicationConfirmation({
    applicantFirstName: input.firstName,
    applicantEmail: input.email,
    jobTitle: listing.title as string,
    department: listing.department as string,
    applicationDate: new Date().toISOString(),
  }).catch(err => {
    logger.error({ error: err }, 'Failed to send job application confirmation email');
  });

  return {
    applicationId: application.application_id,
    message: 'Application submitted successfully! We will review your application and get back to you soon.',
  };
}

async function ensureVideoBucket() {
  try {
    const { data: buckets } = await supabaseAny.storage.listBuckets();
    const exists = (buckets ?? []).some((b: { name: string }) => b.name === 'application-videos');
    if (!exists) {
      await supabaseAny.storage.createBucket('application-videos', {
        public: false,
        fileSizeLimit: 5 * 1024 * 1024 * 1024, // 5GB
        allowedMimeTypes: [
          'video/mp4',
          'video/quicktime',
          'video/x-msvideo',
          'video/webm',
          'video/x-matroska',
        ],
      });
      logger.info('Created "application-videos" storage bucket');
    }
  } catch (err) {
    logger.warn({ error: err }, 'Video bucket creation check failed (may already exist)');
  }
}

async function ensureResumeBucket() {
  try {
    const { data: buckets } = await supabaseAny.storage.listBuckets();
    const exists = (buckets ?? []).some((b: { name: string }) => b.name === 'resumes');
    if (!exists) {
      await supabaseAny.storage.createBucket('resumes', {
        public: false,
        fileSizeLimit: 5 * 1024 * 1024, // 5MB
        allowedMimeTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
        ],
      });
      logger.info('Created "resumes" storage bucket');
    }
  } catch (err) {
    // Bucket may already exist, that's fine
    logger.warn({ error: err }, 'Resume bucket creation check failed (may already exist)');
  }
}
