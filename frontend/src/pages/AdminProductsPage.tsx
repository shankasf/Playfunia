import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import {
  fetchAdminProducts,
  createProduct,
  updateProduct,
  removeProduct,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadProductImage,
  type CatalogCategory,
  type CatalogProduct,
  type ProductPayload,
  type CategoryPayload,
} from '../api/products';
import styles from './AdminProductsPage.module.css';

type Banner = { type: 'ok' | 'err'; text: string } | null;

type ProductForm = {
  name: string;
  description: string;
  price: string;
  unitLabel: string;
  categoryId: string; // '' = none
  childCount: string;
  maxQuantity: string;
  displayOrder: string;
  imageUrl: string;
  isActive: boolean;
};

type CategoryForm = {
  name: string;
  description: string;
  layout: 'cards' | 'list';
  displayOrder: string;
  isActive: boolean;
};

const UNCATEGORIZED = -1;

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function emptyProductForm(categoryId: number | null, nextOrder: number): ProductForm {
  return {
    name: '',
    description: '',
    price: '',
    unitLabel: 'each',
    categoryId: categoryId && categoryId > 0 ? String(categoryId) : '',
    childCount: '0',
    maxQuantity: '10',
    displayOrder: String(nextOrder),
    imageUrl: '',
    isActive: true,
  };
}

