import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/dateUtils';
import {
  fetchMarketingStats,
  fetchLivePromos,
  previewMarketingAudience,
  draftMarketingMessage,
  sendMarketingCampaign,
  fetchMarketingCampaigns,
  type MarketingStats,
  type LivePromo,
  type MarketingChannel,
  type AudiencePreview,
  type AudienceRecipient,
  type MarketingCampaign,
} from '../api/marketing';
import styles from './AdminMarketingPage.module.css';

type LoadState = 'idle' | 'loading' | 'error';

const RECIPIENTS_PER_PAGE = 10;

function promoLabel(p: LivePromo): string {
  const discount = p.percent_off ? `${p.percent_off}% off` : p.amount_off_usd ? `$${p.amount_off_usd} off` : '';
  return discount ? `${p.code} · ${discount}` : p.code;
}

export function AdminMarketingPage() {
  const { user } = useAuth();

  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [statsState, setStatsState] = useState<LoadState>('idle');
  const [promos, setPromos] = useState<LivePromo[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);

  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());
  const [channel, setChannel] = useState<MarketingChannel>('email');
  const [selectedPromos, setSelectedPromos] = useState<Set<string>>(new Set());

  const [intent, setIntent] = useState('');
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [drafting, setDrafting] = useState(false);

  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [recipientPage, setRecipientPage] = useState(0);
  const [testEmail, setTestEmail] = useState(user?.email ?? '');
  const [testPhone, setTestPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'campaign' | 'history'>('campaign');

  const wantEmail = channel === 'email' || channel === 'both';
  const wantSms = channel === 'sms' || channel === 'both';

  // Audience only counts when a segment is explicitly selected; otherwise 0
  // (we never silently default a bulk send to the entire opted-in list).
  const hasSegment = selectedMonths.size > 0;
  const recipients = useMemo<AudienceRecipient[]>(
    () => (hasSegment ? preview?.recipients ?? [] : []),
    [hasSegment, preview],
  );
  // Counts reflect the rows the admin currently has checked.
  const selectedRecipients = useMemo(
    () => recipients.filter((r) => selectedKeys.has(r.key)),
    [recipients, selectedKeys],
  );
  const emailCount = selectedRecipients.filter((r) => r.viaEmail).length;
  const smsCount = selectedRecipients.filter((r) => r.viaSms).length;
  const uniqueCount = selectedRecipients.length;

  const pageCount = Math.max(1, Math.ceil(recipients.length / RECIPIENTS_PER_PAGE));
  const safePage = Math.min(recipientPage, pageCount - 1);
  const visibleRecipients = recipients.slice(
    safePage * RECIPIENTS_PER_PAGE,
    safePage * RECIPIENTS_PER_PAGE + RECIPIENTS_PER_PAGE,
  );

  const loadAll = useCallback(async () => {
    setStatsState('loading');
    try {
      const [s, p, c] = await Promise.all([fetchMarketingStats(), fetchLivePromos(), fetchMarketingCampaigns()]);
      setStats(s);
      setPromos(p);
      setCampaigns(c);
      setStatsState('idle');
    } catch (e) {
      setStatsState('error');
      setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Failed to load marketing data.' });
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Live audience preview whenever months/channel change (debounced).
  // Recompute the audience and default every recipient to selected.
  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        const p = await previewMarketingAudience({ months: Array.from(selectedMonths), channel });
        setPreview(p);
        setSelectedKeys(new Set(p.recipients.map((r) => r.key)));
        setRecipientPage(0);
      } catch {
        setPreview(null);
        setSelectedKeys(new Set());
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [selectedMonths, channel]);

  const toggleMonth = (m: number) => {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  };

  const togglePromo = (code: string) => {
    setSelectedPromos((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const toggleRecipient = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allSelected = recipients.length > 0 && selectedKeys.size === recipients.length;
  const toggleSelectAll = () => {
    setSelectedKeys(allSelected ? new Set() : new Set(recipients.map((r) => r.key)));
  };

  const selectedMonthLabels = useMemo(
    () => (stats?.months ?? []).filter((m) => selectedMonths.has(m.month)).map((m) => m.label),
    [stats, selectedMonths],
  );

  const handleDraft = async () => {
    setDrafting(true);
    setBanner(null);
    try {
      const promoObjs = promos
        .filter((p) => selectedPromos.has(p.code))
        .map((p) => ({ code: p.code, description: p.description }));
      const draft = await draftMarketingMessage({ intent, promoCodes: promoObjs, months: Array.from(selectedMonths), channel });
      if (wantEmail) {
        setSubject(draft.subject);
        setEmailBody(draft.emailBody);
      }
      if (wantSms) setSmsBody(draft.smsBody);
      setBanner({ type: 'ok', text: 'Draft generated with GPT-4o. Review and edit before sending.' });
    } catch (e) {
      setBanner({ type: 'err', text: e instanceof Error ? e.message : 'AI draft failed.' });
    } finally {
      setDrafting(false);
    }
  };

  const contentValid = (!wantEmail || (subject.trim() && emailBody.trim())) && (!wantSms || smsBody.trim());

  const doSend = async (isTest: boolean) => {
    setSending(true);
    setBanner(null);
    try {
      const result = await sendMarketingCampaign({
        channel,
        subject: wantEmail ? subject : undefined,
        emailBody: wantEmail ? emailBody : undefined,
        smsBody: wantSms ? smsBody : undefined,
        promoCodes: Array.from(selectedPromos),
        months: Array.from(selectedMonths),
        isTest,
        testEmail: testEmail || undefined,
        testPhone: testPhone || undefined,
        selectedKeys: isTest ? undefined : Array.from(selectedKeys),
      });
      setBanner({
        type: result.failed > 0 ? 'err' : 'ok',
        text: `${isTest ? 'Test' : 'Campaign'} sent — ${result.sent} delivered, ${result.failed} failed${isTest ? '' : ` to ${result.audienceCount} recipients`}.`,
      });
      if (!isTest) void fetchMarketingCampaigns().then(setCampaigns);
    } catch (e) {
      setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Send failed.' });
    } finally {
      setSending(false);
    }
  };

  const handleSendBulk = () => {
    const n = uniqueCount;
    if (!hasSegment) {
      setBanner({ type: 'err', text: 'Select at least one birthday month before sending.' });
      return;
    }
    if (n === 0) {
      setBanner({ type: 'err', text: 'No opted-in recipients match this audience.' });
      return;
    }
    const seg = `birthdays in ${selectedMonthLabels.join(', ')}`;
    const ok = window.confirm(
      `This will send a ${channel.toUpperCase()} message to ${n} ${n === 1 ? 'person' : 'people'} (${seg}). Are you sure you want to send now? This cannot be undone.`,
    );
    if (!ok) return;
    void doSend(false);
  };

  const handleSendTest = () => {
    const where = [
      wantEmail && testEmail.trim() ? testEmail.trim() : null,
      wantSms && testPhone.trim() ? testPhone.trim() : null,
    ].filter(Boolean).join(' and ');
    if (!where) {
      setBanner({ type: 'err', text: `Enter a test ${wantEmail ? 'email' : ''}${wantEmail && wantSms ? ' / ' : ''}${wantSms ? 'phone' : ''} first.` });
      return;
    }
    const ok = window.confirm(`This will send a test ${channel.toUpperCase()} message to ${where}. Are you sure you want to send now?`);
    if (!ok) return;
    void doSend(true);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/admin" className={styles.backLink}>&larr; Back to Dashboard</Link>

        <header className={styles.hero}>
          <div>
            <span className={styles.kicker}>Marketing</span>
            <h1>Campaigns &amp; Promotions</h1>
            <p>Target families by their child's birthday month, feature live promo codes, draft copy with GPT-4o, and send to opted-in customers via email &amp; SMS.</p>
          </div>
        </header>

        {stats && (
          <div className={styles.statRow}>
            <div className={styles.statCard}><span className={styles.statValue}>{stats.totals.contacts}</span><span className={styles.statLabel}>Total contacts</span></div>
            <div className={`${styles.statCard} ${styles.statEmail}`}><span className={styles.statValue}>{stats.totals.emailOptIn}</span><span className={styles.statLabel}>Email opt-in</span></div>
            <div className={`${styles.statCard} ${styles.statSms}`}><span className={styles.statValue}>{stats.totals.smsOptIn}</span><span className={styles.statLabel}>SMS opt-in</span></div>
          </div>
        )}

        {banner && <div className={banner.type === 'ok' ? styles.bannerOk : styles.bannerErr}>{banner.text}</div>}
        {statsState === 'loading' && <p className={styles.muted}>Loading marketing data...</p>}

        {/* Tabs */}
        <div className={styles.tabBar} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'campaign'}
            className={`${styles.tabBtn} ${activeTab === 'campaign' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('campaign')}
          >
            New campaign
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`${styles.tabBtn} ${activeTab === 'history' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History{campaigns.length ? ` (${campaigns.length})` : ''}
          </button>
        </div>

        {activeTab === 'campaign' && (
        <>
        {/* Step 1: Birthday segment */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>1 · Birthday segment</h2>
          <p className={styles.panelHint}>Pick one or more months to target families with a child's birthday then. You must select at least one month — bulk send stays disabled until you do. Counts show opted-in reach.</p>
          <div className={styles.monthGrid}>
            {(stats?.months ?? []).map((m) => {
              const active = selectedMonths.has(m.month);
              return (
                <button type="button" key={m.month} className={`${styles.monthCard} ${active ? styles.monthCardActive : ''}`} onClick={() => toggleMonth(m.month)}>
                  <span className={styles.monthName}>{m.label}</span>
                  <span className={styles.monthTotal}>{m.total}</span>
                  <span className={styles.monthReach}>✉ {m.emailReachable} · ✆ {m.smsReachable}</span>
                </button>
              );
            })}
          </div>
          {selectedMonths.size > 0 && (
            <button type="button" className={styles.linkBtn} onClick={() => setSelectedMonths(new Set())}>Clear month selection</button>
          )}
        </section>

        {/* Step 2: Channel */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>2 · Channel</h2>
          <div className={styles.segmented}>
            {(['email', 'sms', 'both'] as MarketingChannel[]).map((ch) => (
              <button type="button" key={ch} className={`${styles.segBtn} ${channel === ch ? styles.segBtnActive : ''}`} onClick={() => setChannel(ch)}>
                {ch === 'email' ? 'Email' : ch === 'sms' ? 'SMS' : 'Email + SMS'}
              </button>
            ))}
          </div>
        </section>

        {/* Step 3: Promo codes */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>3 · Promo codes <span className={styles.subtle}>(live only)</span></h2>
          {promos.length === 0 ? (
            <p className={styles.muted}>No live promo codes right now. Create one under Coupons to feature it here.</p>
          ) : (
            <div className={styles.chipWrap}>
              {promos.map((p) => (
                <button type="button" key={p.code} className={`${styles.chip} ${selectedPromos.has(p.code) ? styles.chipActive : ''}`} onClick={() => togglePromo(p.code)}>
                  {promoLabel(p)}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Step 4: Compose with AI */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>4 · Compose</h2>
          <label className={styles.field}>
            <span>What should this message say? (notes for the AI)</span>
            <textarea
              className={styles.textarea}
              rows={2}
              placeholder="e.g. Invite May birthday families to book a party, mention the free goody bag and the promo code."
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
          </label>
          <button type="button" className={styles.aiBtn} onClick={handleDraft} disabled={drafting}>
            {drafting ? 'Drafting with GPT-4o…' : '✨ Draft with GPT-4o'}
          </button>

          {wantEmail && (
            <>
              <label className={styles.field}>
                <span>Email subject</span>
                <input className={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
              </label>
              <label className={styles.field}>
                <span>Email body</span>
                <textarea className={styles.textarea} rows={8} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
              </label>
            </>
          )}
          {wantSms && (
            <label className={styles.field}>
              <span>SMS body <span className={styles.subtle}>({smsBody.length} chars · "Reply STOP" footer added automatically)</span></span>
              <textarea className={styles.textarea} rows={4} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} maxLength={1000} />
            </label>
          )}
        </section>

        {/* Step 5: Audience + send */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>5 · Review &amp; send</h2>
          <div className={styles.audienceBox}>
            <div className={styles.audienceCounts}>
              {wantEmail && <span><strong>{emailCount}</strong> email</span>}
              {wantSms && <span><strong>{smsCount}</strong> SMS</span>}
              <span className={styles.audienceUnique}><strong>{uniqueCount}</strong> selected of {recipients.length} opted-in</span>
            </div>
            {!hasSegment && <p className={styles.sample}>Select at least one birthday month above to build an audience.</p>}
            {hasSegment && recipients.length === 0 && (
              <p className={styles.sample}>No opted-in recipients match this segment / channel.</p>
            )}
          </div>

          {hasSegment && recipients.length > 0 && (
            <div className={styles.recipientsWrap}>
              <div className={styles.recipientsBar}>
                <span>{uniqueCount} of {recipients.length} selected</span>
                <div className={styles.recipientsActions}>
                  <button type="button" className={styles.linkBtn} onClick={() => setSelectedKeys(new Set(recipients.map((r) => r.key)))}>Select all</button>
                  <button type="button" className={styles.linkBtn} onClick={() => setSelectedKeys(new Set())}>Clear all</button>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.recipientsTable}>
                  <thead>
                    <tr>
                      <th className={styles.checkCol}>
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all recipients" />
                      </th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Reach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecipients.map((r) => {
                      const checked = selectedKeys.has(r.key);
                      return (
                        <tr key={r.key} className={checked ? undefined : styles.rowOff} onClick={() => toggleRecipient(r.key)}>
                          <td className={styles.checkCol} data-label="Select">
                            <input type="checkbox" checked={checked} onChange={() => toggleRecipient(r.key)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${r.name}`} />
                          </td>
                          <td data-label="Name">{r.name}</td>
                          <td data-label="Email">{r.email || '—'}</td>
                          <td data-label="Phone">{r.phone || '—'}</td>
                          <td data-label="Reach">{[r.viaEmail ? '✉' : '', r.viaSms ? '✆' : ''].filter(Boolean).join(' ') || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className={styles.pagination}>
                  <button type="button" className={styles.pageBtn} onClick={() => setRecipientPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>‹ Prev</button>
                  <span className={styles.pageInfo}>Page {safePage + 1} of {pageCount}</span>
                  <button type="button" className={styles.pageBtn} onClick={() => setRecipientPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>Next ›</button>
                </div>
              )}
            </div>
          )}

          <div className={styles.sendRow}>
            <div className={styles.testInputs}>
              {wantEmail && <input className={styles.input} placeholder="Test email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />}
              {wantSms && <input className={styles.input} placeholder="Test phone (+1…)" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />}
              <button type="button" className={styles.ghostBtn} onClick={handleSendTest} disabled={sending || !contentValid}>
                {sending ? 'Sending…' : 'Send test'}
              </button>
            </div>
            <button type="button" className={styles.primaryBtn} onClick={handleSendBulk} disabled={sending || !contentValid || uniqueCount === 0}>
              {sending ? 'Sending…' : `Send to ${uniqueCount} recipient(s)`}
            </button>
          </div>
          {!contentValid && <p className={styles.warn}>Fill in the {wantEmail ? 'subject + email body' : ''}{wantEmail && wantSms ? ' and ' : ''}{wantSms ? 'SMS body' : ''} before sending.</p>}
        </section>
        </>
        )}

        {/* History */}
        {activeTab === 'history' && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Campaign history <span className={styles.subtle}>(all sends &amp; tests)</span></h2>
          {campaigns.length === 0 ? (
            <p className={styles.muted}>No campaigns sent yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Date</th><th>Channel</th><th>Subject / SMS</th><th>Audience</th><th>Sent</th><th>Failed</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.campaign_id}>
                      <td data-label="Date">{c.created_at ? formatDate(c.created_at) : '—'}{c.is_test ? ' (test)' : ''}</td>
                      <td data-label="Channel">{c.channel}</td>
                      <td className={styles.subjectCell} data-label="Subject / SMS">{c.subject || c.sms_body || '—'}</td>
                      <td data-label="Audience">{c.audience_count}</td>
                      <td className={styles.ok} data-label="Sent">{c.sent_count}</td>
                      <td className={c.failed_count > 0 ? styles.bad : undefined} data-label="Failed">{c.failed_count}</td>
                      <td data-label="Status"><span className={styles.statusBadge} data-status={c.status}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
