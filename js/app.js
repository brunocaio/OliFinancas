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
    if (!stateObj || stateObj.version === "1.2.0-oli") return false;
    stateObj.version = "1.2.0-oli";

    const individualSubIds = ["sub_lazer_geral", "sub_parceladas", "sub_transporte_app", "sub_jogos", "sub_autocuidado", "sub_analise", "sub_chatgpt", "sub_adobe", "sub_anuidade", "sub_outros"];
    if (Array.isArray(stateObj.subcategories)) {
      stateObj.subcategories.forEach(s => {
        if (individualSubIds.includes(s.id)) {
          s.defaultOwnership = "INDIVIDUAL_BRUNO";
        }
      });
    }
    if (Array.isArray(stateObj.projections)) {
      stateObj.projections.forEach(p => {
        if (p.id === "proj_lazer" || p.id === "proj_parceladas") {
          p.ownership = "INDIVIDUAL_BRUNO";
        }
      });
    }
    if (Array.isArray(stateObj.transactions)) {
      stateObj.transactions.forEach(t => {
        if (t.id === "tx_nu_10" || t.id === "tx_nu_14") {
          t.ownership = "INDIVIDUAL_BRUNO";
        }
      });
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
        accSelect.value = this.activeUserFilter === "nubia" ? "card_nubia" : "card_nubank_bruno";
      }
    }

    const subSelect = document.getElementById("quick-tx-subcategory");
    if (subSelect) {
      const currentSub = subSelect.value || "sub_feira_sup";
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

  applyQuickPreset(descPlaceholder, subId) {
    const descInput = document.getElementById("quick-tx-desc");
    const subSelect = document.getElementById("quick-tx-subcategory");
    const amountInput = document.getElementById("quick-tx-amount");

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

    // 1. 3 KPIs Minimalistas
    const kpiContainer = document.getElementById("dashboard-kpis");
    if (kpiContainer) {
      const expenseDiff = summary.totalPlannedExpenses - summary.totalActualExpenses;
      const expensePct = summary.totalPlannedExpenses > 0
        ? Math.round((summary.totalActualExpenses / summary.totalPlannedExpenses) * 100)
        : 0;

      kpiContainer.innerHTML = `
        <!-- Receita -->
        <div class="oli-card rounded-2xl p-5">
          <div class="flex items-center justify-between text-xs font-bold text-stone-500 mb-1.5">
            <span>Receitas (${userLabel})</span>
            <i data-lucide="arrow-up-right" class="w-4 h-4 text-lime-700"></i>
          </div>
          <div class="text-2xl font-extrabold text-stone-900">${this.formatBRL(summary.totalIncome)}</div>
          <div class="mt-1.5 text-[11px] text-stone-400">
            Competência ${this.getMonthLabel(monthYear)}
          </div>
        </div>

        <!-- Gastos Realizado vs Meta -->
        <div class="oli-card rounded-2xl p-5">
          <div class="flex items-center justify-between text-xs font-bold text-stone-500 mb-1.5">
            <span>Despesas (Realizado vs. Meta)</span>
            <span class="text-[11px] font-bold ${expensePct > 100 ? "text-rose-600" : "text-lime-700"}">${expensePct}%</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-extrabold text-stone-900">${this.formatBRL(summary.totalActualExpenses)}</span>
            <span class="text-xs text-stone-400">/ ${this.formatBRL(summary.totalPlannedExpenses)}</span>
          </div>
          <div class="mt-2.5 w-full bg-stone-100 h-2 rounded-full overflow-hidden">
            <div class="h-full rounded-full ${expensePct > 100 ? "bg-rose-500" : expensePct > 85 ? "bg-amber-500" : "bg-lime-600"}" style="width: ${Math.min(expensePct, 100)}%"></div>
          </div>
        </div>

        <!-- Saldo Disponível -->
        <div class="oli-card rounded-2xl p-5">
          <div class="flex items-center justify-between text-xs font-bold text-stone-500 mb-1.5">
            <span>Saldo Livre do Mês</span>
            <i data-lucide="wallet" class="w-4 h-4 text-stone-400"></i>
          </div>
          <div class="text-2xl font-extrabold ${summary.actualBalance >= 0 ? "text-lime-700" : "text-rose-600"}">
            ${this.formatBRL(summary.actualBalance)}
          </div>
          <div class="mt-1.5 text-[11px] text-stone-400 flex justify-between">
            <span>Caixa previsto pós-metas:</span>
            <strong class="text-stone-700">${this.formatBRL(summary.projectedBalance)}</strong>
          </div>
        </div>
      `;
    }

    // 2. Cartões & Contas (filtrados pelo usuário ativo)
    const accContainer = document.getElementById("dashboard-accounts-grid");
    if (accContainer) {
      const visibleAccounts = summary.byAccount.filter(
        item => item.actual > 0 || item.planned > 0 || item.account.type !== "INVESTMENT"
      );

      accContainer.innerHTML = visibleAccounts
        .map(item => {
          const acc = item.account;
          const pct = item.planned > 0 ? Math.round((item.actual / item.planned) * 100) : 0;
          return `
            <div class="p-3.5 rounded-xl bg-[#f9faf7] border border-[#e6ece0] hover:border-lime-600/40 transition">
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full" style="background:${acc.color}"></span>
                  <span class="font-bold text-xs text-stone-800">${acc.name}</span>
                </div>
                ${acc.dueDay ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-stone-200/70 text-stone-600 font-semibold">Dia ${acc.dueDay}</span>` : ""}
              </div>
              <div class="flex items-baseline justify-between">
                <span class="text-base font-extrabold text-stone-900">${this.formatBRL(item.actual)}</span>
                <span class="text-[11px] text-stone-500">Meta: ${this.formatBRL(item.planned)}</span>
              </div>
              <div class="mt-2 w-full bg-stone-200/70 h-1.5 rounded-full overflow-hidden">
                <div class="h-full ${pct > 100 ? "bg-rose-500" : "bg-lime-600"}" style="width:${Math.min(pct, 100)}%"></div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    // 3. Últimos 6 Lançamentos na Home
    const recentContainer = document.getElementById("home-recent-transactions");
    if (recentContainer) {
      const recentTxs = [...summary.filteredTxs]
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
        .slice(0, 6);

      if (recentTxs.length === 0) {
        recentContainer.innerHTML = `
          <div class="py-8 text-center text-xs text-stone-400">
            Nenhum lançamento registrado neste filtro ainda. Use o campo acima para lançar!
          </div>
        `;
      } else {
        recentContainer.innerHTML = recentTxs
          .map(tx => {
            const sub = this.getSubcategory(tx.subcategoryId);
            const acc = this.getAccount(tx.accountId);
            return `
              <div class="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-[11px] font-bold text-stone-400 w-10 shrink-0">${this.formatDateBR(tx.transactionDate)}</span>
                  <div class="truncate">
                    <div class="font-bold text-stone-800 truncate">${tx.description}</div>
                    <div class="text-[11px] text-stone-400">${sub.name} • ${acc.name}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="font-extrabold ${tx.type === "INCOME" ? "text-lime-700" : "text-stone-900"}">
                    ${tx.type === "INCOME" ? "+" : "-"}${this.formatBRL(tx.amount)}
                  </span>
                  <button onclick="App.deleteTransaction('${tx.id}')" class="p-1 text-stone-300 hover:text-rose-600 transition" title="Excluir">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
            `;
          })
          .join("");
      }
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
  // ABA 2: METAS (PREVISTO VS. REALIZADO)
  // ==========================================================================
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
      btnAcc.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition ${
        this.projectionGroupMode === "ACCOUNT" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:text-stone-900"
      }`;
      btnCat.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition ${
        this.projectionGroupMode === "CATEGORY" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:text-stone-900"
      }`;
    }

    const monthProjs = this.state.projections.filter(p => {
      if (p.monthYear !== monthYear) return false;
      if (this.activeUserFilter === "ALL") return true;
      const acc = this.getAccount(p.accountId);
      if (this.activeUserFilter === "bruno") {
        return acc.ownerId === "bruno" || p.ownership === "INDIVIDUAL_BRUNO";
      }
      if (this.activeUserFilter === "nubia") {
        return acc.ownerId === "nubia" || p.ownership === "INDIVIDUAL_NUBIA";
      }
      return true;
    });

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
            subtitle: acc.dueDay ? `Vencimento Dia ${acc.dueDay}` : "Débito em Conta / PIX",
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

    let html = groups
      .map(g => {
        const groupPlanned = g.items.reduce((s, i) => s + Number(i.plannedAmount), 0);
        const groupActual = g.items.reduce((s, i) => s + Number(i.actualAmount), 0);
        const groupDiff = groupPlanned - groupActual;

        const rowsHtml = g.items
          .map(item => {
            let statusBadge = "";
            if (item.actualAmount === 0 && item.plannedAmount > 0) {
              statusBadge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-500">Pendente</span>`;
            } else if (item.actualAmount > item.plannedAmount && item.plannedAmount > 0) {
              statusBadge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700">Acima (+${this.formatBRL(Math.abs(item.diff))})</span>`;
            } else if (item.isFixed && item.actualAmount > 0) {
              statusBadge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-lime-100 text-lime-800">Liquidado</span>`;
            } else {
              statusBadge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-lime-50 text-lime-800">${item.pct}% da meta</span>`;
            }

            const barColor = item.actualAmount > item.plannedAmount && item.plannedAmount > 0
              ? "bg-rose-500"
              : item.pct >= 85
              ? "bg-amber-500"
              : "bg-lime-600";

            return `
              <tr class="border-b border-stone-100 hover:bg-stone-50/80 transition">
                <td class="py-3 px-4">
                  <div class="font-bold text-stone-800 text-xs sm:text-sm">${item.title}</div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[11px] text-stone-400">${item.sub.name}</span>
                    ${this.getOwnershipBadge(item.ownership)}
                  </div>
                </td>
                <td class="py-3 px-4 text-right font-extrabold text-stone-900 text-xs sm:text-sm">
                  ${this.formatBRL(item.actualAmount)}
                </td>
                <td class="py-3 px-4 text-right">
                  <input
                    type="number"
                    step="0.01"
                    value="${Number(item.plannedAmount).toFixed(2)}"
                    onchange="App.updateProjectionAmount('${item.id}', this.value)"
                    class="w-24 oli-input rounded-lg px-2 py-1 text-right text-xs font-bold"
                  />
                </td>
                <td class="py-3 px-4 text-right font-bold text-xs ${item.diff >= 0 ? "text-lime-700" : "text-rose-600"}">
                  ${item.diff >= 0 ? "+" : ""}${this.formatBRL(item.diff)}
                </td>
                <td class="py-3 px-4 w-40">
                  <div class="mb-1">${statusBadge}</div>
                  <div class="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                    <div class="h-full ${barColor}" style="width: ${Math.min(item.pct, 100)}%"></div>
                  </div>
                </td>
                <td class="py-3 px-4 text-right">
                  <div class="inline-flex items-center gap-1">
                    <button
                      onclick="App.openQuickSettleModal('${item.id}')"
                      class="px-2.5 py-1 rounded-lg bg-lime-700/10 hover:bg-lime-700 text-lime-800 hover:text-white text-xs font-bold transition"
                    >
                      Conciliar
                    </button>
                    <button
                      onclick="App.deleteProjection('${item.id}')"
                      class="p-1 text-stone-300 hover:text-rose-600 transition"
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
          <div class="oli-card rounded-2xl overflow-hidden mb-5">
            <div class="px-5 py-3.5 bg-stone-50/90 border-b border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-2.5">
                <span class="w-3 h-3 rounded-full" style="background:${g.color}"></span>
                <div>
                  <h3 class="font-extrabold text-stone-900 text-sm">${g.title}</h3>
                  <p class="text-[11px] text-stone-500">${g.subtitle}</p>
                </div>
              </div>
              <div class="flex items-center gap-4 text-xs">
                <span>Realizado: <strong class="text-stone-900">${this.formatBRL(groupActual)}</strong></span>
                <span>Previsto: <strong class="text-stone-700">${this.formatBRL(groupPlanned)}</strong></span>
                <span>Saldo: <strong class="${groupDiff >= 0 ? "text-lime-700" : "text-rose-600"}">${this.formatBRL(groupDiff)}</strong></span>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-stone-200/70 text-[11px] font-bold uppercase text-stone-400">
                    <th class="py-2.5 px-4">Item Planejado</th>
                    <th class="py-2.5 px-4 text-right">Realizado</th>
                    <th class="py-2.5 px-4 text-right">Meta Prevista</th>
                    <th class="py-2.5 px-4 text-right">Diferença</th>
                    <th class="py-2.5 px-4">Status</th>
                    <th class="py-2.5 px-4 text-right"></th>
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

        return `
          <tr class="border-b border-stone-100 hover:bg-stone-50/80 transition text-xs sm:text-sm">
            <td class="py-3 px-4 whitespace-nowrap text-stone-500 text-xs font-medium">${this.formatDateBR(tx.transactionDate)}</td>
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
        ? `🫒 Compra parcelada registrada (${installments}x)!`
        : "🫒 Lançamento salvo com sucesso!",
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

        const projOptions = `<option value="">-- Automático --</option>` +
          monthProjs
            .map(p => `<option value="${p.id}" ${p.id === item.projectionId ? "selected" : ""}>${p.title} (${this.formatBRL(p.plannedAmount)})</option>`)
            .join("");

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
            <td class="py-2.5 px-3 whitespace-nowrap text-stone-500">${this.formatDateBR(item.transactionDate)}</td>
            <td class="py-2.5 px-3">
              <div class="font-bold text-stone-800">${item.description}</div>
              ${item.alreadyExists ? `<span class="text-[10px] text-amber-600 font-semibold">Já importado (Ignorado)</span>` : ""}
              ${item.type === "TRANSFER" ? `<span class="text-[10px] text-lime-700 font-semibold">Pagamento de fatura ignorado p/ não duplicar</span>` : ""}
            </td>
            <td class="py-2.5 px-3">
              <select
                onchange="App.updateStagedItem(${idx}, 'subcategoryId', this.value)"
                class="oli-input rounded-lg px-2 py-1 text-xs w-40"
              >
                ${subOptions}
              </select>
            </td>
            <td class="py-2.5 px-3">
              <select
                onchange="App.updateStagedItem(${idx}, 'projectionId', this.value)"
                class="oli-input rounded-lg px-2 py-1 text-xs w-44"
              >
                ${projOptions}
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

    this.stagedImports = [];
    this.saveState(true);
    this.renderAll();
    this.showToast(`🫒 ${selected.length} lançamentos importados com sucesso!`, "success");
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