function productToForm(p: CatalogProduct): ProductForm {
  return {
    name: p.name,
    description: p.description ?? '',
    price: p.price.toFixed(2),
    unitLabel: p.unitLabel ?? '',
    categoryId: p.categoryId ? String(p.categoryId) : '',
    childCount: String(p.childCount),
    maxQuantity: String(p.maxQuantity),
    displayOrder: String(p.displayOrder),
    imageUrl: p.imageUrl ?? '',
    isActive: p.isActive,
  };
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) {
    try {
      const parsed = JSON.parse(err.message);
      if (parsed?.message) return parsed.message;
      if (parsed?.error) return parsed.error;
    } catch { /* plain text */ }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

export function AdminProductsPage() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Product editor
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | 'new' | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm(null, 1));
  const [productErrors, setProductErrors] = useState<Record<string, string>>({});
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Category editor
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | 'new' | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ name: '', description: '', layout: 'cards', displayOrder: '99', isActive: true });
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminProducts();
      setCategories(data.categories);
      setProducts(data.products);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const list = categories.map(c => ({ category: c as CatalogCategory | null, id: c.id, items: products.filter(p => p.categoryId === c.id) }));
    const known = new Set(categories.map(c => c.id));
    const orphans = products.filter(p => p.categoryId === null || !known.has(p.categoryId));
    if (orphans.length > 0) list.push({ category: null, id: UNCATEGORIZED, items: orphans });
    return list;
  }, [categories, products]);

  const liveCount = products.filter(p => p.isActive && categories.find(c => c.id === p.categoryId)?.isActive).length;

  // ---------------- Products ----------------
  const openNewProduct = (categoryId: number | null) => {
    const inCat = products.filter(p => p.categoryId === categoryId);
    const nextOrder = inCat.reduce((m, p) => Math.max(m, p.displayOrder), 0) + 1;
    setProductForm(emptyProductForm(categoryId, nextOrder));
    setProductErrors({});
    setEditingProduct('new');
  };

  const openEditProduct = (p: CatalogProduct) => {
    setProductForm(productToForm(p));
    setProductErrors({});
    setEditingProduct(p);
  };

  const closeProduct = () => {
    if (savingProduct || uploading) return;
    setEditingProduct(null);
  };

  const setField = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) =>
    setProductForm(prev => ({ ...prev, [key]: value }));

  const validateProduct = (f: ProductForm): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = 'Enter a name customers will see.';
    const price = Number(f.price);
    if (f.price.trim() === '' || !Number.isFinite(price)) errs.price = 'Enter a price, for example 4.99.';
    else if (price < 0.5) errs.price = 'Card payments need a price of at least $0.50.';
    else if (price > 1000) errs.price = 'Price must be $1,000 or less.';
    const max = Number(f.maxQuantity);
    if (!Number.isInteger(max) || max < 1 || max > 100) errs.maxQuantity = 'Use a whole number from 1 to 100.';
    const kids = Number(f.childCount);
    if (!Number.isInteger(kids) || kids < 0 || kids > 20) errs.childCount = 'Use a whole number from 0 to 20.';
    const order = Number(f.displayOrder);
    if (!Number.isInteger(order) || order < 0) errs.displayOrder = 'Use a whole number (0 or more).';
    return errs;
  };

  const toPayload = (f: ProductForm): ProductPayload => ({
    name: f.name.trim(),
    description: f.description.trim() || null,
    price: Math.round(Number(f.price) * 100) / 100,
    unitLabel: f.unitLabel.trim() || null,
    categoryId: f.categoryId ? Number(f.categoryId) : null,
    childCount: Number(f.childCount),
    maxQuantity: Number(f.maxQuantity),
    displayOrder: Number(f.displayOrder),
    imageUrl: f.imageUrl || null,
    isActive: f.isActive,
  });

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateProduct(productForm);
    setProductErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSavingProduct(true);
    try {
      const payload = toPayload(productForm);
      if (editingProduct === 'new') {
        await createProduct(payload);
        setBanner({ type: 'ok', text: `"${payload.name}" added.${payload.isActive ? ' It is now on the Buy Tickets page.' : ''}` });
      } else if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
        setBanner({ type: 'ok', text: `"${payload.name}" saved. The Buy Tickets page shows the change right away.` });
      }
      setEditingProduct(null);
      await load();
    } catch (err) {
      setProductErrors({ form: errorText(err) });
    } finally {
      setSavingProduct(false);
    }
  };

  const onImagePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setProductErrors(prev => ({ ...prev, image: 'Use a JPEG, PNG, WebP or GIF image.' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProductErrors(prev => ({ ...prev, image: 'Image is too large. The maximum is 5 MB.' }));
      return;
    }
    setUploading(true);
    setProductErrors(prev => ({ ...prev, image: '' }));
    try {
      const url = await uploadProductImage(file);
      setField('imageUrl', url);
    } catch (err) {
      setProductErrors(prev => ({ ...prev, image: errorText(err) }));
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (p: CatalogProduct) => {
    setBusyId(p.id);
    try {
      await updateProduct(p.id, { isActive: !p.isActive });
      setBanner({ type: 'ok', text: p.isActive ? `"${p.name}" is hidden from the website.` : `"${p.name}" is back on the website.` });
      await load();
    } catch (err) {
      setBanner({ type: 'err', text: errorText(err) });
    } finally {
      setBusyId(null);
    }
  };

  const doRemove = async (p: CatalogProduct) => {
    setBusyId(p.id);
    try {
      await removeProduct(p.id);
      setBanner({ type: 'ok', text: `"${p.name}" removed. Past orders that include it are not affected.` });
      setConfirmRemoveId(null);
      await load();
    } catch (err) {
      setBanner({ type: 'err', text: errorText(err) });
    } finally {
      setBusyId(null);
    }
  };

  // ---------------- Categories ----------------
  const openNewCategory = () => {
    const nextOrder = categories.reduce((m, c) => Math.max(m, c.displayOrder), 0) + 1;
    setCategoryForm({ name: '', description: '', layout: 'cards', displayOrder: String(nextOrder), isActive: true });
    setCategoryError(null);
    setConfirmDeleteCategory(false);
    setEditingCategory('new');
  };

  const openEditCategory = (c: CatalogCategory) => {
    setCategoryForm({ name: c.name, description: c.description ?? '', layout: c.layout, displayOrder: String(c.displayOrder), isActive: c.isActive });
    setCategoryError(null);
    setConfirmDeleteCategory(false);
    setEditingCategory(c);
  };

  const saveCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) { setCategoryError('Enter a section name.'); return; }
    const order = Number(categoryForm.displayOrder);
    if (!Number.isInteger(order) || order < 0) { setCategoryError('Position must be a whole number (0 or more).'); return; }
    const payload: CategoryPayload = {
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim() || null,
      layout: categoryForm.layout,
      displayOrder: order,
      isActive: categoryForm.isActive,
    };
    setSavingCategory(true);
    try {
      if (editingCategory === 'new') await createCategory(payload);
      else if (editingCategory) await updateCategory(editingCategory.id, payload);
      setBanner({ type: 'ok', text: `Section "${payload.name}" saved.` });
      setEditingCategory(null);
      await load();
    } catch (err) {
      setCategoryError(errorText(err));
    } finally {
      setSavingCategory(false);
    }
  };

  const doDeleteCategory = async () => {
    if (!editingCategory || editingCategory === 'new') return;
    setSavingCategory(true);
    try {
      await deleteCategory(editingCategory.id);
      setBanner({ type: 'ok', text: `Section "${editingCategory.name}" deleted.` });
      setEditingCategory(null);
      await load();
    } catch (err) {
      setCategoryError(errorText(err));
    } finally {
      setSavingCategory(false);
    }
  };

  // Escape closes whichever editor is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingProduct) closeProduct();
      else if (editingCategory && !savingCategory) setEditingCategory(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/admin" className={styles.backLink}>← Dashboard</Link>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Tickets &amp; Products</h1>
            <p className={styles.pageSubtitle}>
              Everything customers can buy on the Buy Tickets page: passes, bundles, socks, food and extras.
              Changes show on the website as soon as you save.
            </p>
          </div>
          <div className={styles.headerActions}>
            <a href="/buy-ticket" target="_blank" rel="noopener noreferrer" className={styles.secondaryBtn}>View page ↗</a>
            <button type="button" className={styles.primaryBtn} onClick={() => openNewProduct(categories[0]?.id ?? null)} disabled={loading || !!loadError}>
              Add product
            </button>
          </div>
        </header>

        {banner && (
          <div className={banner.type === 'ok' ? styles.noticeOk : styles.noticeErr} role={banner.type === 'err' ? 'alert' : 'status'}>
            <span>{banner.text}</span>
            <button type="button" className={styles.linkBtn} onClick={() => setBanner(null)} aria-label="Dismiss">Dismiss</button>
          </div>
        )}

        {loading && products.length === 0 ? (
          <div className={styles.card}><p className={styles.muted}>Loading products…</p></div>
        ) : loadError ? (
          <div className={styles.noticeErr} role="alert">
            <span>{loadError}</span>
            <button type="button" className={styles.linkBtn} onClick={() => void load()}>Try again</button>
          </div>
        ) : (
          <>
            <p className={styles.summary}>
              <strong>{liveCount}</strong> of {products.length} products on the website · {categories.length} sections
            </p>

            {groups.map(group => (
              <section key={group.id} className={styles.card} aria-labelledby={`grp-${group.id}`}>
                <div className={styles.cardHeaderRow}>
                  <div className={styles.groupTitle}>
                    <h2 id={`grp-${group.id}`} className={styles.cardTitle}>
                      {group.category ? group.category.name : 'No section'}
                    </h2>
                    {group.category && !group.category.isActive && <span className={styles.badgeOff}>Section hidden</span>}
                    {group.category && <span className={styles.badgeMuted}>{group.category.layout === 'list' ? 'Compact list' : 'Cards'}</span>}
                  </div>
                  <div className={styles.rowActions}>
                    {group.category && (
                      <button type="button" className={styles.ghostBtn} onClick={() => openEditCategory(group.category!)}>Edit section</button>
                    )}
                    <button type="button" className={styles.ghostBtn} onClick={() => openNewProduct(group.category?.id ?? null)}>+ Add here</button>
                  </div>
                </div>
                {group.category?.description && <p className={styles.groupDesc}>{group.category.description}</p>}
                {!group.category && <p className={styles.groupDesc}>These products are not in a section, so customers can't see them. Edit each one and pick a section.</p>}

                {group.items.length === 0 ? (
                  <p className={styles.emptyLine}>No products in this section yet. Sections with no products on sale are hidden from the website.</p>
                ) : (
                  <ul className={styles.productList}>
                    {group.items.map(p => (
                      <li key={p.id} className={`${styles.productRow}${p.isActive ? '' : ` ${styles.productRowOff}`}`}>
                        <div className={styles.thumb}>
                          {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <span aria-hidden="true">🎟️</span>}
                        </div>
                        <div className={styles.productInfo}>
                          <div className={styles.productName}>
                            {p.name}
                            {p.isSystem && <span className={styles.badgeMuted}>Built-in</span>}
                          </div>
                          {p.description && <div className={styles.productDesc}>{p.description}</div>}
                          <div className={styles.productMeta}>
                            {p.childCount > 0 ? `${p.childCount} kid pass${p.childCount > 1 ? 'es' : ''}` : 'Add-on'} · up to {p.maxQuantity} per order
                          </div>
                        </div>
                        <div className={styles.productPrice}>
                          {money(p.price)}{p.unitLabel && <span className={styles.unit}>/{p.unitLabel}</span>}
                        </div>
                        <button
                          type="button"
                          className={`${styles.statusToggle} ${p.isActive ? styles.statusOn : styles.statusOffBtn}`}
                          onClick={() => void toggleActive(p)}
                          disabled={busyId === p.id}
                          aria-pressed={p.isActive}
                          title={p.isActive ? 'Click to hide from the website' : 'Click to show on the website'}
                        >
                          {p.isActive ? 'On sale' : 'Hidden'}
                        </button>
                        <div className={styles.rowActions}>
                          <button type="button" className={styles.ghostBtn} onClick={() => openEditProduct(p)}>Edit</button>
                          {!p.isSystem && (
                            confirmRemoveId === p.id ? (
                              <>
                                <button type="button" className={styles.dangerBtn} onClick={() => void doRemove(p)} disabled={busyId === p.id}>
                                  {busyId === p.id ? 'Removing…' : 'Yes, remove'}
                                </button>
                                <button type="button" className={styles.ghostBtn} onClick={() => setConfirmRemoveId(null)}>Keep</button>
                              </>
                            ) : (
                              <button type="button" className={styles.ghostDanger} onClick={() => setConfirmRemoveId(p.id)}>Remove</button>
                            )
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <button type="button" className={styles.addSection} onClick={openNewCategory}>+ Add a section</button>
            <p className={styles.hint}>
              Built-in products (single admission, extra adults, grip socks) can be renamed, repriced or hidden, but not removed,
              because other parts of the site use their price.
            </p>
          </>
        )}
      </div>

      {/* ---------------- Product editor ---------------- */}
      {editingProduct && (
        <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) closeProduct(); }}>
          <form className={styles.dialog} onSubmit={saveProduct} role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" noValidate>
            <div className={styles.dialogHeader}>
              <h2 id="product-dialog-title">{editingProduct === 'new' ? 'Add product' : `Edit ${editingProduct.name}`}</h2>
              <button type="button" className={styles.closeBtn} onClick={closeProduct} aria-label="Close">×</button>
            </div>

            <div className={styles.dialogBody}>
              {productErrors.form && <div className={styles.noticeErr} role="alert"><span>{productErrors.form}</span></div>}

              <label className={styles.field}>
                <span className={styles.label}>Name</span>
                <input className={styles.input} value={productForm.name} onChange={e => setField('name', e.target.value)} maxLength={100} placeholder="e.g. Cheese Pizza" autoFocus aria-invalid={!!productErrors.name} />
                {productErrors.name && <span className={styles.errText}>{productErrors.name}</span>}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Description <span className={styles.labelMeta}>optional</span></span>
                <textarea className={styles.textarea} value={productForm.description} onChange={e => setField('description', e.target.value)} maxLength={1000} rows={2} placeholder="Shown under the name on the Buy Tickets page" />
              </label>

              <div className={styles.twoCol}>
                <label className={styles.field}>
                  <span className={styles.label}>Price (USD)</span>
                  <div className={styles.prefixInput}>
                    <span aria-hidden="true">$</span>
                    <input className={styles.input} inputMode="decimal" value={productForm.price} onChange={e => setField('price', e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" aria-invalid={!!productErrors.price} />
                  </div>
                  {productErrors.price && <span className={styles.errText}>{productErrors.price}</span>}
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Priced per <span className={styles.labelMeta}>optional</span></span>
                  <input className={styles.input} value={productForm.unitLabel} onChange={e => setField('unitLabel', e.target.value)} maxLength={30} placeholder="each, child, pair, slice" />
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>Section</span>
                <select className={styles.input} value={productForm.categoryId} onChange={e => setField('categoryId', e.target.value)}>
                  <option value="">No section (not shown)</option>
                  {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}{c.isActive ? '' : ' (hidden)'}</option>)}
                </select>
              </label>

              <div className={styles.field}>
                <span className={styles.label}>Photo <span className={styles.labelMeta}>optional · JPEG, PNG, WebP or GIF, up to 5 MB</span></span>
                <div className={styles.imageRow}>
                  <div className={styles.imagePreview}>
                    {productForm.imageUrl ? <img src={productForm.imageUrl} alt="Product" /> : <span>No photo</span>}
                  </div>
                  <div className={styles.imageButtons}>
                    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onImagePicked} hidden />
                    <button type="button" className={styles.secondaryBtn} onClick={() => fileInput.current?.click()} disabled={uploading}>
                      {uploading ? 'Uploading…' : productForm.imageUrl ? 'Replace photo' : 'Upload photo'}
                    </button>
                    {productForm.imageUrl && !uploading && (
                      <button type="button" className={styles.ghostDanger} onClick={() => setField('imageUrl', '')}>Remove photo</button>
                    )}
                  </div>
                </div>
                {productErrors.image && <span className={styles.errText}>{productErrors.image}</span>}
              </div>

              <div className={styles.threeCol}>
                <label className={styles.field}>
                  <span className={styles.label}>Kid passes</span>
                  <input className={styles.input} inputMode="numeric" value={productForm.childCount} onChange={e => setField('childCount', e.target.value.replace(/\D/g, ''))} aria-invalid={!!productErrors.childCount} />
                  <span className={styles.hint}>0 for food, socks and extras</span>
                  {productErrors.childCount && <span className={styles.errText}>{productErrors.childCount}</span>}
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Max per order</span>
                  <input className={styles.input} inputMode="numeric" value={productForm.maxQuantity} onChange={e => setField('maxQuantity', e.target.value.replace(/\D/g, ''))} aria-invalid={!!productErrors.maxQuantity} />
                  {productErrors.maxQuantity && <span className={styles.errText}>{productErrors.maxQuantity}</span>}
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Position</span>
                  <input className={styles.input} inputMode="numeric" value={productForm.displayOrder} onChange={e => setField('displayOrder', e.target.value.replace(/\D/g, ''))} aria-invalid={!!productErrors.displayOrder} />
                  <span className={styles.hint}>Lower shows first</span>
                  {productErrors.displayOrder && <span className={styles.errText}>{productErrors.displayOrder}</span>}
                </label>
              </div>

              <label className={styles.checkRow}>
                <input type="checkbox" checked={productForm.isActive} onChange={e => setField('isActive', e.target.checked)} />
                <span>
                  <strong>On sale</strong>
                  <span className={styles.hint}> Show this product on the Buy Tickets page</span>
                </span>
              </label>
            </div>

            <div className={styles.dialogFooter}>
              <button type="button" className={styles.secondaryBtn} onClick={closeProduct} disabled={savingProduct || uploading}>Cancel</button>
              <button type="submit" className={styles.primaryBtn} disabled={savingProduct || uploading}>
                {savingProduct ? 'Saving…' : editingProduct === 'new' ? 'Add product' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------- Section editor ---------------- */}
      {editingCategory && (
        <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget && !savingCategory) setEditingCategory(null); }}>
          <form className={styles.dialog} onSubmit={saveCategory} role="dialog" aria-modal="true" aria-labelledby="category-dialog-title" noValidate>
            <div className={styles.dialogHeader}>
              <h2 id="category-dialog-title">{editingCategory === 'new' ? 'Add section' : `Edit section`}</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setEditingCategory(null)} disabled={savingCategory} aria-label="Close">×</button>
            </div>
            <div className={styles.dialogBody}>
              {categoryError && <div className={styles.noticeErr} role="alert"><span>{categoryError}</span></div>}
              <label className={styles.field}>
                <span className={styles.label}>Section name</span>
                <input className={styles.input} value={categoryForm.name} onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value }))} maxLength={100} placeholder="e.g. Food & Drinks" autoFocus />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Subtitle <span className={styles.labelMeta}>optional</span></span>
                <input className={styles.input} value={categoryForm.description} onChange={e => setCategoryForm(f => ({ ...f, description: e.target.value }))} maxLength={500} placeholder="Shown under the section name" />
              </label>
              <div className={styles.twoCol}>
                <label className={styles.field}>
                  <span className={styles.label}>Layout</span>
                  <select className={styles.input} value={categoryForm.layout} onChange={e => setCategoryForm(f => ({ ...f, layout: e.target.value as 'cards' | 'list' }))}>
                    <option value="cards">Cards with photo and quantity</option>
                    <option value="list">Compact list (one-click add)</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Position</span>
                  <input className={styles.input} inputMode="numeric" value={categoryForm.displayOrder} onChange={e => setCategoryForm(f => ({ ...f, displayOrder: e.target.value.replace(/\D/g, '') }))} />
                </label>
              </div>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={categoryForm.isActive} onChange={e => setCategoryForm(f => ({ ...f, isActive: e.target.checked }))} />
                <span><strong>Show this section</strong><span className={styles.hint}> Hiding it hides every product in it</span></span>
              </label>
              {editingCategory !== 'new' && (
                <div className={styles.dangerZone}>
                  {confirmDeleteCategory ? (
                    <>
                      <span>Delete this section? Only empty sections can be deleted.</span>
                      <button type="button" className={styles.dangerBtn} onClick={() => void doDeleteCategory()} disabled={savingCategory}>Yes, delete</button>
                      <button type="button" className={styles.ghostBtn} onClick={() => setConfirmDeleteCategory(false)}>Keep</button>
                    </>
                  ) : (
                    <button type="button" className={styles.ghostDanger} onClick={() => setConfirmDeleteCategory(true)}>Delete section</button>
                  )}
                </div>
              )}
            </div>
            <div className={styles.dialogFooter}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setEditingCategory(null)} disabled={savingCategory}>Cancel</button>
              <button type="submit" className={styles.primaryBtn} disabled={savingCategory}>{savingCategory ? 'Saving…' : 'Save section'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
