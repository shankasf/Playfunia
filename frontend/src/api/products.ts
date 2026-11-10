import { API_BASE_URL, apiDelete, apiGet, apiPatch, apiPost, getAuthToken } from './client';

/** One thing sold on /buy-ticket (admission, bundle, socks, pizza, ...). */
export type CatalogProduct = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  price: number;
  /** Kid passes included (1 = single admission, 2+ = sibling bundle, 0 = add-on). */
  childCount: number;
  imageUrl: string | null;
  unitLabel: string | null;
  maxQuantity: number;
  displayOrder: number;
  categoryId: number | null;
  isActive: boolean;
  /** Built-in rows (single admission, extra adults, grip socks) can be turned off, not removed. */
  isSystem: boolean;
};

export type CatalogCategory = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  layout: 'cards' | 'list';
  displayOrder: number;
  isActive: boolean;
};

export type PublicCatalog = {
  schemaReady: boolean;
  categories: Array<CatalogCategory & { items: CatalogProduct[] }>;
};

export function getTicketCatalog(): Promise<PublicCatalog> {
  return apiGet<PublicCatalog>('/pricing/catalog');
}

// ---------------- Admin ----------------
export type ProductPayload = {
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
};

export type CategoryPayload = {
  name: string;
  description: string | null;
  layout: 'cards' | 'list';
  displayOrder: number;
  isActive: boolean;
};

export function fetchAdminProducts(): Promise<{ categories: CatalogCategory[]; products: CatalogProduct[] }> {
  return apiGet('/admin/products');
}

export async function createProduct(payload: ProductPayload): Promise<CatalogProduct> {
  const res = await apiPost<{ product: CatalogProduct }, ProductPayload>('/admin/products', payload);
  return res.product;
}

export async function updateProduct(id: string, payload: Partial<ProductPayload>): Promise<CatalogProduct> {
  const res = await apiPatch<{ product: CatalogProduct }, Partial<ProductPayload>>(`/admin/products/${id}`, payload);
  return res.product;
}

export function removeProduct(id: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/admin/products/${id}`);
}

export async function createCategory(payload: CategoryPayload): Promise<CatalogCategory> {
  const res = await apiPost<{ category: CatalogCategory }, CategoryPayload>('/admin/product-categories', payload);
  return res.category;
}

export async function updateCategory(id: number, payload: Partial<CategoryPayload>): Promise<CatalogCategory> {
  const res = await apiPatch<{ category: CatalogCategory }, Partial<CategoryPayload>>(`/admin/product-categories/${id}`, payload);
  return res.category;
}

export function deleteCategory(id: number): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/admin/product-categories/${id}`);
}

export async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/admin/products/image`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  let json: { imageUrl?: string; message?: string; error?: string } = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!response.ok) throw new Error(json.message || json.error || text || 'Failed to upload image');
  if (!json.imageUrl) throw new Error('Upload succeeded but no image URL was returned.');
  return json.imageUrl;
}
