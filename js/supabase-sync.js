// ============================================================================
// OLIFINANÇAS 🫒 - CAMADA DE SINCRONIZAÇÃO COM SUPABASE (REST + REALTIME)
// Compatível nativamente com chaves sb_publishable_... e chaves JWT anon
// ============================================================================

window.SupabaseSync = {
  client: null,
  channel: null,
  STORAGE_CONFIG_KEY: "olifinancas_supabase_config",
  DEFAULT_URL: "https://djfkcaievgrcxdfynckd.supabase.co",
  DEFAULT_ANON_KEY: "sb_publishable_LVDqHv91V0b-gbq5zmPGWQ__V54RpdG",

  normalizeUrl(url) {
    return (url || "")
      .trim()
      .replace(/\/rest\/v1\/?$/i, "")
      .replace(/\/$/, "");
  },

  getConfig() {
    try {
      const raw = localStorage.getItem(this.STORAGE_CONFIG_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        url: this.normalizeUrl(parsed.url || this.DEFAULT_URL),
        anonKey: (parsed.anonKey || this.DEFAULT_ANON_KEY || "").trim(),
        autoSync: parsed.autoSync !== undefined ? parsed.autoSync : true
      };
    } catch (e) {
      return { url: this.DEFAULT_URL, anonKey: this.DEFAULT_ANON_KEY, autoSync: true };
    }
  },

  saveConfig(url, anonKey, autoSync = true) {
    const cleanUrl = this.normalizeUrl(url || this.DEFAULT_URL);
    const cleanKey = (anonKey || this.DEFAULT_ANON_KEY || "").trim();
    const cfg = { url: cleanUrl, anonKey: cleanKey, autoSync };
    localStorage.setItem(this.STORAGE_CONFIG_KEY, JSON.stringify(cfg));
    return this.initClient();
  },

  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg.url && cfg.anonKey);
  },

  getHeaders(prefer = "resolution=merge-duplicates,return=minimal") {
    const cfg = this.getConfig();
    const headers = {
      apikey: cfg.anonKey,
      "Content-Type": "application/json"
    };
    if (prefer) {
      headers.Prefer = prefer;
    }
    if (cfg.anonKey.startsWith("eyJ")) {
      headers.Authorization = `Bearer ${cfg.anonKey}`;
    }
    return headers;
  },

  async restUpsert(table, payload) {
    const cfg = this.getConfig();
    const res = await fetch(`${cfg.url}/rest/v1/${table}`, {
      method: "POST",
      headers: this.getHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro Supabase [${table}]: ${errText}`);
    }
    return true;
  },

  initClient(onRemoteChangeCallback) {
    const cfg = this.getConfig();
    if (!cfg.url || !cfg.anonKey) {
      this.client = null;
      return false;
    }

    try {
      if (window.supabase) {
        this.client = window.supabase.createClient(cfg.url, cfg.anonKey);
        if (onRemoteChangeCallback) {
          if (this.channel) {
            this.client.removeChannel(this.channel);
          }
          this.channel = this.client
            .channel("olifinancas_sync_channel")
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "app_state_sync" },
              (payload) => {
                if (payload.new && payload.new.state_json) {
                  onRemoteChangeCallback(payload.new.state_json, payload.new.updated_by);
                }
              }
            )
            .subscribe();
        }
      }
      return true;
    } catch (err) {
      console.warn("Aviso Realtime Supabase (REST segue ativo):", err);
      return true;
    }
  },

  async pushState(state, updatedBy = "Bruno") {
    if (!this.isConfigured()) {
      throw new Error("Supabase não configurado. Informe a URL e a Anon Key na aba Nuvem.");
    }

    // 1. Grava o snapshot JSONB principal via REST direto
    await this.restUpsert("app_state_sync", [
      {
        household_id: "olifinancas_bruno_nubia",
        state_json: state,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy
      }
    ]);

    // 2. Sincroniza as tabelas SQL relacionais em sequência (respeitando Foreign Keys)
    try {
      if (state.users?.length) {
        await this.restUpsert(
          "users_profile",
          state.users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email || null,
            avatar_color: u.avatarColor || "#84cc16",
            default_income: u.defaultIncome || 0
          }))
        );
      }

      if (state.accounts?.length) {
        await this.restUpsert(
          "accounts",
          state.accounts.map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            owner_id: a.ownerId || null,
            closing_day: a.closingDay || null,
            due_day: a.dueDay || null,
            monthly_target: a.monthlyTarget || 0,
            color: a.color || "#84cc16"
          }))
        );
      }

      if (state.categories?.length) {
        await this.restUpsert(
          "categories",
          state.categories.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            icon: c.icon || "folder",
            color: c.color || "#84cc16",
            sort_order: c.sortOrder || 0
          }))
        );
      }

      if (state.subcategories?.length) {
        await this.restUpsert(
          "subcategories",
          state.subcategories.map(s => ({
            id: s.id,
            category_id: s.categoryId,
            name: s.name,
            default_ownership: s.defaultOwnership || "COLLECTIVE",
            default_account_id: s.defaultAccountId || null,
            default_meta: s.defaultMeta || 0,
            is_fixed: Boolean(s.isFixed),
            keywords: s.keywords || []
          }))
        );
      }

      if (state.projections?.length) {
        await this.restUpsert(
          "budget_projections",
          state.projections.map(p => ({
            id: p.id,
            month_year: p.monthYear,
            subcategory_id: p.subcategoryId || null,
            title: p.title,
            planned_amount: p.plannedAmount || 0,
            account_id: p.accountId || null,
            ownership: p.ownership || "COLLECTIVE",
            is_fixed: Boolean(p.isFixed),
            due_day: p.dueDay || null
          }))
        );
      }

      if (state.transactions?.length) {
        await this.restUpsert(
          "transactions",
          state.transactions.map(t => ({
            id: t.id,
            transaction_date: t.transactionDate,
            competence_month: t.competenceMonth,
            description: t.description,
            amount: t.amount,
            type: t.type,
            account_id: t.accountId || null,
            paid_by_user_id: t.paidByUserId || null,
            ownership: t.ownership || "COLLECTIVE",
            subcategory_id: t.subcategoryId || null,
            projection_id: t.projectionId || null,
            installment_current: t.installmentCurrent || 1,
            installment_total: t.installmentTotal || 1,
            import_hash: t.importHash || null
          }))
        );
      }
    } catch (relErr) {
      console.warn("Snapshot salvo, aviso secundário nas tabelas relacionais:", relErr);
    }

    return true;
  },

  async pullState() {
    if (!this.isConfigured()) {
      throw new Error("Supabase não configurado.");
    }

    const cfg = this.getConfig();
    const res = await fetch(
      `${cfg.url}/rest/v1/app_state_sync?household_id=eq.olifinancas_bruno_nubia&select=*`,
      {
        method: "GET",
        headers: this.getHeaders(null)
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro ao buscar dados do Supabase: ${errText}`);
    }

    const rows = await res.json();
    return rows && rows.length > 0 ? rows[0].state_json : null;
  }
};
