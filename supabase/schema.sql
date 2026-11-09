-- ============================================================================
-- OLIFINANÇAS 🫒 - GESTÃO FINANCEIRA EXTRA VIRGEM (BRUNO & NÚBIA)
-- Script SQL para Supabase (PostgreSQL)
-- Como usar: Copie todo este conteúdo, abra o painel do seu projeto no Supabase,
-- vá em "SQL Editor" -> "New Query", cole e clique em "Run".
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.users_profile (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    avatar_color TEXT DEFAULT '#84cc16',
    default_income NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('CHECKING', 'CREDIT_CARD', 'INVESTMENT')),
    owner_id TEXT REFERENCES public.users_profile(id) ON DELETE SET NULL,
    closing_day INTEGER,
    due_day INTEGER,
    monthly_target NUMERIC(12, 2) DEFAULT 0.00,
    color TEXT DEFAULT '#84cc16',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME', 'TRANSFER')),
    icon TEXT DEFAULT 'folder',
    color TEXT DEFAULT '#84cc16',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subcategories (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    default_ownership TEXT NOT NULL DEFAULT 'COLLECTIVE' CHECK (default_ownership IN ('COLLECTIVE', 'INDIVIDUAL_BRUNO', 'INDIVIDUAL_NUBIA')),
    default_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    default_meta NUMERIC(12, 2) DEFAULT 0.00,
    is_fixed BOOLEAN DEFAULT FALSE,
    keywords TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.budget_projections (
    id TEXT PRIMARY KEY,
    month_year TEXT NOT NULL,
    subcategory_id TEXT REFERENCES public.subcategories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    planned_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    ownership TEXT NOT NULL DEFAULT 'COLLECTIVE' CHECK (ownership IN ('COLLECTIVE', 'INDIVIDUAL_BRUNO', 'INDIVIDUAL_NUBIA')),
    is_fixed BOOLEAN DEFAULT FALSE,
    due_day INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    transaction_date DATE NOT NULL,
    competence_month TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME', 'TRANSFER')),
    account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    paid_by_user_id TEXT REFERENCES public.users_profile(id) ON DELETE SET NULL,
    ownership TEXT NOT NULL DEFAULT 'COLLECTIVE' CHECK (ownership IN ('COLLECTIVE', 'INDIVIDUAL_BRUNO', 'INDIVIDUAL_NUBIA')),
    subcategory_id TEXT REFERENCES public.subcategories(id) ON DELETE SET NULL,
    projection_id TEXT REFERENCES public.budget_projections(id) ON DELETE SET NULL,
    installment_current INTEGER DEFAULT 1,
    installment_total INTEGER DEFAULT 1,
    installment_group_id TEXT,
    import_hash TEXT UNIQUE,
    reconciled BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_state_sync (
    household_id TEXT PRIMARY KEY DEFAULT 'olifinancas_bruno_nubia',
    state_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_competence ON public.transactions(competence_month);
CREATE INDEX IF NOT EXISTS idx_transactions_projection ON public.transactions(projection_id);
CREATE INDEX IF NOT EXISTS idx_projections_month ON public.budget_projections(month_year);

ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_state_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso Total Casal users" ON public.users_profile;
CREATE POLICY "Acesso Total Casal users" ON public.users_profile FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Casal accounts" ON public.accounts;
CREATE POLICY "Acesso Total Casal accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Casal categories" ON public.categories;
CREATE POLICY "Acesso Total Casal categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Casal subcategories" ON public.subcategories;
CREATE POLICY "Acesso Total Casal subcategories" ON public.subcategories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Casal projections" ON public.budget_projections;
CREATE POLICY "Acesso Total Casal projections" ON public.budget_projections FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Casal transactions" ON public.transactions;
CREATE POLICY "Acesso Total Casal transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Casal app_state_sync" ON public.app_state_sync;
CREATE POLICY "Acesso Total Casal app_state_sync" ON public.app_state_sync FOR ALL USING (true) WITH CHECK (true);
