// ============================================================================
// OLIFINANÇAS 🫒 - LÓGICA PRINCIPAL (INTERFACE CLARA, MINIMALISTA E BRUNO-FIRST)
// ============================================================================

const STORAGE_KEY = "olifinancas_state_v1";

const OLIVE_QUOTES = [
  "🫒 Dica: Digite a descrição abaixo e a categoria é reconhecida automaticamente.",
  "🫒 Pagamento de fatura no extrato da conta corrente é ignorado para não duplicar gastos.",
  "🫒 Quem acompanha o Previsto vs. Realizado fecha o mês com tranquilidade.",
  "🐕 Contas da casa e do Chicó organizadas com divisão justa.",
  "🫒 Importe seu OFX ou CSV na aba Importar para conciliar vários itens de uma vez."
];

window.App = {
  state: null,
  currentTab: "dashboard",
  activeUserFilter: "bruno", // Prioriza Bruno por padrão
  loggedUser: "bruno",
  quickTxType: "EXPENSE",
  projectionGroupMode: "ACCOUNT",
  expandedTreeKeys: {},
  expandedArchiveKeys: {},
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
    }, 12000);
  },

  nextQuote() {
    const el = document.getElementById("oli-humorous-banner-text");
    if (!el) return;
    this.quoteIndex = (this.quoteIndex + 1) % OLIVE_QUOTES.length;
    el.textContent = OLIVE_QUOTES[this.quoteIndex];
  },

  upgradeStateToLatest(stateObj) {
    if (!stateObj || stateObj.version === "1.4.0-oli") return false;
    stateObj.version = "1.4.0-oli";

    if (!stateObj.settings) stateObj.settings = {};
    if (!stateObj.settings.cardCustomMeta) stateObj.settings.cardCustomMeta = {};

    // Atualiza regras de virada dos cartões (Nubank vira dia 9 -> mês seguinte; Itaú vira dia 21 -> próprio mês)
    if (Array.isArray(stateObj.accounts)) {
      stateObj.accounts.forEach(acc => {
        if (acc.id === "card_nubank_bruno") {
          acc.name = "Nubank Bruno (Vira dia 9)";
          acc.closingDay = 9;
          acc.dueDay = 16;
          acc.competenceOffset = 1;
        } else if (acc.id === "card_itau_bruno") {
          acc.name = "Itaucard Bruno (Vira dia 21)";
          acc.closingDay = 21;
          acc.dueDay = 28;
          acc.competenceOffset = 0;
        }
      });
    }

    const individualSubIds = ["sub_lazer_geral", "sub_parceladas", "sub_transporte_app", "sub_jogos", "sub_autocuidado", "sub_analise", "sub_chatgpt", "sub_adobe", "sub_anuidade", "sub_outros"];
    if (Array.isArray(stateObj.subcategories)) {
      stateObj.subcategories.forEach(s => {
        if (individualSubIds.includes(s.id)) {
          s.defaultOwnership = "INDIVIDUAL_BRUNO";
        }
      });
      if (!stateObj.subcategories.some(s => s.id === "sub_feira_cc")) {
        stateObj.subcategories.push({
          id: "sub_feira_cc",
          categoryId: "cat_alimentacao",
          name: "Feira (Conta Corrente / Pix)",
          defaultOwnership: "COLLECTIVE",
          defaultAccountId: "cc_bruno",
          defaultMeta: 0.00,
          isFixed: false,
          keywords: []
        });
      }
    }

    if (Array.isArray(stateObj.projections)) {
      stateObj.projections.forEach(p => {
        if (p.id === "proj_lazer" || p.id === "proj_parceladas") {
          p.ownership = "INDIVIDUAL_BRUNO";
        }
      });
      if (!stateObj.projections.some(p => p.id === "proj_manut_itau")) {
        stateObj.projections.push({
          id: "proj_manut_itau",
          monthYear: "2026-11",
          subcategoryId: "sub_manut_carro",
          title: "Manutenção Carro (Itaú)",
          plannedAmount: 130.40,
          accountId: "card_itau_bruno",
          ownership: "COLLECTIVE",
          isFixed: false,
          dueDay: 19
        });
      }
      if (!stateObj.projections.some(p => p.id === "proj_outros_itau")) {
        stateObj.projections.push({
          id: "proj_outros_itau",
          monthYear: "2026-11",
          subcategoryId: "sub_outros",
          title: "Outros Itaú",
          plannedAmount: 33.70,
          accountId: "card_itau_bruno",
          ownership: "INDIVIDUAL_BRUNO",
          isFixed: false,
          dueDay: 19
        });
      }
    }

    if (Array.isArray(stateObj.transactions)) {
      const userAddedTxs = stateObj.transactions.filter(t => !t.id.startsWith("tx_rec_") && !t.id.startsWith("tx_cc_") && !t.id.startsWith("tx_nu_") && !t.id.startsWith("tx_it_"));
      stateObj.transactions = [
        ...JSON.parse(JSON.stringify(window.INITIAL_SEED_DATA.transactions)),
        ...userAddedTxs
      ];
    }
    return true;
  },

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.state = JSON.parse(saved);
        if (this.upgradeStateToLatest(this.state)) {
          this.saveState(true);
        }
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
    this.showToast("🫒 Dados originais da planilha restaurados!", "success");
  },

  async initSupabase() {
    if (!window.SupabaseSync) return;
    const connected = window.SupabaseSync.initClient((remoteState, updatedBy) => {
      this.state = remoteState;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.renderAll();
      this.showToast(`🫒 Atualizado em tempo real (${updatedBy || "nuvem"})`, "info");
    });
    this.updateCloudBadge(connected);

    if (connected) {
      try {
        const remoteState = await window.SupabaseSync.pullState();
        if (remoteState && remoteState.transactions) {
          const upgraded = this.upgradeStateToLatest(remoteState);
          this.state = remoteState;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
          if (upgraded) {
            await window.SupabaseSync.pushState(this.state, this.loggedUser);
          }
          this.renderAll();
        } else {
          await window.SupabaseSync.pushState(this.state, this.loggedUser);
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
      badge.className = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-lime-100 text-lime-800 border border-lime-300/70 cursor-pointer";
      badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-lime-600"></span> Online`;
    } else {
      badge.className = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300/70 cursor-pointer";
      badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Local`;
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
    return `${parts[2]}/${parts[1]}`;
  },

  getMonthLabel(monthYear) {
    if (!monthYear) return "";
    const [y, m] = monthYear.split("-");
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${months[parseInt(m, 10) - 1] || m} ${y}`;
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
    return this.state.categories.find(c => c.id === catId) || { id: catId, name: "Outros", color: "#4d7c0f", icon: "folder" };
  },

  getAccount(accId) {
    return this.state.accounts.find(a => a.id === accId) || { id: accId, name: "Conta", type: "CHECKING", color: "#4d7c0f" };
  },

  getUser(userId) {
    return this.state.users.find(u => u.id === userId) || { id: userId, name: userId };
  },

  getOwnershipBadge(ownership) {
    if (ownership === "COLLECTIVE") {
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-lime-100 text-lime-800">Casa</span>`;
    }
    if (ownership === "INDIVIDUAL_BRUNO") {
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-700">Bruno</span>`;
    }
    if (ownership === "INDIVIDUAL_NUBIA") {
      return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700">Núbia</span>`;
    }
    return "";
  },

  // ==========================================================================
  // CÁLCULO DE INDICADORES (COM FOCO NO USUÁRIO SELECIONADO OU CASAL)
  // ==========================================================================
  calculateMonthSummary(monthYear, userFilter = "bruno") {
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

    const byAccount = this.state.accounts
      .filter(acc => {
        if (userFilter === "bruno") return acc.ownerId === "bruno";
        if (userFilter === "nubia") return acc.ownerId === "nubia";
        return true;
      })
      .map(acc => {
        const accTxs = monthTxs.filter(t => t.type === "EXPENSE" && t.accountId === acc.id);
        const accProjs = monthProjs.filter(p => p.accountId === acc.id);
        const actual = accTxs.reduce((s, t) => s + Number(t.amount), 0);
        const plannedSum = accProjs.reduce((s, p) => s + Number(p.plannedAmount), 0);
        let planned = plannedSum;
        let isArbitrated = false;
        if (acc.type === "CREDIT_CARD") {
          const metaInfo = this.getCardMetaInfo(monthYear, acc.id);
          planned = metaInfo.effectiveMeta;
          isArbitrated = metaInfo.isArbitrated;
        }
        return {
          account: acc,
          actual,
          planned,
          plannedSum,
          isArbitrated,
          txCount: accTxs.length
        };
      });

    const totalPlannedExpenses = byAccount
      .filter(item => item.account.type !== "INVESTMENT")
      .reduce((s, item) => s + Number(item.planned), 0);

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
      filteredTxs,
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

  // ==========================================================================
  // RENDERIZAÇÃO PRINCIPAL
  // ==========================================================================
  renderAll() {
    const monthYear = this.state.settings.activeMonth;
    this.ensureMonthProjections(monthYear);

    const monthLabelEl = document.getElementById("active-month-label");
    if (monthLabelEl) monthLabelEl.textContent = this.getMonthLabel(monthYear);

    // Botões de filtro de usuário no topo (Bruno, Núbia, Ambos)
    document.querySelectorAll("[data-user-filter]").forEach(btn => {
      const val = btn.getAttribute("data-user-filter");
      if (val === this.activeUserFilter) {
        btn.className = "px-3 py-1 rounded-full text-xs font-bold bg-lime-700 text-white shadow-xs transition";
      } else {
        btn.className = "px-3 py-1 rounded-full text-xs font-medium text-stone-600 hover:text-stone-900 transition";
      }
    });

    // Abas Desktop e Mobile
    document.querySelectorAll("[data-tab-target]").forEach(btn => {
      const target = btn.getAttribute("data-tab-target");
      const isActive = target === this.currentTab;
      if (btn.classList.contains("mobile-nav-btn")) {
        btn.className = `mobile-nav-btn flex flex-col items-center justify-center py-2.5 px-1 text-[11px] font-bold transition ${
          isActive ? "text-lime-700" : "text-stone-400 hover:text-stone-700"
        }`;
      } else {
        btn.className = `flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
          isActive
            ? "bg-lime-700/10 text-lime-800"
            : "text-stone-500 hover:bg-stone-200/60 hover:text-stone-900"
        }`;
      }
    });

    document.querySelectorAll(".tab-section").forEach(sec => {
      sec.classList.toggle("hidden", sec.id !== `tab-${this.currentTab}`);
    });

    const summary = this.calculateMonthSummary(monthYear, this.activeUserFilter);
    this.populateQuickFormSelects();
    this.renderDashboard(summary, monthYear);
    this.renderDiagnosticsTab(monthYear);
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
    if (tabName === "transactions" || tabName === "import") {
      tabName = "dashboard";
    }
    this.currentTab = tabName;
    this.renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  setUserFilter(filter) {
    this.activeUserFilter = filter;
    if (filter === "bruno" || filter === "nubia") {
      this.loggedUser = filter;
    }
    this.renderAll();
  },

  setSplitMode(mode) {
    this.state.settings.splitMode = mode;
    this.saveState(true);
    this.renderAll();
  },

  // ==========================================================================
  // RESOLUÇÃO AUTOMÁTICA DE DIVISÃO (CASAL VS. INDIVIDUAL POR CATEGORIA)
  // ==========================================================================
  resolveDefaultOwnership(subcategoryId, userId = null) {
    const sub = this.getSubcategory(subcategoryId);
    const activeUser = userId || (this.activeUserFilter === "nubia" ? "nubia" : this.loggedUser || "bruno");
    const rule = sub.defaultOwnership || "COLLECTIVE";

    if (rule === "COLLECTIVE") {
      return "COLLECTIVE";
    }
    // Se a subcategoria é especificamente da Núbia (ex: Fisioterapia, Maracatu) e ninguém forçou outro usuário
    if (rule === "INDIVIDUAL_NUBIA" && !userId && this.activeUserFilter === "ALL") {
      return "INDIVIDUAL_NUBIA";
    }
    return activeUser === "nubia" ? "INDIVIDUAL_NUBIA" : "INDIVIDUAL_BRUNO";
  },

  formatSubOptionLabel(sub) {
    const isCollective = (sub.defaultOwnership || "COLLECTIVE") === "COLLECTIVE";
    return `${sub.name} (${isCollective ? "Casa" : "Individual"})`;
  },

  flashAutoOwnershipTag(tagElementId) {
    const el = document.getElementById(tagElementId);
    if (!el) return;
    el.textContent = "• padrão";
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.textContent = "";
    }, 2200);
  },

  // ==========================================================================
  // FORMULÁRIO DE LANÇAMENTO RÁPIDO NA HOME
  // ==========================================================================
  populateQuickFormSelects() {
    const accSelect = document.getElementById("quick-tx-account");
    if (accSelect) {
      const prevVal = accSelect.value;
      const userAccounts = this.state.accounts.filter(a => {
        if (this.activeUserFilter === "bruno") return a.ownerId === "bruno";
        if (this.activeUserFilter === "nubia") return a.ownerId === "nubia";
        return true;
      });
      accSelect.innerHTML = userAccounts
        .map(a => `<option value="${a.id}">${a.name}</option>`)
        .join("");

      if (prevVal && userAccounts.some(a => a.id === prevVal)) {
        accSelect.value = prevVal;
      } else {
        // Por padrão aponta para Conta Corrente (foco em dinheiro sacado / espécie / ajustes)
        accSelect.value = this.activeUserFilter === "nubia" ? "cc_nubia" : "cc_bruno";
      }
    }

    const subSelect = document.getElementById("quick-tx-subcategory");
    if (subSelect) {
      const currentSub = subSelect.value || "sub_flanelinhas";
      subSelect.innerHTML = this.state.categories
        .map(cat => {
          const subs = this.state.subcategories.filter(s => s.categoryId === cat.id);
          return `<optgroup label="${cat.name}">` +
            subs.map(s => `<option value="${s.id}">${this.formatSubOptionLabel(s)}</option>`).join("") +
            `</optgroup>`;
        })
        .join("");
      subSelect.value = currentSub;
    }
  },

  onQuickSubcategoryChange(subId) {
    const accSelect = document.getElementById("quick-tx-account");
    const ownSelect = document.getElementById("quick-tx-ownership");
    const acc = accSelect ? this.getAccount(accSelect.value) : null;
    const ownerId = (acc && acc.ownerId) || (this.activeUserFilter === "nubia" ? "nubia" : "bruno");

    if (ownSelect) {
      ownSelect.value = this.resolveDefaultOwnership(subId, ownerId);
      this.flashAutoOwnershipTag("quick-ownership-auto-tag");
    }
  },

  onQuickAccountChange(accId) {
    const subSelect = document.getElementById("quick-tx-subcategory");
    const ownSelect = document.getElementById("quick-tx-ownership");
    const acc = this.getAccount(accId);
    if (subSelect && ownSelect && acc) {
      ownSelect.value = this.resolveDefaultOwnership(subSelect.value, acc.ownerId);
    }
  },

  setQuickType(type) {
    this.quickTxType = type;
    const btnExp = document.getElementById("quick-type-expense");
    const btnInc = document.getElementById("quick-type-income");
    if (btnExp && btnInc) {
      if (type === "EXPENSE") {
        btnExp.className = "px-2.5 py-1 rounded-md font-bold bg-white text-stone-900 shadow-xs transition";
        btnInc.className = "px-2.5 py-1 rounded-md font-medium text-stone-500 hover:text-stone-800 transition";
      } else {
        btnInc.className = "px-2.5 py-1 rounded-md font-bold bg-lime-700 text-white shadow-xs transition";
        btnExp.className = "px-2.5 py-1 rounded-md font-medium text-stone-500 hover:text-stone-800 transition";
        const subSelect = document.getElementById("quick-tx-subcategory");
        if (subSelect) {
          subSelect.value = this.loggedUser === "nubia" ? "sub_salario_unisuam" : "sub_salario_aoro";
          this.onQuickSubcategoryChange(subSelect.value);
        }
      }
    }
  },

  onQuickDescInput(text) {
    const hint = document.getElementById("quick-auto-cat-hint");
    if (!text || text.trim().length < 2 || !window.StatementParser) {
      if (hint) hint.textContent = "";
      return;
    }
    const matchedSub = window.StatementParser.detectSubcategory(text, this.state);
    if (matchedSub) {
      const subSelect = document.getElementById("quick-tx-subcategory");
      if (subSelect) subSelect.value = matchedSub.id;
      this.onQuickSubcategoryChange(matchedSub.id);
      const isCollective = (matchedSub.defaultOwnership || "COLLECTIVE") === "COLLECTIVE";
      if (hint) hint.textContent = `• ${matchedSub.name} (${isCollective ? "Casa" : "Individual"})`;
    } else if (hint) {
      hint.textContent = "";
    }
  },

  applyQuickPreset(descPlaceholder, subId, preferredAccountId = null) {
    const descInput = document.getElementById("quick-tx-desc");
    const subSelect = document.getElementById("quick-tx-subcategory");
    const accSelect = document.getElementById("quick-tx-account");
    const amountInput = document.getElementById("quick-tx-amount");

    if (preferredAccountId && accSelect && Array.from(accSelect.options).some(o => o.value === preferredAccountId)) {
      accSelect.value = preferredAccountId;
    }
    if (descInput) descInput.value = descPlaceholder;
    if (subSelect) subSelect.value = subId;
    this.onQuickSubcategoryChange(subId);
    if (amountInput) amountInput.focus();
  },

  handleQuickTransaction(e) {
    e.preventDefault();
    const amountInput = document.getElementById("quick-tx-amount");
    const descInput = document.getElementById("quick-tx-desc");
    const accSelect = document.getElementById("quick-tx-account");
    const subSelect = document.getElementById("quick-tx-subcategory");
    const ownSelect = document.getElementById("quick-tx-ownership");
    const hint = document.getElementById("quick-auto-cat-hint");

    const amount = parseFloat(amountInput.value);
    const description = descInput.value.trim();
    const accountId = accSelect.value;
    const subcategoryId = subSelect.value;
    const ownership = ownSelect.value;

    if (!description || isNaN(amount) || amount <= 0) {
      this.showToast("Informe o valor e a descrição.", "error");
      return;
    }

    const monthYear = this.state.settings.activeMonth;
    const todayISO = `${monthYear}-${String(new Date().getDate()).padStart(2, "0")}`;
    const acc = this.getAccount(accountId);
    const paidByUserId = acc.ownerId || this.loggedUser || "bruno";

    // Procura meta correspondente no mês para conciliar automaticamente
    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);
    const matchingProj = monthProjs.find(
      p => p.subcategoryId === subcategoryId && (!p.accountId || p.accountId === accountId)
    ) || monthProjs.find(p => p.subcategoryId === subcategoryId);

    this.state.transactions.push({
      id: "tx_" + Date.now(),
      transactionDate: todayISO,
      competenceMonth: monthYear,
      description,
      amount,
      type: this.quickTxType,
      accountId,
      paidByUserId,
      ownership,
      subcategoryId,
      projectionId: matchingProj ? matchingProj.id : null,
      installmentCurrent: 1,
      installmentTotal: 1
    });

    amountInput.value = "";
    descInput.value = "";
    if (hint) hint.textContent = "";

    this.saveState(true);
    this.renderAll();
    this.showToast(`🫒 ${this.formatBRL(amount)} (${description}) registrado!`, "success");
  },

  // ==========================================================================
  // ABA 1: HOME MINIMALISTA (BRUNO-FIRST)
  // ==========================================================================
  renderDashboard(summary, monthYear) {
    const userLabel = this.activeUserFilter === "bruno"
      ? "Bruno"
      : this.activeUserFilter === "nubia"
      ? "Núbia"
      : "Bruno & Núbia";

    const greetingEl = document.getElementById("home-greeting-title");
    if (greetingEl) {
      greetingEl.textContent = this.activeUserFilter === "ALL"
        ? "Visão do Casal 🫒"
        : `Olá, ${userLabel} 🫒`;
    }

    const accTitleEl = document.getElementById("home-accounts-title");
    if (accTitleEl) {
      accTitleEl.textContent = this.activeUserFilter === "ALL"
        ? "Cartões & Contas da Família"
        : `Cartões & Contas (${userLabel})`;
    }

    const recentTitleEl = document.getElementById("home-recent-tx-title");
    if (recentTitleEl) {
      recentTitleEl.textContent = this.activeUserFilter === "ALL"
        ? "Últimos Lançamentos do Mês"
        : `Últimos Lançamentos (${userLabel})`;
    }

    // Pílulas discretas e minimalistas no topo da Home (sem poluir a página inicial)
    const kpiContainer = document.getElementById("dashboard-kpis");
    if (kpiContainer) {
      kpiContainer.innerHTML = `
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-stone-200/80 text-xs shadow-2xs">
          <span class="text-stone-400 font-semibold">Saídas (${userLabel}):</span>
          <strong class="text-stone-900 font-extrabold">${this.formatBRL(summary.totalActualExpenses)}</strong>
        </div>
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-stone-200/80 text-xs shadow-2xs">
          <span class="text-stone-400 font-semibold">Meta Geral:</span>
          <strong class="text-stone-700 font-bold">${this.formatBRL(summary.totalPlannedExpenses)}</strong>
        </div>
        <button
          type="button"
          onclick="App.switchTab('projections')"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lime-700/10 hover:bg-lime-700/20 text-lime-900 font-bold text-xs transition"
        >
          <i data-lucide="target" class="w-3.5 h-3.5 text-lime-700"></i>
          <span>Ver Metas &rarr;</span>
        </button>
      `;
    }
  },

  // ==========================================================================
  // ABA 4: DIAGNÓSTICO DETALHADO & CASAL (EM PÁGINA PRÓPRIA)
  // ==========================================================================
  renderDiagnosticsTab(monthYear) {
    const fullSummary = this.calculateMonthSummary(monthYear, "ALL");
    const splitEl = document.getElementById("couple-split-panel");
    if (splitEl) {
      const cs = fullSummary.coupleSplit;
      const isProp = this.state.settings.splitMode === "PROPORTIONAL";
      const brunoPct = (cs.brunoShareRatio * 100).toFixed(1);
      const nubiaPct = (cs.nubiaShareRatio * 100).toFixed(1);

      let settlementMsg = "";
      if (Math.abs(cs.brunoNetCredit) < 1) {
        settlementMsg = `<span class="text-lime-800 font-bold">🫒 Tudo em equilíbrio! As contas coletivas estão 100% acertadas.</span>`;
      } else if (cs.brunoNetCredit > 0) {
        settlementMsg = `Para equilibrar as despesas da casa, <strong>Núbia</strong> transfere <strong class="text-lime-800 text-sm">${this.formatBRL(cs.brunoNetCredit)}</strong> para <strong>Bruno</strong>.`;
      } else {
        settlementMsg = `Para equilibrar as despesas da casa, <strong>Bruno</strong> transfere <strong class="text-lime-800 text-sm">${this.formatBRL(Math.abs(cs.brunoNetCredit))}</strong> para <strong>Núbia</strong>.`;
      }

      splitEl.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <h3 class="text-sm font-extrabold text-stone-900 flex items-center gap-2">
              <i data-lucide="users" class="w-4 h-4 text-lime-700"></i>
              Divisão do Casal • Gastos Coletivos da Casa: ${this.formatBRL(cs.totalHouseholdCollective)}
            </h3>
            <p class="text-xs text-stone-500 mt-0.5">Comparativo de quanto cada um pagou pelas despesas coletivas e cálculo de equilíbrio</p>
          </div>
          <div class="inline-flex bg-stone-100 p-1 rounded-xl self-start">
            <button onclick="App.setSplitMode('PROPORTIONAL')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${isProp ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-900"}">
              Proporcional à Renda (${brunoPct}% / ${nubiaPct}%)
            </button>
            <button onclick="App.setSplitMode('EQUAL')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${!isProp ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-900"}">
              Meio a Meio (50% / 50%)
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div class="bg-[#f9faf7] border border-[#e6ece0] rounded-xl p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold text-lime-800 uppercase">Bruno (${brunoPct}%)</span>
              <span class="text-xs text-stone-500">Quota Casa: ${this.formatBRL(cs.brunoFairShare)}</span>
            </div>
            <div class="mt-2 text-lg font-extrabold text-stone-900">Pagou: ${this.formatBRL(cs.paidByBrunoCollective)}</div>
            <div class="text-xs text-stone-500 mt-1">Gastos Individuais Bruno: ${this.formatBRL(fullSummary.individualBrunoActual)}</div>
          </div>

          <div class="bg-[#f9faf7] border border-[#e6ece0] rounded-xl p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold text-rose-700 uppercase">Núbia (${nubiaPct}%)</span>
              <span class="text-xs text-stone-500">Quota Casa: ${this.formatBRL(cs.nubiaFairShare)}</span>
            </div>
            <div class="mt-2 text-lg font-extrabold text-stone-900">Pagou: ${this.formatBRL(cs.paidByNubiaCollective)}</div>
            <div class="text-xs text-stone-500 mt-1">Gastos Individuais Núbia: ${this.formatBRL(fullSummary.individualNubiaActual)}</div>
          </div>

          <div class="bg-lime-50 border border-lime-200 rounded-xl p-4 flex flex-col justify-center">
            <div class="text-xs font-extrabold uppercase text-lime-800 mb-1">🫒 Acerto Sugerido</div>
            <div class="text-xs text-stone-700 leading-relaxed">${settlementMsg}</div>
          </div>
        </div>
      `;
    }

    const diagKpis = document.getElementById("diagnostics-kpis");
    if (diagKpis) {
      diagKpis.innerHTML = `
        <div class="oli-card rounded-2xl p-4">
          <div class="text-xs font-bold text-stone-500">Receita Total da Casa</div>
          <div class="text-xl font-extrabold text-stone-900 mt-1">${this.formatBRL(fullSummary.incomeBruno + fullSummary.incomeNubia)}</div>
          <div class="text-[11px] text-stone-500 mt-1">Bruno: ${this.formatBRL(fullSummary.incomeBruno)} • Núbia: ${this.formatBRL(fullSummary.incomeNubia)}</div>
        </div>
        <div class="oli-card rounded-2xl p-4">
          <div class="text-xs font-bold text-stone-500">Gastos Coletivos (Realizado / Meta)</div>
          <div class="text-xl font-extrabold text-stone-900 mt-1">${this.formatBRL(fullSummary.collectiveActual)}</div>
          <div class="text-[11px] text-stone-500 mt-1">Meta Coletiva: ${this.formatBRL(fullSummary.collectivePlanned)}</div>
        </div>
        <div class="oli-card rounded-2xl p-4">
          <div class="text-xs font-bold text-stone-500">Gastos Individuais Somados</div>
          <div class="text-xl font-extrabold text-stone-900 mt-1">${this.formatBRL(fullSummary.individualBrunoActual + fullSummary.individualNubiaActual)}</div>
          <div class="text-[11px] text-stone-500 mt-1">Meta Individual: ${this.formatBRL(fullSummary.individualTotalPlanned)}</div>
        </div>
      `;
    }

    if (this.currentTab === "diagnostics") {
      this.renderDiagnosticsChart(monthYear);
    }
  },

  renderDiagnosticsChart(monthYear) {
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
              backgroundColor: "#e2e8d8",
              borderColor: "#94a37e",
              borderWidth: 1,
              borderRadius: 6
            },
            {
              label: "Realizado",
              data: actualData,
              backgroundColor: "#4d7c0f",
              borderColor: "#3f6212",
              borderWidth: 1,
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: "#334155", font: { size: 11, weight: "600" } } }
          },
          scales: {
            x: { ticks: { color: "#64748b", font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { color: "#64748b", font: { size: 11 } }, grid: { color: "#f1f5f9" } }
          }
        }
      });
    }
  },

  // ==========================================================================
  // ESTRUTURA DE METAS & GASTOS EM ÁRVORE [+]:
  // 1) CONTA CORRENTE (CARTÕES + CONTAS DÉBITO)
  // 2) CARTÕES DE CRÉDITO SEPARADOS POR CARTÃO E CATEGORIA (COM ARQUIVAMENTO AUTOMÁTICO)
  // ==========================================================================
  getCardMetaInfo(monthYear, cardAccountId) {
    const monthProjs = this.state.projections.filter(
      p => p.monthYear === monthYear && p.accountId === cardAccountId
    );
    const categoriesSum = monthProjs.reduce((s, p) => s + Number(p.plannedAmount || 0), 0);
    const customMap = (this.state.settings && this.state.settings.cardCustomMeta) || {};
    const key = `${monthYear}__${cardAccountId}`;
    const customVal = customMap[key];
    const isArbitrated = typeof customVal === "number" && customVal > 0;
    return {
      categoriesSum,
      customVal: isArbitrated ? customVal : null,
      effectiveMeta: isArbitrated ? customVal : categoriesSum,
      isArbitrated
    };
  },

  promptCardCustomMeta(cardAccountId) {
    const monthYear = this.state.settings.activeMonth;
    const acc = this.getAccount(cardAccountId);
    const info = this.getCardMetaInfo(monthYear, cardAccountId);
    const currentInput = info.isArbitrated ? String(info.customVal) : "";
    const msg =
      `Meta da fatura "${acc.name}" (${this.getMonthLabel(monthYear)}):\n\n` +
      `• Soma automática das categorias do cartão: ${this.formatBRL(info.categoriesSum)}\n\n` +
      `Digite um valor se quiser arbitrar um teto manual (ex: 10000), ou deixe em branco / 0 para usar a soma automática das categorias:`;

    const raw = prompt(msg, currentInput);
    if (raw === null) return;

    if (!this.state.settings.cardCustomMeta) {
      this.state.settings.cardCustomMeta = {};
    }
    const key = `${monthYear}__${cardAccountId}`;
    const cleaned = raw.replace(",", ".").trim();
    const val = parseFloat(cleaned);

    if (!cleaned || isNaN(val) || val <= 0) {
      delete this.state.settings.cardCustomMeta[key];
      this.saveState(true);
      this.renderAll();
      this.showToast(`🫒 Meta de "${acc.name}" voltou para a soma automática (${this.formatBRL(info.categoriesSum)})!`, "info");
    } else {
      this.state.settings.cardCustomMeta[key] = val;
      this.saveState(true);
      this.renderAll();
      this.showToast(`🫒 Meta de "${acc.name}" arbitrada em ${this.formatBRL(val)}!`, "success");
    }
  },

  resetCardCustomMeta(cardAccountId) {
    const monthYear = this.state.settings.activeMonth;
    const acc = this.getAccount(cardAccountId);
    if (this.state.settings && this.state.settings.cardCustomMeta) {
      delete this.state.settings.cardCustomMeta[`${monthYear}__${cardAccountId}`];
    }
    this.saveState(true);
    this.renderAll();
    const info = this.getCardMetaInfo(monthYear, cardAccountId);
    this.showToast(`🫒 Meta de "${acc.name}" usando soma automática (${this.formatBRL(info.categoriesSum)})!`, "info");
  },

  toggleTreeRow(treeKey) {
    this.expandedTreeKeys[treeKey] = !this.expandedTreeKeys[treeKey];
    this.renderAll();
  },

  expandAllTrees(expand = true, accountPrefix = null) {
    const monthYear = this.state.settings.activeMonth;
    this.state.accounts.forEach(acc => {
      if (accountPrefix && acc.id !== accountPrefix) return;
      this.state.subcategories.forEach(sub => {
        const key = `${acc.id}__${sub.id}`;
        if (expand) {
          const hasTx = this.state.transactions.some(
            t => t.competenceMonth === monthYear && t.type === "EXPENSE" && t.accountId === acc.id && t.subcategoryId === sub.id
          );
          if (hasTx) this.expandedTreeKeys[key] = true;
        } else {
          delete this.expandedTreeKeys[key];
        }
      });
    });
    this.renderAll();
  },

  toggleArchiveDrawer(drawerKey) {
    this.expandedArchiveKeys[drawerKey] = !this.expandedArchiveKeys[drawerKey];
    this.renderAll();
  },

  setCategoryMeta(accountId, subcategoryId, rawValue) {
    const monthYear = this.state.settings.activeMonth;
    const val = Math.max(0, parseFloat(String(rawValue).replace(",", ".")) || 0);
    const sub = this.getSubcategory(subcategoryId);
    const acc = this.getAccount(accountId);

    const existingProjs = this.state.projections.filter(
      p => p.monthYear === monthYear && p.accountId === accountId && p.subcategoryId === subcategoryId
    );

    if (existingProjs.length > 0) {
      existingProjs[0].plannedAmount = val;
      for (let i = 1; i < existingProjs.length; i++) {
        existingProjs[i].plannedAmount = 0;
      }
    } else if (val > 0) {
      this.state.projections.push({
        id: "proj_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        monthYear,
        subcategoryId,
        title: sub.name,
        plannedAmount: val,
        accountId,
        ownership: this.resolveDefaultOwnership(subcategoryId, acc.ownerId),
        isFixed: Boolean(sub.isFixed),
        dueDay: acc.dueDay || 10
      });
    }

    this.saveState(true);
    this.renderAll();
    if (val === 0) {
      this.showToast(`🫒 Meta de "${sub.name}" zerada (se não houver gastos, será arquivada).`, "info");
    } else {
      this.showToast(`🫒 Meta de "${sub.name}" atualizada para ${this.formatBRL(val)}!`, "success");
    }
  },

  promptActivateArchivedCategory(accountId, subcategoryId) {
    const sub = this.getSubcategory(subcategoryId);
    const acc = this.getAccount(accountId);
    const defaultVal = sub.defaultMeta > 0 ? String(sub.defaultMeta) : "100";
    const raw = prompt(`Definir meta mensal para "${sub.name}" em ${acc.name} (R$):`, defaultVal);
    if (raw === null) return;
    const val = parseFloat(raw.replace(",", "."));
    if (isNaN(val) || val <= 0) {
      this.showToast("Informe um valor maior que zero para desarquivar a categoria.", "error");
      return;
    }
    this.setCategoryMeta(accountId, subcategoryId, val);
  },

  quickLaunchInCategory(accountId, subcategoryId) {
    const sub = this.getSubcategory(subcategoryId);
    const accSelect = document.getElementById("quick-tx-account");
    const subSelect = document.getElementById("quick-tx-subcategory");
    const descInput = document.getElementById("quick-tx-desc");
    const amountInput = document.getElementById("quick-tx-amount");

    if (this.currentTab !== "dashboard") {
      this.openTransactionModal({
        type: "EXPENSE",
        description: sub.name,
        amount: "",
        accountId,
        subcategoryId,
        ownership: this.resolveDefaultOwnership(subcategoryId, this.getAccount(accountId).ownerId)
      });
      return;
    }

    if (accSelect) accSelect.value = accountId;
    if (subSelect) subSelect.value = subcategoryId;
    this.onQuickSubcategoryChange(subcategoryId);
    if (descInput && !descInput.value) descInput.value = sub.name.split("(")[0].trim();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      if (amountInput) amountInput.focus();
    }, 250);
  },

  getSpreadsheetCellColor(actual, meta) {
    if (meta <= 0 && actual > 0) {
      return {
        actualClass: "bg-amber-50/90 text-amber-900 border border-amber-200/80",
        metaClass: "bg-stone-50 text-stone-500 border border-stone-200/70"
      };
    }
    if (actual > meta && meta > 0) {
      return {
        actualClass: "bg-rose-50/90 text-rose-800 border border-rose-200/80",
        metaClass: "bg-rose-100/70 text-rose-900 border border-rose-200"
      };
    }
    if (Math.abs(actual - meta) < 0.05 && meta > 0) {
      return {
        actualClass: "bg-amber-50/90 text-amber-900 border border-amber-200/80",
        metaClass: "bg-amber-50/90 text-amber-900 border border-amber-200/80"
      };
    }
    return {
      actualClass: "bg-emerald-50/90 text-emerald-900 border border-emerald-200/80",
      metaClass: "bg-emerald-50/70 text-emerald-800 border border-emerald-200/70"
    };
  },

  buildCategoryTreeRowsHTML(accountId, items, monthYear) {
    if (items.length === 0) {
      return `
        <tr>
          <td colspan="4" class="py-6 px-4 text-center text-xs text-stone-400">
            Nenhuma categoria com meta ou lançamento ativo neste bloco.
          </td>
        </tr>
      `;
    }

    return items
      .map(item => {
        const treeKey = `${accountId}__${item.sub.id}`;
        const isExpanded = Boolean(this.expandedTreeKeys[treeKey]);
        const txCount = item.txs.length;
        const colors = this.getSpreadsheetCellColor(item.actual, item.meta);
        const diff = item.meta - item.actual;

        const treeChildrenHTML = isExpanded
          ? `
            <tr class="bg-[#f8faf5] border-b border-stone-200/70">
              <td colspan="4" class="px-4 sm:px-6 py-3">
                <div class="pl-3 sm:pl-5 border-l-2 border-lime-600/40 space-y-1.5">
                  <div class="flex items-center justify-between text-[11px] font-bold text-stone-500 pb-1 border-b border-stone-200/60">
                    <span>Árvore de Lançamentos • ${item.sub.name} (${txCount})</span>
                    <button
                      type="button"
                      onclick="App.quickLaunchInCategory('${accountId}', '${item.sub.id}')"
                      class="text-lime-800 hover:text-lime-950 bg-lime-100 hover:bg-lime-200/80 px-2.5 py-0.5 rounded-lg font-bold transition"
                    >
                      + Novo lançamento aqui
                    </button>
                  </div>
                  ${
                    txCount === 0
                      ? `<div class="py-2 text-xs text-stone-400 italic">└─ Nenhum lançamento registrado ainda nesta categoria no mês (Meta: ${this.formatBRL(item.meta)}).</div>`
                      : item.txs
                          .map((tx, idx) => {
                            const branchChar = idx === txCount - 1 ? "└─" : "├─";
                            const instTag = tx.installmentTotal > 1
                              ? `<span class="px-1.5 py-0.5 rounded bg-stone-200/80 text-stone-700 text-[10px] font-bold">${tx.installmentCurrent}/${tx.installmentTotal}</span>`
                              : "";
                            return `
                              <div class="flex items-center justify-between gap-2 py-1 text-xs hover:bg-white/80 rounded-lg px-2 transition">
                                <div class="flex items-center gap-2 min-w-0">
                                  <span class="font-mono text-lime-700 font-bold select-none">${branchChar}</span>
                                  <span class="text-[11px] text-stone-400 font-semibold w-11 shrink-0">${this.formatDateBR(tx.transactionDate)}</span>
                                  <span class="font-semibold text-stone-800 truncate">${tx.description}</span>
                                  ${instTag}
                                  ${this.getOwnershipBadge(tx.ownership)}
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                  <span class="font-extrabold text-stone-900">${this.formatBRL(tx.amount)}</span>
                                  <button
                                    type="button"
                                    onclick="App.deleteTransaction('${tx.id}')"
                                    class="p-1 text-stone-300 hover:text-rose-600 transition"
                                    title="Excluir lançamento"
                                  >
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                  </button>
                                </div>
                              </div>
                            `;
                          })
                          .join("")
                  }
                </div>
              </td>
            </tr>
          `
          : "";

        return `
          <tr class="border-b border-stone-100 hover:bg-stone-50/90 transition group">
            <td class="py-2.5 px-3 sm:px-4">
              <div class="flex items-center gap-2.5">
                <button
                  type="button"
                  onclick="App.toggleTreeRow('${treeKey}')"
                  class="w-6 h-6 rounded-lg flex items-center justify-center font-extrabold text-xs border transition shrink-0 ${
                    isExpanded
                      ? "bg-lime-700 text-white border-lime-700 shadow-2xs"
                      : "bg-white hover:bg-lime-50 text-stone-700 border-stone-300"
                  }"
                  title="${isExpanded ? "Recolher lançamentos" : "Abrir árvore com cada lançamento"}"
                >
                  ${isExpanded ? "&minus;" : "+"}
                </button>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onclick="App.toggleTreeRow('${treeKey}')"
                      class="font-bold text-stone-800 hover:text-lime-800 text-xs sm:text-sm text-left transition"
                    >
                      ${item.sub.name}
                    </button>
                    ${this.getOwnershipBadge(item.ownership)}
                    ${
                      txCount > 0
                        ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">${txCount} ${txCount === 1 ? "item" : "itens"}</span>`
                        : `<span class="text-[10px] font-medium text-stone-400">0 itens</span>`
                    }
                  </div>
                </div>
              </div>
            </td>

            <!-- Coluna REALIZADO (Estilo Planilha) -->
            <td class="py-2 px-2 sm:px-3 text-right w-28 sm:w-36">
              <div class="inline-block w-full px-2.5 py-1.5 rounded-lg font-extrabold text-xs sm:text-sm text-right ${colors.actualClass}">
                ${this.formatBRL(item.actual)}
              </div>
            </td>

            <!-- Coluna META (Editável direto na célula) -->
            <td class="py-2 px-2 sm:px-3 text-right w-28 sm:w-36">
              <div class="relative flex items-center justify-end">
                <input
                  type="number"
                  step="0.01"
                  value="${Number(item.meta).toFixed(2)}"
                  onchange="App.setCategoryMeta('${accountId}', '${item.sub.id}', this.value)"
                  title="Clique para editar a Meta desta categoria (0 para arquivar se não houver gastos)"
                  class="w-full rounded-lg px-2.5 py-1.5 text-right font-extrabold text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-lime-600 transition ${colors.metaClass}"
                />
              </div>
            </td>

            <!-- Coluna SALDO / AÇÃO RÁPIDA -->
            <td class="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap w-24 sm:w-32">
              <div class="flex items-center justify-end gap-1.5">
                <span class="text-xs font-bold ${diff >= 0 ? "text-lime-700" : "text-rose-600"}">
                  ${diff >= 0 ? "+" : ""}${this.formatBRL(diff)}
                </span>
                <button
                  type="button"
                  onclick="App.quickLaunchInCategory('${accountId}', '${item.sub.id}')"
                  class="opacity-70 group-hover:opacity-100 p-1 rounded-lg hover:bg-lime-100 text-lime-800 transition"
                  title="Adicionar lançamento nesta categoria"
                >
                  <i data-lucide="plus-circle" class="w-4 h-4"></i>
                </button>
              </div>
            </td>
          </tr>
          ${treeChildrenHTML}
        `;
      })
      .join("");
  },

  buildArchiveDrawerHTML(drawerKey, accountId, archivedSubs) {
    if (!archivedSubs || archivedSubs.length === 0) return "";
    const isOpen = Boolean(this.expandedArchiveKeys[drawerKey]);

    return `
      <div class="border-t border-stone-200/70 bg-stone-50/70 px-4 py-2.5">
        <button
          type="button"
          onclick="App.toggleArchiveDrawer('${drawerKey}')"
          class="w-full flex items-center justify-between text-xs text-stone-500 hover:text-stone-800 font-semibold transition"
        >
          <span class="flex items-center gap-2">
            <i data-lucide="archive" class="w-3.5 h-3.5 text-stone-400"></i>
            <span>Categorias Arquivadas sem meta e sem lançamento (${archivedSubs.length})</span>
          </span>
          <span class="font-bold text-lime-700">${isOpen ? "Ocultar [-]" : "Ver arquivadas [+]"}</span>
        </button>
        ${
          isOpen
            ? `
              <div class="mt-3 pt-2.5 border-t border-stone-200/60 flex flex-wrap gap-2">
                ${archivedSubs
                  .map(
                    sub => `
                      <div class="inline-flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 text-xs text-stone-600 shadow-2xs">
                        <span class="font-semibold text-stone-700">${sub.name}</span>
                        <span class="text-[10px] text-stone-400">(0,00 / 0,00)</span>
                        <button
                          type="button"
                          onclick="App.promptActivateArchivedCategory('${accountId}', '${sub.id}')"
                          class="ml-1 px-2 py-0.5 rounded-lg bg-lime-50 hover:bg-lime-100 text-lime-800 font-bold text-[11px] transition"
                          title="Definir uma meta para desarquivar"
                        >
                          + Meta
                        </button>
                        <button
                          type="button"
                          onclick="App.quickLaunchInCategory('${accountId}', '${sub.id}')"
                          class="px-1.5 py-0.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition"
                          title="Fazer um lançamento nesta categoria"
                        >
                          + Lançar
                        </button>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `
            : ""
        }
      </div>
    `;
  },

  buildStructuredBudgetHTML(monthYear) {
    const userFilter = this.activeUserFilter;
    const userLabel = userFilter === "bruno" ? "BRUNO" : userFilter === "nubia" ? "NÚBIA" : "CASAL (BRUNO & NÚBIA)";

    const monthTxs = this.state.transactions.filter(
      t => t.competenceMonth === monthYear && t.type === "EXPENSE"
    );
    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);

    // Filtra contas correntes e cartões do usuário ativo
    const checkingAccounts = this.state.accounts.filter(acc => {
      if (acc.type !== "CHECKING") return false;
      if (userFilter === "bruno") return acc.ownerId === "bruno";
      if (userFilter === "nubia") return acc.ownerId === "nubia";
      return true;
    });

    const creditCards = this.state.accounts.filter(acc => {
      if (acc.type !== "CREDIT_CARD") return false;
      if (userFilter === "bruno") return acc.ownerId === "bruno";
      if (userFilter === "nubia") return acc.ownerId === "nubia";
      return true;
    });

    const primaryCheckingId = checkingAccounts[0] ? checkingAccounts[0].id : "cc_bruno";
    const checkingIds = checkingAccounts.map(a => a.id);

    // 1A. Resumo dos Cartões de Crédito no topo (Bloco CONTA CORRENTE)
    const cardSummaryRows = creditCards.map(card => {
      const cardTxs = monthTxs.filter(t => t.accountId === card.id);
      const actual = cardTxs.reduce((s, t) => s + Number(t.amount), 0);
      const metaInfo = this.getCardMetaInfo(monthYear, card.id);
      return {
        card,
        actual,
        meta: metaInfo.effectiveMeta,
        categoriesSum: metaInfo.categoriesSum,
        isArbitrated: metaInfo.isArbitrated
      };
    });

    const totalCardsActual = cardSummaryRows.reduce((s, r) => s + r.actual, 0);
    const totalCardsMeta = cardSummaryRows.reduce((s, r) => s + r.meta, 0);

    // 1B. Categorias da Conta Corrente (Débito / Pix)
    const expenseSubcategories = this.state.subcategories.filter(s => {
      const cat = this.getCategory(s.categoryId);
      return cat && cat.type === "EXPENSE";
    });

    const activeCheckingItems = [];
    const archivedCheckingSubs = [];

    expenseSubcategories.forEach(sub => {
      const subTxs = monthTxs.filter(t => checkingIds.includes(t.accountId) && t.subcategoryId === sub.id);
      const subProjs = monthProjs.filter(p => checkingIds.includes(p.accountId) && p.subcategoryId === sub.id);
      const actual = subTxs.reduce((s, t) => s + Number(t.amount), 0);
      const meta = subProjs.reduce((s, p) => s + Number(p.plannedAmount), 0);

      if (actual > 0 || meta > 0) {
        const targetAccId = (subProjs[0] && subProjs[0].accountId) || (subTxs[0] && subTxs[0].accountId) || primaryCheckingId;
        const ownership = (subProjs[0] && subProjs[0].ownership) || (subTxs[0] && subTxs[0].ownership) || this.resolveDefaultOwnership(sub.id);
        activeCheckingItems.push({
          sub,
          accountId: targetAccId,
          actual,
          meta,
          txs: subTxs,
          ownership
        });
      } else if (checkingIds.includes(sub.defaultAccountId)) {
        archivedCheckingSubs.push(sub);
      }
    });

    const totalCheckingDebitActual = activeCheckingItems.reduce((s, i) => s + i.actual, 0);
    const totalCheckingDebitMeta = activeCheckingItems.reduce((s, i) => s + i.meta, 0);

    const grandTotalCheckingActual = totalCardsActual + totalCheckingDebitActual;
    const grandTotalCheckingMeta = totalCardsMeta + totalCheckingDebitMeta;
    const grandTotalDiff = grandTotalCheckingMeta - grandTotalCheckingActual;

    // Render das linhas de Cartão no Bloco CONTA CORRENTE
    const cardsInCheckingHTML = cardSummaryRows
      .map(row => {
        const colors = this.getSpreadsheetCellColor(row.actual, row.meta);
        const diff = row.meta - row.actual;
        return `
          <tr class="border-b border-stone-200/70 hover:bg-stone-50 transition">
            <td class="py-2.5 px-3 sm:px-4">
              <div class="flex items-center justify-between gap-2">
                <a
                  href="#card-block-${row.card.id}"
                  class="font-extrabold text-stone-900 hover:text-lime-800 text-xs sm:text-sm uppercase tracking-tight flex items-center gap-2"
                >
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${row.card.color}"></span>
                  <span>${row.card.name.replace(" (Dia 8)", "").replace(" (Dia 19)", "")}</span>
                  <span class="text-[10px] font-semibold text-stone-400 normal-case">(ver categorias &darr;)</span>
                </a>
                ${
                  row.isArbitrated
                    ? `
                      <div class="flex items-center gap-1">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold" title="Soma das categorias: ${this.formatBRL(row.categoriesSum)}">
                          Arbitrado (Σ ${this.formatBRL(row.categoriesSum)})
                        </span>
                        <button
                          type="button"
                          onclick="App.resetCardCustomMeta('${row.card.id}')"
                          class="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold transition"
                          title="Voltar para a soma automática das categorias do cartão"
                        >
                          ↺ Auto
                        </button>
                      </div>
                    `
                    : `
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-semibold">
                        Σ categorias
                      </span>
                    `
                }
              </div>
            </td>
            <td class="py-2 px-2 sm:px-3 text-right w-28 sm:w-36">
              <div class="inline-block w-full px-2.5 py-1.5 rounded-lg font-extrabold text-xs sm:text-sm text-right ${colors.actualClass}">
                ${this.formatBRL(row.actual)}
              </div>
            </td>
            <td class="py-2 px-2 sm:px-3 text-right w-28 sm:w-36">
              <button
                type="button"
                onclick="App.promptCardCustomMeta('${row.card.id}')"
                title="Clique para arbitrar um valor fixo para o cartão ou usar a soma automática das categorias"
                class="w-full px-2.5 py-1.5 rounded-lg font-extrabold text-xs sm:text-sm text-right flex items-center justify-between gap-1 hover:ring-2 hover:ring-lime-600 transition ${colors.metaClass}"
              >
                <i data-lucide="pencil" class="w-3 h-3 opacity-50 shrink-0"></i>
                <span>${this.formatBRL(row.meta)}</span>
              </button>
            </td>
            <td class="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap w-24 sm:w-32">
              <span class="text-xs font-bold ${diff >= 0 ? "text-lime-700" : "text-rose-600"}">
                ${diff >= 0 ? "+" : ""}${this.formatBRL(diff)}
              </span>
            </td>
          </tr>
        `;
      })
      .join("");

    // 2. Blocos de Cartão de Crédito Separados por Cartão (com árvore [+] por categoria)
    const creditCardsBlocksHTML = creditCards
      .map(card => {
        const cardTxs = monthTxs.filter(t => t.accountId === card.id);
        const cardProjs = monthProjs.filter(p => p.accountId === card.id);
        const metaInfo = this.getCardMetaInfo(monthYear, card.id);
        const cardActual = cardTxs.reduce((s, t) => s + Number(t.amount), 0);

        const activeCardItems = [];
        const archivedCardSubs = [];

        expenseSubcategories.forEach(sub => {
          const subTxs = cardTxs.filter(t => t.subcategoryId === sub.id);
          const subProjs = cardProjs.filter(p => p.subcategoryId === sub.id);
          const actual = subTxs.reduce((s, t) => s + Number(t.amount), 0);
          const meta = subProjs.reduce((s, p) => s + Number(p.plannedAmount), 0);

          if (actual > 0 || meta > 0) {
            const ownership = (subProjs[0] && subProjs[0].ownership) || (subTxs[0] && subTxs[0].ownership) || this.resolveDefaultOwnership(sub.id, card.ownerId);
            activeCardItems.push({
              sub,
              accountId: card.id,
              actual,
              meta,
              txs: subTxs,
              ownership
            });
          } else if (sub.defaultAccountId === card.id) {
            archivedCardSubs.push(sub);
          }
        });

        const cardDiff = metaInfo.effectiveMeta - cardActual;

        return `
          <div id="card-block-${card.id}" class="oli-card rounded-3xl overflow-hidden shadow-xs">
            <!-- Cabeçalho do Cartão -->
            <div class="px-5 py-4 bg-stone-50/90 border-b border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class="w-3.5 h-3.5 rounded-full shrink-0" style="background:${card.color}"></span>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-extrabold text-stone-900 text-sm sm:text-base uppercase tracking-tight">${card.name}</h3>
                    ${card.dueDay ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-stone-200/75 text-stone-700 font-bold">Vence dia ${card.dueDay}</span>` : ""}
                  </div>
                  <p class="text-xs text-stone-500 mt-0.5">
                    Clique em <strong>[+]</strong> para abrir os lançamentos de cada categoria ou edite a <strong>Meta</strong> diretamente.
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2 self-start sm:self-center">
                <button
                  type="button"
                  onclick="App.expandAllTrees(true, '${card.id}')"
                  class="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:border-lime-600 text-stone-600 text-[11px] font-bold transition"
                >
                  Expandir [+]
                </button>
                <button
                  type="button"
                  onclick="App.expandAllTrees(false, '${card.id}')"
                  class="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:border-lime-600 text-stone-600 text-[11px] font-bold transition"
                >
                  Recolher [-]
                </button>
                <button
                  type="button"
                  onclick="App.promptCardCustomMeta('${card.id}')"
                  class="px-2.5 py-1 rounded-lg bg-lime-700/10 hover:bg-lime-700/20 text-lime-900 text-[11px] font-bold transition"
                >
                  ${metaInfo.isArbitrated ? `Meta Arbitrada: ${this.formatBRL(metaInfo.effectiveMeta)}` : "Arbitrar Teto do Cartão"}
                </button>
              </div>
            </div>

            <!-- Tabela de Categorias Ativas do Cartão -->
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-stone-200/80 text-[11px] font-extrabold uppercase text-stone-400 bg-white">
                    <th class="py-2.5 px-3 sm:px-4">Categoria do Cartão</th>
                    <th class="py-2.5 px-2 sm:px-3 text-right">Realizado</th>
                    <th class="py-2.5 px-2 sm:px-3 text-right">Meta</th>
                    <th class="py-2.5 px-3 sm:px-4 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.buildCategoryTreeRowsHTML(card.id, activeCardItems, monthYear)}
                </tbody>
                <tfoot>
                  <tr class="bg-emerald-100/70 border-t-2 border-emerald-300/80 font-extrabold text-stone-900 text-xs sm:text-sm">
                    <td class="py-3 px-3 sm:px-4 uppercase tracking-wide">
                      TOTAL ${card.name.split("(")[0].trim()}
                      ${
                        metaInfo.isArbitrated
                          ? `<span class="ml-2 text-[11px] font-semibold text-stone-600 normal-case">(Soma das categorias: ${this.formatBRL(metaInfo.categoriesSum)})</span>`
                          : ""
                      }
                    </td>
                    <td class="py-3 px-2 sm:px-3 text-right">${this.formatBRL(cardActual)}</td>
                    <td class="py-3 px-2 sm:px-3 text-right">${this.formatBRL(metaInfo.effectiveMeta)}</td>
                    <td class="py-3 px-3 sm:px-4 text-right ${cardDiff >= 0 ? "text-lime-800" : "text-rose-700"}">
                      ${cardDiff >= 0 ? "+" : ""}${this.formatBRL(cardDiff)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <!-- Gaveta de Categorias Arquivadas do Cartão -->
            ${this.buildArchiveDrawerHTML(`archive__${card.id}`, card.id, archivedCardSubs)}
          </div>
        `;
      })
      .join("");

    // Retorno Completo: Bloco 1 (CONTA CORRENTE) + Bloco 2 (CARTÕES POR CATEGORIA)
    return `
      <!-- ================================================================ -->
      <!-- BLOCO 1: RESUMO GERAL DO QUE SAI DA CONTA CORRENTE (CARTÕES + DÉBITO) -->
      <!-- ================================================================ -->
      <div class="oli-card rounded-3xl overflow-hidden shadow-xs border-stone-300/80">
        <div class="px-5 py-4 bg-stone-100/90 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-md bg-stone-900 text-white text-[10px] font-extrabold uppercase tracking-wider">1º Bloco</span>
              <h3 class="font-extrabold text-stone-900 text-sm sm:text-base uppercase tracking-tight">
                DESPESAS • ${userLabel} • CONTA CORRENTE
              </h3>
            </div>
            <p class="text-xs text-stone-500 mt-0.5">
              Dinâmica do mês: pagamento das faturas dos cartões + contas da casa no débito/Pix.
            </p>
          </div>
          <div class="text-xs font-semibold text-stone-600">
            Saída Total: <strong class="text-stone-900">${this.formatBRL(grandTotalCheckingActual)}</strong>
            <span class="text-stone-400"> / Meta ${this.formatBRL(grandTotalCheckingMeta)}</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-stone-200/80 text-[11px] font-extrabold uppercase text-stone-400 bg-white">
                <th class="py-2.5 px-3 sm:px-4">Conta Corrente (Faturas + Contas em Débito)</th>
                <th class="py-2.5 px-2 sm:px-3 text-right">Realizado</th>
                <th class="py-2.5 px-2 sm:px-3 text-right">Meta</th>
                <th class="py-2.5 px-3 sm:px-4 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <!-- 1A. Faturas dos Cartões -->
              ${cardsInCheckingHTML}

              <!-- SUBTOTAL CARTÕES (TOTAL CARTÃO) -->
              <tr class="bg-emerald-100/80 border-b-2 border-emerald-300/80 font-extrabold text-stone-900 text-xs sm:text-sm">
                <td class="py-2.5 px-3 sm:px-4 uppercase tracking-wide">TOTAL CARTÃO</td>
                <td class="py-2.5 px-2 sm:px-3 text-right">${this.formatBRL(totalCardsActual)}</td>
                <td class="py-2.5 px-2 sm:px-3 text-right">${this.formatBRL(totalCardsMeta)}</td>
                <td class="py-2.5 px-3 sm:px-4 text-right ${(totalCardsMeta - totalCardsActual) >= 0 ? "text-lime-800" : "text-rose-700"}">
                  ${(totalCardsMeta - totalCardsActual) >= 0 ? "+" : ""}${this.formatBRL(totalCardsMeta - totalCardsActual)}
                </td>
              </tr>

              <!-- Divisor sutil para Contas da Casa em Débito -->
              <tr class="bg-stone-50/90 border-b border-stone-200/70">
                <td colspan="4" class="py-1.5 px-3 sm:px-4 text-[11px] font-extrabold uppercase tracking-wider text-stone-500">
                  Contas do Mês em Débito / Pix na Conta Corrente (clique em [+] para abrir os lançamentos)
                </td>
              </tr>

              <!-- 1B. Categorias em Débito na Conta Corrente -->
              ${this.buildCategoryTreeRowsHTML(primaryCheckingId, activeCheckingItems, monthYear)}
            </tbody>
            <tfoot>
              <!-- TOTAL DESPESAS (CONTA CORRENTE) -->
              <tr class="bg-stone-900 text-white font-extrabold text-xs sm:text-sm">
                <td class="py-3.5 px-3 sm:px-4 uppercase tracking-wider">TOTAL DESPESAS (Saída Conta Corrente)</td>
                <td class="py-3.5 px-2 sm:px-3 text-right text-amber-300">${this.formatBRL(grandTotalCheckingActual)}</td>
                <td class="py-3.5 px-2 sm:px-3 text-right text-stone-200">${this.formatBRL(grandTotalCheckingMeta)}</td>
                <td class="py-3.5 px-3 sm:px-4 text-right ${grandTotalDiff >= 0 ? "text-lime-300" : "text-rose-300"}">
                  ${grandTotalDiff >= 0 ? "+" : ""}${this.formatBRL(grandTotalDiff)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Gaveta de Categorias Arquivadas da Conta Corrente (ex: Análise 0/0, Feira CC 0/0, Creche 0/0) -->
        ${this.buildArchiveDrawerHTML("archive__checking", primaryCheckingId, archivedCheckingSubs)}
      </div>

      <!-- ================================================================ -->
      <!-- BLOCO 2: CARTÕES DE CRÉDITO SEPARADOS POR CARTÃO E CATEGORIA -->
      <!-- ================================================================ -->
      <div class="pt-2 space-y-5">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-md bg-lime-800 text-white text-[10px] font-extrabold uppercase tracking-wider">2º Bloco</span>
            <h3 class="text-sm sm:text-base font-extrabold text-stone-900 uppercase tracking-tight">
              Detalhamento dos Cartões de Crédito por Categoria
            </h3>
          </div>
          <span class="text-xs text-stone-500 hidden sm:inline">Clique em <strong>[+]</strong> em qualquer categoria para ver cada compra</span>
        </div>

        ${creditCardsBlocksHTML}
      </div>
    `;
  },

  renderProjectionsTab(summary, monthYear) {
    const container = document.getElementById("projections-groups-container");
    if (!container) return;
    container.innerHTML = this.buildStructuredBudgetHTML(monthYear);
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

  // ==========================================================================
  // ABA 3: EXTRATO COMPLETO
  // ==========================================================================
  renderTransactionsTab(monthYear) {
    const accFilterEl = document.getElementById("tx-filter-account");
    if (accFilterEl && accFilterEl.options.length <= 1) {
      accFilterEl.innerHTML = `<option value="ALL">Todas as Contas</option>` +
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

    const badgeEl = document.getElementById("history-count-badge");
    if (badgeEl) {
      badgeEl.textContent = `${txs.length} ${txs.length === 1 ? "item" : "itens"}`;
    }

    if (txs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-10 text-center text-stone-400 text-xs">
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
          ? `<span class="ml-1 px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[10px] font-bold">${tx.installmentCurrent}/${tx.installmentTotal}</span>`
          : "";

        const txMonthPrefix = tx.transactionDate ? tx.transactionDate.substring(0, 7) : tx.competenceMonth;
        const shiftedBadge = tx.competenceMonth > txMonthPrefix
          ? `<div class="text-[10px] text-amber-700 font-semibold mt-0.5">↳ Vira dia ${acc.closingDay || 9} → Comp. ${this.getMonthLabel(tx.competenceMonth).split(" ")[0]}</div>`
          : "";

        return `
          <tr class="border-b border-stone-100 hover:bg-stone-50/80 transition text-xs sm:text-sm">
            <td class="py-3 px-4 whitespace-nowrap text-stone-500 text-xs font-medium">
              <div>${this.formatDateBR(tx.transactionDate)}</div>
              ${shiftedBadge}
            </td>
            <td class="py-3 px-4">
              <div class="font-bold text-stone-800">${tx.description} ${instBadge}</div>
              ${linkedProj ? `<div class="text-[11px] text-lime-700 font-medium mt-0.5">Meta: ${linkedProj.title}</div>` : ""}
            </td>
            <td class="py-3 px-4">
              <span class="inline-flex items-center gap-1.5 text-xs text-stone-600 font-medium">
                <span class="w-2 h-2 rounded-full" style="background:${cat.color}"></span>
                ${sub.name}
              </span>
            </td>
            <td class="py-3 px-4">
              <span class="text-xs font-semibold text-stone-700">${acc.name}</span>
              <div class="text-[11px] text-stone-400">${user.name}</div>
            </td>
            <td class="py-3 px-4">${this.getOwnershipBadge(tx.ownership)}</td>
            <td class="py-3 px-4 text-right font-extrabold whitespace-nowrap ${
              tx.type === "INCOME" ? "text-lime-700" : "text-stone-900"
            }">
              ${tx.type === "INCOME" ? "+" : "-"}${this.formatBRL(tx.amount)}
            </td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
              <button onclick="App.deleteTransaction('${tx.id}')" class="p-1.5 rounded-lg text-stone-300 hover:text-rose-600 transition" title="Excluir">
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
          subs.map(s => `<option value="${s.id}">${this.formatSubOptionLabel(s)}</option>`).join("") +
          `</optgroup>`;
      })
      .join("");

    const projSelect = document.getElementById("tx-modal-projection");
    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);
    projSelect.innerHTML = `<option value="">-- Automático pela subcategoria --</option>` +
      monthProjs.map(p => `<option value="${p.id}">${p.title} (Meta: ${this.formatBRL(p.plannedAmount)})</option>`).join("");

    const initialUser = prefill.paidByUserId || this.loggedUser;
    const initialSub = prefill.subcategoryId || "sub_feira_sup";

    document.getElementById("tx-modal-type").value = prefill.type || "EXPENSE";
    document.getElementById("tx-modal-date").value = prefill.transactionDate || todayISO;
    document.getElementById("tx-modal-desc").value = prefill.description || "";
    document.getElementById("tx-modal-amount").value = prefill.amount !== undefined ? prefill.amount : "";
    accSelect.value = prefill.accountId || (initialUser === "nubia" ? "cc_nubia" : "card_nubank_bruno");
    document.getElementById("tx-modal-user").value = initialUser;
    subSelect.value = initialSub;
    document.getElementById("tx-modal-ownership").value = prefill.ownership || this.resolveDefaultOwnership(initialSub, initialUser);
    projSelect.value = prefill.projectionId || "";
    document.getElementById("tx-modal-installments").value = "1";

    modal.classList.remove("hidden");
  },

  onModalSubcategoryChange(subId) {
    const userSelect = document.getElementById("tx-modal-user");
    const ownSelect = document.getElementById("tx-modal-ownership");
    const projSelect = document.getElementById("tx-modal-projection");
    const userId = userSelect ? userSelect.value : this.loggedUser;

    if (ownSelect) {
      ownSelect.value = this.resolveDefaultOwnership(subId, userId);
      this.flashAutoOwnershipTag("modal-ownership-auto-tag");
    }

    if (projSelect) {
      const monthProjs = this.state.projections.filter(p => p.monthYear === this.state.settings.activeMonth);
      const matchingProj = monthProjs.find(p => p.subcategoryId === subId);
      projSelect.value = matchingProj ? matchingProj.id : "";
    }
  },

  onModalAccountChange(accId) {
    const acc = this.getAccount(accId);
    const userSelect = document.getElementById("tx-modal-user");
    const subSelect = document.getElementById("tx-modal-subcategory");
    if (acc && acc.ownerId && userSelect) {
      userSelect.value = acc.ownerId;
      if (subSelect) this.onModalSubcategoryChange(subSelect.value);
    }
  },

  onModalUserChange(userId) {
    const subSelect = document.getElementById("tx-modal-subcategory");
    const ownSelect = document.getElementById("tx-modal-ownership");
    if (subSelect && ownSelect) {
      ownSelect.value = this.resolveDefaultOwnership(subSelect.value, userId);
      this.flashAutoOwnershipTag("modal-ownership-auto-tag");
    }
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

    const acc = this.getAccount(accountId);
    const baseMonth = window.StatementParser
      ? window.StatementParser.computeCompetenceMonth(txDate, acc, this.state.settings.activeMonth)
      : this.state.settings.activeMonth;
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
        ? `🫒 Compra parcelada registrada (${installments}x a partir de ${this.getMonthLabel(baseMonth)})!`
        : `🫒 Lançamento salvo na competência ${this.getMonthLabel(baseMonth)}!`,
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
          subs.map(s => `<option value="${s.id}">${this.formatSubOptionLabel(s)}</option>`).join("") +
          `</optgroup>`;
      })
      .join("");

    const acc = this.getAccount(accSelect.value);
    const ownSelect = document.getElementById("proj-modal-ownership");
    if (ownSelect && subSelect.value) {
      ownSelect.value = this.resolveDefaultOwnership(subSelect.value, acc ? acc.ownerId : "bruno");
    }

    document.getElementById("proj-modal-title").value = "";
    document.getElementById("proj-modal-amount").value = "";
    modal.classList.remove("hidden");
  },

  onProjModalSubcategoryChange(subId) {
    const accSelect = document.getElementById("proj-modal-account");
    const acc = accSelect ? this.getAccount(accSelect.value) : null;
    const ownSelect = document.getElementById("proj-modal-ownership");
    if (ownSelect) {
      ownSelect.value = this.resolveDefaultOwnership(subId, acc ? acc.ownerId : "bruno");
    }
  },

  onProjModalAccountChange(accId) {
    const acc = this.getAccount(accId);
    const subSelect = document.getElementById("proj-modal-subcategory");
    const ownSelect = document.getElementById("proj-modal-ownership");
    if (ownSelect && subSelect) {
      ownSelect.value = this.resolveDefaultOwnership(subSelect.value, acc ? acc.ownerId : "bruno");
    }
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
    this.showToast(`🫒 Meta "${title}" adicionada!`, "success");
  },

  // ==========================================================================
  // ABA 5: IMPORTAR EXTRATO (OFX / CSV)
  // ==========================================================================
  onImportAccountChange(accId) {
    this.importTargetAccountId = accId;
    this.updateImportCycleRuleHint();
    if (this.stagedImports && this.stagedImports.length > 0 && window.StatementParser) {
      const account = this.getAccount(accId);
      this.stagedImports.forEach(item => {
        item.accountId = accId;
        item.paidByUserId = account.ownerId || "bruno";
        item.competenceMonth = window.StatementParser.computeCompetenceMonth(
          item.transactionDate,
          account,
          this.state.settings.activeMonth
        );
      });
      this.renderImportTab(this.state.settings.activeMonth);
    }
  },

  updateImportCycleRuleHint() {
    const hintEl = document.getElementById("import-cycle-rule-hint");
    if (!hintEl || !window.StatementParser) return;
    const acc = this.getAccount(this.importTargetAccountId);
    hintEl.innerHTML = `<strong>Regra de Virada (${acc.name}):</strong> ${window.StatementParser.describeCardCycleRule(acc)}`;
  },

  renderImportTab(monthYear) {
    const accSelect = document.getElementById("import-account-select");
    if (accSelect) {
      const currentVal = accSelect.value || this.importTargetAccountId;
      accSelect.innerHTML = this.state.accounts
        .filter(a => a.type !== "INVESTMENT")
        .map(a => `<option value="${a.id}">${a.name}</option>`)
        .join("");
      accSelect.value = currentVal;
      this.importTargetAccountId = accSelect.value;
    }
    this.updateImportCycleRuleHint();

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

    const availableMonths = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];

    tbody.innerHTML = this.stagedImports
      .map((item, idx) => {
        const subOptions = this.state.subcategories
          .map(s => `<option value="${s.id}" ${s.id === item.subcategoryId ? "selected" : ""}>${s.name}</option>`)
          .join("");

        const compOptions = availableMonths
          .map(m => `<option value="${m}" ${m === item.competenceMonth ? "selected" : ""}>${this.getMonthLabel(m)}</option>`)
          .join("");

        const txMonthPrefix = item.transactionDate ? item.transactionDate.substring(0, 7) : item.competenceMonth;
        const shiftedToNext = item.competenceMonth > txMonthPrefix;

        const rowClass = item.alreadyExists
          ? "opacity-45 bg-stone-50"
          : item.type === "TRANSFER"
          ? "bg-stone-50 text-stone-400"
          : "hover:bg-stone-50/80";

        return `
          <tr class="border-b border-stone-100 text-xs ${rowClass}">
            <td class="py-2.5 px-3">
              <input
                type="checkbox"
                ${item.selected ? "checked" : ""}
                onchange="App.toggleStagedItem(${idx}, this.checked)"
                class="w-4 h-4 rounded border-stone-300 text-lime-700"
              />
            </td>
            <td class="py-2.5 px-3 whitespace-nowrap">
              <div class="font-bold text-stone-700">${this.formatDateBR(item.transactionDate)}</div>
              <div class="text-[10px] text-stone-400">${item.transactionDate.substring(0, 4)}</div>
            </td>
            <td class="py-2.5 px-3 whitespace-nowrap">
              <select
                onchange="App.updateStagedItem(${idx}, 'competenceMonth', this.value)"
                class="oli-input rounded-lg px-2 py-1 text-xs font-bold ${shiftedToNext ? "bg-amber-50 border-amber-300 text-amber-900" : "text-stone-800"}"
              >
                ${compOptions}
              </select>
              <div class="text-[10px] mt-0.5 ${shiftedToNext ? "text-amber-700 font-semibold" : "text-lime-700 font-medium"}">
                ${shiftedToNext ? "↳ Mês seguinte (Vira dia 9)" : "• Próprio mês"}
              </div>
            </td>
            <td class="py-2.5 px-3">
              <div class="font-bold text-stone-800">${item.description}</div>
              ${item.alreadyExists ? `<span class="text-[10px] text-amber-600 font-semibold">Já importado (Ignorado)</span>` : ""}
              ${item.type === "TRANSFER" ? `<span class="text-[10px] text-lime-700 font-semibold">Pagamento de fatura ignorado p/ não duplicar</span>` : ""}
            </td>
            <td class="py-2.5 px-3">
              <select
                onchange="App.updateStagedItem(${idx}, 'subcategoryId', this.value)"
                class="oli-input rounded-lg px-2 py-1 text-xs w-44"
              >
                ${subOptions}
              </select>
            </td>
            <td class="py-2.5 px-3">
              <select
                onchange="App.updateStagedItem(${idx}, 'ownership', this.value)"
                class="oli-input rounded-lg px-2 py-1 text-xs"
              >
                <option value="COLLECTIVE" ${item.ownership === "COLLECTIVE" ? "selected" : ""}>Casa</option>
                <option value="INDIVIDUAL_BRUNO" ${item.ownership === "INDIVIDUAL_BRUNO" ? "selected" : ""}>Só Bruno</option>
                <option value="INDIVIDUAL_NUBIA" ${item.ownership === "INDIVIDUAL_NUBIA" ? "selected" : ""}>Só Núbia</option>
              </select>
            </td>
            <td class="py-2.5 px-3 text-right font-extrabold text-stone-900 whitespace-nowrap">
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
        this.showToast("Nenhuma transação encontrada neste arquivo.", "error");
        return;
      }

      this.stagedImports = parsed;
      this.renderImportTab(monthYear);
      this.showToast(`🫒 ${parsed.length} transações classificadas! Revise abaixo.`, "success");
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
    this.showToast("🫒 Extrato exemplo carregado!", "info");
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
      item.ownership = this.resolveDefaultOwnership(value, item.paidByUserId);
      const monthProjs = this.state.projections.filter(p => p.monthYear === this.state.settings.activeMonth);
      const match = monthProjs.find(p => p.subcategoryId === value);
      if (match) item.projectionId = match.id;
    }
    this.renderImportTab(this.state.settings.activeMonth);
  },

  confirmStagedImports() {
    const selected = this.stagedImports.filter(i => i.selected);
    if (selected.length === 0) {
      this.showToast("Selecione pelo menos uma transação.", "error");
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

    const compMonths = Array.from(new Set(selected.map(i => i.competenceMonth))).map(m => this.getMonthLabel(m));
    this.stagedImports = [];
    this.saveState(true);
    this.renderAll();
    this.showToast(`🫒 ${selected.length} lançamentos importados (${compMonths.join(" / ")})!`, "success");
  },

  // ==========================================================================
  // ABA 6: CATEGORIAS & REGRAS
  // ==========================================================================
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
            <div class="flex items-center justify-between mb-3 pb-2 border-b border-stone-100">
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full" style="background:${cat.color}"></span>
                <h4 class="font-extrabold text-stone-900 text-sm">${cat.name}</h4>
              </div>
              <span class="text-xs text-stone-400">${subs.length} subcategorias</span>
            </div>
            <div class="space-y-2">
              ${subs
                .map(s => `
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#f9faf7] border border-[#e6ece0] rounded-xl p-3 text-xs">
                    <div>
                      <div class="font-bold text-stone-800 flex items-center gap-2">
                        ${s.name}
                        <button
                          onclick="App.toggleSubcategoryDefaultOwnership('${s.id}')"
                          title="Clique para alternar o padrão entre Casa (Casal) e Individual"
                          class="cursor-pointer hover:opacity-80 transition"
                        >
                          ${this.getOwnershipBadge(s.defaultOwnership)}
                        </button>
                      </div>
                      <div class="text-[11px] text-stone-400 mt-0.5">
                        Regras: <span class="text-lime-700 font-medium">${(s.keywords || []).join(", ") || "Nenhuma"}</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-center">
                      <span class="text-stone-500">Meta: <strong class="text-stone-800">${this.formatBRL(s.defaultMeta)}</strong></span>
                      <button onclick="App.toggleSubcategoryDefaultOwnership('${s.id}')" class="px-2 py-1 rounded-lg bg-white border border-stone-200 hover:border-lime-600 text-stone-600 font-semibold transition">
                        Alternar Divisão
                      </button>
                      <button onclick="App.addKeywordPrompt('${s.id}')" class="px-2 py-1 rounded-lg bg-white border border-stone-200 hover:border-lime-600 text-stone-700 font-bold transition">
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

  toggleSubcategoryDefaultOwnership(subId) {
    const sub = this.state.subcategories.find(s => s.id === subId);
    if (!sub) return;
    sub.defaultOwnership = sub.defaultOwnership === "COLLECTIVE" ? "INDIVIDUAL_BRUNO" : "COLLECTIVE";
    this.saveState(true);
    this.renderAll();
    const label = sub.defaultOwnership === "COLLECTIVE" ? "Casa (Casal)" : "Individual (Pessoal)";
    this.showToast(`🫒 Padrão de "${sub.name}" alterado para ${label}!`, "info");
  },

  addKeywordPrompt(subId) {
    const sub = this.state.subcategories.find(s => s.id === subId);
    if (!sub) return;
    const kw = prompt(`Digite uma palavra-chave para classificar automaticamente em "${sub.name}" (Ex: ZONA SUL, DROGASIL, UBER):`);
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
    this.showToast(`🫒 Subcategoria "${name}" criada!`, "success");
  },

  // ==========================================================================
  // ABA 7: NUVEM SUPABASE
  // ==========================================================================
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
      this.showToast("Informe a Project URL e a Key do Supabase.", "error");
      return;
    }

    const ok = window.SupabaseSync.saveConfig(url, key, true);
    this.updateCloudBadge(ok);

    if (ok) {
      this.initSupabase();
      this.showToast("🫒 Conectado ao Supabase!", "info");
      await this.syncNowWithSupabase();
    }
  },

  async syncNowWithSupabase() {
    try {
      await window.SupabaseSync.pushState(this.state, this.loggedUser);
      this.showToast("🫒 Sincronizado com o Supabase!", "success");
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
        this.showToast("🫒 Dados atualizados da nuvem!", "success");
      } else {
        this.showToast("Nenhum dado encontrado na nuvem.", "info");
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
    a.download = `olifinancas_backup_${this.state.settings.activeMonth}.json`;
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
      success: "bg-lime-800 border-lime-900 text-white",
      error: "bg-rose-700 border-rose-800 text-white",
      info: "bg-stone-800 border-stone-900 text-white"
    };

    const toast = document.createElement("div");
    toast.className = `px-4 py-3 rounded-xl border shadow-lg text-xs font-bold flex items-center gap-2 transition-all duration-300 ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("opacity-0", "translate-y-2");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  window.App.init();
});
