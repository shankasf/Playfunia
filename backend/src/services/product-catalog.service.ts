/**
 * Product catalog for /buy-ticket.
 *
 * Everything sold on the Buy Tickets page (admission, sibling bundles, extra
 * adults, grip socks, pizza, extra hour, ...) is a row in `ticket_types`,
 * grouped into `product_categories`. Admins manage both from Admin -> Products;
 * the page renders whatever is active. Checkout validates each line against the
 * row's DB price (see validateItemPrices in square-checkout.service).
 *
 * A few rows carry a system `code` whose price is also read elsewhere through
 * pricing_config (memberships, legacy carts). Saving those rows writes the price
 * through to pricing_config and clears the pricing cache so both agree.
 */

import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { clearPricingCache, initializePricingCache } from './pricing-config.service';
import { publishAdminEvent } from './admin-events.service';

/** System rows: code -> pricing_config key that mirrors the price. */
export const SYSTEM_PRODUCT_CONFIG_KEYS: Record<string, string> = {
  single_admission: 'single_admission_price',
  extra_adult: 'extra_adult_admission_price',
  grip_socks: 'grip_socks_price',
};

type Row = Record<string, any>;

export interface CatalogItem {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  price: number;
  childCount: number;
  imageUrl: string | null;
  unitLabel: string | null;
  maxQuantity: number;
  displayOrder: number;
  categoryId: number | null;
  isActive: boolean;
  isSystem: boolean;
}

export interface CatalogCategory {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  layout: 'cards' | 'list';
  displayOrder: number;
  isActive: boolean;
}

export interface PublicCatalog {
  schemaReady: boolean;
  categories: Array<CatalogCategory & { items: CatalogItem[] }>;
}

// ---------------------------------------------------------------------------
// Schema detection: the page keeps working (legacy layout) until the
// 20261106_dynamic_ticket_products.sql migration has been applied.
// ---------------------------------------------------------------------------
let schemaReady: boolean | null = null;
let schemaCheckedAt = 0;

export async function isCatalogSchemaReady(): Promise<boolean> {
  if (schemaReady === true) return true;
  if (schemaReady === false && Date.now() - schemaCheckedAt < 60_000) return false;
  const [cats, cols] = await Promise.all([
    supabaseAny.from('product_categories').select('category_id').limit(1),
    supabaseAny.from('ticket_types').select('category_id,is_deleted,image_url,max_quantity').limit(1),
  ]);
  schemaReady = !cats.error && !cols.error;
  schemaCheckedAt = Date.now();
  return schemaReady;
}

async function requireSchema(): Promise<void> {
  if (!(await isCatalogSchemaReady())) {
    throw new AppError(
      'Product management needs a one-time database update (20261106_dynamic_ticket_products.sql). Ask your developer to run it.',
      503,
    );
  }
}

function toItem(r: Row): CatalogItem {
  return {
    id: String(r.ticket_type_id),
    code: r.code ?? null,
    name: r.name,
    description: r.description ?? null,
    price: Number(r.base_price_usd ?? 0),
    childCount: Number(r.child_count ?? 0),
    imageUrl: r.image_url ?? null,
    unitLabel: r.unit_label ?? null,
    maxQuantity: Number(r.max_quantity ?? 10),
    displayOrder: Number(r.display_order ?? 0),
    categoryId: r.category_id ?? null,
    isActive: r.is_active !== false,
    isSystem: Boolean(r.code && SYSTEM_PRODUCT_CONFIG_KEYS[r.code]),
  };
}

function toCategory(r: Row): CatalogCategory {
  return {
    id: r.category_id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
    layout: r.layout === 'list' ? 'list' : 'cards',
    displayOrder: Number(r.display_order ?? 0),
    isActive: r.is_active !== false,
  };
}

