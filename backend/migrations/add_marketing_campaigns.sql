-- Marketing campaigns: saved history + per-recipient delivery status.
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    campaign_id SERIAL PRIMARY KEY,
    created_by INTEGER REFERENCES public.users(user_id) ON DELETE SET NULL,
    channel VARCHAR(10) NOT NULL,            -- 'email' | 'sms' | 'both'
    subject VARCHAR(300),
    email_body TEXT,
    sms_body TEXT,
    promo_codes TEXT[] DEFAULT '{}',
    birthday_months INTEGER[] DEFAULT '{}',  -- target months 1-12 (empty = all opted-in)
    audience_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    is_test BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'sent',       -- 'sent' | 'partial' | 'failed'
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_recipients (
    recipient_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES public.marketing_campaigns(campaign_id) ON DELETE CASCADE,
    name VARCHAR(200),
    email VARCHAR(200),
    phone VARCHAR(50),
    channel VARCHAR(10) NOT NULL,            -- 'email' | 'sms'
    status VARCHAR(20) NOT NULL,             -- 'sent' | 'failed'
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_recipients_campaign
    ON public.marketing_recipients(campaign_id);
