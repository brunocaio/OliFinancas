// ============================================================================
// OLIFINANÇAS 🫒 - LÓGICA PRINCIPAL (BRUNO & NÚBIA)
// Visual e bom humor na medida certa, com terminologia financeira clara e direta
// ============================================================================

const STORAGE_KEY = "olifinancas_state_v1";

const OLIVE_QUOTES = [
  "🫒 Dica do Oli: Pagamento de fatura no extrato da conta corrente é ignorado automaticamente para não contar seus gastos duas vezes!",
  "🍾 Meta batida no mês rende até um bom azeite português na feira!",
  "🫒 Quem concilia o Previsto vs. Realizado não engole caroço no fechamento do mês.",
  "🐕 Até o Chicó aprova: contas da casa organizadas e divisão justa entre Bruno e Núbia!",
  "🫒 Importou o OFX ou CSV do Nubank/Itaú? O sistema já sugere a subcategoria e a meta correspondente."
];

window.App = {
  state: null,
  currentTab: "dashboard",
  activeUserFilter: "ALL",
  loggedUser: "bruno",
  projectionGroupMode: "ACCOUNT",
  quoteIndex: 0,
  txFilter: {
    search: "",
    accountId: "ALL",
    categoryId: "ALL",
    ownership: "ALL"
  },
  stagedImports: [],
  importTargetAccountId: "card_nubank_bruno",
  charts: {},

  init() {
    this.loadState();
    this.initSupabase();
    this.bindGlobalEvents();
    this.renderAll();
    this.rotateQuotes();
  },

  rotateQuotes() {
    const el = document.getElementById("oli-humorous-banner-text");
    if (!el) return;
    setInterval(() => {
      this.quoteIndex = (this.quoteIndex + 1) % OLIVE_QUOTES.length;
      el.textContent = OLIVE_QUOTES[this.quoteIndex];
    }, 10000);
  },

  nextQuote() {
    const el = document.getElementById("oli-humorous-banner-text");
    if (!el) return;
    this.quoteIndex = (this.quoteIndex + 1) % OLIVE_QUOTES.length;
    el.textContent = OLIVE_QUOTES[this.quoteIndex];
  },

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.state = JSON.parse(saved);
      } else {
        this.state = JSON.parse(JSON.stringify(window.INITIAL_SEED_DATA));
        this.saveState(false);
      }
    } catch (e) {
      console.error("Erro ao carregar estado local, usando seed inicial:", e);
      this.state = JSON.parse(JSON.stringify(window.INITIAL_SEED_DATA));
    }
  },

  saveState(syncCloud = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    if (syncCloud && window.SupabaseSync && window.SupabaseSync.isConfigured()) {
      const cfg = window.SupabaseSync.getConfig();
      if (cfg.autoSync) {
        window.SupabaseSync.pushState(this.state, this.loggedUser).catch(err => {
          console.warn("Sync automático pendente:", err.message);
        });
      }
    }
  },

  resetToSpreadsheetSeed() {
    if (!confirm("Deseja restaurar os dados originais extraídos da sua planilha do Google? Isso substituirá alterações locais.")) {
      return;
    }
    this.state = JSON.parse(JSON.stringify(window.INITIAL_SEED_DATA));
    this.saveState(true);
    this.renderAll();
    this.showToast("🫒 Dados originais da planilha restaurados com sucesso!", "success");
  },

  async initSupabase() {
    if (!window.SupabaseSync) return;
    const connected = window.SupabaseSync.initClient((remoteState, updatedBy) => {
      this.state = remoteState;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.renderAll();
      this.showToast(`🫒 Sincronizado em tempo real (atualizado por ${updatedBy || "parceiro"})`, "info");
    });
    this.updateCloudBadge(connected);

    if (connected) {
      try {
        const remoteState = await window.SupabaseSync.pullState();
        if (remoteState && remoteState.transactions) {
          this.state = remoteState;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
          this.renderAll();
        } else {
          await window.SupabaseSync.pushState(this.state, this.loggedUser);
          this.showToast("🫒 Banco Supabase inicializado automaticamente com os dados da planilha!", "success");
        }
      } catch (err) {
        console.warn("Aviso ao verificar estado inicial no Supabase:", err.message);
      }
    }
  },

  updateCloudBadge(connected) {
    const badge = document.getElementById("cloud-status-badge");
    if (!badge) return;
    if (connected) {
      badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-lime-500/20 text-lime-300 border border-lime-500/40 cursor-pointer";
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-lime-400 animate-pulse"></span> Supabase Conectado`;
    } else {
      badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 cursor-pointer";
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span> Modo Local (Conectar Nuvem)`;
    }
  },

  formatBRL(value) {
    const num = Number(value) || 0;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },

  formatDateBR(isoDate) {
    if (!isoDate) return "-";
    const parts = isoDate.split("-");
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  },

  getMonthLabel(monthYear) {
    if (!monthYear) return "";
    const [y, m] = monthYear.split("-");
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${months[parseInt(m, 10) - 1] || m} de ${y}`;
  },

  changeMonth(delta) {
    const [y, m] = this.state.settings.activeMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, "0");
    const targetMonth = `${newY}-${newM}`;

    this.state.settings.activeMonth = targetMonth;
    this.ensureMonthProjections(targetMonth);
    this.saveState(false);
    this.renderAll();
  },

  ensureMonthProjections(monthYear) {
    const existing = this.state.projections.filter(p => p.monthYear === monthYear);
    if (existing.length > 0) return;

    const baseProjs = this.state.projections.filter(p => p.monthYear === "2026-11");
    for (const bp of baseProjs) {
      this.state.projections.push({
        id: "proj_" + monthYear.replace("-", "") + "_" + Math.random().toString(36).substring(2, 7),
        monthYear: monthYear,
        subcategoryId: bp.subcategoryId,
        title: bp.title,
        plannedAmount: bp.plannedAmount,
        accountId: bp.accountId,
        ownership: bp.ownership,
        isFixed: bp.isFixed,
        dueDay: bp.dueDay
      });
    }
  },

  getSubcategory(subId) {
    return this.state.subcategories.find(s => s.id === subId) || { id: subId, name: "Sem Categoria", categoryId: "cat_financeiro" };
  },

  getCategory(catId) {
    return this.state.categories.find(c => c.id === catId) || { id: catId, name: "Outros", color: "#84cc16", icon: "folder" };
  },

  getAccount(accId) {
    return this.state.accounts.find(a => a.id === accId) || { id: accId, name: "Conta", type: "CHECKING", color: "#84cc16" };
  },

  getUser(userId) {
    return this.state.users.find(u => u.id === userId) || { id: userId, name: userId };
  },

  getOwnershipBadge(ownership) {
    if (ownership === "COLLECTIVE") {
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-lime-500/15 text-lime-300 border border-lime-500/30">Coletivo Casa</span>`;
    }
    if (ownership === "INDIVIDUAL_BRUNO") {
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Individual Bruno</span>`;
    }
    if (ownership === "INDIVIDUAL_NUBIA") {
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">Individual Núbia</span>`;
    }
    return "";
  },

  calculateMonthSummary(monthYear, userFilter = "ALL") {
    const monthTxs = this.state.transactions.filter(t => t.competenceMonth === monthYear);
    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);

    const filterTxByUser = (tx) => {
      if (userFilter === "ALL") return true;
      if (userFilter === "bruno") {
        return tx.paidByUserId === "bruno" || tx.ownership === "INDIVIDUAL_BRUNO";
      }
      if (userFilter === "nubia") {
        return tx.paidByUserId === "nubia" || tx.ownership === "INDIVIDUAL_NUBIA";
      }
      return true;
    };

    const filterProjByUser = (proj) => {
      if (userFilter === "ALL") return true;
      const acc = this.getAccount(proj.accountId);
      if (userFilter === "bruno") {
        return acc.ownerId === "bruno" || proj.ownership === "INDIVIDUAL_BRUNO";
      }
      if (userFilter === "nubia") {
        return acc.ownerId === "nubia" || proj.ownership === "INDIVIDUAL_NUBIA";
      }
      return true;
    };

    const filteredTxs = monthTxs.filter(filterTxByUser);
    const filteredProjs = monthProjs.filter(filterProjByUser);

    const incomeBruno = monthTxs
      .filter(t => t.type === "INCOME" && t.paidByUserId === "bruno")
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const incomeNubia = monthTxs
      .filter(t => t.type === "INCOME" && t.paidByUserId === "nubia")
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const totalIncome = userFilter === "bruno"
      ? incomeBruno
      : userFilter === "nubia"
      ? incomeNubia
      : incomeBruno + incomeNubia;

    const expenseTxs = filteredTxs.filter(t => t.type === "EXPENSE");
    const totalActualExpenses = expenseTxs.reduce((acc, t) => acc + Number(t.amount), 0);
    const totalPlannedExpenses = filteredProjs.reduce((acc, p) => acc + Number(p.plannedAmount), 0);

    const collectiveActual = expenseTxs
      .filter(t => t.ownership === "COLLECTIVE")
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const collectivePlanned = filteredProjs
      .filter(p => p.ownership === "COLLECTIVE")
      .reduce((acc, p) => acc + Number(p.plannedAmount), 0);

    const individualBrunoActual = monthTxs
      .filter(t => t.type === "EXPENSE" && t.ownership === "INDIVIDUAL_BRUNO")
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const individualNubiaActual = monthTxs
      .filter(t => t.type === "EXPENSE" && t.ownership === "INDIVIDUAL_NUBIA")
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const individualTotalActual = userFilter === "bruno"
      ? individualBrunoActual
      : userFilter === "nubia"
      ? individualNubiaActual
      : individualBrunoActual + individualNubiaActual;

    const individualTotalPlanned = filteredProjs
      .filter(p => p.ownership !== "COLLECTIVE")
      .reduce((acc, p) => acc + Number(p.plannedAmount), 0);

    const allCollectiveTxs = monthTxs.filter(t => t.type === "EXPENSE" && t.ownership === "COLLECTIVE");
    const totalHouseholdCollective = allCollectiveTxs.reduce((acc, t) => acc + Number(t.amount), 0);
    const paidByBrunoCollective = allCollectiveTxs
      .filter(t => t.paidByUserId === "bruno")
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const paidByNubiaCollective = allCollectiveTxs
      .filter(t => t.paidByUserId === "nubia")
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const combinedIncome = (incomeBruno + incomeNubia) || 1;
    const brunoShareRatio = this.state.settings.splitMode === "PROPORTIONAL"
      ? incomeBruno / combinedIncome
      : 0.5;
    const nubiaShareRatio = 1 - brunoShareRatio;

    const brunoFairShare = totalHouseholdCollective * brunoShareRatio;
    const nubiaFairShare = totalHouseholdCollective * nubiaShareRatio;
    const brunoNetCredit = paidByBrunoCollective - brunoFairShare;

    const byAccount = this.state.accounts.map(acc => {
      const accTxs = monthTxs.filter(t => t.type === "EXPENSE" && t.accountId === acc.id);
      const accProjs = monthProjs.filter(p => p.accountId === acc.id);
      const actual = accTxs.reduce((s, t) => s + Number(t.amount), 0);
      const planned = accProjs.reduce((s, p) => s + Number(p.plannedAmount), 0);
      return {
        account: acc,
        actual,
        planned: acc.monthlyTarget > 0 ? acc.monthlyTarget : planned,
        plannedSum: planned,
        txCount: accTxs.length
      };
    });

    return {
      totalIncome,
      incomeBruno,
      incomeNubia,
      totalActualExpenses,
      totalPlannedExpenses,
      actualBalance: totalIncome - totalActualExpenses,
      projectedBalance: totalIncome - totalPlannedExpenses,
      collectiveActual,
      collectivePlanned,
      individualTotalActual,
      individualTotalPlanned,
      individualBrunoActual,
      individualNubiaActual,
      coupleSplit: {
        totalHouseholdCollective,
        paidByBrunoCollective,
        paidByNubiaCollective,
        brunoShareRatio,
        nubiaShareRatio,
        brunoFairShare,
        nubiaFairShare,
        brunoNetCredit
      },
      byAccount
    };
  },

  renderAll() {
    const monthYear = this.state.settings.activeMonth;
    this.ensureMonthProjections(monthYear);

    const monthLabelEl = document.getElementById("active-month-label");
    if (monthLabelEl) monthLabelEl.textContent = this.getMonthLabel(monthYear);

    document.querySelectorAll("[data-user-filter]").forEach(btn => {
      const val = btn.getAttribute("data-user-filter");
      if (val === this.activeUserFilter) {
        btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-lime-500 text-stone-950 shadow-sm transition";
      } else {
        btn.className = "px-3 py-1.5 rounded-lg text-xs font-medium text-stone-300 hover:text-white hover:bg-stone-800 transition";
      }
    });

    const loggedSelect = document.getElementById("logged-user-select");
    if (loggedSelect) loggedSelect.value = this.loggedUser;

    document.querySelectorAll("[data-tab-target]").forEach(btn => {
      const target = btn.getAttribute("data-tab-target");
      const isActive = target === this.currentTab;
      if (btn.classList.contains("mobile-nav-btn")) {
        btn.className = `mobile-nav-btn flex flex-col items-center justify-center py-2 px-1 text-[11px] font-semibold transition ${
          isActive ? "text-lime-400" : "text-stone-400 hover:text-stone-200"
        }`;
      } else {
        btn.className = `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
          isActive
            ? "bg-lime-500 text-stone-950 shadow-lg shadow-lime-500/20"
            : "text-stone-300 hover:bg-stone-800/80 hover:text-white"
        }`;
      }
    });

    document.querySelectorAll(".tab-section").forEach(sec => {
      sec.classList.toggle("hidden", sec.id !== `tab-${this.currentTab}`);
    });

    const summary = this.calculateMonthSummary(monthYear, this.activeUserFilter);
    this.renderDashboard(summary, monthYear);
    this.renderProjectionsTab(summary, monthYear);
    this.renderTransactionsTab(monthYear);
    this.renderImportTab(monthYear);
    this.renderCategoriesTab();
    this.renderCloudTab();

    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  switchTab(tabName) {
    this.currentTab = tabName;
    this.renderAll();
  },

  setUserFilter(filter) {
    this.activeUserFilter = filter;
    this.renderAll();
  },

  setSplitMode(mode) {
    this.state.settings.splitMode = mode;
    this.saveState(true);
    this.renderAll();
  },

  renderDashboard(summary, monthYear) {
    const kpiContainer = document.getElementById("dashboard-kpis");
    if (!kpiContainer) return;

    const expenseDiff = summary.totalPlannedExpenses - summary.totalActualExpenses;
    const expensePct = summary.totalPlannedExpenses > 0
      ? Math.round((summary.totalActualExpenses / summary.totalPlannedExpenses) * 100)
      : 0;

    kpiContainer.innerHTML = `
      <!-- Card Receitas -->
      <div class="oli-card rounded-2xl p-5 shadow-lg">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold uppercase tracking-wider text-stone-400">Receitas do Mês</span>
          <div class="w-9 h-9 rounded-xl bg-lime-500/20 text-lime-400 flex items-center justify-center">
            <i data-lucide="trending-up" class="w-5 h-5"></i>
          </div>
        </div>
        <div class="text-2xl font-extrabold text-white">${this.formatBRL(summary.totalIncome)}</div>
        <div class="mt-2 flex items-center justify-between text-xs text-stone-400">
          <span>Bruno: <strong class="text-lime-200">${this.formatBRL(summary.incomeBruno)}</strong></span>
          <span>Núbia: <strong class="text-rose-200">${this.formatBRL(summary.incomeNubia)}</strong></span>
        </div>
      </div>

      <!-- Card Despesas (Realizado vs. Meta) -->
      <div class="oli-card rounded-2xl p-5 shadow-lg">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold uppercase tracking-wider text-stone-400">Despesas (Realizado vs. Meta)</span>
          <div class="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
            <i data-lucide="credit-card" class="w-5 h-5"></i>
          </div>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-extrabold text-white">${this.formatBRL(summary.totalActualExpenses)}</span>
          <span class="text-xs text-stone-400">de ${this.formatBRL(summary.totalPlannedExpenses)}</span>
        </div>
        <div class="mt-2 w-full bg-stone-800 h-2.5 rounded-full overflow-hidden">
          <div class="h-full rounded-full ${expensePct > 100 ? "bg-rose-500" : expensePct > 85 ? "bg-amber-400" : "bg-lime-500"}" style="width: ${Math.min(expensePct, 100)}%"></div>
        </div>
        <div class="mt-1.5 flex justify-between text-xs">
          <span class="font-semibold ${expenseDiff >= 0 ? "text-lime-400" : "text-rose-400"}">
            ${expenseDiff >= 0 ? `Dentro da meta (+${this.formatBRL(expenseDiff)})` : `Acima da meta (-${this.formatBRL(Math.abs(expenseDiff))})`}
          </span>
          <span class="text-stone-400">${expensePct}% da meta</span>
        </div>
      </div>

      <!-- Card Saldo Atual & Caixa Previsto -->
      <div class="oli-card rounded-2xl p-5 shadow-lg">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold uppercase tracking-wider text-stone-400">Saldo Atual & Caixa Previsto</span>
          <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <i data-lucide="wallet" class="w-5 h-5"></i>
          </div>
        </div>
        <div class="text-2xl font-extrabold ${summary.actualBalance >= 0 ? "text-lime-400" : "text-rose-400"}">
          ${this.formatBRL(summary.actualBalance)}
        </div>
        <div class="mt-2 flex items-center justify-between text-xs">
          <span class="text-stone-400">Caixa Previsto (Pós-Metas):</span>
          <strong class="${summary.projectedBalance >= 0 ? "text-lime-300" : "text-rose-400"}">${this.formatBRL(summary.projectedBalance)}</strong>
        </div>
      </div>

      <!-- Card Gastos Coletivos vs. Individuais -->
      <div class="oli-card rounded-2xl p-5 shadow-lg">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold uppercase tracking-wider text-stone-400">Coletivos vs. Individuais</span>
          <div class="w-9 h-9 rounded-xl bg-lime-500/15 text-lime-300 flex items-center justify-center">
            <i data-lucide="users" class="w-5 h-5"></i>
          </div>
        </div>
        <div class="space-y-1.5 text-xs">
          <div class="flex justify-between items-center">
            <span class="text-stone-300">Gastos Coletivos:</span>
            <span class="font-bold text-white">${this.formatBRL(summary.collectiveActual)} <span class="text-stone-500 font-normal">/ ${this.formatBRL(summary.collectivePlanned)}</span></span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-stone-300">Gastos Individuais:</span>
            <span class="font-bold text-white">${this.formatBRL(summary.individualTotalActual)} <span class="text-stone-500 font-normal">/ ${this.formatBRL(summary.individualTotalPlanned)}</span></span>
          </div>
          <div class="pt-1 border-t border-stone-800 flex justify-between text-[11px] text-stone-400">
            <span>Ind. Bruno: ${this.formatBRL(summary.individualBrunoActual)}</span>
            <span>Ind. Núbia: ${this.formatBRL(summary.individualNubiaActual)}</span>
          </div>
        </div>
      </div>
    `;

    // 2. Painel de Divisão / Acerto do Casal
    const splitEl = document.getElementById("couple-split-panel");
    if (splitEl) {
      const cs = summary.coupleSplit;
      const isProp = this.state.settings.splitMode === "PROPORTIONAL";
      const brunoPct = (cs.brunoShareRatio * 100).toFixed(1);
      const nubiaPct = (cs.nubiaShareRatio * 100).toFixed(1);

      let settlementMsg = "";
      if (Math.abs(cs.brunoNetCredit) < 1) {
        settlementMsg = `<span class="text-lime-400 font-bold">🫒 Tudo em equilíbrio! As contas coletivas já estão 100% acertadas neste mês.</span>`;
      } else if (cs.brunoNetCredit > 0) {
        settlementMsg = `Para equilibrar os gastos coletivos da casa, <strong class="text-rose-400">Núbia</strong> transfere <strong class="text-lime-400 text-base">${this.formatBRL(cs.brunoNetCredit)}</strong> para <strong class="text-lime-300">Bruno</strong>.`;
      } else {
        settlementMsg = `Para equilibrar os gastos coletivos da casa, <strong class="text-lime-300">Bruno</strong> transfere <strong class="text-lime-400 text-base">${this.formatBRL(Math.abs(cs.brunoNetCredit))}</strong> para <strong class="text-rose-400">Núbia</strong>.`;
      }

      splitEl.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-800">
          <div>
            <h3 class="text-base font-extrabold text-white flex items-center gap-2">
              <i data-lucide="scale" class="w-5 h-5 text-lime-400"></i>
              Divisão & Equilíbrio do Casal (Gastos Coletivos: ${this.formatBRL(cs.totalHouseholdCollective)})
            </h3>
            <p class="text-xs text-stone-400 mt-0.5">Comparativo de quanto cada um pagou pelas despesas da casa e sugestão de acerto</p>
          </div>
          <div class="inline-flex bg-stone-950 p-1 rounded-xl border border-stone-800 self-start">
            <button onclick="App.setSplitMode('PROPORTIONAL')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${isProp ? "bg-lime-500 text-stone-950" : "text-stone-400 hover:text-white"}">
              Proporcional à Renda (${brunoPct}% / ${nubiaPct}%)
            </button>
            <button onclick="App.setSplitMode('EQUAL')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${!isProp ? "bg-lime-500 text-stone-950" : "text-stone-400 hover:text-white"}">
              Meio a Meio (50% / 50%)
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div class="bg-stone-950/70 border border-stone-800 rounded-xl p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-lime-400 uppercase">Bruno (${brunoPct}%)</span>
              <span class="text-xs text-stone-400">Parte Justa: ${this.formatBRL(cs.brunoFairShare)}</span>
            </div>
            <div class="mt-2 text-lg font-extrabold text-white">Pagou: ${this.formatBRL(cs.paidByBrunoCollective)}</div>
            <div class="text-xs text-stone-400 mt-1">+ Gastos Individuais Bruno: ${this.formatBRL(summary.individualBrunoActual)}</div>
          </div>

          <div class="bg-stone-950/70 border border-stone-800 rounded-xl p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-rose-400 uppercase">Núbia (${nubiaPct}%)</span>
              <span class="text-xs text-stone-400">Parte Justa: ${this.formatBRL(cs.nubiaFairShare)}</span>
            </div>
            <div class="mt-2 text-lg font-extrabold text-white">Pagou: ${this.formatBRL(cs.paidByNubiaCollective)}</div>
            <div class="text-xs text-stone-400 mt-1">+ Gastos Individuais Núbia: ${this.formatBRL(summary.individualNubiaActual)}</div>
          </div>

          <div class="bg-lime-950/30 border border-lime-500/30 rounded-xl p-4 flex flex-col justify-center">
            <div class="text-xs font-bold uppercase text-lime-300 mb-1">🫒 Acerto Mensal Sugerido</div>
            <div class="text-xs text-stone-200 leading-relaxed">${settlementMsg}</div>
          </div>
        </div>
      `;
    }

    // 3. Resumo por Conta & Cartões
    const accContainer = document.getElementById("dashboard-accounts-grid");
    if (accContainer) {
      accContainer.innerHTML = summary.byAccount
        .filter(item => item.actual > 0 || item.planned > 0 || item.account.type !== "INVESTMENT")
        .map(item => {
          const acc = item.account;
          const pct = item.planned > 0 ? Math.round((item.actual / item.planned) * 100) : 0;
          const diff = item.planned - item.actual;
          return `
            <div class="bg-stone-950/75 border border-stone-800 rounded-xl p-4 hover:border-lime-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full" style="background:${acc.color}"></span>
                  <span class="font-bold text-sm text-white">${acc.name}</span>
                </div>
                ${acc.dueDay ? `<span class="text-[11px] px-2 py-0.5 rounded bg-stone-800 text-amber-300 font-semibold">Vence dia ${acc.dueDay}</span>` : `<span class="text-[11px] px-2 py-0.5 rounded bg-stone-800 text-stone-400">Débito / PIX</span>`}
              </div>
              <div class="flex items-baseline justify-between mt-3">
                <div>
                  <div class="text-xs text-stone-400">Realizado</div>
                  <div class="text-lg font-extrabold text-white">${this.formatBRL(item.actual)}</div>
                </div>
                <div class="text-right">
                  <div class="text-xs text-stone-400">Meta / Teto</div>
                  <div class="text-sm font-semibold text-stone-300">${this.formatBRL(item.planned)}</div>
                </div>
              </div>
              <div class="mt-2.5 w-full bg-stone-800 h-1.5 rounded-full overflow-hidden">
                <div class="h-full ${pct > 100 ? "bg-rose-500" : "bg-lime-500"}" style="width:${Math.min(pct, 100)}%"></div>
              </div>
              <div class="mt-2 flex items-center justify-between text-[11px]">
                <span class="text-stone-400">${item.txCount} lançamento(s)</span>
                <span class="font-semibold ${diff >= 0 ? "text-lime-400" : "text-rose-400"}">
                  ${diff >= 0 ? `Disponível: ${this.formatBRL(diff)}` : `Excedido: ${this.formatBRL(Math.abs(diff))}`}
                </span>
              </div>
            </div>
          `;
        })
        .join("");
    }

    this.renderDashboardCharts(monthYear);
  },

  renderDashboardCharts(monthYear) {
    if (!window.Chart) return;

    const monthTxs = this.state.transactions.filter(t => t.competenceMonth === monthYear && t.type === "EXPENSE");
    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);

    const expenseCategories = this.state.categories.filter(c => c.type === "EXPENSE");
    const labels = [];
    const actualData = [];
    const plannedData = [];

    for (const cat of expenseCategories) {
      const subIds = this.state.subcategories.filter(s => s.categoryId === cat.id).map(s => s.id);
      const catActual = monthTxs
        .filter(t => subIds.includes(t.subcategoryId))
        .reduce((s, t) => s + Number(t.amount), 0);
      const catPlanned = monthProjs
        .filter(p => subIds.includes(p.subcategoryId))
        .reduce((s, p) => s + Number(p.plannedAmount), 0);

      if (catActual > 0 || catPlanned > 0) {
        labels.push(cat.name.split("&")[0].trim());
        actualData.push(Number(catActual.toFixed(2)));
        plannedData.push(Number(catPlanned.toFixed(2)));
      }
    }

    const ctxBar = document.getElementById("chart-previsto-realizado");
    if (ctxBar) {
      if (this.charts.bar) this.charts.bar.destroy();
      this.charts.bar = new Chart(ctxBar, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Previsto (Meta)",
              data: plannedData,
              backgroundColor: "rgba(234, 179, 8, 0.35)",
              borderColor: "#eab308",
              borderWidth: 1.5,
              borderRadius: 6
            },
            {
              label: "Realizado",
              data: actualData,
              backgroundColor: "rgba(132, 204, 22, 0.8)",
              borderColor: "#84cc16",
              borderWidth: 1.5,
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: "#e7e5e4", font: { size: 11 } } }
          },
          scales: {
            x: { ticks: { color: "#a8a29e", font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { color: "#a8a29e", font: { size: 11 } }, grid: { color: "rgba(168,162,158,0.1)" } }
          }
        }
      });
    }
  },

  setProjectionGroupMode(mode) {
    this.projectionGroupMode = mode;
    this.renderAll();
  },

  renderProjectionsTab(summary, monthYear) {
    const container = document.getElementById("projections-groups-container");
    if (!container) return;

    const btnAcc = document.getElementById("btn-proj-group-account");
    const btnCat = document.getElementById("btn-proj-group-category");
    if (btnAcc && btnCat) {
      btnAcc.className = `px-3.5 py-2 rounded-xl text-xs font-bold transition ${
        this.projectionGroupMode === "ACCOUNT" ? "bg-lime-500 text-stone-950" : "bg-stone-800 text-stone-300 hover:text-white"
      }`;
      btnCat.className = `px-3.5 py-2 rounded-xl text-xs font-bold transition ${
        this.projectionGroupMode === "CATEGORY" ? "bg-lime-500 text-stone-950" : "bg-stone-800 text-stone-300 hover:text-white"
      }`;
    }

    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);
    const monthTxs = this.state.transactions.filter(t => t.competenceMonth === monthYear && t.type === "EXPENSE");

    const enrichedProjs = monthProjs.map(proj => {
      const linkedTxs = monthTxs.filter(t => {
        if (t.projectionId) return t.projectionId === proj.id;
        return t.subcategoryId === proj.subcategoryId && (!proj.accountId || t.accountId === proj.accountId);
      });
      const actualAmount = linkedTxs.reduce((s, t) => s + Number(t.amount), 0);
      const diff = Number(proj.plannedAmount) - actualAmount;
      const pct = proj.plannedAmount > 0 ? Math.round((actualAmount / proj.plannedAmount) * 100) : (actualAmount > 0 ? 100 : 0);

      return {
        ...proj,
        actualAmount,
        diff,
        pct,
        linkedTxs,
        sub: this.getSubcategory(proj.subcategoryId),
        acc: this.getAccount(proj.accountId)
      };
    });

    let groups = [];
    if (this.projectionGroupMode === "ACCOUNT") {
      for (const acc of this.state.accounts) {
        const items = enrichedProjs.filter(p => p.accountId === acc.id);
        if (items.length > 0) {
          groups.push({
            id: acc.id,
            title: acc.name,
            subtitle: acc.dueDay ? `Fatura Vencimento Dia ${acc.dueDay}` : "Débito em Conta / PIX",
            color: acc.color,
            items
          });
        }
      }
    } else {
      for (const cat of this.state.categories.filter(c => c.type === "EXPENSE")) {
        const items = enrichedProjs.filter(p => p.sub.categoryId === cat.id);
        if (items.length > 0) {
          groups.push({
            id: cat.id,
            title: cat.name,
            subtitle: `${items.length} item(ns) planejado(s)`,
            color: cat.color,
            items
          });
        }
      }
    }

    const unlinkedTxs = monthTxs.filter(t => {
      return !enrichedProjs.some(ep => ep.linkedTxs.some(lt => lt.id === t.id));
    });

    let html = groups
      .map(g => {
        const groupPlanned = g.items.reduce((s, i) => s + Number(i.plannedAmount), 0);
        const groupActual = g.items.reduce((s, i) => s + Number(i.actualAmount), 0);
        const groupDiff = groupPlanned - groupActual;

        const rowsHtml = g.items
          .map(item => {
            let statusBadge = "";
            if (item.actualAmount === 0 && item.plannedAmount > 0) {
              statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-stone-800 text-stone-400">Pendente</span>`;
            } else if (item.actualAmount > item.plannedAmount && item.plannedAmount > 0) {
              statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/30">Acima (+${this.formatBRL(Math.abs(item.diff))})</span>`;
            } else if (item.isFixed && item.actualAmount > 0) {
              statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-lime-500/20 text-lime-300 border border-lime-500/30">Liquidado</span>`;
            } else {
              statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-lime-500/15 text-lime-300">Dentro da Meta (${item.pct}%)</span>`;
            }

            const barColor = item.actualAmount > item.plannedAmount && item.plannedAmount > 0
              ? "bg-rose-500"
              : item.pct >= 85
              ? "bg-amber-400"
              : "bg-lime-500";

            return `
              <tr class="border-b border-stone-800/60 hover:bg-stone-800/30 transition">
                <td class="py-3 px-4">
                  <div class="font-semibold text-white text-sm">${item.title}</div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-[11px] text-stone-400">${item.sub.name}</span>
                    ${this.getOwnershipBadge(item.ownership)}
                  </div>
                </td>
                <td class="py-3 px-4 text-right font-bold text-white text-sm">
                  ${this.formatBRL(item.actualAmount)}
                  <div class="text-[11px] text-stone-400 font-normal">${item.linkedTxs.length} lanç.</div>
                </td>
                <td class="py-3 px-4 text-right">
                  <input
                    type="number"
                    step="0.01"
                    value="${Number(item.plannedAmount).toFixed(2)}"
                    onchange="App.updateProjectionAmount('${item.id}', this.value)"
                    title="Clique para editar a Meta / Valor Previsto"
                    class="w-28 bg-stone-950 border border-stone-700 focus:border-lime-500 rounded-lg px-2.5 py-1 text-right text-sm font-bold text-amber-300 outline-none"
                  />
                </td>
                <td class="py-3 px-4 text-right font-bold text-sm ${item.diff >= 0 ? "text-lime-400" : "text-rose-400"}">
                  ${item.diff >= 0 ? "+" : ""}${this.formatBRL(item.diff)}
                </td>
                <td class="py-3 px-4 w-48">
                  <div class="flex items-center justify-between mb-1">
                    ${statusBadge}
                  </div>
                  <div class="w-full bg-stone-800 h-1.5 rounded-full overflow-hidden">
                    <div class="h-full ${barColor}" style="width: ${Math.min(item.pct, 100)}%"></div>
                  </div>
                </td>
                <td class="py-3 px-4 text-right">
                  <div class="inline-flex items-center gap-1">
                    <button
                      onclick="App.openQuickSettleModal('${item.id}')"
                      title="Dar baixa / Lançar gasto real vinculado a este item previsto"
                      class="px-2.5 py-1.5 rounded-lg bg-lime-500/20 hover:bg-lime-500 text-lime-300 hover:text-stone-950 text-xs font-bold transition flex items-center gap-1"
                    >
                      <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>
                      Conciliar
                    </button>
                    <button
                      onclick="App.deleteProjection('${item.id}')"
                      title="Excluir previsão"
                      class="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-stone-800 transition"
                    >
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("");

        return `
          <div class="oli-card rounded-2xl overflow-hidden shadow-lg mb-6">
            <div class="px-5 py-4 bg-stone-950/80 border-b border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <span class="w-3.5 h-3.5 rounded-full" style="background:${g.color}"></span>
                <div>
                  <h3 class="font-extrabold text-white text-base">${g.title}</h3>
                  <p class="text-xs text-stone-400">${g.subtitle}</p>
                </div>
              </div>
              <div class="flex items-center gap-5 text-xs">
                <div>
                  <span class="text-stone-400">Realizado: </span>
                  <strong class="text-white text-sm">${this.formatBRL(groupActual)}</strong>
                </div>
                <div>
                  <span class="text-stone-400">Meta Prevista: </span>
                  <strong class="text-amber-300 text-sm">${this.formatBRL(groupPlanned)}</strong>
                </div>
                <div>
                  <span class="text-stone-400">Diferença: </span>
                  <strong class="text-sm ${groupDiff >= 0 ? "text-lime-400" : "text-rose-400"}">${this.formatBRL(groupDiff)}</strong>
                </div>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-stone-800 text-[11px] font-bold uppercase text-stone-400 bg-stone-950/40">
                    <th class="py-2.5 px-4">Item Planejado / Categoria</th>
                    <th class="py-2.5 px-4 text-right">Realizado (R$)</th>
                    <th class="py-2.5 px-4 text-right">Meta / Previsto (R$)</th>
                    <th class="py-2.5 px-4 text-right">Diferença / Saldo</th>
                    <th class="py-2.5 px-4">Status / Progresso</th>
                    <th class="py-2.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        `;
      })
      .join("");

    if (unlinkedTxs.length > 0) {
      const unlinkedSum = unlinkedTxs.reduce((s, t) => s + Number(t.amount), 0);
      html += `
        <div class="bg-amber-950/25 border border-amber-500/30 rounded-2xl p-4 mb-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i data-lucide="alert-circle" class="w-5 h-5 text-amber-400"></i>
              <span class="font-bold text-sm text-amber-200">Gastos Realizados Fora de Metas Previstas (${unlinkedTxs.length} item(ns): ${this.formatBRL(unlinkedSum)})</span>
            </div>
            <span class="text-xs text-amber-300/80">Ex: "Outros" no Nubank e Itaú</span>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  },

  updateProjectionAmount(projId, newVal) {
    const proj = this.state.projections.find(p => p.id === projId);
    if (!proj) return;
    proj.plannedAmount = parseFloat(newVal) || 0;
    this.saveState(true);
    this.renderAll();
    this.showToast(`🫒 Meta "${proj.title}" atualizada para ${this.formatBRL(proj.plannedAmount)}`, "success");
  },

  deleteProjection(projId) {
    if (!confirm("Remover este item previsto do mês?")) return;
    this.state.projections = this.state.projections.filter(p => p.id !== projId);
    this.saveState(true);
    this.renderAll();
  },

  openQuickSettleModal(projId) {
    const proj = this.state.projections.find(p => p.id === projId);
    if (!proj) return;
    this.openTransactionModal({
      type: "EXPENSE",
      description: proj.title,
      amount: proj.plannedAmount > 0 ? proj.plannedAmount : "",
      accountId: proj.accountId || "cc_bruno",
      subcategoryId: proj.subcategoryId,
      ownership: proj.ownership,
      projectionId: proj.id
    });
  },

  renderTransactionsTab(monthYear) {
    const accFilterEl = document.getElementById("tx-filter-account");
    if (accFilterEl && accFilterEl.options.length <= 1) {
      accFilterEl.innerHTML = `<option value="ALL">Todas as Contas & Cartões</option>` +
        this.state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
    }

    const catFilterEl = document.getElementById("tx-filter-category");
    if (catFilterEl && catFilterEl.options.length <= 1) {
      catFilterEl.innerHTML = `<option value="ALL">Todas as Categorias</option>` +
        this.state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
    }

    const tbody = document.getElementById("transactions-table-body");
    if (!tbody) return;

    let txs = this.state.transactions.filter(t => t.competenceMonth === monthYear);

    if (this.activeUserFilter === "bruno") {
      txs = txs.filter(t => t.paidByUserId === "bruno" || t.ownership === "INDIVIDUAL_BRUNO");
    } else if (this.activeUserFilter === "nubia") {
      txs = txs.filter(t => t.paidByUserId === "nubia" || t.ownership === "INDIVIDUAL_NUBIA");
    }

    if (this.txFilter.accountId !== "ALL") {
      txs = txs.filter(t => t.accountId === this.txFilter.accountId);
    }
    if (this.txFilter.categoryId !== "ALL") {
      txs = txs.filter(t => {
        const sub = this.getSubcategory(t.subcategoryId);
        return sub.categoryId === this.txFilter.categoryId;
      });
    }
    if (this.txFilter.ownership !== "ALL") {
      txs = txs.filter(t => t.ownership === this.txFilter.ownership);
    }
    if (this.txFilter.search) {
      const q = this.txFilter.search.toLowerCase();
      txs = txs.filter(t => t.description.toLowerCase().includes(q));
    }

    txs.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));

    if (txs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-10 text-center text-stone-400 text-sm">
            Nenhum lançamento encontrado para os filtros selecionados neste mês.
          </td>
        </tr>
      `;
      return;
    }

    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);

    tbody.innerHTML = txs
      .map(tx => {
        const sub = this.getSubcategory(tx.subcategoryId);
        const cat = this.getCategory(sub.categoryId);
        const acc = this.getAccount(tx.accountId);
        const user = this.getUser(tx.paidByUserId);
        const linkedProj = monthProjs.find(p => p.id === tx.projectionId);

        const instBadge = tx.installmentTotal > 1
          ? `<span class="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">${tx.installmentCurrent}/${tx.installmentTotal}</span>`
          : "";

        return `
          <tr class="border-b border-stone-800/60 hover:bg-stone-800/30 transition text-sm">
            <td class="py-3 px-4 whitespace-nowrap text-stone-300 text-xs">${this.formatDateBR(tx.transactionDate)}</td>
            <td class="py-3 px-4">
              <div class="font-semibold text-white">${tx.description} ${instBadge}</div>
              ${linkedProj ? `<div class="text-[11px] text-lime-400 flex items-center gap-1 mt-0.5"><i data-lucide="link" class="w-3 h-3"></i> Vinculado a: ${linkedProj.title}</div>` : ""}
            </td>
            <td class="py-3 px-4">
              <span class="inline-flex items-center gap-1.5 text-xs text-stone-200">
                <span class="w-2 h-2 rounded-full" style="background:${cat.color}"></span>
                ${sub.name}
              </span>
            </td>
            <td class="py-3 px-4">
              <span class="text-xs text-stone-300">${acc.name}</span>
              <div class="text-[11px] text-stone-500">Pago por ${user.name}</div>
            </td>
            <td class="py-3 px-4">${this.getOwnershipBadge(tx.ownership)}</td>
            <td class="py-3 px-4 text-right font-extrabold whitespace-nowrap ${
              tx.type === "INCOME" ? "text-lime-400" : tx.type === "TRANSFER" ? "text-stone-400" : "text-white"
            }">
              ${tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "-" : ""}${this.formatBRL(tx.amount)}
            </td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
              <button onclick="App.deleteTransaction('${tx.id}')" class="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-stone-800 transition" title="Excluir lançamento">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  },

  deleteTransaction(txId) {
    if (!confirm("Deseja excluir este lançamento?")) return;
    this.state.transactions = this.state.transactions.filter(t => t.id !== txId);
    this.saveState(true);
    this.renderAll();
    this.showToast("Lançamento removido.", "info");
  },

  openTransactionModal(prefill = {}) {
    const modal = document.getElementById("modal-transaction");
    if (!modal) return;

    const monthYear = this.state.settings.activeMonth;
    const todayISO = `${monthYear}-${String(new Date().getDate()).padStart(2, "0")}`;

    const accSelect = document.getElementById("tx-modal-account");
    accSelect.innerHTML = this.state.accounts
      .map(a => `<option value="${a.id}">${a.name}</option>`)
      .join("");

    const subSelect = document.getElementById("tx-modal-subcategory");
    subSelect.innerHTML = this.state.categories
      .map(cat => {
        const subs = this.state.subcategories.filter(s => s.categoryId === cat.id);
        return `<optgroup label="${cat.name}">` +
          subs.map(s => `<option value="${s.id}">${s.name}</option>`).join("") +
          `</optgroup>`;
      })
      .join("");

    const projSelect = document.getElementById("tx-modal-projection");
    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);
    projSelect.innerHTML = `<option value="">-- Sem vínculo direto (usar subcategoria) --</option>` +
      monthProjs.map(p => `<option value="${p.id}">${p.title} (Meta: ${this.formatBRL(p.plannedAmount)})</option>`).join("");

    document.getElementById("tx-modal-type").value = prefill.type || "EXPENSE";
    document.getElementById("tx-modal-date").value = prefill.transactionDate || todayISO;
    document.getElementById("tx-modal-desc").value = prefill.description || "";
    document.getElementById("tx-modal-amount").value = prefill.amount !== undefined ? prefill.amount : "";
    accSelect.value = prefill.accountId || (this.loggedUser === "nubia" ? "cc_nubia" : "card_nubank_bruno");
    document.getElementById("tx-modal-user").value = prefill.paidByUserId || this.loggedUser;
    document.getElementById("tx-modal-ownership").value = prefill.ownership || "COLLECTIVE";
    subSelect.value = prefill.subcategoryId || "sub_feira_sup";
    projSelect.value = prefill.projectionId || "";
    document.getElementById("tx-modal-installments").value = "1";

    modal.classList.remove("hidden");
  },

  closeTransactionModal() {
    const modal = document.getElementById("modal-transaction");
    if (modal) modal.classList.add("hidden");
  },

  saveTransactionFromModal(e) {
    e.preventDefault();
    const type = document.getElementById("tx-modal-type").value;
    const txDate = document.getElementById("tx-modal-date").value;
    const description = document.getElementById("tx-modal-desc").value.trim();
    const amount = parseFloat(document.getElementById("tx-modal-amount").value);
    const accountId = document.getElementById("tx-modal-account").value;
    const paidByUserId = document.getElementById("tx-modal-user").value;
    const ownership = document.getElementById("tx-modal-ownership").value;
    const subcategoryId = document.getElementById("tx-modal-subcategory").value;
    const projectionId = document.getElementById("tx-modal-projection").value || null;
    const installments = parseInt(document.getElementById("tx-modal-installments").value, 10) || 1;

    if (!description || isNaN(amount) || amount <= 0) {
      this.showToast("Preencha a descrição e um valor válido.", "error");
      return;
    }

    const baseMonth = this.state.settings.activeMonth;
    const [baseY, baseM] = baseMonth.split("-").map(Number);

    for (let i = 0; i < installments; i++) {
      const targetDate = new Date(baseY, baseM - 1 + i, 1);
      const compMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;

      this.state.transactions.push({
        id: "tx_" + Date.now() + "_" + i,
        transactionDate: txDate,
        competenceMonth: compMonth,
        description: installments > 1 ? `${description} (${i + 1}/${installments})` : description,
        amount: amount,
        type,
        accountId,
        paidByUserId,
        ownership,
        subcategoryId,
        projectionId: i === 0 ? projectionId : null,
        installmentCurrent: i + 1,
        installmentTotal: installments
      });
    }

    this.saveState(true);
    this.closeTransactionModal();
    this.renderAll();
    this.showToast(
      installments > 1
        ? `🫒 Compra parcelada registrada nos próximos ${installments} meses!`
        : "🫒 Lançamento salvo e conciliado com sucesso!",
      "success"
    );
  },

  openProjectionModal() {
    const modal = document.getElementById("modal-projection");
    if (!modal) return;

    const accSelect = document.getElementById("proj-modal-account");
    accSelect.innerHTML = this.state.accounts
      .map(a => `<option value="${a.id}">${a.name}</option>`)
      .join("");

    const subSelect = document.getElementById("proj-modal-subcategory");
    subSelect.innerHTML = this.state.categories
      .filter(c => c.type === "EXPENSE")
      .map(cat => {
        const subs = this.state.subcategories.filter(s => s.categoryId === cat.id);
        return `<optgroup label="${cat.name}">` +
          subs.map(s => `<option value="${s.id}">${s.name}</option>`).join("") +
          `</optgroup>`;
      })
      .join("");

    document.getElementById("proj-modal-title").value = "";
    document.getElementById("proj-modal-amount").value = "";
    modal.classList.remove("hidden");
  },

  closeProjectionModal() {
    const modal = document.getElementById("modal-projection");
    if (modal) modal.classList.add("hidden");
  },

  saveProjectionFromModal(e) {
    e.preventDefault();
    const title = document.getElementById("proj-modal-title").value.trim();
    const plannedAmount = parseFloat(document.getElementById("proj-modal-amount").value) || 0;
    const subcategoryId = document.getElementById("proj-modal-subcategory").value;
    const accountId = document.getElementById("proj-modal-account").value;
    const ownership = document.getElementById("proj-modal-ownership").value;
    const isFixed = document.getElementById("proj-modal-fixed").checked;

    if (!title) {
      this.showToast("Informe o título do gasto previsto / meta.", "error");
      return;
    }

    this.state.projections.push({
      id: "proj_" + Date.now(),
      monthYear: this.state.settings.activeMonth,
      subcategoryId,
      title,
      plannedAmount,
      accountId,
      ownership,
      isFixed,
      dueDay: 10
    });

    this.saveState(true);
    this.closeProjectionModal();
    this.renderAll();
    this.showToast(`🫒 Previsão "${title}" adicionada ao planejamento do mês!`, "success");
  },

  renderImportTab(monthYear) {
    const accSelect = document.getElementById("import-account-select");
    if (accSelect && accSelect.options.length === 0) {
      accSelect.innerHTML = this.state.accounts
        .map(a => `<option value="${a.id}">${a.name} (${a.type === "CREDIT_CARD" ? "Cartão" : "Conta"})</option>`)
        .join("");
      accSelect.value = this.importTargetAccountId;
    }

    const stagingArea = document.getElementById("import-staging-area");
    const tbody = document.getElementById("import-staging-tbody");
    const countSpan = document.getElementById("import-selected-count");
    if (!stagingArea || !tbody) return;

    if (this.stagedImports.length === 0) {
      stagingArea.classList.add("hidden");
      return;
    }

    stagingArea.classList.remove("hidden");
    const selectedItems = this.stagedImports.filter(i => i.selected);
    if (countSpan) {
      const totalSelectedVal = selectedItems.reduce((s, i) => s + Number(i.amount), 0);
      countSpan.textContent = `${selectedItems.length} selecionado(s) (${this.formatBRL(totalSelectedVal)})`;
    }

    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);

    tbody.innerHTML = this.stagedImports
      .map((item, idx) => {
        const subOptions = this.state.subcategories
          .map(s => `<option value="${s.id}" ${s.id === item.subcategoryId ? "selected" : ""}>${s.name}</option>`)
          .join("");

        const projOptions = `<option value="">-- Automático pela Subcategoria --</option>` +
          monthProjs
            .map(p => `<option value="${p.id}" ${p.id === item.projectionId ? "selected" : ""}>${p.title} (${this.formatBRL(p.plannedAmount)})</option>`)
            .join("");

        const rowClass = item.alreadyExists
          ? "opacity-50 bg-stone-950/50"
          : item.type === "TRANSFER"
          ? "bg-stone-900/40 text-stone-400"
          : "hover:bg-stone-800/30";

        return `
          <tr class="border-b border-stone-800/70 text-xs ${rowClass}">
            <td class="py-2.5 px-3">
              <input
                type="checkbox"
                ${item.selected ? "checked" : ""}
                onchange="App.toggleStagedItem(${idx}, this.checked)"
                class="w-4 h-4 rounded border-stone-700 bg-stone-900 text-lime-500"
              />
            </td>
            <td class="py-2.5 px-3 whitespace-nowrap text-stone-300">${this.formatDateBR(item.transactionDate)}</td>
            <td class="py-2.5 px-3">
              <div class="font-semibold text-white">${item.description}</div>
              ${item.alreadyExists ? `<span class="text-[10px] text-amber-400">Já importado anteriormente (Ignorado)</span>` : ""}
              ${item.type === "TRANSFER" ? `<span class="text-[10px] text-lime-300">Pagamento de fatura detectado (Desmarcado p/ não contar 2x)</span>` : ""}
            </td>
            <td class="py-2.5 px-3">
              <select
                onchange="App.updateStagedItem(${idx}, 'subcategoryId', this.value)"
                class="bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-xs text-stone-200 w-44"
              >
                ${subOptions}
              </select>
            </td>
            <td class="py-2.5 px-3">
              <select
                onchange="App.updateStagedItem(${idx}, 'projectionId', this.value)"
                class="bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-xs text-amber-300 w-48"
              >
                ${projOptions}
              </select>
            </td>
            <td class="py-2.5 px-3">
              <select
                onchange="App.updateStagedItem(${idx}, 'ownership', this.value)"
                class="bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-xs text-stone-200"
              >
                <option value="COLLECTIVE" ${item.ownership === "COLLECTIVE" ? "selected" : ""}>Coletivo Casa</option>
                <option value="INDIVIDUAL_BRUNO" ${item.ownership === "INDIVIDUAL_BRUNO" ? "selected" : ""}>Só Bruno</option>
                <option value="INDIVIDUAL_NUBIA" ${item.ownership === "INDIVIDUAL_NUBIA" ? "selected" : ""}>Só Núbia</option>
              </select>
            </td>
            <td class="py-2.5 px-3 text-right font-extrabold text-white whitespace-nowrap">
              ${this.formatBRL(item.amount)}
            </td>
          </tr>
        `;
      })
      .join("");
  },

  handleStatementFileUpload(fileList) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const accId = document.getElementById("import-account-select").value;
    this.importTargetAccountId = accId;
    const account = this.getAccount(accId);
    const monthYear = this.state.settings.activeMonth;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const isOFX = file.name.toLowerCase().endsWith(".ofx") || content.includes("<OFX>") || content.includes("<STMTTRN>");

      const parsed = isOFX
        ? window.StatementParser.parseOFX(content, account, monthYear, this.state)
        : window.StatementParser.parseCSV(content, account, monthYear, this.state);

      if (parsed.length === 0) {
        this.showToast("Nenhuma transação encontrada neste arquivo. Verifique se é um extrato .OFX ou .CSV válido.", "error");
        return;
      }

      this.stagedImports = parsed;
      this.renderImportTab(monthYear);
      this.showToast(`🫒 ${parsed.length} transações lidas e classificadas! Revise abaixo antes de confirmar.`, "success");
    };
    reader.readAsText(file, "UTF-8");
  },

  loadSampleNubankExtract() {
    const accId = "card_nubank_bruno";
    const accSelect = document.getElementById("import-account-select");
    if (accSelect) accSelect.value = accId;
    const account = this.getAccount(accId);
    const monthYear = this.state.settings.activeMonth;
    const sampleOFX = window.StatementParser.getSampleNubankOFX();

    this.stagedImports = window.StatementParser.parseOFX(sampleOFX, account, monthYear, this.state);
    this.renderImportTab(monthYear);
    this.showToast("🫒 Extrato OFX de demonstração carregado! Veja o vínculo automático com as metas.", "info");
  },

  toggleStagedItem(idx, checked) {
    if (!this.stagedImports[idx]) return;
    this.stagedImports[idx].selected = checked;
    this.renderImportTab(this.state.settings.activeMonth);
  },

  updateStagedItem(idx, field, value) {
    const item = this.stagedImports[idx];
    if (!item) return;
    item[field] = value || null;

    if (field === "subcategoryId") {
      const monthProjs = this.state.projections.filter(p => p.monthYear === this.state.settings.activeMonth);
      const match = monthProjs.find(p => p.subcategoryId === value);
      if (match) item.projectionId = match.id;
    }
    this.renderImportTab(this.state.settings.activeMonth);
  },

  confirmStagedImports() {
    const selected = this.stagedImports.filter(i => i.selected);
    if (selected.length === 0) {
      this.showToast("Selecione pelo menos uma transação para importar.", "error");
      return;
    }

    for (const item of selected) {
      this.state.transactions.push({
        id: "tx_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        transactionDate: item.transactionDate,
        competenceMonth: item.competenceMonth,
        description: item.description,
        amount: item.amount,
        type: item.type,
        accountId: item.accountId,
        paidByUserId: item.paidByUserId,
        ownership: item.ownership,
        subcategoryId: item.subcategoryId,
        projectionId: item.projectionId,
        installmentCurrent: item.installmentCurrent,
        installmentTotal: item.installmentTotal,
        importHash: item.importHash
      });
    }

    this.stagedImports = [];
    this.saveState(true);
    this.renderAll();
    this.showToast(`🫒 ${selected.length} lançamentos importados e conciliados com as metas do mês!`, "success");
  },

  renderCategoriesTab() {
    const container = document.getElementById("categories-list-container");
    if (!container) return;

    const catSelect = document.getElementById("new-sub-category-id");
    if (catSelect && catSelect.options.length === 0) {
      catSelect.innerHTML = this.state.categories
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join("");
    }

    container.innerHTML = this.state.categories
      .map(cat => {
        const subs = this.state.subcategories.filter(s => s.categoryId === cat.id);
        return `
          <div class="oli-card rounded-2xl p-5">
            <div class="flex items-center justify-between mb-3 pb-2 border-b border-stone-800">
              <div class="flex items-center gap-2.5">
                <span class="w-3.5 h-3.5 rounded-full" style="background:${cat.color}"></span>
                <h4 class="font-extrabold text-white text-sm">${cat.name}</h4>
              </div>
              <span class="text-xs text-stone-400">${subs.length} subcategorias</span>
            </div>
            <div class="space-y-2.5">
              ${subs
                .map(s => `
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-stone-950/70 border border-stone-800/80 rounded-xl p-3 text-xs">
                    <div>
                      <div class="font-bold text-stone-200 flex items-center gap-2">
                        ${s.name}
                        ${this.getOwnershipBadge(s.defaultOwnership)}
                      </div>
                      <div class="text-[11px] text-stone-400 mt-1">
                        Palavras-chave OFX/CSV: <span class="text-lime-300">${(s.keywords || []).join(", ") || "Nenhuma"}</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-center">
                      <span class="text-stone-400">Meta: <strong class="text-white">${this.formatBRL(s.defaultMeta)}</strong></span>
                      <button onclick="App.addKeywordPrompt('${s.id}')" class="px-2 py-1 rounded bg-stone-800 hover:bg-lime-500 text-stone-300 hover:text-stone-950 font-bold transition" title="Adicionar palavra-chave para importação automática">
                        + Regra
                      </button>
                    </div>
                  </div>
                `)
                .join("")}
            </div>
          </div>
        `;
      })
      .join("");
  },

  addKeywordPrompt(subId) {
    const sub = this.state.subcategories.find(s => s.id === subId);
    if (!sub) return;
    const kw = prompt(`Digite uma palavra-chave do extrato bancário para classificar automaticamente em "${sub.name}" (Ex: ZONA SUL, DROGASIL, UBER):`);
    if (!kw || !kw.trim()) return;
    if (!sub.keywords) sub.keywords = [];
    sub.keywords.push(kw.trim().toUpperCase());
    this.saveState(true);
    this.renderCategoriesTab();
    this.showToast(`🫒 Regra "${kw.toUpperCase()}" adicionada em ${sub.name}!`, "success");
  },

  handleNewSubcategory(e) {
    e.preventDefault();
    const categoryId = document.getElementById("new-sub-category-id").value;
    const name = document.getElementById("new-sub-name").value.trim();
    const defaultMeta = parseFloat(document.getElementById("new-sub-meta").value) || 0;
    const defaultOwnership = document.getElementById("new-sub-ownership").value;
    const rawKeywords = document.getElementById("new-sub-keywords").value;

    if (!name) return;
    const keywords = rawKeywords
      .split(",")
      .map(k => k.trim().toUpperCase())
      .filter(Boolean);

    const newSubId = "sub_" + Date.now();
    this.state.subcategories.push({
      id: newSubId,
      categoryId,
      name,
      defaultOwnership,
      defaultAccountId: "card_nubank_bruno",
      defaultMeta,
      isFixed: false,
      keywords
    });

    if (defaultMeta > 0) {
      this.state.projections.push({
        id: "proj_" + Date.now(),
        monthYear: this.state.settings.activeMonth,
        subcategoryId: newSubId,
        title: name,
        plannedAmount: defaultMeta,
        accountId: "card_nubank_bruno",
        ownership: defaultOwnership,
        isFixed: false,
        dueDay: 10
      });
    }

    document.getElementById("new-sub-name").value = "";
    document.getElementById("new-sub-meta").value = "";
    document.getElementById("new-sub-keywords").value = "";

    this.saveState(true);
    this.renderAll();
    this.showToast(`🫒 Subcategoria "${name}" criada com sucesso!`, "success");
  },

  renderCloudTab() {
    if (!window.SupabaseSync) return;
    const cfg = window.SupabaseSync.getConfig();
    const urlInput = document.getElementById("supabase-url-input");
    const keyInput = document.getElementById("supabase-key-input");
    if (urlInput && !urlInput.value) urlInput.value = cfg.url || "";
    if (keyInput && !keyInput.value) keyInput.value = cfg.anonKey || "";
  },

  async saveSupabaseCredentials(e) {
    e.preventDefault();
    const url = document.getElementById("supabase-url-input").value.trim();
    const key = document.getElementById("supabase-key-input").value.trim();

    if (!url || !key) {
      this.showToast("Informe a Project URL e a Anon Key do seu projeto Supabase.", "error");
      return;
    }

    const ok = window.SupabaseSync.saveConfig(url, key, true);
    this.updateCloudBadge(ok);

    if (ok) {
      this.initSupabase();
      this.showToast("🫒 Credenciais salvas! Sincronizando com o Supabase...", "info");
      await this.syncNowWithSupabase();
    }
  },

  async syncNowWithSupabase() {
    try {
      await window.SupabaseSync.pushState(this.state, this.loggedUser);
      this.showToast("🫒 Sincronizado com o Supabase com sucesso!", "success");
    } catch (err) {
      this.showToast(err.message, "error");
    }
  },

  async pullFromSupabase() {
    try {
      const remote = await window.SupabaseSync.pullState();
      if (remote) {
        this.state = remote;
        this.saveState(false);
        this.renderAll();
        this.showToast("🫒 Dados carregados da nuvem Supabase com sucesso!", "success");
      } else {
        this.showToast("Nenhum dado encontrado na nuvem ainda. Clique em 'Enviar Dados para o Supabase' primeiro.", "info");
      }
    } catch (err) {
      this.showToast(err.message, "error");
    }
  },

  exportBackupJSON() {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `olifinancas_bruno_nubia_${this.state.settings.activeMonth}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  bindGlobalEvents() {
    const searchInput = document.getElementById("tx-filter-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.txFilter.search = e.target.value;
        this.renderTransactionsTab(this.state.settings.activeMonth);
      });
    }
  },

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const colors = {
      success: "bg-lime-950/95 border-lime-500/50 text-lime-200",
      error: "bg-rose-950/95 border-rose-500/50 text-rose-200",
      info: "bg-stone-900/95 border-amber-500/50 text-amber-200"
    };

    const toast = document.createElement("div");
    toast.className = `px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold flex items-center gap-2 transition-all duration-300 ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  window.App.init();
});
