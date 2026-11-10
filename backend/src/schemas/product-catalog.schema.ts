import { z } from 'zod';

const money = z.number().min(0.5, 'Price must be at least $0.50').max(1000, 'Price must be $1,000 or less');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const imageUrl = z.string().trim().url('Image must be a valid URL').max(1000).nullable().optional()
  .or(z.literal('').transform(() => null));

const productFields = {
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: optionalText(1000),
  price: money,
  childCount: z.number().int().min(0).max(20).optional(),
  imageUrl,
  unitLabel: optionalText(30),
  maxQuantity: z.number().int().min(1).max(100).optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
};

export const createProductSchema = z.object(productFields).strict();
export const updateProductSchema = z.object(productFields).partial().strict();

const categoryFields = {
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: optionalText(500),
  layout: z.enum(['cards', 'list']).optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
};

export const createCategorySchema = z.object(categoryFields).strict();
export const updateCategorySchema = z.object(categoryFields).partial().strict();
