import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';

import { formatDateTime } from '../lib/dateUtils';
import {
  fetchChatbotSettings,
  updateChatbotSettings,
  fetchChatbotModels,
  testChatbot,
  fetchKbDocuments,
  fetchKbDocument,
  createKbTextDocument,
  updateKbDocument,
  reindexKbDocument,
  deleteKbDocument,
  searchKb,
  uploadKbFile,
  replaceKbFile,
  type ChatbotSettings,
  type ChatbotSettingsPatch,
  type ChatbotTestResult,
  type QuickPrompt,
  type KbDocument,
  type KbDocumentDetail,
  type KbStats,
  type KbSearchResult,
} from '../api/chatbotAdmin';
import styles from './AdminChatbotPage.module.css';

type LoadState = 'idle' | 'loading' | 'error';
type Tab = 'settings' | 'kb';
type Banner = { type: 'ok' | 'err'; text: string } | null;

/** Editable copy of the settings (everything except server-managed audit fields). */
type SettingsForm = Omit<ChatbotSettings, 'updatedBy' | 'updatedAt'>;

const FALLBACK_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini', 'gpt-5'];

function toForm(s: ChatbotSettings): SettingsForm {
  return {
    enabled: s.enabled,
    botName: s.botName,
    model: s.model,
    temperature: s.temperature,
    systemPrompt: s.systemPrompt,
    greeting: s.greeting,
    quickPrompts: s.quickPrompts.map((q) => ({ ...q })),
    capabilityPhrases: [...s.capabilityPhrases],
    maxToolTurns: s.maxToolTurns,
    kbEnabled: s.kbEnabled,
    kbTopK: s.kbTopK,
  };
}

function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(s: KbDocument['status']): string {
  switch (s) {
    case 'ready': return 'Ready';
    case 'processing': return 'Preparing';
    case 'failed': return "Couldn't be read";
    case 'unsearchable': return 'Stored, not readable';
    default: return s;
  }
}

/** Friendly names for the engine picker. Unknown ids fall back to the raw id. */
const MODEL_INFO: Record<string, string> = {
  'gpt-4o-mini': 'Fast and affordable (recommended)',
  'gpt-4o': 'More capable',
  'gpt-4.1-mini': 'Fast, newer',
  'gpt-4.1': 'Most capable',
  'gpt-5-mini': 'Newest, fast',
  'gpt-5': 'Newest, most capable',
};
function modelLabel(id: string): string {
  return MODEL_INFO[id] ? `${MODEL_INFO[id]} · ${id}` : id;
}

function styleWord(t: number): string {
  if (t < 0.4) return 'Precise';
  if (t < 1.0) return 'Balanced';
  return 'Creative';
}

function matchKey(sim: number): 'strong' | 'good' | 'weak' {
  if (sim >= 0.6) return 'strong';
  if (sim >= 0.45) return 'good';
  return 'weak';
}
function matchWord(sim: number): string {
  const k = matchKey(sim);
  return k === 'strong' ? 'Strong match' : k === 'good' ? 'Good match' : 'Weak match';
}

