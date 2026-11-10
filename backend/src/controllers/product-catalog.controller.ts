import type { z } from 'zod';

import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/app-error';
import * as Catalog from '../services/product-catalog.service';
import { uploadProductImage } from '../services/event-image.service';
import {
  createProductSchema,
  updateProductSchema,
  createCategorySchema,
  updateCategorySchema,
} from '../schemas/product-catalog.schema';

function idParam(raw: string | undefined): number {
  const id = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid id', 400);
  return id;
}

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path?.join('.') ?? '';
    throw new AppError(issue ? `${field ? field + ': ' : ''}${issue.message}` : 'Invalid input', 400);
  }
  return result.data;
}

// Public
export const getPublicCatalogHandler = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(200).json(await Catalog.getPublicCatalog());
});

// Admin
export const listAdminProductsHandler = asyncHandler(async (_req, res) => {
  return res.status(200).json(await Catalog.listAdminProducts());
});

export const createProductHandler = asyncHandler(async (req, res) => {
  const input = parse(createProductSchema, req.body);
  return res.status(201).json({ product: await Catalog.createProduct(input) });
});

export const updateProductHandler = asyncHandler(async (req, res) => {
  const input = parse(updateProductSchema, req.body);
  return res.status(200).json({ product: await Catalog.updateProduct(idParam(req.params.id), input) });
});

export const removeProductHandler = asyncHandler(async (req, res) => {
  await Catalog.removeProduct(idParam(req.params.id));
  return res.status(200).json({ success: true });
});

export const uploadProductImageHandler = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new AppError('No image uploaded. Attach an image in the "image" field.', 400);
  const imageUrl = await uploadProductImage({
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });
  return res.status(200).json({ imageUrl });
});

export const createCategoryHandler = asyncHandler(async (req, res) => {
  const input = parse(createCategorySchema, req.body);
  return res.status(201).json({ category: await Catalog.createCategory(input) });
});

export const updateCategoryHandler = asyncHandler(async (req, res) => {
  const input = parse(updateCategorySchema, req.body);
  return res.status(200).json({ category: await Catalog.updateCategory(idParam(req.params.id), input) });
});

export const deleteCategoryHandler = asyncHandler(async (req, res) => {
  await Catalog.deleteCategory(idParam(req.params.id));
  return res.status(200).json({ success: true });
});