const byOrder = <T extends { displayOrder: number; price?: number; name?: string }>(a: T, b: T) =>
  a.displayOrder - b.displayOrder || (a.price ?? 0) - (b.price ?? 0) || String(a.name).localeCompare(String(b.name));

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
export async function getPublicCatalog(): Promise<PublicCatalog> {
  if (!(await isCatalogSchemaReady())) return { schemaReady: false, categories: [] };

  const [catRes, itemRes] = await Promise.all([
    supabaseAny.from('product_categories').select('*').eq('is_active', true),
    supabaseAny.from('ticket_types').select('*').eq('is_active', true).eq('is_deleted', false),
  ]);
  if (catRes.error) throw catRes.error;
  if (itemRes.error) throw itemRes.error;

  const items = (itemRes.data as Row[]).map(toItem);
  const categories = (catRes.data as Row[]).map(toCategory).sort(byOrder);
  return {
    schemaReady: true,
    categories: categories
      .map(c => ({ ...c, items: items.filter(i => i.categoryId === c.id).sort(byOrder) }))
      .filter(c => c.items.length > 0),
  };
}

/**
 * Used by checkout validation: is this ticket type currently for sale?
 * Before the migration every row counts as sellable if is_active.
 */
export function isSellable(row: Row): boolean {
  return row.is_active !== false && row.is_deleted !== true;
}

// ---------------------------------------------------------------------------
// Admin: products
// ---------------------------------------------------------------------------
export interface ProductInput {
  name?: string;
  description?: string | null;
  price?: number;
  childCount?: number;
  imageUrl?: string | null;
  unitLabel?: string | null;
  maxQuantity?: number;
  displayOrder?: number;
  categoryId?: number | null;
  isActive?: boolean;
}

function toRow(input: ProductInput): Row {
  const row: Row = {};
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.description !== undefined) row.description = input.description?.trim() || null;
  if (input.price !== undefined) row.base_price_usd = Math.round(input.price * 100) / 100;
  if (input.childCount !== undefined) row.child_count = input.childCount;
  if (input.imageUrl !== undefined) row.image_url = input.imageUrl || null;
  if (input.unitLabel !== undefined) row.unit_label = input.unitLabel?.trim() || null;
  if (input.maxQuantity !== undefined) row.max_quantity = input.maxQuantity;
  if (input.displayOrder !== undefined) row.display_order = input.displayOrder;
  if (input.categoryId !== undefined) row.category_id = input.categoryId;
  if (input.isActive !== undefined) row.is_active = input.isActive;
  return row;
}

async function writeThroughSystemPrice(code: string | null | undefined, price: number | undefined) {
  if (!code || price === undefined) return;
  const configKey = SYSTEM_PRODUCT_CONFIG_KEYS[code];
  if (!configKey) return;
  const { error } = await supabaseAny
    .from('pricing_config')
    .update({ config_value: price, updated_at: new Date().toISOString() })
    .eq('config_key', configKey);
  if (error) {
    logger.error({ error, configKey }, 'Failed to mirror product price into pricing_config');
    throw new AppError('Saved the product but could not update the matching price setting. Please try again.', 500);
  }
}