/** Plain-language names for what the assistant looked up. */
const TOOL_LABELS: Record<string, string> = {
  list_tickets: 'Ticket prices',
  get_ticket: 'A ticket option',
  find_best_ticket_for: 'Best ticket for a group',
  estimate_admission_total: 'Admission total',
  list_memberships: 'Membership plans',
  get_membership: 'A membership plan',
  find_best_membership_for: 'Best membership for a family',
  compare_memberships: 'Membership comparison',
  monthly_membership_break_even: 'Membership value check',
  list_party_packages: 'Party packages',
  get_party_package: 'A party package',
  find_best_party_package: 'Best party package',
  estimate_party_total: 'Party price estimate',
  list_party_addons: 'Party add-ons',
  get_party_addon: 'A party add-on',
  list_active_promotions: 'Current promotions',
  get_promotion_by_code: 'A promo code',
  get_hours: 'Opening hours',
  is_open_now: 'Open right now?',
  get_location: 'Location and contact',
  get_fee: 'A fee',
  list_upcoming_events: 'Upcoming events',
  search_faqs: 'Frequently asked questions',
  list_active_announcements: 'Announcements',
  list_open_positions: 'Job openings',
  search_knowledge_base: 'Knowledge library',
};
function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function typeLabel(d: KbDocument): string {
  if (d.sourceType !== 'file') return 'Note';
  const mime = (d.mimeType || '').toLowerCase();
  const name = (d.fileName || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (mime.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) return 'Word';
  if (mime.includes('sheet') || mime.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls')) return 'Excel';
  if (mime.includes('csv') || name.endsWith('.csv')) return 'Spreadsheet';
  if (mime.startsWith('image/')) return 'Image';
  if (mime.includes('html') || name.endsWith('.html') || name.endsWith('.htm')) return 'Web page';
  if (mime.includes('json') || name.endsWith('.json')) return 'Data';
  if (mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return 'Text';
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return ext ? ext.toUpperCase() : 'File';
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function AdminChatbotPage() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [banner, setBanner] = useState<Banner>(null);

  // ---- Settings state ----------------------------------------------------------
  const [settingsState, setSettingsState] = useState<LoadState>('idle');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ChatbotSettings | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [customModel, setCustomModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');

  const [testInput, setTestInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ChatbotTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  // ---- KB state ----------------------------------------------------------------
  const [kbState, setKbState] = useState<LoadState>('idle');
  const [kbError, setKbError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [kbStats, setKbStats] = useState<KbStats | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const [showNewText, setShowNewText] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<KbDocumentDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [detailTitle, setDetailTitle] = useState('');
  const [detailContent, setDetailContent] = useState('');
  const [detailBusy, setDetailBusy] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KbSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ---- Loaders ---------------------------------------------------------------------
  const loadSettings = useCallback(async () => {
    setSettingsState('loading');
    setSettingsError(null);
    try {
      const [s, m] = await Promise.all([
        fetchChatbotSettings(),
        fetchChatbotModels().catch(() => FALLBACK_MODELS),
      ]);
      setSaved(s);
      setForm(toForm(s));
      const list = m.length ? m : FALLBACK_MODELS;
      setModels(list);
      setCustomModel(!list.includes(s.model));
      setSettingsState('idle');
    } catch (e) {
      setSettingsError(errMsg(e, 'Failed to load chatbot settings.'));
      setSettingsState('error');
    }
  }, []);

  const loadKb = useCallback(async (silent = false) => {
    if (!silent) setKbState('loading');
    setKbError(null);
    try {
      const data = await fetchKbDocuments();
      setDocuments(data.documents ?? []);
      setKbStats(data.stats ?? null);
      setKbState('idle');
    } catch (e) {
      setKbError(errMsg(e, 'Failed to load knowledge base.'));
      setKbState('error');
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadKb();
  }, [loadSettings, loadKb]);

  // Auto-dismiss banners.
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(t);
  }, [banner]);

  // Poll while any doc is still processing.
  useEffect(() => {
    if (!documents.some((d) => d.status === 'processing')) return;
    const t = window.setInterval(() => void loadKb(true), 3000);
    return () => window.clearInterval(t);
  }, [documents, loadKb]);

  // ---- Settings handlers ---------------------------------------------------------
  const isDirty = useMemo(() => {
    if (!saved || !form) return false;
    return JSON.stringify(toForm(saved)) !== JSON.stringify(form);
  }, [saved, form]);

  const patch = useCallback((p: Partial<SettingsForm>) => {
    setForm((prev) => (prev ? { ...prev, ...p } : prev));
  }, []);

  const updateQuickPrompt = (i: number, field: keyof QuickPrompt, value: string) => {
    if (!form) return;
    const next = form.quickPrompts.map((q, idx) => (idx === i ? { ...q, [field]: value } : q));
    patch({ quickPrompts: next });
  };
  const moveQuickPrompt = (i: number, dir: -1 | 1) => {
    if (!form) return;
    const j = i + dir;
    if (j < 0 || j >= form.quickPrompts.length) return;
    const next = [...form.quickPrompts];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ quickPrompts: next });
  };
  const removeQuickPrompt = (i: number) => {
    if (!form) return;
    patch({ quickPrompts: form.quickPrompts.filter((_, idx) => idx !== i) });
  };
  const addQuickPrompt = () => {
    if (!form) return;
    patch({ quickPrompts: [...form.quickPrompts, { emoji: '✨', label: '', prompt: '' }] });
  };

  const movePhrase = (i: number, dir: -1 | 1) => {
    if (!form) return;
    const j = i + dir;
    if (j < 0 || j >= form.capabilityPhrases.length) return;
    const next = [...form.capabilityPhrases];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ capabilityPhrases: next });
  };
  const removePhrase = (i: number) => {
    if (!form) return;
    patch({ capabilityPhrases: form.capabilityPhrases.filter((_, idx) => idx !== i) });
  };
  const addPhrase = () => {
    const v = newPhrase.trim();
    if (!form || !v) return;
    patch({ capabilityPhrases: [...form.capabilityPhrases, v] });
    setNewPhrase('');
  };

  const validateForm = (f: SettingsForm): string | null => {
    if (!f.botName.trim()) return 'Bot name is required.';
    if (!f.model.trim()) return 'Model is required.';
    if (!f.greeting.trim()) return 'Greeting is required.';
    if (f.quickPrompts.some((q) => !q.label.trim() || !q.prompt.trim())) {
      return 'Every quick prompt needs a label and a prompt.';
    }
    return null;
  };

  const handleSave = async () => {
    if (!form) return;
    const problem = validateForm(form);
    if (problem) {
      setBanner({ type: 'err', text: problem });
      return;
    }
    setSaving(true);
    try {
      const payload: ChatbotSettingsPatch = {
        ...form,
        botName: form.botName.trim(),
        model: form.model.trim(),
        greeting: form.greeting.trim(),
        systemPrompt: form.systemPrompt && form.systemPrompt.trim() ? form.systemPrompt : null,
        quickPrompts: form.quickPrompts.map((q) => ({
          emoji: q.emoji.trim() || '✨',
          label: q.label.trim(),
          prompt: q.prompt.trim(),
        })),
        capabilityPhrases: form.capabilityPhrases.map((p) => p.trim()).filter(Boolean),
      };
      const result = await updateChatbotSettings(payload);
      setSaved(result);
      setForm(toForm(result));
      setBanner({ type: 'ok', text: 'Chatbot settings saved. Changes apply to new conversations immediately.' });
    } catch (e) {
      setBanner({ type: 'err', text: errMsg(e, 'Failed to save settings.') });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (saved) {
      setForm(toForm(saved));
      setCustomModel(!models.includes(saved.model));
    }
  };

  const handleTest = async () => {
    const msg = testInput.trim();
    if (!msg) return;
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const r = await testChatbot(msg);
      setTestResult(r);
    } catch (e) {
      setTestError(errMsg(e, 'Test request failed.'));
    } finally {
      setTesting(false);
    }
  };

  // ---- KB handlers -----------------------------------------------------------------
  const openDocument = useCallback(async (id: number) => {
    setSelectedId(id);
    setDetailState('loading');
    setDetail(null);
    try {
      const d = await fetchKbDocument(id);
      setDetail(d);
      setDetailTitle(d.title);
      setDetailContent(d.content ?? '');
      setDetailState('idle');
    } catch (e) {
      setDetailState('error');
      setBanner({ type: 'err', text: errMsg(e, 'Failed to load document.') });
    }
  }, []);

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailState('idle');
  };

  const applyDetail = (d: KbDocumentDetail) => {
    setDetail(d);
    setDetailTitle(d.title);
    setDetailContent(d.content ?? '');
    setDocuments((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...d } : x)));
  };

  const doUpload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    let ok = 0;
    let fail = 0;
    let lastDoc: KbDocumentDetail | null = null;
    for (const file of list) {
      try {
        const doc = await uploadKbFile(file, list.length === 1 ? uploadTitle : undefined);
        lastDoc = doc;
        ok += 1;
        if (doc.status === 'unsearchable' || doc.status === 'failed') {
          setBanner({
            type: 'err',
            text: `${file.name}: ${doc.error || (doc.status === 'unsearchable' ? 'stored but its text could not be indexed.' : 'indexing failed.')}`,
          });
        }
      } catch (e) {
        fail += 1;
        setBanner({ type: 'err', text: `${file.name}: ${errMsg(e, 'upload failed')}` });
      }
    }
    setUploading(false);
    setUploadTitle('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    await loadKb(true);
    if (fail === 0 && lastDoc && lastDoc.status === 'ready') {
      setBanner({ type: 'ok', text: `${ok} file${ok === 1 ? '' : 's'} uploaded and indexed.` });
    }
    if (lastDoc && list.length === 1) void openDocument(lastDoc.id);
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void doUpload(e.target.files);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void doUpload(e.dataTransfer.files);
  };

  const handleCreateText = async () => {
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title || !content) {
      setBanner({ type: 'err', text: 'Title and content are both required.' });
      return;
    }
    setCreating(true);
    try {
      const doc = await createKbTextDocument({ title, content });
      setNewTitle('');
      setNewContent('');
      setShowNewText(false);
      await loadKb(true);
      setBanner({ type: 'ok', text: `"${doc.title}" created and indexed (${doc.chunkCount} chunks).` });
      void openDocument(doc.id);
    } catch (e) {
      setBanner({ type: 'err', text: errMsg(e, 'Failed to create document.') });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleEnabled = async (doc: KbDocument, next: boolean) => {
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, isEnabled: next } : d)));
    try {
      const updated = await updateKbDocument(doc.id, { isEnabled: next });
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, ...updated } : d)));
      if (detail?.id === doc.id) applyDetail(updated);
    } catch (e) {
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, isEnabled: !next } : d)));
      setBanner({ type: 'err', text: errMsg(e, 'Failed to update document.') });
    }
  };

  const detailDirty = detail != null && (detailTitle !== detail.title || detailContent !== (detail.content ?? ''));

  const handleDetailSave = async () => {
    if (!detail) return;
    const title = detailTitle.trim();
    if (!title) {
      setBanner({ type: 'err', text: 'Title is required.' });
      return;
    }
    setDetailBusy('save');
    try {
      const p: { title?: string; content?: string } = {};
      if (title !== detail.title) p.title = title;
      if (detailContent !== (detail.content ?? '')) p.content = detailContent;
      const updated = await updateKbDocument(detail.id, p);
      applyDetail(updated);
      await loadKb(true);
      setBanner({ type: 'ok', text: p.content != null ? `Saved and re-indexed (${updated.chunkCount} chunks).` : 'Saved.' });
    } catch (e) {
      setBanner({ type: 'err', text: errMsg(e, 'Failed to save document.') });
    } finally {
      setDetailBusy(null);
    }
  };

  const handleReindex = async () => {
    if (!detail) return;
    setDetailBusy('reindex');
    try {
      const updated = await reindexKbDocument(detail.id);
      applyDetail(updated);
      await loadKb(true);
      setBanner({ type: 'ok', text: `Re-indexed into ${updated.chunkCount} chunks.` });
    } catch (e) {
      setBanner({ type: 'err', text: errMsg(e, 'Re-index failed.') });
    } finally {
      setDetailBusy(null);
    }
  };

  const handleReplaceFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !detail) return;
    setDetailBusy('replace');
    try {
      const updated = await replaceKbFile(detail.id, file);
      applyDetail(updated);
      await loadKb(true);
      setBanner({
        type: updated.status === 'ready' ? 'ok' : 'err',
        text: updated.status === 'ready'
          ? `File replaced and re-indexed (${updated.chunkCount} chunks).`
          : updated.error || 'File replaced but could not be indexed.',
      });
    } catch (err) {
      setBanner({ type: 'err', text: errMsg(err, 'Replace failed.') });
    } finally {
      setDetailBusy(null);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const ok = window.confirm(`Delete "${detail.title}" from the knowledge base? The chatbot will no longer be able to use it. This cannot be undone.`);
    if (!ok) return;
    setDetailBusy('delete');
    try {
      await deleteKbDocument(detail.id);
      closeDetail();
      await loadKb(true);
      setBanner({ type: 'ok', text: 'Document deleted.' });
    } catch (e) {
      setBanner({ type: 'err', text: errMsg(e, 'Delete failed.') });
    } finally {
      setDetailBusy(null);
    }
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      setSearchResults(await searchKb(q, 5));
    } catch (e) {
      setSearchError(errMsg(e, 'Search failed.'));
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  };

  // ---- Render ------------------------------------------------------------------------
  const isLive = saved?.enabled ?? false;
  const savedInfo = isDirty
    ? 'Unsaved changes'
    : saved?.updatedAt
      ? `Saved ${formatDateTime(saved.updatedAt)}${saved.updatedBy ? ` by ${saved.updatedBy}` : ''}`
      : '';

  const saveButtons = (
    <div className={styles.actionGroup}>
      <button type="button" className={styles.ghostBtn} onClick={handleDiscard} disabled={!isDirty || saving}>Discard</button>
      <button type="button" className={styles.primaryBtn} onClick={() => void handleSave()} disabled={!isDirty || saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/admin" className={styles.backLink}>← Dashboard</Link>

        <header className={styles.pageHeader}>
          <div className={styles.pageHeaderText}>
            <h1 className={styles.pageTitle}>Website assistant</h1>
            <p className={styles.pageSubtitle}>Decide how the chat helper on playfunia.com greets visitors, answers questions, and what it is allowed to read.</p>
          </div>
          <div className={styles.pageHeaderActions}>
            <span className={styles.statusPill} data-live={isLive ? 'yes' : 'no'}>
              <span className={styles.statusDot} aria-hidden="true" />
              {saved ? (isLive ? 'Live on website' : 'Hidden from website') : 'Loading…'}
            </span>
            {activeTab === 'settings' && form && <div className={styles.headerSave}>{saveButtons}</div>}
          </div>
        </header>

        <div className={styles.summaryStrip} aria-label="Summary">
          <span>Assistant <strong>{saved ? (saved.enabled ? 'on' : 'off') : '—'}</strong></span>
          <span className={styles.summaryDivider} aria-hidden="true" />
          <span><strong>{kbStats ? kbStats.documents : '—'}</strong> {kbStats?.documents === 1 ? 'document' : 'documents'}{kbStats && kbStats.readyDocuments !== kbStats.documents ? ` (${kbStats.readyDocuments} ready)` : ''}</span>
          <span className={styles.summaryDivider} aria-hidden="true" />
          <span><strong>{kbStats ? kbStats.chunks : '—'}</strong> searchable passages</span>
        </div>

        {banner && (
          <div className={banner.type === 'ok' ? styles.noticeOk : styles.noticeErr} role="status">
            {banner.text}
          </div>
        )}

        <div className={styles.tabBar} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'settings'}
            className={`${styles.tab} ${activeTab === 'settings' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Assistant{isDirty && <span className={styles.dirtyDot} aria-label="unsaved changes" />}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'kb'}
            className={`${styles.tab} ${activeTab === 'kb' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('kb')}
          >
            Knowledge{documents.length ? <span className={styles.tabCount}>{documents.length}</span> : null}
          </button>
        </div>

        {/* ================= ASSISTANT ================= */}
        {activeTab === 'settings' && (
          <>
            {settingsState === 'loading' && <p className={styles.muted}>Loading…</p>}
            {settingsState === 'error' && (
              <div className={styles.noticeErr}>
                {settingsError}{' '}
                <button type="button" className={styles.linkBtn} onClick={() => void loadSettings()}>Try again</button>
              </div>
            )}

            {form && (
              <div className={styles.settingsGrid}>
                <div className={styles.formCol}>
                  <section className={styles.card}>
                    <h2 className={styles.cardTitle}>Availability</h2>

                    <label className={styles.toggleRow}>
                      <span className={styles.toggleText}>
                        <span className={styles.toggleLabel}>Show the assistant on the website</span>
                        <span className={styles.hint}>When off, the chat button disappears for visitors.</span>
                      </span>
                      <input
                        type="checkbox"
                        className={styles.switch}
                        checked={form.enabled}
                        onChange={(e) => patch({ enabled: e.target.checked })}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>Assistant name</span>
                      <input className={styles.input} value={form.botName} onChange={(e) => patch({ botName: e.target.value })} maxLength={60} />
                      <span className={styles.hint}>Shown at the top of the chat window.</span>
                    </label>
                  </section>

                  <section className={styles.card}>
                    <h2 className={styles.cardTitle}>How it answers</h2>

                    <div className={styles.field}>
                      <span className={styles.label}>AI engine</span>
                      {customModel ? (
                        <div className={styles.inlineRow}>
                          <input
                            className={styles.input}
                            value={form.model}
                            onChange={(e) => patch({ model: e.target.value })}
                            placeholder="Engine id, for example gpt-4o-mini"
                            aria-label="Custom engine id"
                          />
                          <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={() => { setCustomModel(false); if (!models.includes(form.model)) patch({ model: models[0] }); }}
                          >
                            Choose from list
                          </button>
                        </div>
                      ) : (
                        <>
                          <select className={styles.input} value={form.model} onChange={(e) => patch({ model: e.target.value })} aria-label="AI engine">
                            {models.map((m) => <option key={m} value={m}>{modelLabel(m)}</option>)}
                          </select>
                          <span className={styles.hint}>
                            <span className={styles.mono}>{form.model}</span>
                            {' · '}
                            <button type="button" className={styles.linkBtn} onClick={() => setCustomModel(true)}>Use a custom engine id</button>
                          </span>
                        </>
                      )}
                    </div>

                    <div className={styles.field}>
                      <span className={styles.label}>Answer style <span className={styles.labelMeta}>{styleWord(form.temperature)}</span></span>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={form.temperature}
                        className={styles.range}
                        aria-label="Answer style"
                        onChange={(e) => patch({ temperature: Number(e.target.value) })}
                      />
                      <div className={styles.rangeEnds}><span>Precise</span><span>Creative</span></div>
                      <span className={styles.hint}>Precise keeps answers consistent and factual. Creative allows more varied wording.</span>
                    </div>
                  </section>

                  <section className={styles.card}>
                    <h2 className={styles.cardTitle}>Instructions</h2>
                    <label className={styles.field}>
                      <span className={styles.label}>
                        Instructions for the assistant
                        <span className={styles.labelMeta}>{form.systemPrompt == null || !form.systemPrompt.trim() ? 'Using standard instructions' : `${form.systemPrompt.length} characters`}</span>
                      </span>
                      <textarea
                        className={styles.textarea}
                        rows={9}
                        value={form.systemPrompt ?? ''}
                        onChange={(e) => patch({ systemPrompt: e.target.value })}
                        placeholder="For example: You are the Playfunia assistant for an indoor kids' play center in Albany, NY. Be warm and brief, and always quote prices from our live information."
                      />
                      <span className={styles.hint}>Describe how it should talk, what it should help with, and what to avoid. Leave empty to use the standard instructions.</span>
                    </label>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => patch({ systemPrompt: null })}
                      disabled={form.systemPrompt == null || !form.systemPrompt.trim()}
                    >
                      Use standard instructions
                    </button>
                  </section>

                  <section className={styles.card}>
                    <h2 className={styles.cardTitle}>First impression</h2>

                    <label className={styles.field}>
                      <span className={styles.label}>Welcome message</span>
                      <textarea
                        className={styles.textarea}
                        rows={3}
                        value={form.greeting}
                        onChange={(e) => patch({ greeting: e.target.value })}
                        maxLength={500}
                      />
                      <span className={styles.hint}>The first thing visitors read when they open the chat.</span>
                    </label>

                    <div className={styles.field}>
                      <span className={styles.label}>Suggested questions</span>
                      <span className={styles.hint}>Buttons shown when the chat opens. Tapping one asks the question for the visitor.</span>
                      {form.quickPrompts.length === 0 && <p className={styles.emptyLine}>No suggestions yet. Visitors will only see the welcome message.</p>}
                      <div className={styles.listEditor}>
                        {form.quickPrompts.map((q, i) => (
                          <div key={i} className={styles.listRow}>
                            <input
                              className={`${styles.input} ${styles.emojiInput}`}
                              value={q.emoji}
                              onChange={(e) => updateQuickPrompt(i, 'emoji', e.target.value)}
                              aria-label="Emoji"
                              maxLength={4}
                            />
                            <input
                              className={styles.input}
                              value={q.label}
                              onChange={(e) => updateQuickPrompt(i, 'label', e.target.value)}
                              placeholder="Button text"
                              aria-label="Button text"
                              maxLength={60}
                            />
                            <input
                              className={styles.input}
                              value={q.prompt}
                              onChange={(e) => updateQuickPrompt(i, 'prompt', e.target.value)}
                              placeholder="Question it asks"
                              aria-label="Question it asks"
                              maxLength={300}
                            />
                            <div className={styles.rowActions}>
                              <button type="button" className={styles.iconBtn} onClick={() => moveQuickPrompt(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                              <button type="button" className={styles.iconBtn} onClick={() => moveQuickPrompt(i, 1)} disabled={i === form.quickPrompts.length - 1} aria-label="Move down">↓</button>
                              <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => removeQuickPrompt(i)} aria-label="Remove">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <button type="button" className={styles.ghostBtn} onClick={addQuickPrompt} disabled={form.quickPrompts.length >= 10}>Add a question</button>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <span className={styles.label}>Chat button hints</span>
                      <span className={styles.hint}>Short phrases that rotate next to the chat button.</span>
                      <div className={styles.chipWrap}>
                        {form.capabilityPhrases.map((p, i) => (
                          <span key={`${p}-${i}`} className={styles.chip}>
                            <span>{p}</span>
                            <button type="button" className={styles.chipBtn} onClick={() => movePhrase(i, -1)} disabled={i === 0} aria-label="Move left">‹</button>
                            <button type="button" className={styles.chipBtn} onClick={() => movePhrase(i, 1)} disabled={i === form.capabilityPhrases.length - 1} aria-label="Move right">›</button>
                            <button type="button" className={`${styles.chipBtn} ${styles.chipBtnDanger}`} onClick={() => removePhrase(i)} aria-label="Remove">✕</button>
                          </span>
                        ))}
                        {form.capabilityPhrases.length === 0 && <span className={styles.emptyLine}>No hints yet. The chat button will show without a tip.</span>}
                      </div>
                      <div className={styles.inlineRow}>
                        <input
                          className={styles.input}
                          value={newPhrase}
                          onChange={(e) => setNewPhrase(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhrase(); } }}
                          placeholder="For example: Plan a birthday party 🎂"
                          aria-label="New hint"
                          maxLength={60}
                        />
                        <button type="button" className={styles.ghostBtn} onClick={addPhrase} disabled={!newPhrase.trim() || form.capabilityPhrases.length >= 12}>Add</button>
                      </div>
                    </div>
                  </section>

                  <section className={styles.card}>
                    <h2 className={styles.cardTitle}>Knowledge use</h2>
                    <label className={styles.toggleRow}>
                      <span className={styles.toggleText}>
                        <span className={styles.toggleLabel}>Let the assistant read the knowledge library</span>
                        <span className={styles.hint}>Uses the files and notes on the Knowledge tab to answer questions our live information cannot.</span>
                      </span>
                      <input type="checkbox" className={styles.switch} checked={form.kbEnabled} onChange={(e) => patch({ kbEnabled: e.target.checked })} />
                    </label>

                    <details className={styles.advanced}>
                      <summary className={styles.advancedSummary}>Advanced</summary>
                      <div className={styles.twoCol}>
                        <label className={styles.field}>
                          <span className={styles.label}>Passages read per answer</span>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className={styles.input}
                            value={form.kbTopK}
                            disabled={!form.kbEnabled}
                            onChange={(e) => patch({ kbTopK: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                          />
                          <span className={styles.hint}>How many library passages it reads before answering. 5 is a good default.</span>
                        </label>
                        <label className={styles.field}>
                          <span className={styles.label}>Lookups allowed per answer</span>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            className={styles.input}
                            value={form.maxToolTurns}
                            onChange={(e) => patch({ maxToolTurns: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                          />
                          <span className={styles.hint}>How many times it may check prices, hours or the library for one answer.</span>
                        </label>
                      </div>
                    </details>
                  </section>

                  <p className={styles.savedInfo}>{savedInfo}</p>
                </div>

                <aside className={styles.sideCol}>
                  <section className={`${styles.card} ${styles.stickyCard}`}>
                    <h2 className={styles.cardTitle}>Try it out</h2>
                    <p className={styles.hint}>Ask a question the way a visitor would. Uses the saved settings.</p>
                    <div className={styles.tryRow}>
                      <input
                        className={styles.input}
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleTest(); } }}
                        placeholder="How much is a party for 12 kids?"
                        aria-label="Question to try"
                      />
                      <button type="button" className={styles.secondaryBtn} onClick={() => void handleTest()} disabled={testing || !testInput.trim()}>
                        {testing ? 'Thinking…' : 'Ask'}
                      </button>
                    </div>
                    {testError && <p className={styles.errText}>{testError}</p>}
                    {testResult && (
                      <div className={styles.reply}>
                        <div className={styles.replyBody}>{testResult.reply}</div>
                        {testResult.toolCalls?.length > 0 ? (
                          <>
                            <button type="button" className={styles.linkBtn} onClick={() => setShowTrace((v) => !v)}>
                              {showTrace ? 'Hide what it looked up' : `What it looked up (${testResult.toolCalls.length})`}
                            </button>
                            {showTrace && (
                              <ul className={styles.lookupList}>
                                {testResult.toolCalls.map((tc, i) => (
                                  <li key={i}>
                                    <span className={styles.lookupName}>{toolLabel(tc.tool)}</span>
                                    {tc.result_preview && <span className={styles.lookupPreview}>{tc.result_preview}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        ) : (
                          <span className={styles.meta}>Answered without looking anything up.</span>
                        )}
                      </div>
                    )}
                  </section>
                </aside>

                <div className={styles.mobileSaveBar}>
                  <span className={styles.meta}>{savedInfo}</span>
                  {saveButtons}
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= KNOWLEDGE ================= */}
        {activeTab === 'kb' && (
          <>
            {kbState === 'error' && (
              <div className={styles.noticeErr}>
                {kbError}{' '}
                <button type="button" className={styles.linkBtn} onClick={() => void loadKb()}>Try again</button>
              </div>
            )}

            <div className={styles.addRow}>
              <div
                className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ''} ${uploading ? styles.dropzoneBusy : ''}`}
                onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={uploading ? (e) => e.preventDefault() : onDrop}
                onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
                role="button"
                tabIndex={0}
                aria-label="Add files"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              >
                <input ref={fileInputRef} type="file" multiple className={styles.fileInput} onChange={onFileInput} disabled={uploading} />
                {uploading ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    <span className={styles.dropTitle}>Adding files…</span>
                    <span className={styles.hint}>Large PDFs and images can take up to a minute.</span>
                  </>
                ) : (
                  <>
                    <span className={styles.dropTitle}>Add files</span>
                    <span className={styles.hint}>Drop files here or <span className={styles.linkText}>choose files</span>. PDF, Word, Excel, text, images and more. Up to 25 MB each.</span>
                  </>
                )}
              </div>
              <div className={styles.addSide}>
                <label className={styles.field}>
                  <span className={styles.label}>Name for the next file <span className={styles.labelMeta}>optional</span></span>
                  <input
                    className={styles.input}
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Defaults to the file name"
                    maxLength={120}
                    disabled={uploading}
                  />
                </label>
                <button type="button" className={styles.secondaryBtn} onClick={() => setShowNewText((v) => !v)}>
                  {showNewText ? 'Cancel note' : 'Write a note'}
                </button>
              </div>
            </div>

            {showNewText && (
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>New note</h2>
                <label className={styles.field}>
                  <span className={styles.label}>Title</span>
                  <input className={styles.input} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="For example: Party room rules" maxLength={120} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Content</span>
                  <textarea className={styles.textarea} rows={10} value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Write or paste what the assistant should know." />
                  <span className={styles.hint}>Start a line with “## ” to make a heading and keep topics separate.</span>
                </label>
                <div className={styles.actionGroup}>
                  <button type="button" className={styles.primaryBtn} onClick={() => void handleCreateText()} disabled={creating || !newTitle.trim() || !newContent.trim()}>
                    {creating ? 'Saving…' : 'Save note'}
                  </button>
                </div>
              </section>
            )}

            <div className={selectedId != null ? styles.kbSplit : undefined}>
              <section className={styles.card}>
                <div className={styles.cardHeaderRow}>
                  <h2 className={styles.cardTitle}>Documents</h2>
                  <button type="button" className={styles.linkBtn} onClick={() => void loadKb()} disabled={kbState === 'loading'}>Reload list</button>
                </div>
                {kbState === 'loading' && documents.length === 0 && (
                  <div className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div>
                )}
                {kbState !== 'loading' && documents.length === 0 && (
                  <div className={styles.emptyState}>
                    <p>Nothing here yet. Add a file or write a note so the assistant has something to read.</p>
                    <button type="button" className={styles.secondaryBtn} onClick={() => fileInputRef.current?.click()}>Add files</button>
                  </div>
                )}
                {documents.length > 0 && (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Size</th>
                          <th>Status</th>
                          <th>Passages</th>
                          <th>In use</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((d) => (
                          <tr
                            key={d.id}
                            className={`${styles.docRow} ${selectedId === d.id ? styles.docRowActive : ''} ${!d.isEnabled ? styles.rowOff : ''}`}
                            onClick={() => void openDocument(d.id)}
                          >
                            <td data-label="Name" className={styles.nameCell}>
                              <span className={styles.docName}>{d.title}</span>
                              {d.sourceType === 'file' && d.fileName && d.fileName !== d.title && <span className={styles.meta}>{d.fileName}</span>}
                              {d.error && <span className={styles.errText}>{d.error}</span>}
                            </td>
                            <td data-label="Type">{typeLabel(d)}</td>
                            <td data-label="Size">{d.sourceType === 'file' ? formatBytes(d.fileSize) : `${Math.max(1, Math.round(d.contentLength / 1000))}k characters`}</td>
                            <td data-label="Status"><span className={styles.status} data-status={d.status}>{statusLabel(d.status)}</span></td>
                            <td data-label="Passages">{d.chunkCount}</td>
                            <td data-label="In use" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className={styles.switch}
                                checked={d.isEnabled}
                                onChange={(e) => void handleToggleEnabled(d, e.target.checked)}
                                aria-label={`Use ${d.title}`}
                              />
                            </td>
                            <td data-label="Updated">{formatDateTime(d.updatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {selectedId != null && (
                <aside className={`${styles.card} ${styles.detailPanel}`}>
                  <div className={styles.cardHeaderRow}>
                    <h2 className={styles.cardTitle}>{detail ? (detail.sourceType === 'file' ? 'File' : 'Note') : 'Document'}</h2>
                    <button type="button" className={styles.iconBtn} onClick={closeDetail} aria-label="Close">✕</button>
                  </div>
                  {detailState === 'loading' && <p className={styles.muted}>Loading…</p>}
                  {detailState === 'error' && <p className={styles.errText}>This document could not be opened.</p>}
                  {detail && (
                    <>
                      <div className={styles.detailMeta}>
                        <span className={styles.status} data-status={detail.status}>{statusLabel(detail.status)}</span>
                        <span className={styles.meta}>{detail.chunkCount} passages</span>
                        {detail.sourceType === 'file' && <span className={styles.meta}>{detail.fileName} · {formatBytes(detail.fileSize)}</span>}
                        <span className={styles.meta}>Updated {formatDateTime(detail.updatedAt)}</span>
                        {detail.createdBy && <span className={styles.meta}>by {detail.createdBy}</span>}
                      </div>
                      {detail.error && <p className={styles.errText}>{detail.error}</p>}

                      <label className={styles.field}>
                        <span className={styles.label}>Title</span>
                        <input className={styles.input} value={detailTitle} onChange={(e) => setDetailTitle(e.target.value)} maxLength={120} />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>
                          Content the assistant can read
                          <span className={styles.labelMeta}>{detailContent.length.toLocaleString()} characters</span>
                        </span>
                        <textarea
                          className={`${styles.textarea} ${styles.contentEditor}`}
                          rows={16}
                          value={detailContent}
                          onChange={(e) => setDetailContent(e.target.value)}
                          placeholder={detail.status === 'unsearchable' ? 'We could not read any text from this file. Type a description here and save it so the assistant can use it.' : ''}
                        />
                        {detail.sourceType === 'file' && <span className={styles.hint}>This text was read from the file. Edits here replace it.</span>}
                      </label>

                      <div className={styles.detailActions}>
                        <button type="button" className={styles.primaryBtn} onClick={() => void handleDetailSave()} disabled={!detailDirty || detailBusy != null}>
                          {detailBusy === 'save' ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => void handleReindex()}
                          disabled={detailBusy != null || !detailContent.trim()}
                          title="Rebuild the searchable passages from the content"
                        >
                          {detailBusy === 'reindex' ? 'Refreshing…' : 'Refresh'}
                        </button>
                        {detail.sourceType === 'file' && (
                          <>
                            <input ref={replaceInputRef} type="file" className={styles.fileInput} onChange={(e) => void handleReplaceFile(e)} />
                            <button type="button" className={styles.ghostBtn} onClick={() => replaceInputRef.current?.click()} disabled={detailBusy != null}>
                              {detailBusy === 'replace' ? 'Uploading…' : 'Upload new version'}
                            </button>
                          </>
                        )}
                        {detail.downloadUrl && (
                          <a className={styles.ghostBtn} href={detail.downloadUrl} target="_blank" rel="noopener noreferrer">Download</a>
                        )}
                        <button type="button" className={styles.dangerLink} onClick={() => void handleDelete()} disabled={detailBusy != null}>
                          {detailBusy === 'delete' ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </>
                  )}
                </aside>
              )}
            </div>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Check what it finds</h2>
              <p className={styles.hint}>Type a question to see which passages the assistant would read. Only documents marked “in use” and ready are searched.</p>
              <div className={styles.tryRow}>
                <input
                  className={styles.input}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSearch(); } }}
                  placeholder="Can we bring our own cake?"
                  aria-label="Question to check"
                />
                <button type="button" className={styles.secondaryBtn} onClick={() => void handleSearch()} disabled={searching || !searchQuery.trim()}>
                  {searching ? 'Checking…' : 'Check'}
                </button>
              </div>
              {searchError && <p className={styles.errText}>{searchError}</p>}
              {searchResults && searchResults.length === 0 && <p className={styles.emptyLine}>Nothing matched. Try different words or add a document about this.</p>}
              {searchResults && searchResults.length > 0 && (
                <ol className={styles.results}>
                  {searchResults.map((r) => (
                    <li key={r.chunkId} className={styles.resultItem}>
                      <div className={styles.resultHead}>
                        <button type="button" className={styles.linkBtn} onClick={() => void openDocument(r.documentId)}>{r.title}</button>
                        <span className={styles.match} data-match={matchKey(r.similarity)}>
                          {matchWord(r.similarity)} <span className={styles.meta}>{(r.similarity * 100).toFixed(0)}%</span>
                        </span>
                      </div>
                      <p className={styles.resultText}>{r.content}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
