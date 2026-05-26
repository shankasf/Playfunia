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
  type MarketingCampaign,
} from '../api/marketing';
import styles from './AdminMarketingPage.module.css';

type LoadState = 'idle' | 'loading' | 'error';

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
  const [testEmail, setTestEmail] = useState(user?.email ?? '');
  const [testPhone, setTestPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const wantEmail = channel === 'email' || channel === 'both';
  const wantSms = channel === 'sms' || channel === 'both';

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
  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        const p = await previewMarketingAudience({ months: Array.from(selectedMonths), channel });
        setPreview(p);
      } catch {
        setPreview(null);
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
    const n = preview?.uniqueCount ?? 0;
    if (n === 0) {
      setBanner({ type: 'err', text: 'No opted-in recipients match this audience.' });
      return;
    }
    const seg = selectedMonthLabels.length ? `birthdays in ${selectedMonthLabels.join(', ')}` : 'all opted-in contacts';
    if (!window.confirm(`Send this ${channel.toUpperCase()} campaign to ${n} opted-in recipient(s) (${seg})? This cannot be undone.`)) return;
    void doSend(false);
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

        {/* Step 1: Birthday segment */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>1 · Birthday segment</h2>
          <p className={styles.panelHint}>Pick one or more months to target families with a child's birthday then. Leave all unselected to reach every opted-in contact. Counts show opted-in reach.</p>
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
              {wantEmail && <span><strong>{preview?.emailCount ?? 0}</strong> email</span>}
              {wantSms && <span><strong>{preview?.smsCount ?? 0}</strong> SMS</span>}
              <span className={styles.audienceUnique}><strong>{preview?.uniqueCount ?? 0}</strong> unique opted-in recipient(s)</span>
            </div>
            {preview?.sample && preview.sample.length > 0 && (
              <p className={styles.sample}>e.g. {preview.sample.slice(0, 4).map((s) => s.name || s.email || s.phone).join(', ')}…</p>
            )}
          </div>

          <div className={styles.sendRow}>
            <div className={styles.testInputs}>
              {wantEmail && <input className={styles.input} placeholder="Test email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />}
              {wantSms && <input className={styles.input} placeholder="Test phone (+1…)" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />}
              <button type="button" className={styles.ghostBtn} onClick={() => doSend(true)} disabled={sending || !contentValid}>
                {sending ? 'Sending…' : 'Send test'}
              </button>
            </div>
            <button type="button" className={styles.primaryBtn} onClick={handleSendBulk} disabled={sending || !contentValid}>
              {sending ? 'Sending…' : `Send to ${preview?.uniqueCount ?? 0} recipient(s)`}
            </button>
          </div>
          {!contentValid && <p className={styles.warn}>Fill in the {wantEmail ? 'subject + email body' : ''}{wantEmail && wantSms ? ' and ' : ''}{wantSms ? 'SMS body' : ''} before sending.</p>}
        </section>

        {/* History */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Campaign history</h2>
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
                      <td>{c.created_at ? formatDate(c.created_at) : '—'}{c.is_test ? ' (test)' : ''}</td>
                      <td>{c.channel}</td>
                      <td className={styles.subjectCell}>{c.subject || c.sms_body || '—'}</td>
                      <td>{c.audience_count}</td>
                      <td className={styles.ok}>{c.sent_count}</td>
                      <td className={c.failed_count > 0 ? styles.bad : undefined}>{c.failed_count}</td>
                      <td><span className={styles.statusBadge} data-status={c.status}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