async function assertCategoryExists(categoryId: number | null | undefined) {
  if (categoryId === undefined || categoryId === null) return;
  const { data, error } = await supabaseAny
    .from('product_categories').select('category_id').eq('category_id', categoryId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError('That category no longer exists', 400);
}

export async function listAdminProducts(): Promise<{ categories: CatalogCategory[]; products: CatalogItem[] }> {
  await requireSchema();
  const [catRes, itemRes] = await Promise.all([
    supabaseAny.from('product_categories').select('*'),
    supabaseAny.from('ticket_types').select('*').eq('is_deleted', false),
  ]);
  if (catRes.error) throw catRes.error;
  if (itemRes.error) throw itemRes.error;
  return {
    categories: (catRes.data as Row[]).map(toCategory).sort(byOrder),
    products: (itemRes.data as Row[]).map(toItem).sort(byOrder),
  };
}

async function findProductRow(id: number): Promise<Row> {
  const { data, error } = await supabaseAny
    .from('ticket_types').select('*').eq('ticket_type_id', id).eq('is_deleted', false).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError('Product not found', 404);
  return data;
}

async function changed(kind: string, productId?: string | number) {
  // Reload right away: checkout reads the tax rate synchronously from this
  // cache and would otherwise fall back to a hardcoded default until reloaded.
  clearPricingCache();
  try {
    await initializePricingCache();
  } catch (error) {
    logger.error({ error }, 'Failed to reload pricing cache after a product change');
  }
  publishAdminEvent(`product.${kind}`, { productId });
}

export async function createProduct(input: ProductInput & { name: string; price: number }): Promise<CatalogItem> {
  await requireSchema();
  await assertCategoryExists(input.categoryId);
  const row = {
    requires_waiver: (input.childCount ?? 0) > 0,
    requires_grip_socks: (input.childCount ?? 0) > 0,
    child_count: 0,
    max_quantity: 10,
    is_active: true,
    ...toRow(input),
  };
  const { data, error } = await supabaseAny.from('ticket_types').insert(row).select().single();
  if (error) throw error;
  await changed('created', data.ticket_type_id);
  return toItem(data);
}

export async function updateProduct(id: number, input: ProductInput): Promise<CatalogItem> {
  await requireSchema();
  const existing = await findProductRow(id);
  await assertCategoryExists(input.categoryId);
  const row: Row = { ...toRow(input), updated_at: new Date().toISOString() };
  if (input.childCount !== undefined) {
    row.requires_waiver = input.childCount > 0;
    row.requires_grip_socks = input.childCount > 0;
  }
  // Price first into pricing_config for system rows, so a failure there leaves
  // both sides on the old price rather than disagreeing.
  await writeThroughSystemPrice(existing.code, input.price);
  const { data, error } = await supabaseAny
    .from('ticket_types').update(row).eq('ticket_type_id', id).select().single();
  if (error) throw error;
  await changed('updated', id);
  return toItem(data);
}

/**
 * "Remove" hides the product everywhere but keeps the row, because past orders
 * and ticket purchases reference it. System products can only be deactivated.
 */
export async function removeProduct(id: number): Promise<void> {
  await requireSchema();
  const existing = await findProductRow(id);
  if (existing.code && SYSTEM_PRODUCT_CONFIG_KEYS[existing.code]) {
    throw new AppError(`"${existing.name}" is a built-in product. Turn it off instead of removing it.`, 400);
  }
  const { error } = await supabaseAny
    .from('ticket_types')
    .update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() })
    .eq('ticket_type_id', id);
  if (error) throw error;
  await changed('removed', id);
}

// ---------------------------------------------------------------------------
// Admin: categories
// ---------------------------------------------------------------------------
export interface CategoryInput {
  name?: string;
  description?: string | null;
  layout?: 'cards' | 'list';
  displayOrder?: number;
  isActive?: boolean;
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return base || 'category';
}

export async function createCategory(input: CategoryInput & { name: string }): Promise<CatalogCategory> {
  await requireSchema();
  const base = slugify(input.name);
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const { data } = await supabaseAny.from('product_categories').select('category_id').eq('slug', slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${n}`;
  }
  const { data, error } = await supabaseAny.from('product_categories').insert({
    slug,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    layout: input.layout ?? 'cards',
    display_order: input.displayOrder ?? 99,
    is_active: input.isActive ?? true,
  }).select().single();
  if (error) throw error;
  await changed('category.created');
  return toCategory(data);
}

export async function updateCategory(id: number, input: CategoryInput): Promise<CatalogCategory> {
  await requireSchema();
  const row: Row = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.description !== undefined) row.description = input.description?.trim() || null;
  if (input.layout !== undefined) row.layout = input.layout;
  if (input.displayOrder !== undefined) row.display_order = input.displayOrder;
  if (input.isActive !== undefined) row.is_active = input.isActive;
  const { data, error } = await supabaseAny
    .from('product_categories').update(row).eq('category_id', id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError('Category not found', 404);
  await changed('category.updated');
  return toCategory(data);
}

export async function deleteCategory(id: number): Promise<void> {
  await requireSchema();
  const { count, error: countError } = await supabaseAny
    .from('ticket_types').select('ticket_type_id', { count: 'exact', head: true })
    .eq('category_id', id).eq('is_deleted', false);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new AppError('Move or remove the products in this category first.', 400);
  }
  const { error } = await supabaseAny.from('product_categories').delete().eq('category_id', id);
  if (error) throw error;
  await changed('category.deleted');
}
