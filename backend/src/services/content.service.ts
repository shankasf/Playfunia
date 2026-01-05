import {
  AnnouncementRepository,
  FAQRepository,
  TestimonialRepository,
} from '../repositories';
import { AppError } from '../utils/app-error';

import type {
  UpsertAnnouncementInput,
  UpsertFaqInput,
  UpsertTestimonialInput,
} from '../schemas/content.schema';

export async function listFaqs() {
  const faqs = await FAQRepository.findAll(false); // Include inactive for admin
  return faqs.map(faq => ({
    id: String(faq.faq_id),
    question: faq.question,
    answer: faq.answer,
    isActive: faq.is_active,
  }));
}

export async function createFaq(input: UpsertFaqInput) {
  const faq = await FAQRepository.create({
    question: input.question,
    answer: input.answer,
    is_active: true,
  });
  return {
    id: String(faq.faq_id),
    question: faq.question,
    answer: faq.answer,
    isActive: faq.is_active,
  };
}

export async function updateFaq(faqId: string, input: UpsertFaqInput) {
  const faqIdNum = parseInt(faqId, 10);
  if (isNaN(faqIdNum)) {
    throw new AppError('Invalid FAQ ID', 400);
  }

  const existingFaq = await FAQRepository.findById(faqIdNum);
  if (!existingFaq) {
    throw new AppError('FAQ not found', 404);
  }

  const updateData: Record<string, unknown> = {};
  if (input.question) updateData.question = input.question;
  if (input.answer) updateData.answer = input.answer;

  const faq = await FAQRepository.update(faqIdNum, updateData);
  return {
    id: String(faq.faq_id),
    question: faq.question,
    answer: faq.answer,
    isActive: faq.is_active,
  };
}

export async function listTestimonials() {
  const testimonials = await TestimonialRepository.findAll(false); // Include all
  return testimonials.map(t => ({
    id: String(t.testimonial_id),
    name: t.name,
    quote: t.quote,
    rating: t.rating,
    isFeatured: t.is_featured,
    createdAt: t.created_at,
  }));
}

export async function createTestimonial(input: UpsertTestimonialInput) {
  const testimonial = await TestimonialRepository.create({
    name: input.name,
    quote: input.quote,
    rating: input.rating,
    is_featured: input.isFeatured ?? false,
  });
  return {
    id: String(testimonial.testimonial_id),
    name: testimonial.name,
    quote: testimonial.quote,
    rating: testimonial.rating,
    isFeatured: testimonial.is_featured,
    createdAt: testimonial.created_at,
  };
}

export async function updateTestimonial(testimonialId: string, input: UpsertTestimonialInput) {
  const testimonialIdNum = parseInt(testimonialId, 10);
  if (isNaN(testimonialIdNum)) {
    throw new AppError('Invalid testimonial ID', 400);
  }

  const existing = await TestimonialRepository.findById(testimonialIdNum);
  if (!existing) {
    throw new AppError('Testimonial not found', 404);
  }

  const updateData: Record<string, unknown> = {};
  if (input.name) updateData.name = input.name;
  if (input.quote) updateData.quote = input.quote;
  if (typeof input.rating === 'number') updateData.rating = input.rating;
  if (typeof input.isFeatured === 'boolean') updateData.is_featured = input.isFeatured;

  const testimonial = await TestimonialRepository.update(testimonialIdNum, updateData);
  return {
    id: String(testimonial.testimonial_id),
    name: testimonial.name,
    quote: testimonial.quote,
    rating: testimonial.rating,
    isFeatured: testimonial.is_featured,
    createdAt: testimonial.created_at,
  };
}

export async function listAnnouncements() {
  const announcements = await AnnouncementRepository.findAll(true);
  return announcements.map((a: any) => ({
    id: String(a.announcement_id),
    title: a.title,
    body: a.body,
    isActive: a.is_active,
    publishDate: a.publish_date,
    expiresAt: a.expires_at,
    createdAt: a.created_at,
  }));
}

export async function createAnnouncement(input: UpsertAnnouncementInput) {
  const announcement = await AnnouncementRepository.create({
    title: input.title,
    body: input.body,
    is_active: input.isActive ?? true,
    publish_date: input.publishDate?.toISOString(),
    expires_at: input.expiresAt?.toISOString(),
  });
  return {
    id: String(announcement.announcement_id),
    title: announcement.title,
    body: announcement.body,
    isActive: announcement.is_active,
    publishDate: announcement.publish_date,
    expiresAt: announcement.expires_at,
    createdAt: announcement.created_at,
  };
}

export async function updateAnnouncement(announcementId: string, input: UpsertAnnouncementInput) {
  const announcementIdNum = parseInt(announcementId, 10);
  if (isNaN(announcementIdNum)) {
    throw new AppError('Invalid announcement ID', 400);
  }

  const existing = await AnnouncementRepository.findById(announcementIdNum);
  if (!existing) {
    throw new AppError('Announcement not found', 404);
  }

  const updateData: Record<string, unknown> = {};
  if (input.title) updateData.title = input.title;
  if (input.body) updateData.body = input.body;
  if (input.publishDate) updateData.publish_date = input.publishDate.toISOString();
  if (typeof input.expiresAt !== 'undefined') {
    updateData.expires_at = input.expiresAt?.toISOString() ?? null;
  }
  if (typeof input.isActive === 'boolean') updateData.is_active = input.isActive;

  const announcement = await AnnouncementRepository.update(announcementIdNum, updateData);
  return {
    id: String(announcement.announcement_id),
    title: announcement.title,
    body: announcement.body,
    isActive: announcement.is_active,
    publishDate: announcement.publish_date,
    expiresAt: announcement.expires_at,
    createdAt: announcement.created_at,
  };
}
