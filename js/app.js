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
  dashboardEntryMode: "IMPORT",
  activeUserFilter: "bruno", // Prioriza Bruno por padrão
  loggedUser: "bruno",
  quickTxType: "EXPENSE",
  projectionGroupMode: "ACCOUNT",
  budgetGroupMode: "MACRO",
  installmentGroupMode: "CATEGORY",
  installmentScopeFilter: "ACTIVE_MONTH",
  financingTableExpanded: false,
  financingTableScope: "NEXT_12",
  updatingFinancingId: null,
  expandedTreeKeys: {},
  expandedTreeDescIds: {},
  showAllTreeFullText: false,
  expandedArchiveKeys: {},
  quoteIndex: 0,
  txFilter: {
    search: "",
    accountId: "ALL",
    categoryId: "ALL",
    ownership: "ALL"
  },
  stagedImports: [],
  stagedImportMeta: null,
  importTargetAccountId: "cc_bruno",
  importCompetenceMode: "SMART_INVOICE",
  statementsPanelMonth: null,
  statementsHistoryScope: "ACTIVE_MONTH",
  statementsPanelCollapsed: false,
  editingStatementBatchId: null,
  deletingStatementBatchId: null,
  selectedTxIds: [],
  lastClickedTxId: null,
  lastClickedStagedIdx: null,
  undoStack: [],
  lastSavedSnapshot: null,
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
    if (!stateObj) return false;
    let changed = false;
    if (stateObj.version !== "2.0.0-clean") {
      const cleanSeed = JSON.parse(JSON.stringify(window.INITIAL_SEED_DATA));
      Object.keys(stateObj).forEach(k => delete stateObj[k]);
      Object.assign(stateObj, cleanSeed);
      changed = true;
    }

    // Patch incremental 2: corrige estornos de cartão importados antes da atualização
    if ((stateObj.schemaPatch || 0) < 2 && Array.isArray(stateObj.transactions)) {
      const cardIds = new Set(
        (stateObj.accounts || []).filter(a => a.type === "CREDIT_CARD").map(a => a.id)
      );
      stateObj.transactions.forEach(tx => {
        if (!tx || !cardIds.has(tx.accountId)) return;
        const amt = Number(tx.amount);
        if (amt > 0 && window.StatementParser && window.StatementParser.isLikelyRefundDescription(tx.description)) {
          tx.amount = -Math.abs(amt);
          tx.isInvoiceCredit = true;
          changed = true;
        }
      });
      stateObj.schemaPatch = 2;
      changed = true;
    }

    // Patch incremental 3: reverte compras de assinatura com "desconto Nubank" no nome
    // que foram confundidas com estorno pelo patch 2 (ex: "Assinatura HBO Max desconto Nubank")
    if ((stateObj.schemaPatch || 0) < 3 && Array.isArray(stateObj.transactions)) {
      stateObj.transactions.forEach(tx => {
        if (!tx) return;
        const desc = (tx.description || "").toUpperCase();
        if (Number(tx.amount) < 0 && desc.includes("DESCONTO NUBANK") && !desc.includes("ESTORNO")) {
          tx.amount = Math.abs(Number(tx.amount));
          tx.isInvoiceCredit = false;
          changed = true;
        }
      });
      stateObj.schemaPatch = 3;
      changed = true;
    }

    // Patch incremental 4: unifica todas as assinaturas na categoria macro "Assinaturas"
    if ((stateObj.schemaPatch || 0) < 4) {
      if (Array.isArray(stateObj.categories)) {
        const catAss = stateObj.categories.find(c => c.id === "cat_assinaturas");
        if (catAss) {
          catAss.name = "Assinaturas";
          changed = true;
        }
      }
      if (Array.isArray(stateObj.subcategories)) {
        const subNet = stateObj.subcategories.find(s => s.id === "sub_internet");
        if (subNet && Array.isArray(subNet.keywords)) {
          subNet.keywords = subNet.keywords.filter(k => k.toUpperCase() !== "NET" && k.toUpperCase() !== "CLARO");
          ["CLARO NET", "NET VIRTUA"].forEach(k => {
            if (!subNet.keywords.includes(k)) subNet.keywords.push(k);
          });
          changed = true;
        }
        const subAmz = stateObj.subcategories.find(s => s.id === "sub_amazon_prime");
        if (subAmz) {
          subAmz.categoryId = "cat_assinaturas";
          if (!Array.isArray(subAmz.keywords)) subAmz.keywords = [];
          ["AMAZONPRIMEBR", "AMAZON AD FREE"].forEach(k => {
            if (!subAmz.keywords.includes(k)) subAmz.keywords.push(k);
          });
          changed = true;
        }
        if (!stateObj.subcategories.some(s => s.id === "sub_globoplay")) {
          stateObj.subcategories.push({
            id: "sub_globoplay",
            categoryId: "cat_assinaturas",
            name: "Globoplay",
            defaultOwnership: "COLLECTIVE",
            defaultAccountId: null,
            defaultMeta: 0.00,
            isFixed: true,
            keywords: ["GLOBOPLAY", "GOOGLE GLOBOPLAY"]
          });
          changed = true;
        }
        if (!stateObj.subcategories.some(s => s.id === "sub_outras_assinaturas")) {
          stateObj.subcategories.push({
            id: "sub_outras_assinaturas",
            categoryId: "cat_assinaturas",
            name: "Outras Assinaturas (Serasa, iCloud, Disney...)",
            defaultOwnership: "COLLECTIVE",
            defaultAccountId: null,
            defaultMeta: 0.00,
            isFixed: true,
            keywords: ["SERASA", "ICLOUD", "APPLE.COM/BILL", "DISNEY", "PARAMOUNT", "MELI+", "ASSINATURA"]
          });
          changed = true;
        }
      }
      if (Array.isArray(stateObj.transactions)) {
        stateObj.transactions.forEach(tx => {
          if (!tx || !tx.description) return;
          const desc = tx.description.toUpperCase();
          if (desc.includes("NETFLIX") && tx.subcategoryId !== "sub_netflix") {
            tx.subcategoryId = "sub_netflix";
            changed = true;
          } else if (desc.includes("GLOBOPLAY") && tx.subcategoryId !== "sub_globoplay") {
            tx.subcategoryId = "sub_globoplay";
            changed = true;
          } else if ((desc.includes("AMAZONPRIMEBR") || desc.includes("AMAZON AD FREE")) && tx.subcategoryId !== "sub_amazon_prime") {
            tx.subcategoryId = "sub_amazon_prime";
            changed = true;
          } else if (desc.includes("SERASA") && tx.subcategoryId !== "sub_outras_assinaturas") {
            tx.subcategoryId = "sub_outras_assinaturas";
            changed = true;
          }
        });
      }
      stateObj.schemaPatch = 4;
      changed = true;
    }

    // Patch incremental 5: adiciona subcategoria dedicada para transferências entre contas próprias
    if ((stateObj.schemaPatch || 0) < 5 && Array.isArray(stateObj.subcategories)) {
      if (!stateObj.subcategories.some(s => s.id === "sub_transf_propria")) {
        stateObj.subcategories.push({
          id: "sub_transf_propria",
          categoryId: "cat_transferencia",
          name: "Transferência entre Contas Próprias",
          defaultOwnership: "INDIVIDUAL_BRUNO",
          defaultAccountId: "cc_bruno",
          defaultMeta: 0.00,
          isFixed: false,
          keywords: ["MESMA TITULARIDADE", "ENTRE CONTAS", "TRANSFERENCIA PROPRIA", "PIX PROPRIO", "RESGATE", "APLICACAO", "DINHEIRO GUARDADO", "CAIXINHA"]
        });
        changed = true;
      }
      const subFatura = stateObj.subcategories.find(s => s.id === "sub_pag_fatura");
      if (subFatura && Array.isArray(subFatura.keywords)) {
        subFatura.keywords = subFatura.keywords.filter(k => k !== "ITAU UNIBANCO SA" && k !== "NU PAGAMENTOS");
      }
      stateObj.schemaPatch = 5;
      changed = true;
    }

    // Patch incremental 6: corrige Pix com data DD/MM detectada erroneamente como parcela,
    // separa transferências próprias "BRUNO CAIO DE OLIVEIRA" de "sub_caio" e extrai De/Para e Origem/Destino
    if ((stateObj.schemaPatch || 0) < 6 && Array.isArray(stateObj.transactions)) {
      const accMap = new Map((stateObj.accounts || []).map(a => [a.id, a]));
      stateObj.transactions.forEach(tx => {
        if (!tx) return;
        const acc = accMap.get(tx.accountId) || null;
        const desc = (tx.description || "").toUpperCase();
        const isChecking = acc && acc.type === "CHECKING";

        // 1. Remove falsas parcelas de datas DD/MM em Pix ou conta corrente
        if ((isChecking || desc.includes("PIX")) && Number(tx.installmentTotal) > 1 && !desc.includes("PARC")) {
          tx.installmentCurrent = 1;
          tx.installmentTotal = 1;
          if (tx.subcategoryId === "sub_parceladas") {
            tx.subcategoryId = tx.type === "INCOME" ? "sub_rt_rendimentos" : "sub_outros";
          }
          changed = true;
        }

        // 2. Corrige Pix entre contas próprias de "BRUNO CAIO DE OLIVEIRA" que caíram em Caio
        if (isChecking && (desc.includes("BRUNO CAIO") || desc.includes("MESMA TITULARIDADE")) && (desc.includes("PIX") || desc.includes("TRANSF"))) {
          tx.type = "TRANSFER";
          tx.subcategoryId = "sub_transf_propria";
          tx.projectionId = null;
          changed = true;
        }

        // 3. Extrai De quem/Para quem foi e Origem/Destino quando for Pix ou Transferência
        if (window.StatementParser && window.StatementParser.extractTransferPixDetails) {
          const info = window.StatementParser.extractTransferPixDetails(tx.description, tx.type, acc);
          if (info.isPixOrTransfer) {
            if (!tx.counterparty && info.counterparty) {
              tx.counterparty = info.counterparty;
              changed = true;
            }
            if (!tx.originLabel && info.originLabel) {
              tx.originLabel = info.originLabel;
              changed = true;
            }
            if (!tx.destinationLabel && info.destinationLabel) {
              tx.destinationLabel = info.destinationLabel;
              changed = true;
            }
          }
        }
      });
      stateObj.schemaPatch = 6;
      changed = true;
    }

    // Patch incremental 7: cria o registro de importações de extratos (statementImports)
    // a partir de transações já importadas e detecta se estão parciais ou completas
    if (!Array.isArray(stateObj.statementImports)) {
      stateObj.statementImports = [];
      changed = true;
    }
    if ((stateObj.schemaPatch || 0) < 7) {
      if (stateObj.statementImports.length === 0 && Array.isArray(stateObj.transactions)) {
        const accMap = new Map((stateObj.accounts || []).map(a => [a.id, a]));
        const groups = new Map();
        stateObj.transactions.forEach(tx => {
          if (!tx || !tx.importHash || !tx.accountId || !tx.competenceMonth) return;
          const key = `${tx.accountId}__${tx.competenceMonth}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(tx);
        });

        groups.forEach((txs, key) => {
          const [accountId, competenceMonth] = key.split("__");
          const acc = accMap.get(accountId) || null;
          const sortedDates = txs
            .map(t => t.transactionDate)
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort();
          const periodStart = sortedDates[0] || `${competenceMonth}-01`;
          const periodEnd = sortedDates[sortedDates.length - 1] || periodStart;
          const cutoffDate = periodEnd;
          const parser = window.StatementParser;
          const expected = parser && parser.getAccountExpectedPeriod
            ? parser.getAccountExpectedPeriod(acc, competenceMonth)
            : { periodStart: `${competenceMonth}-01`, periodEnd: `${competenceMonth}-28`, closeDate: `${competenceMonth}-28` };
          const status = parser && parser.inferStatementImportStatus
            ? parser.inferStatementImportStatus(acc, competenceMonth, cutoffDate)
            : "PARTIAL";
          const batchId = `imp_backfill_${accountId}_${competenceMonth}`;
          const txIds = [];
          let totalAmount = 0;

          txs.forEach(tx => {
            tx.importBatchId = batchId;
            txIds.push(tx.id);
            totalAmount += Number(tx.amount) || 0;
          });

          stateObj.statementImports.push({
            id: batchId,
            accountId,
            competenceMonth,
            fileName: "Extrato importado anteriormente",
            importedAt: new Date().toISOString(),
            status,
            periodStart,
            periodEnd,
            cutoffDate,
            expectedCloseDate: expected.closeDate,
            txCount: txIds.length,
            totalAmount: Number(totalAmount.toFixed(2)),
            txIds,
            notes: status === "PARTIAL" ? "Importado antes do fechamento do mês/ciclo" : ""
          });
        });
      }
      stateObj.schemaPatch = 7;
      changed = true;
    }

    // Patch incremental 8: registra Conta Corrente Itaú (para financiamento imobiliário),
    // subcategoria "Financiamento Imobiliário" e tabela oficial SAC de 420 parcelas (DDC Contrato 10307559107)
    if (!Array.isArray(stateObj.housingFinancings)) {
      stateObj.housingFinancings = [];
      changed = true;
    }
    if ((stateObj.schemaPatch || 0) < 8) {
      if (!Array.isArray(stateObj.accounts)) stateObj.accounts = [];
      const normName = (s) => (window.StatementParser ? window.StatementParser.normalizeText(s) : String(s || "").toUpperCase());
      let itauChecking = stateObj.accounts.find(
        a => a && a.type === "CHECKING" && normName(a.name).includes("ITAU")
      );
      if (!itauChecking) {
        itauChecking = {
          id: "cc_bruno_itau",
          name: "Conta Corrente Itaú",
          type: "CHECKING",
          ownerId: "bruno",
          closingDay: null,
          dueDay: null,
          monthlyTarget: 0,
          color: "#f97316"
        };
        stateObj.accounts.push(itauChecking);
        changed = true;
      }

      if (Array.isArray(stateObj.subcategories)) {
        const hasFinSub = stateObj.subcategories.some(
          s => s && (s.id === "sub_financiamento_imob" || normName(s.name).includes("FINANCIAMENTO IMOB"))
        );
        if (!hasFinSub) {
          const casaCat = (stateObj.categories || []).find(c => c.id === "cat_casa") ||
            (stateObj.categories || []).find(c => c.type === "EXPENSE");
          if (casaCat) {
            stateObj.subcategories.push({
              id: "sub_financiamento_imob",
              categoryId: casaCat.id,
              name: "Financiamento Imobiliário",
              defaultOwnership: "COLLECTIVE",
              defaultAccountId: itauChecking.id,
              defaultMeta: 5297.87,
              isFixed: true,
              keywords: ["FINANCIAMENTO", "FINANC IMOB", "HABITACIONAL", "CREDITO IMOBILIARIO", "PRESTACAO IMOVEL", "SFH", "10307559107"]
            });
            changed = true;
          }
        }
      }

      if (stateObj.housingFinancings.length === 0 && window.DEFAULT_HOUSING_FINANCING) {
        const finCopy = JSON.parse(JSON.stringify(window.DEFAULT_HOUSING_FINANCING));
        finCopy.accountId = itauChecking.id;
        stateObj.housingFinancings.push(finCopy);
        changed = true;
      }

      stateObj.schemaPatch = 8;
      changed = true;
    }

    return changed;
  },

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.state = JSON.parse(saved);
        if (this.upgradeStateToLatest(this.state)) {
          this.saveState(true, false);
        }
      } else {
        this.state = JSON.parse(JSON.stringify(window.INITIAL_SEED_DATA));
        this.saveState(false, false);
      }
    } catch (e) {
      console.error("Erro ao carregar estado local, usando seed inicial:", e);
      this.state = JSON.parse(JSON.stringify(window.INITIAL_SEED_DATA));
    }
    this.lastSavedSnapshot = JSON.stringify({
      state: this.state,
      stagedImports: this.stagedImports
    });
  },

  pushUndoSnapshot() {
    if (!this.lastSavedSnapshot) return;
    const top = this.undoStack[this.undoStack.length - 1];
    if (top !== this.lastSavedSnapshot) {
      this.undoStack.push(this.lastSavedSnapshot);
      if (this.undoStack.length > 30) {
        this.undoStack.shift();
      }
    }
  },

  saveState(syncCloud = true, recordUndo = true) {
    const currentSnapshot = JSON.stringify({
      state: this.state,
      stagedImports: this.stagedImports
    });
    if (recordUndo && syncCloud && this.lastSavedSnapshot && this.lastSavedSnapshot !== currentSnapshot) {
      this.pushUndoSnapshot();
    }
    this.lastSavedSnapshot = currentSnapshot;

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

  undoLastAction() {
    if (!this.undoStack || this.undoStack.length === 0) {
      this.showToast("Não há ações anteriores para desfazer.", "info");
      return;
    }
    const prevSnapshotStr = this.undoStack.pop();
    try {
      const parsed = JSON.parse(prevSnapshotStr);
      if (parsed && parsed.state) {
        this.state = parsed.state;
        this.stagedImports = Array.isArray(parsed.stagedImports) ? parsed.stagedImports : [];
        this.selectedTxIds = [];
        this.saveState(true, false);
        this.renderAll();
        this.showToast("↩️ Última ação desfeita (Ctrl+Z)!", "success");
      }
    } catch (err) {
      console.error("Erro ao desfazer ação:", err);
    }
  },

  updateUndoAndBulkUI() {
    // Limpa IDs selecionados que não existem mais
    const validIds = new Set((this.state.transactions || []).map(t => t.id));
    this.selectedTxIds = (this.selectedTxIds || []).filter(id => validIds.has(id));
    const selCount = this.selectedTxIds.length;

    const undoBtn = document.getElementById("undo-top-btn");
    if (undoBtn) {
      undoBtn.classList.toggle("hidden", this.undoStack.length === 0);
      undoBtn.classList.toggle("inline-flex", this.undoStack.length > 0);
    }

    const histBulkBtn = document.getElementById("history-bulk-delete-btn");
    const histBulkLabel = document.getElementById("history-bulk-delete-label");
    const histBulkRecat = document.getElementById("history-bulk-recategorize");
    if (histBulkBtn) {
      histBulkBtn.classList.toggle("hidden", selCount === 0);
      histBulkBtn.classList.toggle("inline-flex", selCount > 0);
      if (histBulkLabel) {
        histBulkLabel.textContent = `Excluir (${selCount})`;
      }
    }
    if (histBulkRecat) {
      histBulkRecat.classList.toggle("hidden", selCount === 0);
      histBulkRecat.classList.toggle("inline-block", selCount > 0);
      if (selCount > 0) {
        histBulkRecat.innerHTML = `<option value="">🏷️ Recategorizar (${selCount}) p/...</option>` + this.buildSubcategorySelectOptionsHTML("", false);
      }
    }

    const floatBar = document.getElementById("floating-bulk-bar");
    const floatCount = document.getElementById("floating-bulk-count");
    const floatRecat = document.getElementById("floating-bulk-recategorize");
    if (floatBar) {
      floatBar.classList.toggle("hidden", selCount === 0);
      floatBar.classList.toggle("flex", selCount > 0);
      if (floatCount) {
        floatCount.textContent = `${selCount} ${selCount === 1 ? "item selecionado" : "itens selecionados"}`;
      }
      if (floatRecat && selCount > 0) {
        floatRecat.innerHTML = `<option value="">🏷️ Recategorizar p/...</option>` + this.buildSubcategorySelectOptionsHTML("", false);
      }
    }
  },

  escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  buildPixFlowBadgesHTML(txId, txObj, stagedIdx = null) {
    if (!txObj) return "";
    const normDesc = (txObj.description || "").toUpperCase();
    const isPixOrTransfer =
      txObj.type === "TRANSFER" ||
      Boolean(txObj.counterparty || txObj.originLabel || txObj.destinationLabel) ||
      /\b(PIX|TED|DOC|TRANSF|TRANSFERENCIA|RESGATE|APLICACAO)\b/i.test(normDesc);
    if (!isPixOrTransfer) return "";

    const clickCall = stagedIdx !== null
      ? `App.openTxNoteModal(null, ${stagedIdx})`
      : `App.openTxNoteModal('${txId}', null)`;

    const cp = (txObj.counterparty || "").trim();
    const orig = (txObj.originLabel || "").trim();
    const dest = (txObj.destinationLabel || "").trim();
    const dirPrefix = txObj.type === "INCOME" ? "De:" : txObj.type === "EXPENSE" ? "Para:" : "De/Para:";

    const parts = [];
    if (cp) {
      parts.push(`
        <button
          type="button"
          onclick="${clickCall}"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-[10px] font-bold transition cursor-pointer max-w-full"
          title="Clique para editar quem enviou/recebeu e as contas de origem/destino"
        >
          <span class="shrink-0">👤</span>
          <span class="truncate max-w-[180px] sm:max-w-[240px]">${dirPrefix} ${this.escapeHTML(cp)}</span>
        </button>
      `);
    }
    if (orig || dest) {
      const flowText = orig && dest
        ? `${orig} → ${dest}`
        : orig
        ? `Origem: ${orig}`
        : `Destino: ${dest}`;
      parts.push(`
        <button
          type="button"
          onclick="${clickCall}"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-[10px] font-semibold transition cursor-pointer max-w-full"
          title="Contas de origem e destino detectadas (clique para editar)"
        >
          <span class="shrink-0">🏦</span>
          <span class="truncate max-w-[180px] sm:max-w-[240px]">${this.escapeHTML(flowText)}</span>
        </button>
      `);
    }
    if (parts.length === 0) {
      parts.push(`
        <button
          type="button"
          onclick="${clickCall}"
          class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-bold transition cursor-pointer"
          title="Informar de quem/para quem foi este Pix ou transferência"
        >
          + De/Para
        </button>
      `);
    }
    return parts.join("");
  },

  buildTxNoteBadgeHTML(txId, notes, stagedIdx = null) {
    const clean = (notes || "").trim();
    const clickCall = stagedIdx !== null
      ? `App.openTxNoteModal(null, ${stagedIdx})`
      : `App.openTxNoteModal('${txId}', null)`;

    if (clean) {
      return `
        <button
          type="button"
          onclick="${clickCall}"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/90 hover:bg-amber-200 text-amber-950 border border-amber-300/70 text-[11px] font-bold transition cursor-pointer shrink-0"
          title="Clique para editar a identificação deste lançamento"
        >
          <span>📝</span>
          <span class="truncate max-w-[180px]">${this.escapeHTML(clean)}</span>
        </button>
      `;
    }
    return `
      <button
        type="button"
        onclick="${clickCall}"
        class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-stone-100 hover:bg-amber-50 text-stone-500 hover:text-amber-800 border border-stone-200/80 text-[10px] font-bold transition cursor-pointer shrink-0"
        title="Adicionar descrição para facilitar a identificação (parceladas propagam automaticamente)"
      >
        + Desc.
      </button>
    `;
  },

  buildSubcategorySelectOptionsHTML(selectedSubId = "", includeOwnershipSuffix = true) {
    return (this.state.categories || [])
      .map(cat => {
        const subs = (this.state.subcategories || []).filter(s => s.categoryId === cat.id);
        if (subs.length === 0) return "";
        return (
          `<optgroup label="${cat.name}">` +
          subs
            .map(s => {
              const label = includeOwnershipSuffix ? this.formatSubOptionLabel(s) : s.name;
              return `<option value="${s.id}" ${s.id === selectedSubId ? "selected" : ""}>${label}</option>`;
            })
            .join("") +
          `</optgroup>`
        );
      })
      .join("");
  },

  resetToSpreadsheetSeed() {
    if (!confirm("Deseja zerar o banco de dados (lançamentos, metas e cartões) para começar do zero?")) {
      return;
    }
    this.state = JSON.parse(JSON.stringify(window.INITIAL_SEED_DATA));
    this.stagedImports = [];
    this.importTargetAccountId = "cc_bruno";
    this.saveState(true);
    this.renderAll();
    this.showToast("🫒 Banco de dados zerado! Pronto para cadastrar do zero.", "success");
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
    this.renderInstallmentsTab(monthYear);
    this.renderCardsTab(monthYear);
    this.renderTransactionsTab(monthYear);
    this.renderImportTab(monthYear);
    this.renderStatementsPanel(monthYear);
    this.renderCategoriesTab();
    this.renderCloudTab();
    this.updateUndoAndBulkUI();

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

  setDashboardEntryMode(mode = "IMPORT") {
    this.dashboardEntryMode = mode === "QUICK" ? "QUICK" : "IMPORT";
    const isQuick = this.dashboardEntryMode === "QUICK";
    const importPanel = document.getElementById("entry-panel-import");
    const quickPanel = document.getElementById("entry-panel-quick");
    const quickTypes = document.getElementById("entry-tab-quick-types");
    const btnImport = document.getElementById("entry-tab-btn-import");
    const btnQuick = document.getElementById("entry-tab-btn-quick");

    if (importPanel) importPanel.classList.toggle("hidden", isQuick);
    if (quickPanel) quickPanel.classList.toggle("hidden", !isQuick);
    if (quickTypes) quickTypes.classList.toggle("hidden", !isQuick);

    if (btnImport) {
      btnImport.className = `px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
        !isQuick
          ? "font-extrabold bg-white text-stone-900 shadow-2xs"
          : "font-semibold text-stone-500 hover:text-stone-900"
      }`;
    }
    if (btnQuick) {
      btnQuick.className = `px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
        isQuick
          ? "font-extrabold bg-white text-stone-900 shadow-2xs"
          : "font-semibold text-stone-500 hover:text-stone-900"
      }`;
    }
  },

  setUserFilter(filter) {
    this.activeUserFilter = filter;
    if (filter === "bruno" || filter === "nubia") {
      this.loggedUser = filter;
    }
    const allowed = this.getAccountsForActiveUser();
    if (this.txFilter.accountId !== "ALL" && !allowed.some(a => a.id === this.txFilter.accountId)) {
      this.txFilter.accountId = "ALL";
    }
    if (!allowed.some(a => a.id === this.importTargetAccountId) && allowed[0]) {
      this.importTargetAccountId = allowed[0].id;
    }
    this.renderAll();
  },

  getAccountsForActiveUser(userOverride = null) {
    const targetUser = userOverride || this.activeUserFilter;
    return (this.state.accounts || []).filter(a => {
      if (a.type === "INVESTMENT") return false;
      if (targetUser === "bruno") return a.ownerId === "bruno";
      if (targetUser === "nubia") return a.ownerId === "nubia";
      return true;
    });
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
      const userAccounts = this.getAccountsForActiveUser();
      accSelect.innerHTML = userAccounts
        .map(a => `<option value="${a.id}">${a.name}${this.activeUserFilter === "ALL" ? ` (${this.getUser(a.ownerId).name})` : ""}</option>`)
        .join("");

      if (prevVal && userAccounts.some(a => a.id === prevVal)) {
        accSelect.value = prevVal;
      } else {
        const defaultChecking = userAccounts.find(a => a.type === "CHECKING") || userAccounts[0];
        if (defaultChecking) accSelect.value = defaultChecking.id;
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
    const sub = this.getSubcategory(subId);
    const cat = this.getCategory(sub.categoryId);

    if (cat && cat.type === "TRANSFER" && this.quickTxType !== "TRANSFER") {
      this.setQuickType("TRANSFER", false);
    } else if (cat && cat.type === "INCOME" && this.quickTxType !== "INCOME") {
      this.setQuickType("INCOME", false);
    }

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
    this.populateQuickTargetAccounts();
  },

  populateQuickTargetAccounts() {
    const wrap = document.getElementById("quick-counterparty-wrap");
    const labelEl = document.getElementById("quick-counterparty-label");
    const targetWrap = document.getElementById("quick-target-account-wrap");
    const transferHint = document.getElementById("quick-transfer-hint");
    const targetSelect = document.getElementById("quick-tx-target-account");
    const originSelect = document.getElementById("quick-tx-account");
    const descInput = document.getElementById("quick-tx-desc");

    const descText = (descInput && descInput.value || "").toUpperCase();
    const isTransfer = this.quickTxType === "TRANSFER";
    const isPixOrTransferDesc = /\b(PIX|TRANSF|TRANSFERENCIA|TED|DOC)\b/i.test(descText);

    if (wrap) {
      wrap.classList.toggle("hidden", !isTransfer && !isPixOrTransferDesc);
    }
    if (labelEl) {
      labelEl.textContent = isTransfer
        ? "👤 De quem / Para quem foi? (Transferência)"
        : this.quickTxType === "INCOME"
        ? "👤 De quem veio? (Remetente do Pix)"
        : "👤 Para quem foi? (Beneficiário do Pix)";
    }
    if (transferHint) {
      transferHint.classList.toggle("hidden", !isTransfer);
    }

    if (!targetWrap || !targetSelect) return;
    targetWrap.classList.toggle("hidden", !isTransfer);
    if (!isTransfer) return;

    const originId = originSelect ? originSelect.value : null;
    const accounts = this.getAccountsForActiveUser();
    const candidates = accounts.filter(a => a.id !== originId);
    const list = candidates.length > 0 ? candidates : accounts;
    const prevTarget = targetSelect.value;

    targetSelect.innerHTML = `<option value="">-- Outra conta própria --</option>` +
      list.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
    if (prevTarget && list.some(a => a.id === prevTarget)) {
      targetSelect.value = prevTarget;
    } else if (list.length > 0) {
      const checking = list.find(a => a.type === "CHECKING") || list[0];
      targetSelect.value = checking.id;
    }
  },

  applyQuickPixPreset() {
    const descInput = document.getElementById("quick-tx-desc");
    const accSelect = document.getElementById("quick-tx-account");
    const cpInput = document.getElementById("quick-tx-counterparty");
    const userAccounts = this.getAccountsForActiveUser();
    const checking = userAccounts.find(a => a.type === "CHECKING") || userAccounts[0];
    if (accSelect && checking) accSelect.value = checking.id;
    if (descInput) descInput.value = "Pix ";
    this.populateQuickTargetAccounts();
    setTimeout(() => {
      if (cpInput) cpInput.focus();
    }, 40);
  },

  setQuickType(type, autoSelectSub = true) {
    this.quickTxType = type;
    const btnExp = document.getElementById("quick-type-expense");
    const btnInc = document.getElementById("quick-type-income");
    const btnTrf = document.getElementById("quick-type-transfer");

    if (btnExp) {
      btnExp.className = type === "EXPENSE"
        ? "px-2.5 py-1 rounded-md font-bold bg-white text-stone-900 shadow-2xs transition"
        : "px-2.5 py-1 rounded-md font-medium text-stone-500 hover:text-stone-800 transition";
    }
    if (btnInc) {
      btnInc.className = type === "INCOME"
        ? "px-2.5 py-1 rounded-md font-bold bg-lime-700 text-white shadow-2xs transition"
        : "px-2.5 py-1 rounded-md font-medium text-stone-500 hover:text-stone-800 transition";
    }
    if (btnTrf) {
      btnTrf.className = type === "TRANSFER"
        ? "px-2.5 py-1 rounded-md font-bold bg-sky-700 text-white shadow-2xs transition"
        : "px-2.5 py-1 rounded-md font-medium text-stone-500 hover:text-stone-800 transition";
    }

    this.populateQuickTargetAccounts();

    if (autoSelectSub) {
      const subSelect = document.getElementById("quick-tx-subcategory");
      const descInput = document.getElementById("quick-tx-desc");
      if (type === "INCOME" && subSelect) {
        subSelect.value = this.loggedUser === "nubia" ? "sub_salario_unisuam" : "sub_salario_aoro";
        this.onQuickSubcategoryChange(subSelect.value);
      } else if (type === "TRANSFER" && subSelect) {
        subSelect.value = "sub_transf_propria";
        this.onQuickSubcategoryChange(subSelect.value);
        if (descInput && !descInput.value.trim()) {
          descInput.value = "Transferência entre contas";
        }
      }
    }
  },

  onQuickDescInput(text) {
    this.populateQuickTargetAccounts();
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
    const sub = this.getSubcategory(subcategoryId);
    const cat = this.getCategory(sub.categoryId);
    const effectiveType = (cat && cat.type === "TRANSFER") ? "TRANSFER" : this.quickTxType;

    let finalDescription = description;
    let targetAccountId = null;
    const counterpartyEl = document.getElementById("quick-tx-counterparty");
    const counterparty = (counterpartyEl && counterpartyEl.value || "").trim();
    let originLabel = "";
    let destinationLabel = "";

    if (effectiveType === "TRANSFER") {
      const targetEl = document.getElementById("quick-tx-target-account");
      targetAccountId = (targetEl && targetEl.value) || null;
      originLabel = acc.name;
      if (targetAccountId) {
        const targetAcc = this.getAccount(targetAccountId);
        destinationLabel = targetAcc.name;
        if (!finalDescription.includes("→") && !finalDescription.includes(targetAcc.name)) {
          finalDescription = `${finalDescription} → ${targetAcc.name}`;
        }
      }
    } else if (/\b(PIX|TRANSF|TRANSFERENCIA|TED|DOC)\b/i.test(description) || counterparty) {
      if (effectiveType === "INCOME") {
        originLabel = counterparty ? `Pix de ${counterparty}` : "";
        destinationLabel = acc.name;
      } else {
        originLabel = acc.name;
        destinationLabel = counterparty ? `Pix p/ ${counterparty}` : "";
      }
    }

    // Procura meta correspondente no mês para conciliar automaticamente
    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);
    const matchingProj = effectiveType === "TRANSFER"
      ? null
      : (monthProjs.find(p => p.subcategoryId === subcategoryId && (!p.accountId || p.accountId === accountId))
        || monthProjs.find(p => p.subcategoryId === subcategoryId));

    this.state.transactions.push({
      id: "tx_" + Date.now(),
      transactionDate: todayISO,
      competenceMonth: monthYear,
      description: finalDescription,
      counterparty,
      originLabel,
      destinationLabel,
      amount,
      type: effectiveType,
      accountId,
      targetAccountId,
      paidByUserId,
      ownership,
      subcategoryId,
      projectionId: matchingProj ? matchingProj.id : null,
      installmentCurrent: 1,
      installmentTotal: 1
    });

    amountInput.value = "";
    descInput.value = "";
    if (counterpartyEl) counterpartyEl.value = "";
    this.populateQuickTargetAccounts();
    if (hint) hint.textContent = "";

    this.saveState(true);
    this.renderAll();
    this.showToast(
      effectiveType === "TRANSFER"
        ? `⇄ Transferência ${this.formatBRL(amount)} registrada (excluída de gastos)!`
        : `🫒 ${this.formatBRL(amount)} (${finalDescription}) registrado!`,
      effectiveType === "TRANSFER" ? "info" : "success"
    );
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
      const panelMonth = this.statementsPanelMonth || monthYear;
      const regAccounts = this.getRegisteredAccountsForStatements();
      let completeAccs = 0;
      let partialAccs = 0;
      let pendingAccs = 0;
      regAccounts.forEach(acc => {
        const st = this.getAccountStatementSummary(acc, panelMonth);
        if (st.status === "COMPLETE") completeAccs++;
        else if (st.status === "PARTIAL") partialAccs++;
        else pendingAccs++;
      });
      const stmtPillColor = pendingAccs > 0
        ? "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900"
        : partialAccs > 0
        ? "bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-900"
        : "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-900";

      kpiContainer.innerHTML = `
        <div class="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white border border-stone-200/80 text-[11px] sm:text-xs shadow-2xs">
          <span class="text-stone-400 font-semibold">Saídas (${userLabel}):</span>
          <strong class="text-stone-900 font-extrabold whitespace-nowrap tabular-nums">${this.formatBRL(summary.totalActualExpenses)}</strong>
        </div>
        <div class="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white border border-stone-200/80 text-[11px] sm:text-xs shadow-2xs">
          <span class="text-stone-400 font-semibold">Meta:</span>
          <strong class="text-stone-700 font-bold whitespace-nowrap tabular-nums">${this.formatBRL(summary.totalPlannedExpenses)}</strong>
        </div>
        <button
          type="button"
          onclick="App.scrollToStatementsPanel()"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs ${stmtPillColor}"
          title="Ver painel de extratos pendentes, parciais e completos de todas as contas"
        >
          <span>📑</span>
          <span>Extratos: ${completeAccs}/${regAccounts.length} fechados${partialAccs > 0 ? ` • ${partialAccs} parcial` : ""}${pendingAccs > 0 ? ` • ${pendingAccs} pend.` : ""}</span>
        </button>
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
    const isCoupleView = this.activeUserFilter === "ALL";
    const fullSummary = this.calculateMonthSummary(monthYear, isCoupleView ? "ALL" : this.activeUserFilter);
    const activeUserName = isCoupleView ? "Casal" : this.getUser(this.activeUserFilter).name;
    const splitEl = document.getElementById("couple-split-panel");
    if (splitEl) {
      if (!isCoupleView) {
        splitEl.innerHTML = `
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-extrabold text-stone-900 flex items-center gap-2">
                <i data-lucide="user" class="w-4 h-4 text-lime-700"></i>
                Visão Individual: ${activeUserName}
              </h3>
              <p class="text-xs text-stone-500 mt-0.5">
                Os indicadores e gráficos abaixo mostram apenas os dados de <strong>${activeUserName}</strong>. O acerto e os dados conjuntos do casal aparecem ao selecionar <strong>Ambos</strong>.
              </p>
            </div>
            <button
              type="button"
              onclick="App.setUserFilter('ALL')"
              class="px-3.5 py-2 rounded-xl bg-lime-700 hover:bg-lime-800 text-white text-xs font-bold whitespace-nowrap transition self-start sm:self-center"
            >
              👥 Ver Dados Conjuntos (Ambos)
            </button>
          </div>
        `;
      } else {
        const cs = fullSummary.coupleSplit;
        const isProp = this.state.settings.splitMode === "PROPORTIONAL";
        const brunoPct = (cs.brunoShareRatio * 100).toFixed(1);
        const nubiaPct = (cs.nubiaShareRatio * 100).toFixed(1);

        let settlementMsg = "";
        if (Math.abs(cs.brunoNetCredit) < 1) {
          settlementMsg = `<span class="text-lime-800 font-bold">🫒 Tudo em equilíbrio! As contas coletivas estão 100% acertadas.</span>`;
        } else if (cs.brunoNetCredit > 0) {
          settlementMsg = `Para equilibrar as despesas da casa, <strong>Núbia</strong> transfere <strong class="text-lime-800 text-xs sm:text-sm whitespace-nowrap tabular-nums">${this.formatBRL(cs.brunoNetCredit)}</strong> para <strong>Bruno</strong>.`;
        } else {
          settlementMsg = `Para equilibrar as despesas da casa, <strong>Bruno</strong> transfere <strong class="text-lime-800 text-xs sm:text-sm whitespace-nowrap tabular-nums">${this.formatBRL(Math.abs(cs.brunoNetCredit))}</strong> para <strong>Núbia</strong>.`;
        }

        splitEl.innerHTML = `
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <h3 class="text-sm font-extrabold text-stone-900 flex items-center gap-2 flex-wrap">
                <i data-lucide="users" class="w-4 h-4 text-lime-700"></i>
                <span>Divisão do Casal • Gastos Coletivos da Casa:</span>
                <span class="whitespace-nowrap tabular-nums">${this.formatBRL(cs.totalHouseholdCollective)}</span>
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
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-extrabold text-lime-800 uppercase">Bruno (${brunoPct}%)</span>
                <span class="text-xs text-stone-500 whitespace-nowrap tabular-nums">Quota: ${this.formatBRL(cs.brunoFairShare)}</span>
              </div>
              <div class="mt-2 text-base sm:text-lg font-extrabold text-stone-900 whitespace-nowrap tabular-nums">Pagou: ${this.formatBRL(cs.paidByBrunoCollective)}</div>
              <div class="text-xs text-stone-500 mt-1">Individuais Bruno: <span class="whitespace-nowrap tabular-nums font-semibold">${this.formatBRL(fullSummary.individualBrunoActual)}</span></div>
            </div>

            <div class="bg-[#f9faf7] border border-[#e6ece0] rounded-xl p-4">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-extrabold text-rose-700 uppercase">Núbia (${nubiaPct}%)</span>
                <span class="text-xs text-stone-500 whitespace-nowrap tabular-nums">Quota: ${this.formatBRL(cs.nubiaFairShare)}</span>
              </div>
              <div class="mt-2 text-base sm:text-lg font-extrabold text-stone-900 whitespace-nowrap tabular-nums">Pagou: ${this.formatBRL(cs.paidByNubiaCollective)}</div>
              <div class="text-xs text-stone-500 mt-1">Individuais Núbia: <span class="whitespace-nowrap tabular-nums font-semibold">${this.formatBRL(fullSummary.individualNubiaActual)}</span></div>
            </div>

            <div class="bg-lime-50 border border-lime-200 rounded-xl p-4 flex flex-col justify-center">
              <div class="text-xs font-extrabold uppercase text-lime-800 mb-1">🫒 Acerto Sugerido</div>
              <div class="text-xs text-stone-700 leading-relaxed">${settlementMsg}</div>
            </div>
          </div>
        `;
      }
    }

    const diagKpis = document.getElementById("diagnostics-kpis");
    if (diagKpis) {
      if (!isCoupleView) {
        diagKpis.innerHTML = `
          <div class="oli-card rounded-2xl p-4">
            <div class="text-xs font-bold text-stone-500">Entradas (${activeUserName})</div>
            <div class="text-lg sm:text-xl font-extrabold text-stone-900 mt-1 whitespace-nowrap tabular-nums">${this.formatBRL(fullSummary.totalIncome)}</div>
            <div class="text-[11px] text-stone-500 mt-1">Receitas nas contas de ${activeUserName}</div>
          </div>
          <div class="oli-card rounded-2xl p-4">
            <div class="text-xs font-bold text-stone-500">Saídas Totais (${activeUserName})</div>
            <div class="text-lg sm:text-xl font-extrabold text-stone-900 mt-1 whitespace-nowrap tabular-nums">${this.formatBRL(fullSummary.totalActualExpenses)}</div>
            <div class="text-[11px] text-stone-500 mt-1">Meta de ${activeUserName}: <span class="whitespace-nowrap tabular-nums font-semibold">${this.formatBRL(fullSummary.totalPlannedExpenses)}</span></div>
          </div>
          <div class="oli-card rounded-2xl p-4">
            <div class="text-xs font-bold text-stone-500">Individuais (${activeUserName})</div>
            <div class="text-lg sm:text-xl font-extrabold text-stone-900 mt-1 whitespace-nowrap tabular-nums">${this.formatBRL(fullSummary.individualTotalActual)}</div>
            <div class="text-[11px] text-stone-500 mt-1">Meta individual: <span class="whitespace-nowrap tabular-nums font-semibold">${this.formatBRL(fullSummary.individualTotalPlanned)}</span></div>
          </div>
        `;
      } else {
        diagKpis.innerHTML = `
          <div class="oli-card rounded-2xl p-4">
            <div class="text-xs font-bold text-stone-500">Receita Total da Casa</div>
            <div class="text-lg sm:text-xl font-extrabold text-stone-900 mt-1 whitespace-nowrap tabular-nums">${this.formatBRL(fullSummary.incomeBruno + fullSummary.incomeNubia)}</div>
            <div class="text-[11px] text-stone-500 mt-1 flex flex-wrap gap-x-2"><span>Bruno: <strong class="whitespace-nowrap tabular-nums">${this.formatBRL(fullSummary.incomeBruno)}</strong></span><span>• Núbia: <strong class="whitespace-nowrap tabular-nums">${this.formatBRL(fullSummary.incomeNubia)}</strong></span></div>
          </div>
          <div class="oli-card rounded-2xl p-4">
            <div class="text-xs font-bold text-stone-500">Gastos Coletivos (Realizado / Meta)</div>
            <div class="text-lg sm:text-xl font-extrabold text-stone-900 mt-1 whitespace-nowrap tabular-nums">${this.formatBRL(fullSummary.collectiveActual)}</div>
            <div class="text-[11px] text-stone-500 mt-1">Meta Coletiva: <span class="whitespace-nowrap tabular-nums font-semibold">${this.formatBRL(fullSummary.collectivePlanned)}</span></div>
          </div>
          <div class="oli-card rounded-2xl p-4">
            <div class="text-xs font-bold text-stone-500">Gastos Individuais Somados</div>
            <div class="text-lg sm:text-xl font-extrabold text-stone-900 mt-1 whitespace-nowrap tabular-nums">${this.formatBRL(fullSummary.individualBrunoActual + fullSummary.individualNubiaActual)}</div>
            <div class="text-[11px] text-stone-500 mt-1">Meta Individual: <span class="whitespace-nowrap tabular-nums font-semibold">${this.formatBRL(fullSummary.individualTotalPlanned)}</span></div>
          </div>
        `;
      }
    }

    if (this.currentTab === "diagnostics") {
      this.renderDiagnosticsChart(monthYear);
    }
  },

  renderDiagnosticsChart(monthYear) {
    if (!window.Chart) return;

    const userFilter = this.activeUserFilter;
    const summary = this.calculateMonthSummary(monthYear, userFilter);
    const monthTxs = summary.filteredTxs.filter(t => t.type === "EXPENSE");
    const allowedAccIds = new Set(this.getAccountsForActiveUser().map(a => a.id));
    const monthProjs = this.state.projections.filter(p => {
      if (p.monthYear !== monthYear) return false;
      if (userFilter === "ALL") return true;
      return allowedAccIds.has(p.accountId) ||
        (userFilter === "bruno" && p.ownership === "INDIVIDUAL_BRUNO") ||
        (userFilter === "nubia" && p.ownership === "INDIVIDUAL_NUBIA");
    });

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

  toggleTreeTxDesc(txId) {
    this.expandedTreeDescIds[txId] = !this.expandedTreeDescIds[txId];
    this.renderAll();
  },

  toggleAllTreeFullText() {
    this.showAllTreeFullText = !this.showAllTreeFullText;
    this.renderAll();
  },

  setBudgetGroupMode(mode) {
    this.budgetGroupMode = mode === "SUBCATEGORY" ? "SUBCATEGORY" : "MACRO";
    this.renderAll();
  },

  expandAllTrees(expand = true, accountPrefix = null) {
    const monthYear = this.state.settings.activeMonth;
    const isMacro = this.budgetGroupMode === "MACRO";
    this.state.accounts.forEach(acc => {
      if (accountPrefix && acc.id !== accountPrefix) return;
      if (isMacro) {
        this.state.categories.forEach(cat => {
          if (cat.type !== "EXPENSE") return;
          const key = `${acc.id}__macro__${cat.id}`;
          if (expand) {
            const subIds = new Set(this.state.subcategories.filter(s => s.categoryId === cat.id).map(s => s.id));
            const hasTx = this.state.transactions.some(
              t => t.competenceMonth === monthYear && t.type === "EXPENSE" && t.accountId === acc.id && subIds.has(t.subcategoryId)
            );
            if (hasTx) this.expandedTreeKeys[key] = true;
          } else {
            delete this.expandedTreeKeys[key];
          }
        });
      } else {
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
      }
    });
    this.renderAll();
  },

  setMacroCategoryMeta(accountId, categoryId, rawValue) {
    const monthYear = this.state.settings.activeMonth;
    const val = Math.max(0, parseFloat(String(rawValue).replace(",", ".")) || 0);
    const cat = this.getCategory(categoryId);
    const acc = this.getAccount(accountId);
    const childSubs = this.state.subcategories.filter(s => s.categoryId === categoryId);
    if (childSubs.length === 0) return;

    const childSubIds = new Set(childSubs.map(s => s.id));
    const existingProjs = this.state.projections.filter(
      p => p.monthYear === monthYear && p.accountId === accountId && childSubIds.has(p.subcategoryId)
    );

    if (existingProjs.length > 0) {
      existingProjs[0].plannedAmount = val;
      for (let i = 1; i < existingProjs.length; i++) {
        existingProjs[i].plannedAmount = 0;
      }
    } else if (val > 0) {
      const targetSub = childSubs[0];
      this.state.projections.push({
        id: "proj_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        monthYear,
        subcategoryId: targetSub.id,
        title: cat.name,
        plannedAmount: val,
        accountId,
        ownership: this.resolveDefaultOwnership(targetSub.id, acc.ownerId),
        isFixed: false,
        dueDay: acc.dueDay || 10
      });
    }

    this.saveState(true);
    this.renderAll();
    this.showToast(`🫒 Meta da categoria "${cat.name}" atualizada para ${this.formatBRL(val)}!`, "success");
  },

  selectAllInMacroTree(accountId, categoryId) {
    const monthYear = this.state.settings.activeMonth;
    const subIds = new Set(this.state.subcategories.filter(s => s.categoryId === categoryId).map(s => s.id));
    const txs = this.state.transactions.filter(
      t => t.competenceMonth === monthYear && t.type === "EXPENSE" && t.accountId === accountId && subIds.has(t.subcategoryId)
    );
    if (txs.length === 0) return;
    const ids = txs.map(t => t.id);
    const allSelected = ids.every(id => this.selectedTxIds.includes(id));
    if (allSelected) {
      this.selectedTxIds = this.selectedTxIds.filter(id => !ids.includes(id));
    } else {
      ids.forEach(id => {
        if (!this.selectedTxIds.includes(id)) this.selectedTxIds.push(id);
      });
    }
    this.renderAll();
  },

  groupBudgetItemsByMacro(accountId, activeSubItems) {
    const map = new Map();
    activeSubItems.forEach(item => {
      const cat = this.getCategory(item.sub.categoryId);
      if (!map.has(cat.id)) {
        map.set(cat.id, {
          isMacro: true,
          cat,
          sub: { id: item.sub.id, name: cat.name, categoryId: cat.id },
          treeKey: `${accountId}__macro__${cat.id}`,
          accountId,
          actual: 0,
          meta: 0,
          txs: [],
          ownership: item.ownership
        });
      }
      const g = map.get(cat.id);
      g.actual += item.actual;
      g.meta += item.meta;
      g.txs.push(...item.txs);
    });

    const list = Array.from(map.values());
    list.forEach(g => {
      g.txs.sort((a, b) => (b.transactionDate || "").localeCompare(a.transactionDate || ""));
    });
    return list.sort((a, b) => b.actual - a.actual || b.meta - a.meta);
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

    this.setDashboardEntryMode("QUICK");
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
        const isMacroRow = Boolean(item.isMacro);
        const treeKey = item.treeKey || `${accountId}__${item.sub.id}`;
        const isExpanded = Boolean(this.expandedTreeKeys[treeKey]);
        const txCount = item.txs.length;
        const colors = this.getSpreadsheetCellColor(item.actual, item.meta);
        const diff = item.meta - item.actual;
        const selectAllCall = isMacroRow
          ? `App.selectAllInMacroTree('${accountId}', '${item.cat.id}')`
          : `App.selectAllInTree('${accountId}', '${item.sub.id}')`;
        const metaChangeCall = isMacroRow
          ? `App.setMacroCategoryMeta('${accountId}', '${item.cat.id}', this.value)`
          : `App.setCategoryMeta('${accountId}', '${item.sub.id}', this.value)`;

        const treeChildrenHTML = isExpanded
          ? `
            <tr class="bg-[#f8faf5] border-b border-stone-200/70">
              <td colspan="4" class="px-2.5 sm:px-5 py-3 w-full max-w-0">
                <div class="pl-2.5 sm:pl-4 border-l-2 border-lime-600/40 space-y-1.5 min-w-0 max-w-full">
                  <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-stone-500 pb-1.5 border-b border-stone-200/60">
                    <span>Árvore de Lançamentos • ${item.sub.name} (${txCount})</span>
                    <div class="flex flex-wrap items-center gap-1.5">
                      ${
                        txCount > 0
                          ? `<button
                              type="button"
                              onclick="App.toggleAllTreeFullText()"
                              class="text-stone-600 hover:text-stone-900 bg-white border border-stone-200 hover:border-lime-600 px-2 py-0.5 rounded-lg font-bold transition"
                              title="Alternar entre textos compactos (ocultos) e descrição completa com quebra de linha"
                            >
                              ${this.showAllTreeFullText ? "▾ Compactar textos" : "▸ Mostrar textos"}
                            </button>
                            <button
                              type="button"
                              onclick="${selectAllCall}"
                              class="text-stone-700 hover:text-stone-900 bg-white border border-stone-200 hover:border-lime-600 px-2 py-0.5 rounded-lg font-bold transition"
                              title="Marcar todos desta categoria para recategorizar ou excluir em lote"
                            >
                              ☑ Selecionar todos (${txCount})
                            </button>`
                          : ""
                      }
                      <button
                        type="button"
                        onclick="App.quickLaunchInCategory('${accountId}', '${item.sub.id}')"
                        class="text-lime-800 hover:text-lime-950 bg-lime-100 hover:bg-lime-200/80 px-2.5 py-0.5 rounded-lg font-bold transition"
                      >
                        + Novo lançamento aqui
                      </button>
                    </div>
                  </div>
                  ${
                    txCount === 0
                      ? `<div class="py-2 text-xs text-stone-400 italic">└─ Nenhum lançamento registrado ainda nesta categoria no mês (Meta: ${this.formatBRL(item.meta)}).</div>`
                      : item.txs
                          .map((tx, idx) => {
                            if (!this.visibleTreeTxIds) this.visibleTreeTxIds = [];
                            this.visibleTreeTxIds.push(tx.id);
                            const branchChar = idx === txCount - 1 ? "└─" : "├─";
                            const instTag = tx.installmentTotal > 1
                              ? `<span class="px-1.5 py-0.5 rounded bg-stone-200/80 text-stone-700 text-[10px] font-bold">${tx.installmentCurrent}/${tx.installmentTotal}</span>`
                              : "";
                            const isCredit = Number(tx.amount) < 0 || tx.isInvoiceCredit;
                            const creditTag = isCredit
                              ? `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Estorno / Abate</span>`
                              : "";
                            const isChecked = this.selectedTxIds.includes(tx.id);
                            const rawDesc = (tx.description || "").trim();
                            const hasLongText = rawDesc.length > 36 || Boolean(tx.notes || tx.counterparty || tx.originLabel || tx.destinationLabel);
                            const isDescExpanded = Boolean(this.showAllTreeFullText || this.expandedTreeDescIds[tx.id]);
                            return `
                              <div class="flex flex-wrap items-start justify-between gap-2 py-1.5 text-xs ${isChecked ? "bg-lime-100/70" : "hover:bg-white/80"} rounded-lg px-2 transition w-full min-w-0">
                                <div class="flex items-start gap-2 min-w-0 flex-1 basis-[230px] max-w-full">
                                  <input
                                    type="checkbox"
                                    ${isChecked ? "checked" : ""}
                                    onclick="App.handleTxCheckboxClick(event, '${tx.id}', 'tree')"
                                    class="w-3.5 h-3.5 mt-0.5 rounded border-stone-300 text-lime-700 cursor-pointer shrink-0"
                                    title="Selecionar para recategorizar ou excluir em lote (Shift + Clique para intervalo)"
                                  />
                                  <span class="font-mono text-lime-700 font-bold select-none shrink-0">${branchChar}</span>
                                  <span class="text-[11px] text-stone-400 font-semibold w-10 shrink-0">${this.formatDateBR(tx.transactionDate)}</span>
                                  <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-1.5 min-w-0 ${isDescExpanded ? "flex-wrap" : ""}">
                                      <button
                                        type="button"
                                        onclick="App.toggleTreeTxDesc('${tx.id}')"
                                        class="font-semibold text-stone-800 hover:text-lime-800 text-left cursor-pointer ${isDescExpanded ? "whitespace-normal break-words leading-snug" : "truncate block flex-1 min-w-0"}"
                                        title="${isDescExpanded ? "Clique para ocultar o texto completo" : `${this.escapeHTML(rawDesc)} — Clique para ver completo com quebra de linha`}"
                                      >
                                        ${this.escapeHTML(rawDesc)}
                                      </button>
                                      ${
                                        hasLongText
                                          ? `<button
                                              type="button"
                                              onclick="App.toggleTreeTxDesc('${tx.id}')"
                                              class="px-1.5 py-0.5 rounded bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-800 text-[10px] font-bold shrink-0 transition"
                                              title="${isDescExpanded ? "Recolher texto longo" : "Mostrar texto completo quebrando linha"}"
                                            >
                                              ${isDescExpanded ? "Ocultar ▴" : "+ texto"}
                                            </button>`
                                          : ""
                                      }
                                    </div>
                                    <div class="flex flex-wrap items-center gap-1 mt-1">
                                      ${this.buildTxNoteBadgeHTML(tx.id, tx.notes)}
                                      ${isDescExpanded || tx.counterparty ? this.buildPixFlowBadgesHTML(tx.id, tx) : ""}
                                      ${instTag}
                                      ${creditTag}
                                      ${this.getOwnershipBadge(tx.ownership)}
                                    </div>
                                  </div>
                                </div>
                                <div class="flex flex-wrap items-center justify-end gap-1.5 shrink-0 ml-auto max-w-full">
                                  <select
                                    onchange="App.recategorizeTransaction('${tx.id}', this.value)"
                                    title="Recategorizar este lançamento para outra categoria"
                                    class="oli-input rounded-lg px-2 py-0.5 text-[11px] font-semibold text-stone-700 bg-white max-w-[140px] sm:max-w-[165px] cursor-pointer"
                                  >
                                    ${this.buildSubcategorySelectOptionsHTML(tx.subcategoryId, false)}
                                  </select>
                                  <button
                                    type="button"
                                    onclick="App.learnKeywordFromTransaction('${tx.id}')"
                                    class="px-1.5 py-0.5 rounded-md bg-stone-100 hover:bg-lime-100 text-stone-500 hover:text-lime-800 text-[10px] font-bold transition"
                                    title="Salvar regra automática com o nome deste estabelecimento para os próximos extratos"
                                  >
                                    +Regra
                                  </button>
                                  <span class="font-extrabold text-[11px] sm:text-xs whitespace-nowrap tabular-nums text-right ${isCredit ? "text-emerald-700" : "text-stone-900"}">
                                    ${isCredit ? `-${this.formatBRL(Math.abs(tx.amount))}` : this.formatBRL(tx.amount)}
                                  </span>
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
            <td class="py-2.5 px-2.5 sm:px-4">
              <div class="flex items-start sm:items-center gap-2 min-w-0">
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
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onclick="App.toggleTreeRow('${treeKey}')"
                      class="font-bold text-stone-800 hover:text-lime-800 text-xs sm:text-sm text-left break-words transition"
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
            <td class="py-2 px-0.5 sm:px-3 text-right w-[78px] sm:w-32">
              <div class="inline-block w-full px-1 sm:px-2.5 py-1.5 rounded-lg font-extrabold text-[10px] sm:text-sm text-right whitespace-nowrap tabular-nums ${colors.actualClass}">
                ${this.formatBRL(item.actual)}
              </div>
            </td>

            <!-- Coluna META (Editável direto na célula) -->
            <td class="py-2 px-0.5 sm:px-3 text-right w-[74px] sm:w-32">
              <div class="relative flex items-center justify-end">
                <input
                  type="number"
                  step="0.01"
                  value="${Number(item.meta).toFixed(2)}"
                  onchange="${metaChangeCall}"
                  title="Clique para editar a Meta desta categoria (0 para arquivar se não houver gastos)"
                  class="w-full rounded-lg px-1 sm:px-2.5 py-1.5 text-right font-extrabold text-[10px] sm:text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-lime-600 transition ${colors.metaClass}"
                />
              </div>
            </td>

            <!-- Coluna SALDO / AÇÃO RÁPIDA -->
            <td class="py-2.5 px-1 sm:px-4 text-right w-[86px] sm:w-32">
              <div class="flex items-center justify-end gap-0.5 sm:gap-1 flex-nowrap">
                <span class="text-[10px] sm:text-xs font-bold whitespace-nowrap tabular-nums ${diff >= 0 ? "text-lime-700" : "text-rose-600"}">
                  ${diff >= 0 ? "+" : ""}${this.formatBRL(diff)}
                </span>
                <button
                  type="button"
                  onclick="App.quickLaunchInCategory('${accountId}', '${item.sub.id}')"
                  class="opacity-70 group-hover:opacity-100 p-0.5 rounded-lg hover:bg-lime-100 text-lime-800 transition shrink-0"
                  title="Adicionar lançamento nesta categoria"
                >
                  <i data-lucide="plus-circle" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
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
    this.visibleTreeTxIds = [];
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
      const grossPurchases = cardTxs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
      const invoiceCredits = cardTxs.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      const metaInfo = this.getCardMetaInfo(monthYear, card.id);
      return {
        card,
        actual,
        grossPurchases,
        invoiceCredits,
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
            <td class="py-2.5 px-2.5 sm:px-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <a
                  href="#card-block-${row.card.id}"
                  class="font-extrabold text-stone-900 hover:text-lime-800 text-xs sm:text-sm uppercase tracking-tight flex flex-wrap items-center gap-1.5"
                >
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${row.card.color}"></span>
                  <span class="break-words">${row.card.name.replace(" (Dia 8)", "").replace(" (Dia 19)", "")}</span>
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
            <td class="py-2 px-0.5 sm:px-3 text-right w-[78px] sm:w-32">
              <div class="inline-block w-full px-1 sm:px-2.5 py-1.5 rounded-lg font-extrabold text-[10px] sm:text-sm text-right whitespace-nowrap tabular-nums ${colors.actualClass}">
                ${this.formatBRL(row.actual)}
              </div>
              ${
                row.invoiceCredits > 0
                  ? `<div class="text-[9px] sm:text-[10px] text-emerald-700 font-semibold mt-0.5 whitespace-nowrap tabular-nums" title="Compras: ${this.formatBRL(row.grossPurchases)} | Estornos/Descontos: -${this.formatBRL(row.invoiceCredits)}">${this.formatBRL(row.grossPurchases)} − ${this.formatBRL(row.invoiceCredits)}</div>`
                  : ""
              }
            </td>
            <td class="py-2 px-0.5 sm:px-3 text-right w-[74px] sm:w-32">
              <button
                type="button"
                onclick="App.promptCardCustomMeta('${row.card.id}')"
                title="Clique para arbitrar um valor fixo para o cartão ou usar a soma automática das categorias"
                class="w-full px-1 sm:px-2.5 py-1.5 rounded-lg font-extrabold text-[10px] sm:text-sm text-right flex items-center justify-between gap-0.5 hover:ring-2 hover:ring-lime-600 transition ${colors.metaClass}"
              >
                <i data-lucide="pencil" class="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-50 shrink-0"></i>
                <span class="whitespace-nowrap tabular-nums">${this.formatBRL(row.meta)}</span>
              </button>
            </td>
            <td class="py-2.5 px-1 sm:px-4 text-right w-[86px] sm:w-32">
              <span class="text-[10px] sm:text-xs font-bold whitespace-nowrap tabular-nums ${diff >= 0 ? "text-lime-700" : "text-rose-600"}">
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

          if (subTxs.length > 0 || meta > 0) {
            const ownership = (subProjs[0] && subProjs[0].ownership) || (subTxs[0] && subTxs[0].ownership) || this.resolveDefaultOwnership(sub.id, card.ownerId);
            activeCardItems.push({
              sub,
              accountId: card.id,
              actual,
              meta,
              txs: subTxs,
              ownership
            });
          } else if (sub.defaultAccountId === card.id || !checkingIds.includes(sub.defaultAccountId)) {
            archivedCardSubs.push(sub);
          }
        });

        const displayCardItems = this.budgetGroupMode === "MACRO"
          ? this.groupBudgetItemsByMacro(card.id, activeCardItems)
          : activeCardItems;

        const cardDiff = metaInfo.effectiveMeta - cardActual;
        const modeLabel = window.StatementParser
          ? window.StatementParser.getCompetenceModeLabel(card.competenceOffset)
          : "Mês da virada";
        const vCardsCount = Array.isArray(card.virtualCards) ? card.virtualCards.length : 0;

        return `
          <div id="card-block-${card.id}" class="oli-card rounded-3xl overflow-hidden shadow-xs">
            <!-- Cabeçalho do Cartão -->
            <div class="px-5 py-4 bg-stone-50/90 border-b border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class="w-3.5 h-3.5 rounded-full shrink-0" style="background:${card.color}"></span>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-extrabold text-stone-900 text-sm sm:text-base uppercase tracking-tight">${card.name}</h3>
                    <span class="text-[11px] px-2 py-0.5 rounded-full bg-stone-200/75 text-stone-700 font-bold">
                      Vira dia ${card.closingDay || 9} • ${modeLabel}
                    </span>
                    ${vCardsCount > 0 ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-lime-100 text-lime-800 font-semibold" title="${(card.virtualCards || []).join(", ")}">${vCardsCount} cartões na conta</span>` : ""}
                  </div>
                  <p class="text-xs text-stone-500 mt-0.5">
                    Clique em <strong>[+]</strong> para abrir os lançamentos de cada categoria ou <button type="button" onclick="App.switchTab('cards')" class="text-lime-700 hover:underline font-bold">ajustar virada e cartões virtuais</button>.
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
            <div class="w-full overflow-x-hidden">
              <table class="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr class="border-b border-stone-200/80 text-[10px] sm:text-[11px] font-extrabold uppercase text-stone-400 bg-white">
                    <th class="py-2.5 px-2 sm:px-4 w-auto">Categoria do Cartão</th>
                    <th class="py-2.5 px-1 sm:px-3 text-right w-[78px] sm:w-32 whitespace-nowrap">Realizado</th>
                    <th class="py-2.5 px-1 sm:px-3 text-right w-[74px] sm:w-32 whitespace-nowrap">Meta</th>
                    <th class="py-2.5 px-1.5 sm:px-4 text-right w-[86px] sm:w-32 whitespace-nowrap">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.buildCategoryTreeRowsHTML(card.id, displayCardItems, monthYear)}
                </tbody>
                <tfoot>
                  <tr class="bg-emerald-100/70 border-t-2 border-emerald-300/80 font-extrabold text-stone-900 text-[10px] sm:text-sm">
                    <td class="py-3 px-2 sm:px-4 uppercase tracking-wide break-words">
                      TOTAL ${card.name.split("(")[0].trim()}
                      ${
                        metaInfo.isArbitrated
                          ? `<span class="ml-1 sm:ml-2 text-[10px] sm:text-[11px] font-semibold text-stone-600 normal-case whitespace-nowrap tabular-nums">(Σ ${this.formatBRL(metaInfo.categoriesSum)})</span>`
                          : ""
                      }
                    </td>
                    <td class="py-3 px-1 sm:px-3 text-right whitespace-nowrap tabular-nums">${this.formatBRL(cardActual)}</td>
                    <td class="py-3 px-1 sm:px-3 text-right whitespace-nowrap tabular-nums">${this.formatBRL(metaInfo.effectiveMeta)}</td>
                    <td class="py-3 px-1.5 sm:px-4 text-right whitespace-nowrap tabular-nums ${cardDiff >= 0 ? "text-lime-800" : "text-rose-700"}">
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

        <div class="w-full overflow-x-hidden">
          <table class="w-full table-fixed text-left border-collapse">
            <thead>
              <tr class="border-b border-stone-200/80 text-[10px] sm:text-[11px] font-extrabold uppercase text-stone-400 bg-white">
                <th class="py-2.5 px-2 sm:px-4 w-auto">Conta Corrente (Faturas + Débito)</th>
                <th class="py-2.5 px-1 sm:px-3 text-right w-[78px] sm:w-32 whitespace-nowrap">Realizado</th>
                <th class="py-2.5 px-1 sm:px-3 text-right w-[74px] sm:w-32 whitespace-nowrap">Meta</th>
                <th class="py-2.5 px-1.5 sm:px-4 text-right w-[86px] sm:w-32 whitespace-nowrap">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <!-- 1A. Faturas dos Cartões -->
              ${cardsInCheckingHTML}

              <!-- SUBTOTAL CARTÕES (TOTAL CARTÃO) -->
              <tr class="bg-emerald-100/80 border-b-2 border-emerald-300/80 font-extrabold text-stone-900 text-[10px] sm:text-sm">
                <td class="py-2.5 px-2 sm:px-4 uppercase tracking-wide">TOTAL CARTÃO</td>
                <td class="py-2.5 px-1 sm:px-3 text-right whitespace-nowrap tabular-nums">${this.formatBRL(totalCardsActual)}</td>
                <td class="py-2.5 px-1 sm:px-3 text-right whitespace-nowrap tabular-nums">${this.formatBRL(totalCardsMeta)}</td>
                <td class="py-2.5 px-1.5 sm:px-4 text-right whitespace-nowrap tabular-nums ${(totalCardsMeta - totalCardsActual) >= 0 ? "text-lime-800" : "text-rose-700"}">
                  ${(totalCardsMeta - totalCardsActual) >= 0 ? "+" : ""}${this.formatBRL(totalCardsMeta - totalCardsActual)}
                </td>
              </tr>

              <!-- Divisor sutil para Contas da Casa em Débito -->
              <tr class="bg-stone-50/90 border-b border-stone-200/70">
                <td colspan="4" class="py-1.5 px-2.5 sm:px-4 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-stone-500">
                  Contas do Mês em Débito / Pix na Conta Corrente (clique em [+] para abrir os lançamentos)
                </td>
              </tr>

              <!-- 1B. Categorias em Débito na Conta Corrente -->
              ${this.buildCategoryTreeRowsHTML(primaryCheckingId, this.budgetGroupMode === "MACRO" ? this.groupBudgetItemsByMacro(primaryCheckingId, activeCheckingItems) : activeCheckingItems, monthYear)}
            </tbody>
            <tfoot>
              <!-- TOTAL DESPESAS (CONTA CORRENTE) -->
              <tr class="bg-stone-900 text-white font-extrabold text-[10px] sm:text-sm">
                <td class="py-3.5 px-2 sm:px-4 uppercase tracking-wider break-words">TOTAL DESPESAS</td>
                <td class="py-3.5 px-1 sm:px-3 text-right text-amber-300 whitespace-nowrap tabular-nums">${this.formatBRL(grandTotalCheckingActual)}</td>
                <td class="py-3.5 px-1 sm:px-3 text-right text-stone-200 whitespace-nowrap tabular-nums">${this.formatBRL(grandTotalCheckingMeta)}</td>
                <td class="py-3.5 px-1.5 sm:px-4 text-right whitespace-nowrap tabular-nums ${grandTotalDiff >= 0 ? "text-lime-300" : "text-rose-300"}">
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
    document.querySelectorAll("[data-budget-mode]").forEach(btn => {
      const m = btn.getAttribute("data-budget-mode");
      const active = m === (this.budgetGroupMode || "MACRO");
      btn.className = `px-3 py-1.5 rounded-lg font-bold transition ${
        active ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-900"
      }`;
    });
    const container = document.getElementById("projections-groups-container");
    if (!container) return;
    container.innerHTML = this.buildStructuredBudgetHTML(monthYear);
  },

  // ==========================================================================
  // ABA 2.2: TELA DE CONTAS PARCELADAS (BARRAS DE PROGRESSO + CATEGORIAS)
  // ==========================================================================
  setInstallmentGroupMode(mode) {
    this.installmentGroupMode = mode || "CATEGORY";
    this.renderInstallmentsTab(this.state.settings.activeMonth);
  },

  getInstallmentBaseName(desc) {
    return (desc || "")
      .replace(/\s*-?\s*(?:PARC(?:ELA)?\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i, "")
      .trim();
  },

  buildInstallmentSeries(monthYear) {
    const userFilter = this.activeUserFilter;
    const allInstTxs = (this.state.transactions || []).filter(tx => {
      if (!tx || tx.type !== "EXPENSE" || (Number(tx.installmentTotal) || 1) <= 1) return false;
      if (tx.subcategoryId === "sub_financiamento_imob" || (tx.importHash && tx.importHash.startsWith("fin_"))) return false;
      if (userFilter === "bruno") return tx.paidByUserId === "bruno" || tx.ownership === "INDIVIDUAL_BRUNO";
      if (userFilter === "nubia") return tx.paidByUserId === "nubia" || tx.ownership === "INDIVIDUAL_NUBIA";
      return true;
    });

    const monthToInt = (ym) => {
      if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return 2026 * 12 + 11;
      const [y, m] = ym.split("-").map(Number);
      return y * 12 + m;
    };

    const seriesMap = new Map();
    for (const tx of allInstTxs) {
      const total = Number(tx.installmentTotal) || 1;
      const current = Number(tx.installmentCurrent) || 1;
      const baseName = this.getInstallmentBaseName(tx.description);
      const normBase = window.StatementParser
        ? window.StatementParser.normalizeText(baseName)
        : baseName.toUpperCase();
      const startMonthIdx = monthToInt(tx.competenceMonth) - current;
      const amountCents = Math.round(Math.abs(Number(tx.amount)) * 100);
      const key = `${tx.accountId}__${normBase}__${total}__${amountCents}__${startMonthIdx}`;

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          key,
          baseName: baseName || tx.description,
          accountId: tx.accountId,
          total,
          parcelValue: Math.abs(Number(tx.amount)),
          txs: []
        });
      }
      seriesMap.get(key).txs.push(tx);
    }

    const shortMonths = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const formatShortMY = (ym) => {
      const [y, m] = ym.split("-").map(Number);
      return `${shortMonths[(m || 1) - 1]}/${y}`;
    };

    const result = [];
    for (const s of seriesMap.values()) {
      s.txs.sort((a, b) => {
        const cmp = (a.competenceMonth || "").localeCompare(b.competenceMonth || "");
        return cmp !== 0 ? cmp : (Number(a.installmentCurrent) || 1) - (Number(b.installmentCurrent) || 1);
      });

      const activeTx = s.txs.find(t => t.competenceMonth === monthYear) || null;
      const displayTx = activeTx || s.txs[s.txs.length - 1];
      const currentParcel = Math.min(s.total, Math.max(1, Number(displayTx.installmentCurrent) || 1));
      const remainingCount = Math.max(0, s.total - currentParcel);
      const remainingValue = remainingCount * s.parcelValue;
      const totalValue = s.total * s.parcelValue;

      const refYM = displayTx.competenceMonth || monthYear;
      const [ry, rm] = refYM.split("-").map(Number);
      const endYM = window.StatementParser
        ? window.StatementParser.shiftYearMonth(ry, rm, remainingCount)
        : refYM;

      const sub = this.getSubcategory(displayTx.subcategoryId);
      const cat = this.getCategory(sub.categoryId);
      const acc = this.getAccount(displayTx.accountId);

      result.push({
        key: s.key,
        baseName: s.baseName,
        displayTx,
        txIds: s.txs.map(t => t.id),
        hasInActiveMonth: Boolean(activeTx),
        paidCount: currentParcel,
        total: s.total,
        remainingCount,
        parcelValue: s.parcelValue,
        remainingValue,
        totalValue,
        endMonthLabel: formatShortMY(endYM),
        sub,
        cat,
        acc
      });
    }

    return result;
  },

  recategorizeInstallmentSeries(txIdsCSV, newSubId) {
    if (!txIdsCSV || !newSubId) return;
    const ids = txIdsCSV.split(",").filter(Boolean);
    const idSet = new Set(ids);

    // Garante inclusão de qualquer parcela correlata adicional
    ids.forEach(id => {
      const baseTx = this.state.transactions.find(t => t.id === id);
      if (baseTx) {
        this.findCorrelatedInstallmentTxs(baseTx).forEach(sib => idSet.add(sib.id));
      }
    });

    const newSub = this.getSubcategory(newSubId);
    let updated = 0;

    this.state.transactions.forEach(tx => {
      if (!idSet.has(tx.id)) return;
      this.applySubcategoryToTx(tx, newSubId);
      updated++;
    });

    if (updated === 0) return;
    this.saveState(true);
    this.renderAll();
    this.showToast(`🏷️ Parcelamento movido para "${newSub.name}" (${updated} parcela(s) atualizada(s))!`, "success");
  },

  handleInstallmentSeriesCheck(event, txIdsCSV) {
    if (!txIdsCSV) return;
    const ids = txIdsCSV.split(",").filter(Boolean);
    const checked = event.target.checked;
    const seriesOrder = this.visibleInstallmentSeries || [];
    const curIdx = seriesOrder.findIndex(entry => entry.txIdsCSV === txIdsCSV);

    if (event.shiftKey && this.lastClickedInstKey && curIdx !== -1) {
      const prevIdx = seriesOrder.findIndex(entry => entry.key === this.lastClickedInstKey);
      if (prevIdx !== -1) {
        const [from, to] = prevIdx < curIdx ? [prevIdx, curIdx] : [curIdx, prevIdx];
        for (let i = from; i <= to; i++) {
          seriesOrder[i].txIds.forEach(id => {
            if (checked && !this.selectedTxIds.includes(id)) {
              this.selectedTxIds.push(id);
            } else if (!checked) {
              this.selectedTxIds = this.selectedTxIds.filter(x => x !== id);
            }
          });
        }
      }
    } else {
      ids.forEach(id => {
        if (checked && !this.selectedTxIds.includes(id)) {
          this.selectedTxIds.push(id);
        } else if (!checked) {
          this.selectedTxIds = this.selectedTxIds.filter(x => x !== id);
        }
      });
    }

    const found = seriesOrder[curIdx];
    this.lastClickedInstKey = found ? found.key : null;
    this.renderAll();
  },

  selectAllInstallmentsInList(txIdsCSV) {
    if (!txIdsCSV) return;
    const ids = txIdsCSV.split(",").filter(Boolean);
    const allSelected = ids.every(id => this.selectedTxIds.includes(id));
    if (allSelected) {
      this.selectedTxIds = this.selectedTxIds.filter(id => !ids.includes(id));
    } else {
      ids.forEach(id => {
        if (!this.selectedTxIds.includes(id)) this.selectedTxIds.push(id);
      });
    }
    this.renderAll();
  },

  buildInstallmentCardHTML(s) {
    const pct = Math.min(100, Math.round((s.paidCount / s.total) * 100));
    const txIdsCSV = s.txIds.join(",");
    const isChecked = s.txIds.length > 0 && s.txIds.every(id => this.selectedTxIds.includes(id));

    let barHTML = "";
    if (s.total <= 12) {
      const segments = [];
      for (let i = 1; i <= s.total; i++) {
        const isPaid = i <= s.paidCount;
        segments.push(
          `<div class="h-2.5 flex-1 rounded-sm transition ${
            isPaid
              ? "bg-lime-600"
              : "bg-amber-100 border border-amber-300/80"
          }" title="Parcela ${i}/${s.total} (${isPaid ? "Paga / Atual" : "Falta pagar"})"></div>`
        );
      }
      barHTML = `<div class="flex items-center gap-1 w-full">${segments.join("")}</div>`;
    } else {
      barHTML = `
        <div class="w-full h-2.5 rounded-full bg-amber-100 border border-amber-300/70 overflow-hidden">
          <div class="h-full bg-lime-600 rounded-full transition-all" style="width:${pct}%"></div>
        </div>
      `;
    }

    const statusBadge = s.remainingCount === 0
      ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">Última parcela neste mês! 🎉</span>`
      : s.remainingCount === 1
      ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold">Falta apenas 1 parcela</span>`
      : `<span class="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[10px] font-extrabold">Faltam ${s.remainingCount} parcelas</span>`;

    return `
      <div class="p-4 border-b border-stone-100 last:border-b-0 ${isChecked ? "bg-lime-50/70" : "hover:bg-stone-50/70"} transition space-y-2.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-start gap-2.5 min-w-0">
            <input
              type="checkbox"
              ${isChecked ? "checked" : ""}
              onclick="App.handleInstallmentSeriesCheck(event, '${txIdsCSV}')"
              class="mt-1 w-4 h-4 rounded border-stone-300 text-lime-700 cursor-pointer shrink-0"
              title="Selecionar para recategorizar ou excluir várias parceladas (Shift + Clique para intervalo)"
            />
            <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-extrabold text-stone-900 text-sm truncate">${s.baseName}</span>
              ${this.buildTxNoteBadgeHTML(s.displayTx.id, s.displayTx.notes)}
              <span class="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[11px] font-bold">
                ${s.paidCount}/${s.total}
              </span>
              ${statusBadge}
              ${this.getOwnershipBadge(s.displayTx.ownership)}
            </div>
            <div class="flex items-center gap-2 flex-wrap text-[11px] text-stone-400 mt-1">
              <span class="inline-flex items-center gap-1 font-semibold text-stone-600">
                <span class="w-2 h-2 rounded-full" style="background:${s.acc.color || "#4d7c0f"}"></span>
                ${s.acc.name}
              </span>
              <span>•</span>
              <span>Compra: ${this.formatDateBR(s.displayTx.transactionDate)}</span>
              <span>•</span>
              <span>Quita em <strong class="text-stone-600">${s.endMonthLabel}</strong></span>
              ${!s.hasInActiveMonth ? `<span class="text-amber-700 font-semibold">(Última ref.: ${this.getMonthLabel(s.displayTx.competenceMonth)})</span>` : ""}
            </div>
            </div>
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0">
            <div class="text-left sm:text-right">
              <div class="text-xs sm:text-sm font-extrabold text-stone-900 whitespace-nowrap tabular-nums">${this.formatBRL(s.parcelValue)}<span class="text-[10px] sm:text-[11px] font-medium text-stone-400">/mês</span></div>
              <div class="text-[11px] font-bold ${s.remainingValue > 0 ? "text-amber-700" : "text-emerald-700"} whitespace-nowrap tabular-nums">
                ${s.remainingValue > 0 ? `Falta pagar: ${this.formatBRL(s.remainingValue)}` : "Quitada neste mês"}
              </div>
            </div>
          </div>
        </div>

        <!-- Barra Visual de Parcelas + Recategorização Rápida -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <div class="flex-1 space-y-1">
            ${barHTML}
            <div class="flex items-center justify-between gap-2 text-[10px] text-stone-400 font-semibold">
              <span>${pct}% concluído (${s.paidCount} de ${s.total})</span>
              <span class="whitespace-nowrap tabular-nums">Total: ${this.formatBRL(s.totalValue)}</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <span class="w-2 h-2 rounded-full shrink-0" style="background:${s.cat.color}"></span>
            <select
              onchange="App.recategorizeInstallmentSeries('${txIdsCSV}', this.value)"
              title="Recategorizar todas as parcelas desta compra"
              class="oli-input rounded-lg px-2 py-1 text-[11px] font-semibold text-stone-700 bg-white max-w-[180px] cursor-pointer"
            >
              ${this.buildSubcategorySelectOptionsHTML(s.displayTx.subcategoryId, false)}
            </select>
            <button
              type="button"
              onclick="App.learnKeywordFromTransaction('${s.displayTx.id}')"
              class="px-2 py-1 rounded-lg bg-stone-100 hover:bg-lime-100 text-stone-600 hover:text-lime-800 text-[10px] font-bold transition"
              title="Salvar regra automática para futuros extratos"
            >
              +Regra
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderInstallmentsTab(monthYear) {
    const kpisEl = document.getElementById("installments-kpis-container");
    const groupsEl = document.getElementById("installments-groups-container");
    if (!kpisEl || !groupsEl) return;

    // Atualiza estado visual dos botões de agrupamento
    document.querySelectorAll("[data-inst-group]").forEach(btn => {
      const mode = btn.getAttribute("data-inst-group");
      const active = mode === this.installmentGroupMode;
      btn.className = `px-3 py-1.5 rounded-lg font-bold transition ${
        active ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-900"
      }`;
    });

    const scopeEl = document.getElementById("installments-scope-filter");
    if (scopeEl) scopeEl.value = this.installmentScopeFilter || "ACTIVE_MONTH";

    const allSeries = this.buildInstallmentSeries(monthYear);
    let filtered = allSeries;
    if (this.installmentScopeFilter === "ACTIVE_MONTH") {
      filtered = allSeries.filter(s => s.hasInActiveMonth);
    } else if (this.installmentScopeFilter === "FINISHING") {
      filtered = allSeries.filter(s => s.remainingCount <= 1);
    }

    const monthlyParcelSum = filtered.reduce((sum, s) => sum + (s.hasInActiveMonth ? s.parcelValue : 0), 0);
    const totalRemainingSum = filtered.reduce((sum, s) => sum + s.remainingValue, 0);
    const finishingSoonCount = filtered.filter(s => s.remainingCount <= 1).length;

    const financingStats = this.renderHousingFinancingPanel(monthYear);
    const combinedMonthTotal = monthlyParcelSum + financingStats.monthlyAmount;

    kpisEl.innerHTML = `
      <div class="oli-card rounded-2xl p-4">
        <div class="text-xs font-bold text-stone-500">Parcelas em ${this.getMonthLabel(monthYear)}</div>
        <div class="text-lg sm:text-xl font-extrabold text-stone-900 mt-1 whitespace-nowrap tabular-nums">${this.formatBRL(combinedMonthTotal)}</div>
        <div class="text-[11px] text-stone-500 mt-1 flex flex-wrap gap-x-2">
          <span>Cartões (${filtered.length}): <strong class="whitespace-nowrap tabular-nums">${this.formatBRL(monthlyParcelSum)}</strong></span>
          ${financingStats.activeCount > 0 ? `<span>• Imóvel: <strong class="text-orange-700 whitespace-nowrap tabular-nums">${this.formatBRL(financingStats.monthlyAmount)}</strong></span>` : ""}
        </div>
      </div>
      <div class="oli-card rounded-2xl p-4">
        <div class="text-xs font-bold text-stone-500">Falta Pagar (Cartões)</div>
        <div class="text-lg sm:text-xl font-extrabold text-amber-700 mt-1 whitespace-nowrap tabular-nums">${this.formatBRL(totalRemainingSum)}</div>
        <div class="text-[11px] text-stone-500 mt-1">
          ${financingStats.activeCount > 0 ? `Saldo Devedor Financiamento: <strong class="text-stone-700 whitespace-nowrap tabular-nums">${this.formatBRL(financingStats.currentBalance)}</strong>` : "Comprometimento futuro dos cartões"}
        </div>
      </div>
      <div class="oli-card rounded-2xl p-4">
        <div class="text-xs font-bold text-stone-500">Horizonte & Encerramento</div>
        <div class="text-lg sm:text-xl font-extrabold text-lime-800 mt-1 whitespace-nowrap tabular-nums">${finishingSoonCount} ${finishingSoonCount === 1 ? "compra" : "compras"} <span class="text-xs font-semibold text-stone-500">terminando</span></div>
        <div class="text-[11px] text-stone-500 mt-1">
          ${financingStats.activeCount > 0 ? `Imóvel SAC: <strong class="whitespace-nowrap tabular-nums">${financingStats.currentInstallment}/${financingStats.totalTerm}</strong> (restam ${financingStats.remainingMonths}m)` : "Última parcela agora ou no próximo mês"}
        </div>
      </div>
    `;

    if (filtered.length === 0) {
      groupsEl.innerHTML = `
        <div class="oli-card rounded-3xl p-10 text-center text-stone-400 text-xs">
          Nenhuma compra parcelada encontrada para este filtro em ${this.getMonthLabel(monthYear)}.
        </div>
      `;
      return;
    }

    if (this.installmentGroupMode === "REMAINING") {
      const sorted = [...filtered].sort((a, b) => a.remainingCount - b.remainingCount || b.parcelValue - a.parcelValue);
      this.visibleInstallmentSeries = sorted.map(s => ({ key: s.key, txIds: s.txIds, txIdsCSV: s.txIds.join(",") }));
      const allSortedIdsCSV = sorted.flatMap(s => s.txIds).join(",");
      groupsEl.innerHTML = `
        <div class="oli-card rounded-3xl overflow-hidden shadow-xs">
          <div class="px-5 py-3.5 bg-stone-50 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2">
            <span class="font-extrabold text-stone-800 text-xs uppercase tracking-wider">Ordenado pela Quantidade de Parcelas Restantes</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick="App.selectAllInstallmentsInList('${allSortedIdsCSV}')"
                class="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:border-lime-600 text-stone-700 text-[11px] font-bold transition"
              >
                ☑ Selecionar todas (${sorted.length})
              </button>
              <span class="text-xs font-bold text-stone-500">${sorted.length} compra(s)</span>
            </div>
          </div>
          <div>${sorted.map(s => this.buildInstallmentCardHTML(s)).join("")}</div>
        </div>
      `;
      return;
    }

    // Agrupamento por Categoria (Subcategoria ou Categoria Pai) ou por Cartão/Conta
    const groupMap = new Map();
    for (const s of filtered) {
      const gKey = this.installmentGroupMode === "ACCOUNT" ? s.acc.id : s.sub.id;
      const gTitle = this.installmentGroupMode === "ACCOUNT" ? s.acc.name : `${s.cat.name} • ${s.sub.name}`;
      const gColor = this.installmentGroupMode === "ACCOUNT" ? (s.acc.color || "#4d7c0f") : (s.cat.color || "#4d7c0f");

      if (!groupMap.has(gKey)) {
        groupMap.set(gKey, {
          key: gKey,
          title: gTitle,
          color: gColor,
          items: [],
          monthlyTotal: 0,
          remainingTotal: 0
        });
      }
      const g = groupMap.get(gKey);
      g.items.push(s);
      g.monthlyTotal += s.hasInActiveMonth ? s.parcelValue : 0;
      g.remainingTotal += s.remainingValue;
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => b.monthlyTotal - a.monthlyTotal);
    this.visibleInstallmentSeries = [];

    groupsEl.innerHTML = groups
      .map(g => {
        g.items.sort((a, b) => b.remainingCount - a.remainingCount || b.parcelValue - a.parcelValue);
        g.items.forEach(s => {
          this.visibleInstallmentSeries.push({ key: s.key, txIds: s.txIds, txIdsCSV: s.txIds.join(",") });
        });
        const groupTxIdsCSV = g.items.flatMap(s => s.txIds).join(",");
        return `
          <div class="oli-card rounded-3xl overflow-hidden shadow-xs">
            <div class="px-5 py-3.5 bg-stone-50/90 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="w-3 h-3 rounded-full shrink-0" style="background:${g.color}"></span>
                <h3 class="font-extrabold text-stone-900 text-xs sm:text-sm uppercase tracking-tight">${g.title}</h3>
                <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-stone-200/70 text-stone-600">${g.items.length} ${g.items.length === 1 ? "item" : "itens"}</span>
                <button
                  type="button"
                  onclick="App.selectAllInstallmentsInList('${groupTxIdsCSV}')"
                  class="px-2 py-0.5 rounded-lg bg-white border border-stone-200 hover:border-lime-600 text-stone-600 text-[11px] font-bold transition"
                  title="Marcar ou desmarcar todos deste grupo para recategorizar em lote"
                >
                  ☑ Selecionar grupo
                </button>
              </div>
              <div class="flex items-center gap-3 text-xs">
                <span class="text-stone-500">No mês: <strong class="text-stone-900">${this.formatBRL(g.monthlyTotal)}</strong></span>
                <span class="text-amber-700 font-bold">Restam: ${this.formatBRL(g.remainingTotal)}</span>
              </div>
            </div>
            <div>
              ${g.items.map(s => this.buildInstallmentCardHTML(s)).join("")}
            </div>
          </div>
        `;
      })
      .join("");
  },

  // ==========================================================================
  // CONTROLE DO FINANCIAMENTO IMOBILIÁRIO (TABELA EVOLUTIVA SAC / DDC ITAÚ)
  // ==========================================================================
  getActiveFinancingRow(fin, monthYear) {
    const sched = Array.isArray(fin && fin.schedule) ? fin.schedule : [];
    if (sched.length === 0) return { row: null, idx: -1, nextRow: null };
    let idx = sched.findIndex(r => r.competenceMonth === monthYear);
    if (idx === -1) {
      if (monthYear < sched[0].competenceMonth) {
        idx = 0;
      } else {
        idx = sched.length - 1;
      }
    }
    return {
      row: sched[idx],
      idx,
      nextRow: idx + 1 < sched.length ? sched[idx + 1] : null
    };
  },

  toggleFinancingTable() {
    this.financingTableExpanded = !this.financingTableExpanded;
    this.renderInstallmentsTab(this.state.settings.activeMonth);
    if (window.lucide) window.lucide.createIcons();
  },

  setFinancingTableScope(scope) {
    this.financingTableScope = scope || "NEXT_12";
    this.renderInstallmentsTab(this.state.settings.activeMonth);
    if (window.lucide) window.lucide.createIcons();
  },

  toggleFinancingInstallmentStatus(finId, instNum) {
    const fin = (this.state.housingFinancings || []).find(f => f.id === finId);
    if (!fin || !Array.isArray(fin.schedule)) return;
    const row = fin.schedule.find(r => Number(r.installment) === Number(instNum));
    if (!row) return;
    row.status = row.status === "Paga" ? "Projetada" : "Paga";
    this.saveState(true);
    this.renderAll();
    this.showToast(`🏠 Parcela ${row.installment}/${fin.totalTermMonths} marcada como "${row.status}"!`, "info");
  },

  launchFinancingInstallmentForMonth(finId, monthYear) {
    const fin = (this.state.housingFinancings || []).find(f => f.id === finId);
    if (!fin) return;
    const { row } = this.getActiveFinancingRow(fin, monthYear);
    if (!row) return;

    const acc = this.getAccount(fin.accountId) || this.state.accounts.find(a => a.type === "CHECKING") || this.state.accounts[0];
    const targetSub = (this.state.subcategories || []).find(s => s.id === (fin.subcategoryId || "sub_financiamento_imob")) ||
      (this.state.subcategories || []).find(s => s.id === "sub_outros") ||
      this.state.subcategories[0];

    const newTx = {
      id: "tx_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      transactionDate: row.dueDate,
      competenceMonth: row.competenceMonth,
      description: `Parcela ${row.installment}/${fin.totalTermMonths} - Financiamento Imobiliário Itaú`,
      notes: `Contrato ${fin.contractNumber} • Amort. ${this.formatBRL(row.amortization)} + Juros ${this.formatBRL(row.interest)} + Seg/TCA ${this.formatBRL(row.mip + row.dfi + row.tca)}`,
      amount: Number(row.total.toFixed(2)),
      type: "EXPENSE",
      accountId: acc ? acc.id : fin.accountId,
      paidByUserId: (acc && acc.ownerId) || fin.ownerId || "bruno",
      ownership: fin.ownership || "COLLECTIVE",
      subcategoryId: targetSub ? targetSub.id : "sub_outros",
      projectionId: null,
      installmentCurrent: row.installment,
      installmentTotal: fin.totalTermMonths,
      importHash: `fin_${fin.contractNumber}_p${row.installment}`
    };

    this.state.transactions.push(newTx);
    row.status = "Paga";
    this.saveState(true);
    this.renderAll();
    this.showToast(`🏠 Parcela ${row.installment}/${fin.totalTermMonths} (${this.formatBRL(row.total)}) lançada na ${acc ? acc.name : "Conta Itaú"}!`, "success");
  },

  openDDCUpload(finId) {
    this.updatingFinancingId = finId;
    const inp = document.getElementById("ddc-pdf-upload-input");
    if (inp) inp.click();
  },

  async handleDDCUpload(fileList, inputEl = null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const finId = this.updatingFinancingId || (this.state.housingFinancings && this.state.housingFinancings[0]?.id);
    const fin = (this.state.housingFinancings || []).find(f => f.id === finId);
    if (!fin) {
      if (inputEl) inputEl.value = "";
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      let password = null;
      let parsedDDC = null;

      while (true) {
        try {
          parsedDDC = await window.StatementParser.parseItauDDCPDF(buffer.slice(0), password);
          break;
        } catch (pdfErr) {
          if (pdfErr && (pdfErr.name === "PasswordException" || /password/i.test(pdfErr.message || ""))) {
            const entered = prompt("Este DDC do Itaú possui senha. Informe a senha para atualizar:", "");
            if (entered === null) {
              if (inputEl) inputEl.value = "";
              return;
            }
            password = entered.trim();
          } else {
            throw pdfErr;
          }
        }
      }

      if (inputEl) inputEl.value = "";
      if (!parsedDDC || !parsedDDC.schedule || parsedDDC.schedule.length === 0) {
        this.showToast("Nenhuma linha de parcela SAC reconhecida neste PDF DDC.", "error");
        return;
      }

      if (parsedDDC.contractNumber) fin.contractNumber = parsedDDC.contractNumber;
      if (parsedDDC.totalTermMonths) fin.totalTermMonths = parsedDDC.totalTermMonths;
      if (parsedDDC.monthlyInterestRate) fin.monthlyInterestRate = parsedDDC.monthlyInterestRate;
      if (parsedDDC.annualInterestRate) fin.annualInterestRate = parsedDDC.annualInterestRate;
      if (parsedDDC.annualEffectiveRate) fin.annualEffectiveRate = parsedDDC.annualEffectiveRate;
      if (parsedDDC.lastInstallmentValue) fin.lastInstallmentValue = parsedDDC.lastInstallmentValue;
      if (parsedDDC.lastDueDate) fin.lastDueDate = parsedDDC.lastDueDate;
      fin.schedule = parsedDDC.schedule;
      fin.issuedAt = new Date().toISOString();

      this.saveState(true);
      this.renderAll();
      this.showToast(`🏠 Tabela do financiamento atualizada via DDC (${parsedDDC.schedule.length} parcelas)!`, "success");
    } catch (err) {
      if (inputEl) inputEl.value = "";
      console.error("Erro ao ler DDC Itaú:", err);
      this.showToast("Não foi possível ler este PDF DDC do Itaú.", "error");
    }
  },

  renderHousingFinancingPanel(monthYear) {
    const container = document.getElementById("installments-financing-container");
    const emptyStats = { activeCount: 0, monthlyAmount: 0, currentBalance: 0, currentInstallment: 0, totalTerm: 0, remainingMonths: 0 };
    if (!container) return emptyStats;

    const allFins = Array.isArray(this.state.housingFinancings) ? this.state.housingFinancings : [];
    const userFilter = this.activeUserFilter;
    const visibleFins = allFins.filter(fin => {
      if (!fin) return false;
      if (userFilter === "ALL") return true;
      const acc = this.getAccount(fin.accountId);
      const owner = (acc && acc.ownerId) || fin.ownerId || "bruno";
      return owner === userFilter;
    });

    if (visibleFins.length === 0) {
      container.innerHTML = "";
      return emptyStats;
    }

    let monthlySum = 0;
    let totalBalanceSum = 0;
    let totalRemainingMonths = 0;
    let firstCurrentInst = 0;
    let firstTotalTerm = 0;

    container.innerHTML = visibleFins
      .map(fin => {
        const sched = fin.schedule || [];
        const { row, idx, nextRow } = this.getActiveFinancingRow(fin, monthYear);
        if (!row) return "";

        const acc = this.getAccount(fin.accountId);
        const totalTerm = fin.totalTermMonths || sched.length;
        const paidCount = sched.filter(r => r.status === "Paga").length;
        const currentInst = row.installment;
        const remainingCount = Math.max(0, totalTerm - currentInst);
        const remainingProjectedSum = sched.slice(idx + 1).reduce((s, r) => s + Number(r.total || 0), 0);
        const progressPct = Math.max(0.5, Math.min(100, Number(((currentInst / totalTerm) * 100).toFixed(1))));
        const nextDelta = nextRow ? nextRow.total - row.total : 0;
        const insuranceAndFees = Number(row.mip || 0) + Number(row.dfi || 0) + Number(row.tca || 0);

        monthlySum += Number(row.total || 0);
        totalBalanceSum += Number(row.balance || 0);
        totalRemainingMonths = Math.max(totalRemainingMonths, remainingCount);
        if (!firstCurrentInst) {
          firstCurrentInst = currentInst;
          firstTotalTerm = totalTerm;
        }

        // Verifica se a parcela já existe lançada na conta corrente Itaú nesta competência
        const alreadyLaunched = (this.state.transactions || []).some(tx => {
          if (!tx || tx.competenceMonth !== row.competenceMonth || tx.type !== "EXPENSE") return false;
          if (tx.importHash === `fin_${fin.contractNumber}_p${row.installment}`) return true;
          if (tx.accountId === fin.accountId && (tx.subcategoryId === "sub_financiamento_imob" || Math.abs(Number(tx.amount) - row.total) <= 5)) return true;
          return false;
        });

        // Prepara linhas da tabela evolutiva conforme filtro
        const yearsList = Array.from(new Set(sched.map(r => r.dueDate.substring(0, 4))));
        const scope = this.financingTableScope || "NEXT_12";
        let tableRows = [];
        if (scope === "ALL") {
          tableRows = sched;
        } else if (/^\d{4}$/.test(scope)) {
          tableRows = sched.filter(r => r.dueDate.startsWith(scope + "-"));
        } else {
          const startIdx = Math.max(0, idx - 1);
          tableRows = sched.slice(startIdx, startIdx + 13);
        }

        const yearOptionsHTML = yearsList
          .map(y => `<option value="${y}" ${scope === y ? "selected" : ""}>Ano ${y}</option>`)
          .join("");

        const tableRowsHTML = tableRows
          .map(r => {
            const isCurrentMonthRow = r.competenceMonth === monthYear;
            const segTca = Number(r.mip || 0) + Number(r.dfi || 0) + Number(r.tca || 0);
            const rowStatusBadge = r.status === "Paga"
              ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold">✓ Paga</span>`
              : `<span class="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-bold">Projetada</span>`;

            return `
              <tr class="border-b border-stone-100 text-[11px] ${isCurrentMonthRow ? "bg-lime-50/90 font-bold" : "hover:bg-stone-50/70"}">
                <td class="py-2 px-2.5 whitespace-nowrap">
                  <span class="font-extrabold text-stone-800">${r.installment}/${totalTerm}</span>
                </td>
                <td class="py-2 px-2.5 whitespace-nowrap text-stone-600">
                  ${r.dueDateBR}${isCurrentMonthRow ? ` <span class="text-[10px] text-lime-800 font-extrabold">• Mês ativo</span>` : ""}
                </td>
                <td class="py-2 px-2.5 text-right whitespace-nowrap tabular-nums text-stone-700">${this.formatBRL(r.amortization)}</td>
                <td class="py-2 px-2.5 text-right whitespace-nowrap tabular-nums text-stone-700">${this.formatBRL(r.interest)}</td>
                <td class="py-2 px-2.5 text-right whitespace-nowrap tabular-nums text-stone-500" title="MIP ${this.formatBRL(r.mip)} + DFI ${this.formatBRL(r.dfi)} + TCA ${this.formatBRL(r.tca)}">${this.formatBRL(segTca)}</td>
                <td class="py-2 px-2.5 text-right whitespace-nowrap tabular-nums font-extrabold text-stone-900">${this.formatBRL(r.total)}</td>
                <td class="py-2 px-2.5 text-right whitespace-nowrap tabular-nums font-semibold text-orange-800">${this.formatBRL(r.balance)}</td>
                <td class="py-2 px-2.5 text-center whitespace-nowrap">
                  <button
                    type="button"
                    onclick="App.toggleFinancingInstallmentStatus('${fin.id}', ${r.installment})"
                    class="cursor-pointer text-[10px] hover:opacity-80 transition"
                    title="Clique para alternar entre Paga e Projetada"
                  >
                    ${rowStatusBadge}
                  </button>
                </td>
              </tr>
            `;
          })
          .join("");

        return `
          <div class="oli-card rounded-3xl overflow-hidden border-orange-200/90 shadow-xs">
            <!-- Cabeçalho do Financiamento Imobiliário -->
            <div class="px-5 py-4 bg-gradient-to-r from-orange-50/90 via-amber-50/60 to-white border-b border-orange-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="px-2.5 py-0.5 rounded-lg bg-orange-600 text-white text-[10px] font-extrabold uppercase tracking-wider">🏠 Imóvel • Itaú SFH</span>
                  <h3 class="font-extrabold text-stone-900 text-sm sm:text-base">
                    Financiamento Imobiliário (${fin.system} • Contrato ${fin.contractNumber})
                  </h3>
                  <span class="px-2 py-0.5 rounded-full bg-white border border-orange-200 text-orange-900 text-[10px] font-bold">
                    ${acc ? acc.name : `Ag. ${fin.agency} / Cc. ${fin.accountNumber}`}
                  </span>
                  <span class="px-2 py-0.5 rounded-full bg-lime-100 text-lime-900 text-[10px] font-bold">Casa (Casal)</span>
                </div>
                <p class="text-[11px] text-stone-500 mt-1">
                  ${fin.paymentMethod} (Ag. ${fin.agency} • Cc. ${fin.accountNumber}) • Juros ${fin.monthlyInterestRate} a.m. (${fin.annualEffectiveRate} efetiva a.a.) • Última em <strong>${(fin.lastDueDate || "").split("-").reverse().join("/")}</strong> (<span class="whitespace-nowrap tabular-nums">${this.formatBRL(fin.lastInstallmentValue)}</span>)
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onclick="App.openDDCUpload('${fin.id}')"
                  class="px-3 py-1.5 rounded-xl bg-white hover:bg-orange-50 border border-orange-200 text-orange-900 text-xs font-bold transition"
                  title="Caso faça amortização extra ou pula-parcela no banco, suba o novo PDF DDC do Itaú para atualizar as parcelas"
                >
                  📄 Atualizar DDC (.PDF)
                </button>
                <button
                  type="button"
                  onclick="App.toggleFinancingTable()"
                  class="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition"
                >
                  ${this.financingTableExpanded ? "▾ Ocultar tabela SAC" : `▸ Ver evolução (${totalTerm} parcelas)`}
                </button>
              </div>
            </div>

            <!-- Painel do Mês Ativo + Decomposição SAC -->
            <div class="p-4 sm:p-5 space-y-4">
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl bg-[#fcfdf9] border border-stone-200/80 p-4">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs font-extrabold uppercase text-stone-500">Parcela de ${this.getMonthLabel(monthYear)}:</span>
                    <span class="px-2.5 py-0.5 rounded-full bg-stone-900 text-white text-xs font-extrabold">
                      ${currentInst} / ${totalTerm}
                    </span>
                    <button
                      type="button"
                      onclick="App.toggleFinancingInstallmentStatus('${fin.id}', ${row.installment})"
                      class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold transition cursor-pointer ${row.status === "Paga" ? "bg-emerald-100 text-emerald-900 border border-emerald-200" : "bg-amber-100 text-amber-900 border border-amber-200"}"
                      title="Clique para alternar Paga / Projetada"
                    >
                      ${row.status === "Paga" ? "✓ Paga" : "📅 Projetada"}
                    </button>
                    <span class="text-xs text-stone-500 font-semibold">Vencimento: <strong class="text-stone-800">${row.dueDateBR}</strong></span>
                  </div>
                  <div class="flex flex-wrap items-baseline gap-2.5 pt-1">
                    <span class="text-xl sm:text-2xl font-extrabold text-stone-900 whitespace-nowrap tabular-nums">${this.formatBRL(row.total)}</span>
                    ${
                      nextRow
                        ? `<span class="text-[11px] sm:text-xs font-semibold text-emerald-700">Próx. (${nextRow.dueDateBR.substring(3)}): <span class="whitespace-nowrap tabular-nums">${this.formatBRL(nextRow.total)}</span> (<span class="whitespace-nowrap tabular-nums">${nextDelta <= 0 ? "" : "+"}${this.formatBRL(nextDelta)}</span>)</span>`
                        : ""
                    }
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  ${
                    alreadyLaunched
                      ? `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">✓ Parcela já registrada no mês</span>`
                      : `<button
                          type="button"
                          onclick="App.launchFinancingInstallmentForMonth('${fin.id}', '${monthYear}')"
                          class="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold shadow-2xs transition"
                          title="Registrar automaticamente o débito desta parcela na Conta Corrente Itaú"
                        >
                          + Lançar parcela na Conta Itaú
                        </button>`
                  }
                </div>
              </div>

              <!-- 4 Cards de Decomposição SAC da Parcela -->
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
                <div class="rounded-xl bg-stone-50 border border-stone-200/80 p-2.5 sm:p-3">
                  <div class="text-[11px] font-bold text-stone-500">Amortização</div>
                  <div class="text-xs sm:text-base font-extrabold text-stone-900 mt-0.5 whitespace-nowrap tabular-nums">${this.formatBRL(row.amortization)}</div>
                  <div class="text-[10px] text-stone-400">Abate direto da dívida</div>
                </div>
                <div class="rounded-xl bg-stone-50 border border-stone-200/80 p-2.5 sm:p-3">
                  <div class="text-[11px] font-bold text-stone-500">Juros do Mês</div>
                  <div class="text-xs sm:text-base font-extrabold text-stone-900 mt-0.5 whitespace-nowrap tabular-nums">${this.formatBRL(row.interest)}</div>
                  <div class="text-[10px] text-stone-400">Decai mês a mês no SAC</div>
                </div>
                <div class="rounded-xl bg-stone-50 border border-stone-200/80 p-2.5 sm:p-3">
                  <div class="text-[11px] font-bold text-stone-500">Seguros + TCA</div>
                  <div class="text-xs sm:text-base font-extrabold text-stone-900 mt-0.5 whitespace-nowrap tabular-nums">${this.formatBRL(insuranceAndFees)}</div>
                  <div class="text-[10px] text-stone-400 flex flex-wrap gap-x-1"><span class="whitespace-nowrap tabular-nums">MIP ${this.formatBRL(row.mip)}</span><span>•</span><span class="whitespace-nowrap tabular-nums">DFI ${this.formatBRL(row.dfi)}</span><span>•</span><span class="whitespace-nowrap tabular-nums">TCA ${this.formatBRL(row.tca)}</span></div>
                </div>
                <div class="rounded-xl bg-orange-50/80 border border-orange-200/90 p-2.5 sm:p-3">
                  <div class="text-[11px] font-bold text-orange-900">Saldo Devedor Restante</div>
                  <div class="text-xs sm:text-base font-extrabold text-orange-800 mt-0.5 whitespace-nowrap tabular-nums">${this.formatBRL(row.balance)}</div>
                  <div class="text-[10px] text-orange-700/80">Após parcela ${row.installment}/${totalTerm}</div>
                </div>
              </div>

              <!-- Barra de Evolução Geral -->
              <div class="space-y-1.5">
                <div class="w-full h-2.5 rounded-full bg-amber-100 border border-amber-300/70 overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-orange-500 to-lime-600 rounded-full transition-all" style="width:${progressPct}%"></div>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 font-semibold">
                  <span>${progressPct}% do prazo (${currentInst} de ${totalTerm} • ${paidCount} marcada(s) como Paga)</span>
                  <span>Soma restante projetada (${remainingCount}m): <strong class="text-stone-800 whitespace-nowrap tabular-nums">${this.formatBRL(remainingProjectedSum)}</strong></span>
                </div>
              </div>

              ${
                this.financingTableExpanded
                  ? `
                    <div class="rounded-2xl border border-stone-200/90 overflow-hidden mt-2">
                      <div class="px-4 py-2.5 bg-stone-50 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2">
                        <span class="text-xs font-extrabold text-stone-800">Evolução das Parcelas (Tabela DDC • SAC)</span>
                        <div class="flex flex-wrap items-center gap-1.5 text-xs">
                          <select
                            onchange="App.setFinancingTableScope(this.value)"
                            class="oli-input rounded-lg px-2.5 py-1 text-xs font-bold bg-white"
                          >
                            <option value="NEXT_12" ${scope === "NEXT_12" ? "selected" : ""}>Janela atual (±12 meses)</option>
                            <option value="ALL" ${scope === "ALL" ? "selected" : ""}>Todas as ${totalTerm} parcelas (2026–2061)</option>
                            ${yearOptionsHTML}
                          </select>
                        </div>
                      </div>
                      <div class="overflow-x-auto max-h-[380px] overflow-y-auto">
                        <table class="w-full text-left border-collapse">
                          <thead class="sticky top-0 bg-white shadow-2xs z-10">
                            <tr class="border-b border-stone-200 text-[10px] font-extrabold uppercase text-stone-400">
                              <th class="py-2 px-2.5">Parcela</th>
                              <th class="py-2 px-2.5">Vencimento</th>
                              <th class="py-2 px-2.5 text-right">Amortização</th>
                              <th class="py-2 px-2.5 text-right">Juros</th>
                              <th class="py-2 px-2.5 text-right">MIP+DFI+TCA</th>
                              <th class="py-2 px-2.5 text-right">Total Parcela</th>
                              <th class="py-2 px-2.5 text-right">Saldo Devedor</th>
                              <th class="py-2 px-2.5 text-center">Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${tableRowsHTML}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");

    return {
      activeCount: visibleFins.length,
      monthlyAmount: monthlySum,
      currentBalance: totalBalanceSum,
      currentInstallment: firstCurrentInst,
      totalTerm: firstTotalTerm,
      remainingMonths: totalRemainingMonths
    };
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
    const userAccounts = this.getAccountsForActiveUser();
    const accFilterEl = document.getElementById("tx-filter-account");
    if (accFilterEl) {
      if (this.txFilter.accountId !== "ALL" && !userAccounts.some(a => a.id === this.txFilter.accountId)) {
        this.txFilter.accountId = "ALL";
      }
      accFilterEl.innerHTML = `<option value="ALL">Todas as Contas</option>` +
        userAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
      accFilterEl.value = this.txFilter.accountId;
    }

    const catFilterEl = document.getElementById("tx-filter-category");
    if (catFilterEl) {
      const prevCat = this.txFilter.categoryId || "ALL";
      catFilterEl.innerHTML = `<option value="ALL">Todas as Categorias</option>` +
        this.state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
      catFilterEl.value = prevCat;
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
      txs = txs.filter(t =>
        (t.description || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q) ||
        (t.counterparty || "").toLowerCase().includes(q) ||
        (t.originLabel || "").toLowerCase().includes(q) ||
        (t.destinationLabel || "").toLowerCase().includes(q)
      );
    }

    txs.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));

    const badgeEl = document.getElementById("history-count-badge");
    if (badgeEl) {
      badgeEl.textContent = `${txs.length} ${txs.length === 1 ? "item" : "itens"}`;
    }

    const selectAllEl = document.getElementById("history-select-all-checkbox");
    this.visibleHistoryTxIds = txs.map(t => t.id);

    if (txs.length === 0) {
      if (selectAllEl) {
        selectAllEl.checked = false;
        selectAllEl.indeterminate = false;
      }
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="py-10 text-center text-stone-400 text-xs">
            Nenhum lançamento encontrado para os filtros selecionados neste mês.
          </td>
        </tr>
      `;
      return;
    }

    if (selectAllEl) {
      const selectedVisibleCount = txs.filter(t => this.selectedTxIds.includes(t.id)).length;
      selectAllEl.checked = selectedVisibleCount === txs.length && txs.length > 0;
      selectAllEl.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < txs.length;
    }

    const monthProjs = this.state.projections.filter(p => p.monthYear === monthYear);

    tbody.innerHTML = txs
      .map(tx => {
        const sub = this.getSubcategory(tx.subcategoryId);
        const cat = this.getCategory(sub.categoryId);
        const acc = this.getAccount(tx.accountId);
        const user = this.getUser(tx.paidByUserId);
        const linkedProj = monthProjs.find(p => p.id === tx.projectionId);
        const isChecked = this.selectedTxIds.includes(tx.id);
        const isCredit = Number(tx.amount) < 0 || tx.isInvoiceCredit;

        const instBadge = tx.installmentTotal > 1
          ? `<span class="ml-1 px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[10px] font-bold">${tx.installmentCurrent}/${tx.installmentTotal}</span>`
          : "";
        const creditBadge = isCredit
          ? `<span class="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Estorno / Abate</span>`
          : "";
        const transferBadge = tx.type === "TRANSFER"
          ? `<span class="ml-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">⇄ Mov. entre contas (Fora dos gastos)</span>`
          : "";

        const txMonthPrefix = tx.transactionDate ? tx.transactionDate.substring(0, 7) : tx.competenceMonth;
        const shiftedBadge = tx.competenceMonth > txMonthPrefix
          ? `<div class="text-[10px] text-amber-700 font-semibold mt-0.5">↳ Vira dia ${acc.closingDay || 9} → Comp. ${this.getMonthLabel(tx.competenceMonth).split(" ")[0]}</div>`
          : "";

        return `
          <tr class="border-b border-stone-100 ${isChecked ? "bg-lime-50/70" : "hover:bg-stone-50/80"} transition text-xs sm:text-sm">
            <td class="py-3 px-3 text-center">
              <input
                type="checkbox"
                ${isChecked ? "checked" : ""}
                onclick="App.handleTxCheckboxClick(event, '${tx.id}')"
                class="w-4 h-4 rounded border-stone-300 text-lime-700 cursor-pointer"
                title="Selecionar (Shift + Clique para selecionar intervalo)"
              />
            </td>
            <td class="py-3 px-4 whitespace-nowrap text-stone-500 text-xs font-medium">
              <div>${this.formatDateBR(tx.transactionDate)}</div>
              ${shiftedBadge}
            </td>
            <td class="py-3 px-4">
              <div class="font-bold text-stone-800 flex items-center gap-1.5 flex-wrap">
                <span>${tx.description}</span>
                ${instBadge}
                ${creditBadge}
                ${transferBadge}
                ${this.buildTxNoteBadgeHTML(tx.id, tx.notes)}
                ${this.buildPixFlowBadgesHTML(tx.id, tx)}
              </div>
              ${linkedProj ? `<div class="text-[11px] text-lime-700 font-medium mt-0.5">Meta: ${linkedProj.title}</div>` : ""}
            </td>
            <td class="py-3 px-4">
              <div class="inline-flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full shrink-0" style="background:${cat.color}"></span>
                <select
                  onchange="App.recategorizeTransaction('${tx.id}', this.value)"
                  title="Clique para recategorizar este lançamento"
                  class="oli-input rounded-lg px-2 py-1 text-xs font-semibold text-stone-700 bg-white max-w-[170px] cursor-pointer"
                >
                  ${this.buildSubcategorySelectOptionsHTML(tx.subcategoryId, false)}
                </select>
              </div>
            </td>
            <td class="py-3 px-4">
              <span class="text-xs font-semibold text-stone-700">${acc.name}</span>
              <div class="text-[11px] text-stone-400">${user.name}</div>
            </td>
            <td class="py-3 px-4">${this.getOwnershipBadge(tx.ownership)}</td>
            <td class="py-3 px-4 text-right font-extrabold whitespace-nowrap tabular-nums text-xs sm:text-sm ${
              tx.type === "TRANSFER" ? "text-sky-700" : tx.type === "INCOME" ? "text-lime-700" : isCredit ? "text-emerald-700" : "text-stone-900"
            }">
              ${tx.type === "TRANSFER" ? `⇄ ${this.formatBRL(tx.amount)}` : tx.type === "INCOME" ? `+${this.formatBRL(tx.amount)}` : isCredit ? `-${this.formatBRL(Math.abs(tx.amount))}` : `-${this.formatBRL(tx.amount)}`}
            </td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
              <button onclick="App.deleteTransaction('${tx.id}')" class="p-1.5 rounded-lg text-stone-300 hover:text-rose-600 transition" title="Excluir (Ctrl+Z para desfazer)">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  },

  handleTxCheckboxClick(event, txId, scope = "history") {
    const checked = event.target.checked;
    const visibleIds = scope === "tree"
      ? (this.visibleTreeTxIds || [])
      : (this.visibleHistoryTxIds || []);

    if (event.shiftKey && this.lastClickedTxId && visibleIds.includes(this.lastClickedTxId) && visibleIds.includes(txId)) {
      const startIdx = visibleIds.indexOf(this.lastClickedTxId);
      const endIdx = visibleIds.indexOf(txId);
      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      const rangeIds = visibleIds.slice(from, to + 1);
      rangeIds.forEach(id => {
        if (checked && !this.selectedTxIds.includes(id)) {
          this.selectedTxIds.push(id);
        } else if (!checked) {
          this.selectedTxIds = this.selectedTxIds.filter(x => x !== id);
        }
      });
    } else {
      if (checked) {
        if (!this.selectedTxIds.includes(txId)) this.selectedTxIds.push(txId);
      } else {
        this.selectedTxIds = this.selectedTxIds.filter(x => x !== txId);
      }
    }

    this.lastClickedTxId = txId;
    this.renderAll();
  },

  selectAllInTree(accountId, subcategoryId) {
    const monthYear = this.state.settings.activeMonth;
    const txs = this.state.transactions.filter(
      t => t.competenceMonth === monthYear && t.type === "EXPENSE" && t.accountId === accountId && t.subcategoryId === subcategoryId
    );
    if (txs.length === 0) return;
    const ids = txs.map(t => t.id);
    const allSelected = ids.every(id => this.selectedTxIds.includes(id));
    if (allSelected) {
      this.selectedTxIds = this.selectedTxIds.filter(id => !ids.includes(id));
    } else {
      ids.forEach(id => {
        if (!this.selectedTxIds.includes(id)) this.selectedTxIds.push(id);
      });
    }
    this.renderAll();
  },

  recordMerchantMemory(description, subcategoryId, ownership = null) {
    if (!window.StatementParser || !window.StatementParser.normalizeMerchantKey) return;
    const fallbackIds = new Set(["sub_outros", "sub_parceladas", "sub_pag_fatura"]);
    if (!subcategoryId || fallbackIds.has(subcategoryId)) return;

    const key = window.StatementParser.normalizeMerchantKey(description);
    if (!key) return;
    if (!this.state.merchantMemory) this.state.merchantMemory = {};
    this.state.merchantMemory[key] = {
      subcategoryId,
      ownership: ownership || this.resolveDefaultOwnership(subcategoryId),
      updatedAt: new Date().toISOString()
    };
  },

  applySubcategoryToTx(tx, newSubId) {
    if (!tx || !newSubId) return;
    const acc = this.getAccount(tx.accountId);
    const sub = this.getSubcategory(newSubId);
    const cat = this.getCategory(sub.categoryId);

    tx.subcategoryId = newSubId;
    if (cat && (cat.type === "TRANSFER" || cat.type === "INCOME" || cat.type === "EXPENSE")) {
      tx.type = cat.type;
    }
    tx.ownership = this.resolveDefaultOwnership(newSubId, acc.ownerId || tx.paidByUserId);
    const monthProjs = this.state.projections.filter(p => p.monthYear === tx.competenceMonth);
    const matchProj = tx.type === "TRANSFER"
      ? null
      : (monthProjs.find(p => p.subcategoryId === newSubId && (!p.accountId || p.accountId === tx.accountId))
        || monthProjs.find(p => p.subcategoryId === newSubId));
    tx.projectionId = matchProj ? matchProj.id : null;
    this.recordMerchantMemory(tx.description, newSubId, tx.ownership);
  },

  findCorrelatedInstallmentTxs(tx) {
    if (!tx || (Number(tx.installmentTotal) || 1) <= 1) return tx ? [tx] : [];
    if (!window.StatementParser || !window.StatementParser.areCorrelatedInstallments) {
      return [tx];
    }
    const matches = (this.state.transactions || []).filter(
      other => other.id === tx.id || window.StatementParser.areCorrelatedInstallments(tx, other)
    );
    return matches.length > 0 ? matches : [tx];
  },

  recategorizeTransaction(txId, newSubId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx || !newSubId || tx.subcategoryId === newSubId) return;
    const newSub = this.getSubcategory(newSubId);
    const correlated = this.findCorrelatedInstallmentTxs(tx);

    let extraParcels = 0;
    correlated.forEach(item => {
      this.applySubcategoryToTx(item, newSubId);
      if (item.id !== tx.id) extraParcels++;
    });

    this.saveState(true);
    this.renderAll();
    const extraMsg = extraParcels > 0 ? ` + ${extraParcels} parcela(s) correlata(s) atualizada(s)` : "";
    this.showToast(`🏷️ "${tx.description}" movido para "${newSub.name}"${extraMsg} (Ctrl+Z p/ desfazer).`, "success");
  },

  recategorizeSelectedTransactions(newSubId) {
    if (!newSubId) return;
    const expandedIds = new Set(this.selectedTxIds);
    this.selectedTxIds.forEach(id => {
      const tx = this.state.transactions.find(t => t.id === id);
      if (tx) {
        this.findCorrelatedInstallmentTxs(tx).forEach(sib => expandedIds.add(sib.id));
      }
    });

    const newSub = this.getSubcategory(newSubId);
    let directCount = 0;
    let extraCount = 0;
    const origSet = new Set(this.selectedTxIds);

    this.state.transactions.forEach(tx => {
      if (!expandedIds.has(tx.id)) return;
      this.applySubcategoryToTx(tx, newSubId);
      if (origSet.has(tx.id)) directCount++;
      else extraCount++;
    });

    if (directCount + extraCount === 0) return;
    this.selectedTxIds = [];
    this.lastClickedTxId = null;
    this.saveState(true);
    this.renderAll();
    const extraMsg = extraCount > 0 ? ` (+ ${extraCount} parcela(s) correlata(s) de outros meses)` : "";
    this.showToast(`🏷️ ${directCount} item(ns) recategorizado(s) para "${newSub.name}"${extraMsg}! (Ctrl+Z p/ desfazer)`, "success");
  },

  learnKeywordFromTransaction(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;
    const sub = this.getSubcategory(tx.subcategoryId);

    const cleanSuggested = (tx.description || "")
      .replace(/\s*-\s*Parcela\s*\d+\s*\/\s*\d+/i, "")
      .replace(/\s*-\s*NuPay/i, "")
      .trim()
      .toUpperCase();

    const kw = prompt(
      `Regra automática para "${sub.name}":\nQual texto do estabelecimento deve classificar futuros extratos automaticamente nessa categoria?`,
      cleanSuggested
    );
    if (!kw || !kw.trim()) return;
    const normKw = kw.trim().toUpperCase();

    if (!sub.keywords) sub.keywords = [];
    if (!sub.keywords.includes(normKw)) {
      sub.keywords.push(normKw);
    }

    // Verifica se existem outros lançamentos do mês em "Outros" ou "Parceladas" com a mesma palavra-chave
    const fallbackIds = new Set(["sub_outros", "sub_parceladas"]);
    const similarTxs = this.state.transactions.filter(t =>
      t.id !== tx.id &&
      t.competenceMonth === tx.competenceMonth &&
      fallbackIds.has(t.subcategoryId) &&
      window.StatementParser &&
      window.StatementParser.normalizeText(t.description).includes(window.StatementParser.normalizeText(normKw))
    );

    let extraMoved = 0;
    if (similarTxs.length > 0 && confirm(`Encontramos mais ${similarTxs.length} lançamento(s) neste mês contendo "${normKw}" em Outros/Parceladas.\nDeseja recategorizá-los para "${sub.name}" agora?`)) {
      similarTxs.forEach(st => {
        const acc = this.getAccount(st.accountId);
        st.subcategoryId = sub.id;
        st.ownership = this.resolveDefaultOwnership(sub.id, acc.ownerId || st.paidByUserId);
        extraMoved++;
      });
    }

    this.saveState(true);
    this.renderAll();
    const extraMsg = extraMoved > 0 ? ` e ${extraMoved} outro(s) item(ns) recategorizado(s)` : "";
    this.showToast(`🧠 Regra "${normKw}" salva em "${sub.name}"${extraMsg}!`, "success");
  },

  toggleSelectAllTransactions(checked) {
    const visibleIds = this.visibleHistoryTxIds || [];
    if (checked) {
      visibleIds.forEach(id => {
        if (!this.selectedTxIds.includes(id)) {
          this.selectedTxIds.push(id);
        }
      });
    } else {
      this.selectedTxIds = this.selectedTxIds.filter(id => !visibleIds.includes(id));
    }
    this.renderAll();
  },

  clearTransactionSelection() {
    this.selectedTxIds = [];
    this.lastClickedTxId = null;
    this.renderAll();
  },

  deleteSelectedTransactions() {
    const validIds = this.selectedTxIds.filter(id => this.state.transactions.some(t => t.id === id));
    if (validIds.length === 0) return;

    const delSet = new Set(validIds);
    const count = validIds.length;
    this.state.transactions = this.state.transactions.filter(t => !delSet.has(t.id));
    if (Array.isArray(this.state.statementImports)) {
      this.state.statementImports.forEach(batch => {
        if (Array.isArray(batch.txIds)) {
          batch.txIds = batch.txIds.filter(id => !delSet.has(id));
        }
      });
    }
    this.selectedTxIds = [];
    this.lastClickedTxId = null;
    this.saveState(true);
    this.renderAll();
    this.showToast(`🗑️ ${count} ${count === 1 ? "lançamento excluído" : "lançamentos excluídos"}! (Pressione Ctrl+Z para desfazer)`, "info");
  },

  moveSelectedTransactionsToMonth(targetMonth) {
    if (!targetMonth) return;
    const validSet = new Set(this.selectedTxIds);
    let moved = 0;
    this.state.transactions.forEach(tx => {
      if (validSet.has(tx.id)) {
        tx.competenceMonth = targetMonth;
        moved++;
      }
    });
    if (moved === 0) return;
    this.selectedTxIds = [];
    this.lastClickedTxId = null;
    this.saveState(true);
    this.renderAll();
    this.showToast(`📅 ${moved} item(ns) movido(s) para ${this.getMonthLabel(targetMonth)}! (Ctrl+Z para desfazer)`, "success");
  },

  deleteTransaction(txId) {
    this.state.transactions = this.state.transactions.filter(t => t.id !== txId);
    if (Array.isArray(this.state.statementImports)) {
      this.state.statementImports.forEach(batch => {
        if (Array.isArray(batch.txIds)) {
          batch.txIds = batch.txIds.filter(id => id !== txId);
        }
      });
    }
    this.selectedTxIds = this.selectedTxIds.filter(id => id !== txId);
    this.saveState(true);
    this.renderAll();
    this.showToast("🗑️ Lançamento removido (Ctrl+Z para desfazer).", "info");
  },

  openTxNoteModal(txId = null, stagedIdx = null) {
    const modal = document.getElementById("modal-tx-note");
    const rawDescEl = document.getElementById("note-modal-raw-desc");
    const instHintEl = document.getElementById("note-modal-installment-hint");
    const inputEl = document.getElementById("note-modal-input");
    const cpInput = document.getElementById("note-modal-counterparty");
    const origInput = document.getElementById("note-modal-origin");
    const destInput = document.getElementById("note-modal-destination");
    if (!modal || !inputEl) return;

    let target = null;
    if (stagedIdx !== null && this.stagedImports && this.stagedImports[stagedIdx]) {
      target = this.stagedImports[stagedIdx];
      this.editingNoteTarget = { stagedIdx };
    } else if (txId) {
      target = this.state.transactions.find(t => t.id === txId);
      this.editingNoteTarget = { txId };
    }
    if (!target) return;

    if (rawDescEl) rawDescEl.textContent = target.description || "";
    inputEl.value = target.notes || "";

    // Preenche campos de Pix/Transferência (com extração automática se ainda estiverem vazios)
    let autoPix = null;
    if (window.StatementParser && window.StatementParser.extractTransferPixDetails) {
      const acc = this.getAccount(target.accountId);
      autoPix = window.StatementParser.extractTransferPixDetails(target.description, target.type, acc);
    }
    if (cpInput) cpInput.value = target.counterparty || (autoPix && autoPix.counterparty) || "";
    if (origInput) origInput.value = target.originLabel || (autoPix && autoPix.originLabel) || "";
    if (destInput) destInput.value = target.destinationLabel || (autoPix && autoPix.destinationLabel) || "";

    const totalInst = Number(target.installmentTotal) || 1;
    if (instHintEl) {
      if (totalInst > 1) {
        instHintEl.textContent = `ℹ️ Compra parcelada (${totalInst}x): esta identificação será propagada automaticamente para todas as parcelas anteriores e posteriores!`;
        instHintEl.classList.remove("hidden");
      } else {
        instHintEl.classList.add("hidden");
      }
    }

    modal.classList.remove("hidden");
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 50);
  },

  closeTxNoteModal() {
    const modal = document.getElementById("modal-tx-note");
    if (modal) modal.classList.add("hidden");
    this.editingNoteTarget = null;
  },

  applyTxNoteValue(noteValue, pixOverrides = null) {
    const clean = (noteValue || "").trim();
    const targetInfo = this.editingNoteTarget;
    if (!targetInfo) return;

    const cp = pixOverrides ? (pixOverrides.counterparty || "").trim() : undefined;
    const orig = pixOverrides ? (pixOverrides.originLabel || "").trim() : undefined;
    const dest = pixOverrides ? (pixOverrides.destinationLabel || "").trim() : undefined;

    if (targetInfo.stagedIdx !== undefined && targetInfo.stagedIdx !== null) {
      const item = this.stagedImports[targetInfo.stagedIdx];
      if (!item) return;
      item.notes = clean;
      if (cp !== undefined) item.counterparty = cp;
      if (orig !== undefined) item.originLabel = orig;
      if (dest !== undefined) item.destinationLabel = dest;

      if (Number(item.installmentTotal) > 1 && window.StatementParser && window.StatementParser.areCorrelatedInstallments) {
        this.stagedImports.forEach(other => {
          if (other !== item && window.StatementParser.areCorrelatedInstallments(item, other)) {
            other.notes = clean;
          }
        });
      }
      this.closeTxNoteModal();
      this.renderImportTab(this.state.settings.activeMonth);
      this.showToast(clean || cp ? `📝 Detalhes salvos na prévia!` : "Nota removida da prévia.", "success");
      return;
    }

    if (targetInfo.txId) {
      const tx = this.state.transactions.find(t => t.id === targetInfo.txId);
      if (!tx) return;
      if (cp !== undefined) tx.counterparty = cp;
      if (orig !== undefined) tx.originLabel = orig;
      if (dest !== undefined) tx.destinationLabel = dest;

      const correlated = this.findCorrelatedInstallmentTxs(tx);
      let extraParcels = 0;
      correlated.forEach(item => {
        item.notes = clean;
        if (item.id !== tx.id) extraParcels++;
      });

      this.closeTxNoteModal();
      this.saveState(true);
      this.renderAll();

      if (!clean && !cp && !orig && !dest) {
        const msg = extraParcels > 0
          ? `Identificação removida desta e de ${extraParcels} parcela(s) correlata(s) (Ctrl+Z p/ desfazer).`
          : "Identificação removida (Ctrl+Z p/ desfazer).";
        this.showToast(msg, "info");
      } else {
        const extraMsg = extraParcels > 0 ? ` + propagada para ${extraParcels} parcela(s) correlata(s)` : "";
        this.showToast(`📝 Identificação salva${extraMsg}! (Ctrl+Z p/ desfazer)`, "success");
      }
    }
  },

  saveTxNoteFromModal(e) {
    e.preventDefault();
    const inputEl = document.getElementById("note-modal-input");
    const cpEl = document.getElementById("note-modal-counterparty");
    const origEl = document.getElementById("note-modal-origin");
    const destEl = document.getElementById("note-modal-destination");
    this.applyTxNoteValue(inputEl ? inputEl.value : "", {
      counterparty: cpEl ? cpEl.value : "",
      originLabel: origEl ? origEl.value : "",
      destinationLabel: destEl ? destEl.value : ""
    });
  },

  clearTxNote() {
    this.applyTxNoteValue("", { counterparty: "", originLabel: "", destinationLabel: "" });
  },

  populateModalAccountSelect(userId, preferredAccId = null) {
    const accSelect = document.getElementById("tx-modal-account");
    if (!accSelect) return;
    const filterOwner = this.activeUserFilter !== "ALL" ? this.activeUserFilter : userId;
    const accounts = this.getAccountsForActiveUser(filterOwner);
    accSelect.innerHTML = accounts
      .map(a => `<option value="${a.id}">${a.name}</option>`)
      .join("");
    if (preferredAccId && accounts.some(a => a.id === preferredAccId)) {
      accSelect.value = preferredAccId;
    } else if (accounts.length > 0) {
      const def = accounts.find(a => a.type === "CREDIT_CARD") || accounts[0];
      accSelect.value = def.id;
    }
  },

  openTransactionModal(prefill = {}) {
    const modal = document.getElementById("modal-transaction");
    if (!modal) return;

    const monthYear = this.state.settings.activeMonth;
    const todayISO = `${monthYear}-${String(new Date().getDate()).padStart(2, "0")}`;
    const initialUser = prefill.paidByUserId || (this.activeUserFilter !== "ALL" ? this.activeUserFilter : this.loggedUser);

    this.populateModalAccountSelect(initialUser, prefill.accountId || null);

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

    const initialSub = prefill.subcategoryId || "sub_feira_sup";

    document.getElementById("tx-modal-type").value = prefill.type || "EXPENSE";
    document.getElementById("tx-modal-date").value = prefill.transactionDate || todayISO;
    document.getElementById("tx-modal-desc").value = prefill.description || "";
    document.getElementById("tx-modal-amount").value = prefill.amount !== undefined ? prefill.amount : "";
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
    if (this.activeUserFilter === "ALL") {
      this.populateModalAccountSelect(userId);
    }
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
    const userAccounts = this.getAccountsForActiveUser();
    accSelect.innerHTML = userAccounts
      .map(a => `<option value="${a.id}">${a.name}${this.activeUserFilter === "ALL" ? ` (${this.getUser(a.ownerId).name})` : ""}</option>`)
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
  recalculateStagedCompetence() {
    if (!this.stagedImports || this.stagedImports.length === 0 || !window.StatementParser) return;
    const account = this.getAccount(this.importTargetAccountId);
    const mode = this.importCompetenceMode || "SMART_INVOICE";
    const activeMonth = this.state.settings.activeMonth;

    let forcedMonth = null;
    if (/^\d{4}-\d{2}$/.test(mode)) {
      forcedMonth = mode;
    } else if (mode === "SMART_INVOICE" && account.type === "CREDIT_CARD") {
      forcedMonth = window.StatementParser.inferInvoiceMonthFromDates(
        this.stagedImports.map(i => i.transactionDate),
        account,
        activeMonth
      );
    }

    this.stagedImports.forEach(item => {
      item.accountId = account.id;
      item.paidByUserId = account.ownerId || "bruno";
      const cycleMonth = window.StatementParser.computeCompetenceMonth(
        item.transactionDate,
        account,
        activeMonth
      );
      item.cycleCompetenceMonth = cycleMonth;
      item.competenceMonth = forcedMonth || cycleMonth;
    });
  },

  onImportAccountChange(accId) {
    this.importTargetAccountId = accId;
    this.updateImportCycleRuleHint();
    if (this.stagedImports && this.stagedImports.length > 0 && window.StatementParser) {
      this.recalculateStagedCompetence();
      this.renderImportTab(this.state.settings.activeMonth);
    }
  },

  onImportCompetenceModeChange(mode) {
    this.importCompetenceMode = mode || "SMART_INVOICE";
    if (this.stagedImports && this.stagedImports.length > 0) {
      this.recalculateStagedCompetence();
      this.renderImportTab(this.state.settings.activeMonth);
      this.showToast("Competência dos lançamentos da prévia atualizada.", "info");
    }
  },

  updateImportCycleRuleHint() {
    const hintEl = document.getElementById("import-cycle-rule-hint");
    if (!hintEl || !window.StatementParser) return;
    const acc = this.getAccount(this.importTargetAccountId);
    const activeMonth = (this.state && this.state.settings && this.state.settings.activeMonth) || "2026-11";
    hintEl.innerHTML = `<strong>Regra (${acc.name}):</strong> ${window.StatementParser.describeCardCycleRule(acc, activeMonth)}`;
  },

  renderImportTab(monthYear) {
    const accSelect = document.getElementById("import-account-select");
    if (accSelect) {
      const currentVal = accSelect.value || this.importTargetAccountId;
      const userAccounts = this.getAccountsForActiveUser();
      accSelect.innerHTML = userAccounts
        .map(a => {
          const ownerTag = this.activeUserFilter === "ALL" ? ` [${this.getUser(a.ownerId).name}]` : "";
          if (a.type === "CREDIT_CARD") {
            const modeLabel = window.StatementParser
              ? window.StatementParser.getCompetenceModeLabel(a.competenceOffset)
              : "Mês da virada";
            const vCount = Array.isArray(a.virtualCards) ? a.virtualCards.length : 0;
            const vInfo = vCount > 0 ? ` • ${vCount} cartões na conta` : "";
            return `<option value="${a.id}">${a.name}${ownerTag} (Vira dia ${a.closingDay || 9} • ${modeLabel}${vInfo})</option>`;
          }
          return `<option value="${a.id}">${a.name}${ownerTag}</option>`;
        })
        .join("");
      if (userAccounts.some(a => a.id === currentVal)) {
        accSelect.value = currentVal;
      } else if (userAccounts.length > 0) {
        const preferred = userAccounts.find(a => a.type === "CREDIT_CARD") || userAccounts[0];
        accSelect.value = preferred.id;
      }
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
    const compSelect = document.getElementById("import-competence-select");
    if (compSelect) {
      compSelect.value = this.importCompetenceMode || "SMART_INVOICE";
    }

    const selectedItems = this.stagedImports.filter(i => i.selected);
    const importTargetAcc = this.getAccount(this.importTargetAccountId);
    const isCheckingImport = importTargetAcc && importTargetAcc.type === "CHECKING";
    if (countSpan) {
      const incomesTotal = selectedItems
        .filter(i => i.type === "INCOME")
        .reduce((s, i) => s + Math.abs(Number(i.amount)), 0);
      const grossPurchases = selectedItems
        .filter(i => i.type === "EXPENSE" && Number(i.amount) > 0)
        .reduce((s, i) => s + Number(i.amount), 0);
      const creditsTotal = selectedItems
        .filter(i => i.type === "EXPENSE" && Number(i.amount) < 0)
        .reduce((s, i) => s + Math.abs(Number(i.amount)), 0);
      const netInvoice = grossPurchases - creditsTotal;
      if (incomesTotal > 0) {
        const netFlow = incomesTotal - grossPurchases;
        countSpan.innerHTML = `${selectedItems.length} selecionado(s) • <span class="text-emerald-700">Entradas +${this.formatBRL(incomesTotal)}</span> • <span class="text-rose-700">Saídas -${this.formatBRL(grossPurchases)}</span> = <strong class="underline">Saldo: ${netFlow >= 0 ? "+" : ""}${this.formatBRL(netFlow)}</strong>`;
      } else if (creditsTotal > 0) {
        countSpan.innerHTML = `${selectedItems.length} selecionado(s) • Compras ${this.formatBRL(grossPurchases)} − Estornos <span class="text-emerald-700">${this.formatBRL(creditsTotal)}</span> = <strong class="underline">Líquido Fatura: ${this.formatBRL(netInvoice)}</strong>`;
      } else {
        countSpan.textContent = `${selectedItems.length} selecionado(s) (${this.formatBRL(netInvoice)})`;
      }
    }

    const importSelectAll = document.getElementById("import-select-all-checkbox");
    if (importSelectAll) {
      importSelectAll.checked = selectedItems.length === this.stagedImports.length && this.stagedImports.length > 0;
      importSelectAll.indeterminate = selectedItems.length > 0 && selectedItems.length < this.stagedImports.length;
    }

    const importBulkRecat = document.getElementById("import-bulk-recategorize");
    if (importBulkRecat) {
      importBulkRecat.innerHTML = `<option value="">🏷️ Recategorizar Marcados (${selectedItems.length}) p/...</option>` +
        this.buildSubcategorySelectOptionsHTML("", false);
    }

    this.renderStagedStatementMetaBar();

    const availableMonths = this.getStatementMonthOptions();

    tbody.innerHTML = this.stagedImports
      .map((item, idx) => {
        const subOptions = this.buildSubcategorySelectOptionsHTML(item.subcategoryId, false);

        const compOptions = availableMonths
          .map(m => `<option value="${m}" ${m === item.competenceMonth ? "selected" : ""}>${this.getMonthLabel(m)}</option>`)
          .join("");

        const txMonthPrefix = item.transactionDate ? item.transactionDate.substring(0, 7) : item.competenceMonth;
        const shiftedToNext = item.competenceMonth > txMonthPrefix;
        const isCredit = Number(item.amount) < 0 || item.isInvoiceCredit;
        const isIncome = item.type === "INCOME";

        const rowClass = item.alreadyExists
          ? "opacity-45 bg-stone-50"
          : item.type === "TRANSFER"
          ? "bg-stone-50 text-stone-400"
          : isIncome || isCredit
          ? "bg-emerald-50/50 hover:bg-emerald-50/80"
          : "hover:bg-stone-50/80";

        const amountColorClass = isIncome || isCredit
          ? "text-emerald-700"
          : isCheckingImport && item.type === "EXPENSE"
          ? "text-rose-700"
          : "text-stone-900";
        const amountFormatted = isIncome
          ? `+${this.formatBRL(Math.abs(item.amount))}`
          : isCredit
          ? `-${this.formatBRL(Math.abs(item.amount))}`
          : isCheckingImport && item.type === "EXPENSE"
          ? `-${this.formatBRL(Math.abs(item.amount))}`
          : this.formatBRL(item.amount);

        return `
          <tr class="border-b border-stone-100 text-xs ${rowClass}">
            <td class="py-2.5 px-3">
              <input
                type="checkbox"
                ${item.selected ? "checked" : ""}
                onclick="App.handleStagedCheckboxClick(event, ${idx})"
                class="w-4 h-4 rounded border-stone-300 text-lime-700 cursor-pointer"
                title="Selecionar (Shift + Clique para intervalo)"
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
                ${this.importCompetenceMode !== "AUTO_CYCLE" ? "📌 Na fatura do mês" : shiftedToNext ? "↳ Mês seguinte" : "• Próprio mês"}
              </div>
            </td>
            <td class="py-2.5 px-3">
              <div class="font-bold text-stone-800 flex items-center gap-1.5 flex-wrap">
                <span>${item.description}</span>
                ${!item.alreadyExists && item.type !== "TRANSFER" ? this.buildTxNoteBadgeHTML(null, item.notes, idx) : ""}
                ${!item.alreadyExists ? this.buildPixFlowBadgesHTML(null, item, idx) : ""}
              </div>
              ${item.memoryMatched && !item.alreadyExists && item.type !== "TRANSFER" ? `<span class="inline-block px-1.5 py-0.5 rounded bg-lime-100 text-lime-800 text-[10px] font-bold mt-0.5 mr-1">🧠 Memória do histórico</span>` : ""}
              ${isIncome && !item.alreadyExists ? `<span class="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold mt-0.5 mr-1">↓ Entrada</span>` : ""}
              ${!isIncome && isCheckingImport && item.type === "EXPENSE" && !item.alreadyExists ? `<span class="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold mt-0.5 mr-1">↑ Saída</span>` : ""}
              ${isCredit ? `<span class="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold mt-0.5">Estorno / Desconto (Abate Fatura)</span>` : ""}
              ${item.alreadyExists ? `<span class="text-[10px] text-amber-600 font-semibold">Já importado (Ignorado)</span>` : ""}
              ${item.type === "TRANSFER" ? `<span class="text-[10px] text-sky-700 font-semibold">${item.subcategoryId === "sub_transf_propria" ? "⇄ Movimentação entre contas próprias (excluída dos gastos)" : "Pagamento de fatura ignorado p/ não duplicar"}</span>` : ""}
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
            <td class="py-2.5 px-3 text-right font-extrabold whitespace-nowrap ${amountColorClass}">
              ${amountFormatted}
            </td>
          </tr>
        `;
      })
      .join("");
  },

  renderStagedStatementMetaBar() {
    const bar = document.getElementById("import-staging-statement-meta");
    if (!bar) return;
    if (!this.stagedImportMeta) {
      const targetAcc = this.getAccount(this.importTargetAccountId);
      const dates = (this.stagedImports || []).map(i => i.transactionDate).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      const months = (this.stagedImports || []).map(i => i.competenceMonth).filter(Boolean);
      const primaryMonth = months[0] || this.state.settings.activeMonth;
      const maxDate = dates[dates.length - 1] || `${primaryMonth}-01`;
      const parser = window.StatementParser;
      this.stagedImportMeta = {
        fileName: "Extrato selecionado",
        accountId: this.importTargetAccountId,
        primaryMonth,
        periodStart: dates[0] || maxDate,
        periodEnd: maxDate,
        cutoffDate: maxDate,
        status: parser && parser.inferStatementImportStatus ? parser.inferStatementImportStatus(targetAcc, primaryMonth, maxDate) : "PARTIAL",
        consolidatePartial: true
      };
    }

    const meta = this.stagedImportMeta;
    const acc = this.getAccount(meta.accountId || this.importTargetAccountId);
    const hasExistingPartial = (this.state.statementImports || []).some(
      b => b.accountId === meta.accountId && b.status === "PARTIAL" &&
        this.stagedImports.some(i => i.competenceMonth === b.competenceMonth)
    );
    const parser = window.StatementParser;
    const cov = parser && parser.evaluateStatementCoverage
      ? parser.evaluateStatementCoverage(acc, meta.primaryMonth || this.state.settings.activeMonth, meta.cutoffDate, meta.status)
      : { pct: meta.status === "COMPLETE" ? 100 : 50 };

    bar.innerHTML = `
      <div class="flex flex-wrap items-center gap-2.5">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-lime-200 font-bold text-stone-800">
          <span>📄</span>
          <span class="truncate max-w-[200px]" title="${this.escapeHTML(meta.fileName)}">${this.escapeHTML(meta.fileName)}</span>
        </span>
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-stone-600">Situação:</span>
          <select
            onchange="App.updateStagedMeta('status', this.value)"
            class="oli-input rounded-lg px-2.5 py-1 text-xs font-bold bg-white"
          >
            <option value="PARTIAL" ${meta.status === "PARTIAL" ? "selected" : ""}>🌗 Parcial (${cov.pct}% do período)</option>
            <option value="COMPLETE" ${meta.status === "COMPLETE" ? "selected" : ""}>✅ Completo / Fechado (100%)</option>
          </select>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-stone-600">Cobertura até:</span>
          <input
            type="date"
            value="${meta.cutoffDate || ""}"
            onchange="App.updateStagedMeta('cutoffDate', this.value)"
            class="oli-input rounded-lg px-2 py-1 text-xs font-semibold bg-white"
          />
        </div>
      </div>
      ${hasExistingPartial ? `
        <label class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 font-bold cursor-pointer">
          <input
            type="checkbox"
            ${meta.consolidatePartial !== false ? "checked" : ""}
            onchange="App.updateStagedMeta('consolidatePartial', this.checked)"
            class="w-3.5 h-3.5 rounded border-sky-400 text-lime-700"
          />
          <span>Consolidar com parcial anterior (preserva categorias/notas já editadas)</span>
        </label>
      ` : ""}
    `;
  },

  updateStagedMeta(field, value) {
    if (!this.stagedImportMeta) return;
    this.stagedImportMeta[field] = value;
    this.renderStagedStatementMetaBar();
  },

  stageParsedStatement(parsed, fileName, account, monthYear, explicitRange = {}) {
    const accId = account ? account.id : this.importTargetAccountId;
    const txDates = parsed.map(p => p.transactionDate).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const periodStart = txDates[0] || explicitRange.dtStart || `${monthYear}-01`;
    const periodEnd = txDates[txDates.length - 1] || explicitRange.dtEnd || periodStart;
    const explicitCutoff = parsed[0]?.pdfExplicitCutoff || explicitRange.dtEnd || null;
    const cutoffDate = explicitCutoff && explicitCutoff > periodEnd ? explicitCutoff : periodEnd;
    const months = Array.from(new Set(parsed.map(i => i.competenceMonth).filter(Boolean)));
    const primaryMonth = months[months.length - 1] || monthYear;
    const inferredStatus = window.StatementParser.inferStatementImportStatus
      ? window.StatementParser.inferStatementImportStatus(account, primaryMonth, cutoffDate)
      : "PARTIAL";

    this.pushUndoSnapshot();
    this.stagedImports = parsed;
    this.stagedImportMeta = {
      fileName,
      accountId: accId,
      primaryMonth,
      periodStart,
      periodEnd,
      cutoffDate,
      status: inferredStatus,
      consolidatePartial: true
    };
    this.lastSavedSnapshot = JSON.stringify({
      state: this.state,
      stagedImports: this.stagedImports
    });
    this.renderImportTab(monthYear);
    this.updateUndoAndBulkUI();
    const detectedMonths = Array.from(new Set(parsed.map(i => this.getMonthLabel(i.competenceMonth))));
    this.showToast(`🫒 ${parsed.length} lançamentos prontos para revisão (${detectedMonths.join(", ")})!`, "success");
  },

  async handleStatementFileUpload(fileList, inputEl = null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const accId = document.getElementById("import-account-select").value;
    this.importTargetAccountId = accId;
    const account = this.getAccount(accId);
    const monthYear = this.state.settings.activeMonth;
    const compSelect = document.getElementById("import-competence-select");
    this.importCompetenceMode = (compSelect && compSelect.value) || "SMART_INVOICE";

    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

    if (isPdf) {
      const accNameNorm = window.StatementParser
        ? window.StatementParser.normalizeText(account ? account.name : "")
        : (account ? account.name.toUpperCase() : "");
      if (!accNameNorm.includes("ITAU")) {
        this.showToast("Importação de PDF foi feita para o Itaú (para Nubank/BB prefira .OFX). Lendo arquivo...", "info");
      }

      try {
        const buffer = await file.arrayBuffer();
        let password = null;
        let parsed = null;

        while (true) {
          try {
            parsed = await window.StatementParser.parseItauPDF(
              buffer.slice(0),
              account,
              monthYear,
              this.state,
              this.importCompetenceMode,
              password
            );
            break;
          } catch (pdfErr) {
            if (pdfErr && (pdfErr.name === "PasswordException" || /password/i.test(pdfErr.message || ""))) {
              const promptMsg = password === null
                ? "Este PDF do Itaú está protegido por senha (geralmente os primeiros dígitos do CPF). Informe a senha para abrir:"
                : "Senha incorreta para este PDF do Itaú. Tente novamente:";
              const entered = prompt(promptMsg, "");
              if (entered === null) {
                if (inputEl) inputEl.value = "";
                return;
              }
              password = entered.trim();
            } else {
              throw pdfErr;
            }
          }
        }

        if (inputEl) inputEl.value = "";
        if (!parsed || parsed.length === 0) {
          this.showToast("Nenhum lançamento reconhecido neste PDF do Itaú (verifique se o arquivo possui texto selecionável).", "error");
          return;
        }
        this.stageParsedStatement(parsed, file.name, account, monthYear);
      } catch (err) {
        if (inputEl) inputEl.value = "";
        console.error("Erro ao importar PDF Itaú:", err);
        this.showToast("Não foi possível ler este PDF do Itaú. Verifique o arquivo ou tente outra versão.", "error");
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const isOFX = file.name.toLowerCase().endsWith(".ofx") || content.includes("<OFX>") || content.includes("<STMTTRN>");

      const parsed = isOFX
        ? window.StatementParser.parseOFX(content, account, monthYear, this.state, this.importCompetenceMode)
        : window.StatementParser.parseCSV(content, account, monthYear, this.state, this.importCompetenceMode);

      if (inputEl) inputEl.value = "";

      if (parsed.length === 0) {
        this.showToast("Nenhuma transação encontrada neste arquivo.", "error");
        return;
      }

      const ofxRange = isOFX && window.StatementParser.extractOFXDateRange
        ? window.StatementParser.extractOFXDateRange(content)
        : { dtStart: null, dtEnd: null };

      this.stageParsedStatement(parsed, file.name, account, monthYear, ofxRange);
    };
    reader.readAsText(file, "UTF-8");
  },

  loadSampleNubankExtract() {
    const accSelect = document.getElementById("import-account-select");
    const firstCard = this.state.accounts.find(a => a.type === "CREDIT_CARD");
    const accId = (accSelect && accSelect.value) || (firstCard && firstCard.id) || "cc_bruno";
    if (accSelect) accSelect.value = accId;
    this.importTargetAccountId = accId;
    const account = this.getAccount(accId);
    const monthYear = this.state.settings.activeMonth;
    const sampleOFX = window.StatementParser.getSampleNubankOFX();
    const compSelect = document.getElementById("import-competence-select");
    this.importCompetenceMode = (compSelect && compSelect.value) || "SMART_INVOICE";

    const parsed = window.StatementParser.parseOFX(sampleOFX, account, monthYear, this.state, this.importCompetenceMode);
    const txDates = parsed.map(p => p.transactionDate).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const maxDate = txDates[txDates.length - 1] || `${monthYear}-08`;
    const primaryMonth = parsed[parsed.length - 1]?.competenceMonth || monthYear;

    this.pushUndoSnapshot();
    this.stagedImports = parsed;
    this.stagedImportMeta = {
      fileName: "nubank_exemplo.ofx",
      accountId: accId,
      primaryMonth,
      periodStart: txDates[0] || maxDate,
      periodEnd: maxDate,
      cutoffDate: maxDate,
      status: window.StatementParser.inferStatementImportStatus
        ? window.StatementParser.inferStatementImportStatus(account, primaryMonth, maxDate)
        : "PARTIAL",
      consolidatePartial: true
    };
    this.lastSavedSnapshot = JSON.stringify({
      state: this.state,
      stagedImports: this.stagedImports
    });
    this.renderImportTab(monthYear);
    this.updateUndoAndBulkUI();
    this.showToast("🫒 Extrato exemplo carregado!", "info");
  },

  toggleStagedItem(idx, checked) {
    if (!this.stagedImports[idx]) return;
    this.stagedImports[idx].selected = checked;
    this.renderImportTab(this.state.settings.activeMonth);
  },

  handleStagedCheckboxClick(event, idx) {
    if (!this.stagedImports[idx]) return;
    const checked = event.target.checked;
    if (event.shiftKey && this.lastClickedStagedIdx !== null && this.stagedImports[this.lastClickedStagedIdx]) {
      const [from, to] = this.lastClickedStagedIdx < idx ? [this.lastClickedStagedIdx, idx] : [idx, this.lastClickedStagedIdx];
      for (let i = from; i <= to; i++) {
        if (this.stagedImports[i]) this.stagedImports[i].selected = checked;
      }
    } else {
      this.stagedImports[idx].selected = checked;
    }
    this.lastClickedStagedIdx = idx;
    this.renderImportTab(this.state.settings.activeMonth);
  },

  toggleSelectAllStaged(checked) {
    this.stagedImports.forEach(item => {
      item.selected = Boolean(checked);
    });
    this.renderImportTab(this.state.settings.activeMonth);
  },

  recategorizeSelectedStagedImports(newSubId) {
    if (!newSubId) return;
    const selectedItems = this.stagedImports.filter(i => i.selected);
    if (selectedItems.length === 0) {
      this.showToast("Marque pelo menos um item na lista de revisão para recategorizar.", "error");
      return;
    }

    this.pushUndoSnapshot();
    const newSub = this.getSubcategory(newSubId);
    const monthProjs = this.state.projections.filter(p => p.monthYear === this.state.settings.activeMonth);

    selectedItems.forEach(item => {
      item.subcategoryId = newSubId;
      const newCat = this.getCategory(newSub.categoryId);
      if (newCat && (newCat.type === "TRANSFER" || newCat.type === "INCOME" || newCat.type === "EXPENSE")) {
        item.type = newCat.type;
      }
      item.ownership = this.resolveDefaultOwnership(newSubId, item.paidByUserId);
      const match = item.type === "TRANSFER"
        ? null
        : (monthProjs.find(p => p.subcategoryId === newSubId && (!p.accountId || p.accountId === item.accountId))
          || monthProjs.find(p => p.subcategoryId === newSubId));
      item.projectionId = match ? match.id : null;
    });

    this.lastSavedSnapshot = JSON.stringify({
      state: this.state,
      stagedImports: this.stagedImports
    });
    this.renderImportTab(this.state.settings.activeMonth);
    this.updateUndoAndBulkUI();
    this.showToast(`🏷️ ${selectedItems.length} item(ns) da prévia movido(s) para "${newSub.name}" (Ctrl+Z p/ desfazer)!`, "success");
  },

  deleteSelectedStagedImports() {
    const selectedCount = this.stagedImports.filter(i => i.selected).length;
    if (selectedCount === 0) {
      this.showToast("Marque pelo menos um item na lista de revisão para excluir.", "error");
      return;
    }
    this.pushUndoSnapshot();
    this.stagedImports = this.stagedImports.filter(i => !i.selected);
    this.lastSavedSnapshot = JSON.stringify({
      state: this.state,
      stagedImports: this.stagedImports
    });
    this.lastClickedStagedIdx = null;
    this.renderImportTab(this.state.settings.activeMonth);
    this.updateUndoAndBulkUI();
    this.showToast(`🗑️ ${selectedCount} item(ns) removido(s) da revisão (Ctrl+Z para desfazer).`, "info");
  },

  cancelStagedImports() {
    if (this.stagedImports.length === 0) return;
    this.pushUndoSnapshot();
    this.stagedImports = [];
    this.stagedImportMeta = null;
    this.lastSavedSnapshot = JSON.stringify({
      state: this.state,
      stagedImports: this.stagedImports
    });
    this.lastClickedStagedIdx = null;
    this.renderImportTab(this.state.settings.activeMonth);
    this.updateUndoAndBulkUI();
    this.showToast("Revisão cancelada (Ctrl+Z para restaurar).", "info");
  },

  updateStagedItem(idx, field, value) {
    const item = this.stagedImports[idx];
    if (!item) return;
    item[field] = value || null;

    if (field === "subcategoryId") {
      const sub = this.getSubcategory(value);
      const cat = this.getCategory(sub.categoryId);
      if (cat && (cat.type === "TRANSFER" || cat.type === "INCOME" || cat.type === "EXPENSE")) {
        item.type = cat.type;
      }
      item.ownership = this.resolveDefaultOwnership(value, item.paidByUserId);
      const monthProjs = this.state.projections.filter(p => p.monthYear === this.state.settings.activeMonth);
      const match = item.type === "TRANSFER" ? null : monthProjs.find(p => p.subcategoryId === value);
      item.projectionId = match ? match.id : null;
    }
    this.renderImportTab(this.state.settings.activeMonth);
  },

  confirmStagedImports() {
    if (!Array.isArray(this.stagedImports) || this.stagedImports.length === 0) {
      this.showToast("Nenhum lançamento carregado para importar.", "error");
      return;
    }

    const selected = this.stagedImports.filter(i => i.selected);
    const hasAlreadyImported = this.stagedImports.some(i => i.alreadyExists);
    if (selected.length === 0 && !hasAlreadyImported) {
      this.showToast("Selecione pelo menos uma transação.", "error");
      return;
    }

    if (!Array.isArray(this.state.statementImports)) {
      this.state.statementImports = [];
    }

    const meta = this.stagedImportMeta || {};
    const fileName = meta.fileName || "Extrato importado";
    const metaStatus = meta.status || "PARTIAL";
    const metaCutoff = meta.cutoffDate || meta.periodEnd || "";
    const consolidatePartial = meta.consolidatePartial !== false;
    const nowISO = new Date().toISOString();
    const fallbackIds = new Set(["sub_parceladas", "sub_outros"]);

    // Agrupa os lançamentos selecionados por (accountId, competenceMonth)
    const batchGroups = new Map();
    for (const item of selected) {
      const groupKey = `${item.accountId}__${item.competenceMonth}`;
      if (!batchGroups.has(groupKey)) {
        batchGroups.set(groupKey, {
          batchId: "imp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          accountId: item.accountId,
          competenceMonth: item.competenceMonth,
          txs: []
        });
      }
      const grp = batchGroups.get(groupKey);
      const newTx = {
        id: "tx_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        transactionDate: item.transactionDate,
        competenceMonth: item.competenceMonth,
        description: item.description,
        notes: (item.notes || "").trim(),
        counterparty: (item.counterparty || "").trim(),
        originLabel: (item.originLabel || "").trim(),
        destinationLabel: (item.destinationLabel || "").trim(),
        amount: item.amount,
        isInvoiceCredit: Boolean(item.isInvoiceCredit),
        type: item.type,
        accountId: item.accountId,
        paidByUserId: item.paidByUserId,
        ownership: item.ownership,
        subcategoryId: item.subcategoryId,
        projectionId: item.projectionId,
        installmentCurrent: item.installmentCurrent,
        installmentTotal: item.installmentTotal,
        importHash: item.importHash,
        importBatchId: grp.batchId
      };
      this.state.transactions.push(newTx);
      grp.txs.push(newTx);

      // Se esta parcela importada foi classificada para uma categoria específica
      // ou recebeu descrição personalizada, propaga para parcelas correlatas anteriores/posteriores
      this.recordMerchantMemory(newTx.description, newTx.subcategoryId, newTx.ownership);
      if (Number(newTx.installmentTotal) > 1) {
        this.findCorrelatedInstallmentTxs(newTx).forEach(sib => {
          if (sib.id === newTx.id) return;
          if (!fallbackIds.has(newTx.subcategoryId) && sib.subcategoryId !== newTx.subcategoryId) {
            this.applySubcategoryToTx(sib, newTx.subcategoryId);
          }
          if (newTx.notes && (!sib.notes || !sib.notes.trim())) {
            sib.notes = newTx.notes;
          } else if (!newTx.notes && sib.notes) {
            newTx.notes = sib.notes;
          }
        });
      }
    }

    // Caso o usuário tenha reenviado um arquivo em que tudo já existia (ex: apenas atualizar data de corte ou fechar mês)
    if (batchGroups.size === 0 && hasAlreadyImported) {
      const targetAccId = meta.accountId || this.importTargetAccountId;
      const targetMonths = Array.from(new Set(this.stagedImports.filter(i => i.alreadyExists).map(i => i.competenceMonth).filter(Boolean)));
      targetMonths.forEach(m => {
        const key = `${targetAccId}__${m}`;
        batchGroups.set(key, {
          batchId: "imp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          accountId: targetAccId,
          competenceMonth: m,
          txs: []
        });
      });
    }

    // Registra ou consolida cada lote de importação no painel
    batchGroups.forEach(grp => {
      const acc = this.getAccount(grp.accountId);
      const parser = window.StatementParser;
      const expected = parser && parser.getAccountExpectedPeriod
        ? parser.getAccountExpectedPeriod(acc, grp.competenceMonth)
        : { periodStart: `${grp.competenceMonth}-01`, periodEnd: `${grp.competenceMonth}-28`, closeDate: `${grp.competenceMonth}-28` };

      const existingPartials = consolidatePartial
        ? this.state.statementImports.filter(b => b.accountId === grp.accountId && b.competenceMonth === grp.competenceMonth && b.status === "PARTIAL")
        : [];

      const inheritedTxIds = [];
      let inheritedStart = "";
      let inheritedEnd = "";
      if (existingPartials.length > 0) {
        const partialIds = new Set(existingPartials.map(b => b.id));
        existingPartials.forEach(pb => {
          if (pb.periodStart && (!inheritedStart || pb.periodStart < inheritedStart)) inheritedStart = pb.periodStart;
          if (pb.periodEnd && (!inheritedEnd || pb.periodEnd > inheritedEnd)) inheritedEnd = pb.periodEnd;
          this.getBatchedTransactions(pb).forEach(tx => {
            tx.importBatchId = grp.batchId;
            if (!inheritedTxIds.includes(tx.id)) inheritedTxIds.push(tx.id);
          });
        });
        this.state.statementImports = this.state.statementImports.filter(b => !partialIds.has(b.id));
      }

      const newTxIds = grp.txs.map(t => t.id);
      const mergedTxIds = Array.from(new Set([...inheritedTxIds, ...newTxIds]));
      const allBatchTxs = this.state.transactions.filter(t => mergedTxIds.includes(t.id));
      const allDates = allBatchTxs.map(t => t.transactionDate).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

      const periodStart = [inheritedStart, allDates[0], meta.periodStart].filter(Boolean).sort()[0] || expected.periodStart;
      const periodEnd = [inheritedEnd, allDates[allDates.length - 1], meta.periodEnd].filter(Boolean).sort().slice(-1)[0] || periodStart;
      const cutoffDate = [metaCutoff, periodEnd].filter(Boolean).sort().slice(-1)[0] || periodEnd;
      const totalAmount = allBatchTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);

      // Se a competência de saída for diferente do mês principal analisado, reavalia status para aquela competência específica quando pertinente
      const resolvedStatus = batchGroups.size > 1 && parser && parser.inferStatementImportStatus
        ? (grp.competenceMonth === meta.primaryMonth ? metaStatus : parser.inferStatementImportStatus(acc, grp.competenceMonth, cutoffDate))
        : metaStatus;

      this.state.statementImports.push({
        id: grp.batchId,
        accountId: grp.accountId,
        competenceMonth: grp.competenceMonth,
        fileName,
        importedAt: nowISO,
        status: resolvedStatus,
        periodStart,
        periodEnd,
        cutoffDate,
        expectedCloseDate: expected.closeDate,
        txCount: mergedTxIds.length,
        totalAmount: Number(totalAmount.toFixed(2)),
        txIds: mergedTxIds,
        notes: resolvedStatus === "PARTIAL" ? "Parcial antes do encerramento do mês/ciclo" : ""
      });
    });

    const compMonths = Array.from(batchGroups.values()).map(g => this.getMonthLabel(g.competenceMonth));
    const uniqueCompLabels = Array.from(new Set(compMonths));
    this.stagedImports = [];
    this.stagedImportMeta = null;
    this.saveState(true);
    this.renderAll();
    if (selected.length > 0) {
      this.showToast(`🫒 ${selected.length} lançamentos importados e extrato registrado (${uniqueCompLabels.join(" / ")})!`, "success");
    } else {
      this.showToast(`🫒 Cadastro do extrato atualizado em "${fileName}"!`, "success");
    }
  },

  // ==========================================================================
  // PAINEL DE CONTROLE DE EXTRATOS & IMPORTAÇÕES (PENDENTE / PARCIAL / FECHADO)
  // ==========================================================================
  getStatementMonthOptions() {
    const base = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"];
    const set = new Set(base);
    if (this.state && this.state.settings && this.state.settings.activeMonth) {
      set.add(this.state.settings.activeMonth);
    }
    (this.state.statementImports || []).forEach(b => {
      if (b && b.competenceMonth) set.add(b.competenceMonth);
    });
    (this.state.transactions || []).forEach(t => {
      if (t && t.competenceMonth) set.add(t.competenceMonth);
    });
    return Array.from(set).sort();
  },

  getRegisteredAccountsForStatements() {
    return this.getAccountsForActiveUser();
  },

  getBatchedTransactions(batch) {
    if (!batch) return [];
    const idSet = new Set(Array.isArray(batch.txIds) ? batch.txIds : []);
    return (this.state.transactions || []).filter(
      t => t.importBatchId === batch.id || idSet.has(t.id)
    );
  },

  getAccountStatementSummary(account, monthYear) {
    const batches = (this.state.statementImports || []).filter(
      b => b && b.accountId === account.id && b.competenceMonth === monthYear
    );
    const parser = window.StatementParser;
    const expected = parser && parser.getAccountExpectedPeriod
      ? parser.getAccountExpectedPeriod(account, monthYear)
      : { periodStart: `${monthYear}-01`, periodEnd: `${monthYear}-30`, closeDate: `${monthYear}-30` };

    if (batches.length === 0) {
      return {
        status: "PENDING",
        batches: [],
        liveTxCount: 0,
        periodStart: expected.periodStart,
        cutoffDate: "",
        coverage: { expected, totalDays: 30, coveredDays: 0, missingDays: 30, pct: 0 }
      };
    }

    const anyComplete = batches.some(b => b.status === "COMPLETE");
    const effectiveStatus = anyComplete ? "COMPLETE" : "PARTIAL";
    const sortedStarts = batches.map(b => b.periodStart).filter(Boolean).sort();
    const sortedCutoffs = batches.map(b => b.cutoffDate || b.periodEnd).filter(Boolean).sort();
    const periodStart = sortedStarts[0] || expected.periodStart;
    const cutoffDate = sortedCutoffs[sortedCutoffs.length - 1] || expected.closeDate;

    const uniqueTxIds = new Set();
    batches.forEach(b => {
      this.getBatchedTransactions(b).forEach(t => uniqueTxIds.add(t.id));
    });

    const coverage = parser && parser.evaluateStatementCoverage
      ? parser.evaluateStatementCoverage(account, monthYear, cutoffDate, effectiveStatus)
      : { expected, totalDays: 30, coveredDays: effectiveStatus === "COMPLETE" ? 30 : 15, missingDays: effectiveStatus === "COMPLETE" ? 0 : 15, pct: effectiveStatus === "COMPLETE" ? 100 : 50 };

    return {
      status: effectiveStatus,
      batches,
      primaryBatch: batches[batches.length - 1],
      liveTxCount: uniqueTxIds.size,
      periodStart,
      cutoffDate,
      coverage
    };
  },

  setStatementsPanelMonth(monthYear) {
    this.statementsPanelMonth = monthYear || null;
    this.renderStatementsPanel(this.state.settings.activeMonth);
    this.renderDashboard(this.calculateMonthSummary(this.state.settings.activeMonth, this.activeUserFilter), this.state.settings.activeMonth);
    if (window.lucide) window.lucide.createIcons();
  },

  setStatementsHistoryScope(scope) {
    this.statementsHistoryScope = scope === "ALL" ? "ALL" : "ACTIVE_MONTH";
    this.renderStatementsPanel(this.state.settings.activeMonth);
    if (window.lucide) window.lucide.createIcons();
  },

  toggleStatementsPanelCollapse() {
    this.statementsPanelCollapsed = !this.statementsPanelCollapsed;
    this.renderStatementsPanel(this.state.settings.activeMonth);
    if (window.lucide) window.lucide.createIcons();
  },

  scrollToStatementsPanel() {
    this.statementsPanelCollapsed = false;
    this.renderStatementsPanel(this.state.settings.activeMonth);
    const el = document.getElementById("statements-control-panel");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  },

  triggerAccountStatementUpload(accountId, targetMonth = null) {
    const acc = this.getAccount(accountId);
    if (!acc) return;
    if (this.currentTab !== "dashboard") {
      this.switchTab("dashboard");
    }
    this.importTargetAccountId = accountId;

    const accSelect = document.getElementById("import-account-select");
    if (accSelect) {
      const existsInSelect = Array.from(accSelect.options).some(opt => opt.value === accountId);
      if (!existsInSelect) {
        // Se a conta pertence ao outro usuário, altera filtro para "ALL" para não bloquear importação
        this.activeUserFilter = "ALL";
        this.renderAll();
      }
      const updatedSelect = document.getElementById("import-account-select");
      if (updatedSelect) {
        updatedSelect.value = accountId;
      }
    }

    const compSelect = document.getElementById("import-competence-select");
    if (compSelect) {
      const m = targetMonth || this.statementsPanelMonth || this.state.settings.activeMonth;
      this.importCompetenceMode = acc.type === "CREDIT_CARD" ? "SMART_INVOICE" : (m || "SMART_INVOICE");
      if (Array.from(compSelect.options).some(opt => opt.value === this.importCompetenceMode)) {
        compSelect.value = this.importCompetenceMode;
      } else {
        compSelect.value = "SMART_INVOICE";
        this.importCompetenceMode = "SMART_INVOICE";
      }
    }
    this.updateImportCycleRuleHint();

    const fileInput = document.getElementById("import-file-input");
    if (fileInput) {
      fileInput.click();
    } else {
      const card = document.getElementById("import-account-select");
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },

  toggleStatementBatchStatus(batchId) {
    const batch = (this.state.statementImports || []).find(b => b.id === batchId);
    if (!batch) return;
    batch.status = batch.status === "COMPLETE" ? "PARTIAL" : "COMPLETE";
    if (batch.status === "COMPLETE") {
      const acc = this.getAccount(batch.accountId);
      const expected = window.StatementParser && window.StatementParser.getAccountExpectedPeriod
        ? window.StatementParser.getAccountExpectedPeriod(acc, batch.competenceMonth)
        : null;
      if (expected && (!batch.cutoffDate || batch.cutoffDate < expected.closeDate)) {
        batch.expectedCloseDate = expected.closeDate;
      }
    }
    this.saveState(true);
    this.renderAll();
    this.showToast(
      batch.status === "COMPLETE"
        ? `✅ Extrato marcado como Completo / Fechado!`
        : `🌗 Extrato reaberto como Parcial.`,
      "success"
    );
  },

  openStatementImportModal(batchId = null, prefillAccountId = null, prefillMonth = null) {
    const modal = document.getElementById("modal-statement-import");
    if (!modal) return;

    const accounts = this.getRegisteredAccountsForStatements();
    const months = this.getStatementMonthOptions();
    const activeMonth = prefillMonth || this.statementsPanelMonth || this.state.settings.activeMonth;
    const batch = batchId ? (this.state.statementImports || []).find(b => b.id === batchId) : null;

    this.editingStatementBatchId = batch ? batch.id : null;

    const titleEl = document.getElementById("stmt-modal-title");
    const accEl = document.getElementById("stmt-modal-account");
    const monthEl = document.getElementById("stmt-modal-month");
    const statusEl = document.getElementById("stmt-modal-status");
    const fileEl = document.getElementById("stmt-modal-filename");
    const startEl = document.getElementById("stmt-modal-start");
    const cutoffEl = document.getElementById("stmt-modal-cutoff");
    const notesEl = document.getElementById("stmt-modal-notes");
    const cascadeWrap = document.getElementById("stmt-modal-cascade-wrap");
    const cascadeLabel = document.getElementById("stmt-modal-cascade-label");
    const cascadeChk = document.getElementById("stmt-modal-cascade-txs");

    if (accEl) {
      accEl.innerHTML = accounts
        .map(a => `<option value="${a.id}">${a.name} (${this.getUser(a.ownerId).name})</option>`)
        .join("");
    }
    if (monthEl) {
      monthEl.innerHTML = months
        .map(m => `<option value="${m}">${this.getMonthLabel(m)}</option>`)
        .join("");
    }

    if (batch) {
      if (titleEl) titleEl.textContent = "Alterar Importação de Extrato";
      if (accEl) accEl.value = batch.accountId;
      if (monthEl) monthEl.value = batch.competenceMonth;
      if (statusEl) statusEl.value = batch.status || "PARTIAL";
      if (fileEl) fileEl.value = batch.fileName || "";
      if (startEl) startEl.value = batch.periodStart || "";
      if (cutoffEl) cutoffEl.value = batch.cutoffDate || batch.periodEnd || "";
      if (notesEl) notesEl.value = batch.notes || "";
      const linkedCount = this.getBatchedTransactions(batch).length;
      if (cascadeWrap) {
        cascadeWrap.classList.toggle("hidden", linkedCount === 0);
        if (cascadeLabel) {
          cascadeLabel.textContent = `Se eu alterar Conta ou Competência, mover também os ${linkedCount} lançamento(s) vinculado(s) a este lote.`;
        }
        if (cascadeChk) cascadeChk.checked = true;
      }
    } else {
      const targetAcc = accounts.find(a => a.id === prefillAccountId) || accounts[0];
      const expected = window.StatementParser && window.StatementParser.getAccountExpectedPeriod
        ? window.StatementParser.getAccountExpectedPeriod(targetAcc, activeMonth)
        : { periodStart: `${activeMonth}-01`, closeDate: `${activeMonth}-28` };
      const todayISO = window.StatementParser ? window.StatementParser.getTodayISO() : "";
      const defStatus = window.StatementParser && window.StatementParser.inferStatementImportStatus
        ? window.StatementParser.inferStatementImportStatus(targetAcc, activeMonth, todayISO)
        : "COMPLETE";

      if (titleEl) titleEl.textContent = "Registrar Extrato Manual / Sem Movimentação";
      if (accEl && targetAcc) accEl.value = targetAcc.id;
      if (monthEl) monthEl.value = activeMonth;
      if (statusEl) statusEl.value = defStatus;
      if (fileEl) fileEl.value = "Extrato verificado / Sem movimentação";
      if (startEl) startEl.value = expected.periodStart;
      if (cutoffEl) cutoffEl.value = defStatus === "COMPLETE" ? expected.closeDate : (todayISO || expected.closeDate);
      if (notesEl) notesEl.value = "";
      if (cascadeWrap) cascadeWrap.classList.add("hidden");
    }

    modal.classList.remove("hidden");
  },

  closeStatementImportModal() {
    const modal = document.getElementById("modal-statement-import");
    if (modal) modal.classList.add("hidden");
    this.editingStatementBatchId = null;
  },

  saveStatementImportModal(event) {
    event.preventDefault();
    if (!Array.isArray(this.state.statementImports)) {
      this.state.statementImports = [];
    }

    const accountId = document.getElementById("stmt-modal-account").value;
    const competenceMonth = document.getElementById("stmt-modal-month").value;
    const status = document.getElementById("stmt-modal-status").value || "PARTIAL";
    const fileName = (document.getElementById("stmt-modal-filename").value || "").trim() || "Extrato cadastrado";
    const periodStart = document.getElementById("stmt-modal-start").value || `${competenceMonth}-01`;
    const cutoffDate = document.getElementById("stmt-modal-cutoff").value || periodStart;
    const notes = (document.getElementById("stmt-modal-notes").value || "").trim();
    const cascadeTxs = Boolean(document.getElementById("stmt-modal-cascade-txs")?.checked);

    const acc = this.getAccount(accountId);
    const expected = window.StatementParser && window.StatementParser.getAccountExpectedPeriod
      ? window.StatementParser.getAccountExpectedPeriod(acc, competenceMonth)
      : { closeDate: `${competenceMonth}-28` };

    if (this.editingStatementBatchId) {
      const batch = this.state.statementImports.find(b => b.id === this.editingStatementBatchId);
      if (!batch) {
        this.closeStatementImportModal();
        return;
      }

      const accChanged = batch.accountId !== accountId;
      const monthChanged = batch.competenceMonth !== competenceMonth;

      if (cascadeTxs && (accChanged || monthChanged)) {
        const linked = this.getBatchedTransactions(batch);
        linked.forEach(tx => {
          if (accChanged) {
            tx.accountId = accountId;
            if (acc && acc.ownerId) {
              tx.paidByUserId = acc.ownerId;
            }
          }
          if (monthChanged) {
            tx.competenceMonth = competenceMonth;
          }
        });
      }

      batch.accountId = accountId;
      batch.competenceMonth = competenceMonth;
      batch.status = status;
      batch.fileName = fileName;
      batch.periodStart = periodStart;
      batch.cutoffDate = cutoffDate;
      batch.periodEnd = cutoffDate;
      batch.expectedCloseDate = expected.closeDate;
      batch.notes = notes;
      batch.txCount = this.getBatchedTransactions(batch).length;
    } else {
      this.state.statementImports.push({
        id: "imp_manual_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        accountId,
        competenceMonth,
        fileName,
        importedAt: new Date().toISOString(),
        status,
        periodStart,
        periodEnd: cutoffDate,
        cutoffDate,
        expectedCloseDate: expected.closeDate,
        txCount: 0,
        totalAmount: 0,
        txIds: [],
        notes
      });
    }

    this.closeStatementImportModal();
    this.saveState(true);
    this.renderAll();
    this.showToast("🫒 Registro de importação de extrato salvo! (Ctrl+Z para desfazer)", "success");
  },

  openDeleteStatementModal(batchId) {
    const batch = (this.state.statementImports || []).find(b => b.id === batchId);
    if (!batch) return;
    const modal = document.getElementById("modal-statement-delete");
    const summaryEl = document.getElementById("stmt-delete-summary");
    const withTxsBtn = document.getElementById("stmt-delete-with-txs-btn");
    const withTxsLabel = document.getElementById("stmt-delete-with-txs-label");
    if (!modal || !summaryEl) return;

    this.deletingStatementBatchId = batchId;
    const acc = this.getAccount(batch.accountId);
    const linked = this.getBatchedTransactions(batch);
    const linkedCount = linked.length;

    summaryEl.innerHTML = `
      <div><strong>Arquivo / Origem:</strong> ${this.escapeHTML(batch.fileName || "Extrato")}</div>
      <div><strong>Conta:</strong> ${this.escapeHTML(acc ? acc.name : batch.accountId)} • <strong>Competência:</strong> ${this.getMonthLabel(batch.competenceMonth)}</div>
      <div><strong>Lançamentos vinculados:</strong> ${linkedCount} lançamento(s)</div>
    `;

    if (withTxsBtn && withTxsLabel) {
      withTxsBtn.classList.toggle("hidden", linkedCount === 0);
      withTxsLabel.textContent = `Excluir importação e os ${linkedCount} lançamento(s) vinculado(s)`;
    }

    modal.classList.remove("hidden");
  },

  closeDeleteStatementModal() {
    const modal = document.getElementById("modal-statement-delete");
    if (modal) modal.classList.add("hidden");
    this.deletingStatementBatchId = null;
  },

  confirmDeleteStatementModal(mode = "WITH_TXS") {
    const batchId = this.deletingStatementBatchId;
    if (!batchId) return;
    const batch = (this.state.statementImports || []).find(b => b.id === batchId);
    if (!batch) {
      this.closeDeleteStatementModal();
      return;
    }

    const linked = this.getBatchedTransactions(batch);
    const linkedIds = new Set(linked.map(t => t.id));
    let deletedTxCount = 0;

    if (mode === "WITH_TXS" && linkedIds.size > 0) {
      this.state.transactions = this.state.transactions.filter(t => !linkedIds.has(t.id));
      this.selectedTxIds = this.selectedTxIds.filter(id => !linkedIds.has(id));
      deletedTxCount = linkedIds.size;
    } else if (linkedIds.size > 0) {
      this.state.transactions.forEach(t => {
        if (linkedIds.has(t.id) && t.importBatchId === batchId) {
          delete t.importBatchId;
        }
      });
    }

    this.state.statementImports = (this.state.statementImports || []).filter(b => b.id !== batchId);
    this.closeDeleteStatementModal();
    this.saveState(true);
    this.renderAll();

    if (deletedTxCount > 0) {
      this.showToast(`🗑️ Importação e ${deletedTxCount} lançamento(s) excluídos (Ctrl+Z para desfazer).`, "info");
    } else {
      this.showToast(`🧹 Registro da importação removido do painel (lançamentos mantidos).`, "info");
    }
  },

  renderStatementsPanel(monthYear) {
    const panel = document.getElementById("statements-control-panel");
    if (!panel) return;

    const targetMonth = this.statementsPanelMonth || monthYear || this.state.settings.activeMonth;
    const monthOptions = this.getStatementMonthOptions();
    const accounts = this.getRegisteredAccountsForStatements();
    const totalAccounts = accounts.length;

    const summaries = accounts.map(acc => ({
      account: acc,
      summary: this.getAccountStatementSummary(acc, targetMonth)
    }));

    const completeCount = summaries.filter(s => s.summary.status === "COMPLETE").length;
    const partialCount = summaries.filter(s => s.summary.status === "PARTIAL").length;
    const pendingCount = summaries.filter(s => s.summary.status === "PENDING").length;
    const overallCoveragePct = totalAccounts > 0
      ? Math.round(((completeCount + partialCount * 0.5) / totalAccounts) * 100)
      : 100;

    const monthSelectHTML = monthOptions
      .map(m => `<option value="${m}" ${m === targetMonth ? "selected" : ""}>${this.getMonthLabel(m)}</option>`)
      .join("");

    const accountRowsHTML = summaries.length === 0
      ? `<div class="p-6 text-center text-xs text-stone-400">Nenhuma conta cadastrada. Cadastre suas contas em Cartões & Contas.</div>`
      : summaries
          .map(({ account, summary }) => {
            const owner = this.getUser(account.ownerId);
            const isCard = account.type === "CREDIT_CARD";
            const expected = summary.coverage.expected;
            const pct = summary.coverage.pct;
            const liveCount = summary.liveTxCount;

            let badgeHTML = "";
            let barHTML = "";
            let metaLine = "";
            let actionsHTML = "";

            if (summary.status === "COMPLETE") {
              badgeHTML = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-extrabold">✅ Fechado (100%)</span>`;
              barHTML = `
                <div class="w-full h-2 rounded-full bg-emerald-100 overflow-hidden mt-1.5">
                  <div class="h-full bg-emerald-600 rounded-full" style="width:100%"></div>
                </div>
              `;
              metaLine = `${liveCount} lançamento(s) • Ciclo ${this.formatDateBR(expected.periodStart)} → ${this.formatDateBR(expected.closeDate)} • Arquivo: ${this.escapeHTML(summary.primaryBatch?.fileName || "Extrato")}`;
              actionsHTML = `
                <button type="button" onclick="App.triggerAccountStatementUpload('${account.id}', '${targetMonth}')" class="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-[11px] font-bold transition" title="Importar arquivo complementar ou atualizado">🔄 Nova import.</button>
                <button type="button" onclick="App.toggleStatementBatchStatus('${summary.primaryBatch.id}')" class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-bold transition" title="Reabrir como parcial">🌗 Parcial</button>
                <button type="button" onclick="App.openStatementImportModal('${summary.primaryBatch.id}')" class="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-[11px] font-bold transition">✏️ Alterar</button>
                <button type="button" onclick="App.openDeleteStatementModal('${summary.primaryBatch.id}')" class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-bold transition" title="Excluir importação">🗑️</button>
              `;
            } else if (summary.status === "PARTIAL") {
              badgeHTML = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-300 text-[11px] font-extrabold">🌗 Parcial até ${this.formatDateBR(summary.cutoffDate)} (${pct}%)</span>`;
              barHTML = `
                <div class="w-full h-2.5 rounded-full bg-stone-100 border border-dashed border-sky-300 overflow-hidden mt-1.5 flex" title="${summary.coverage.coveredDays} de ${summary.coverage.totalDays} dias cobertos — faltam ${summary.coverage.missingDays} dia(s) até o fechamento">
                  <div class="h-full bg-gradient-to-r from-sky-500 to-lime-500 rounded-l-full transition-all" style="width:${pct}%"></div>
                </div>
              `;
              metaLine = `${liveCount} lançamento(s) • Coberto ${this.formatDateBR(summary.periodStart)} → <strong>${this.formatDateBR(summary.cutoffDate)}</strong> (fecha em ${this.formatDateBR(expected.closeDate)} • faltam ${summary.coverage.missingDays}d)`;
              actionsHTML = `
                <button type="button" onclick="App.triggerAccountStatementUpload('${account.id}', '${targetMonth}')" class="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-extrabold transition" title="Enviar extrato mais recente para completar o mês">🔄 Atualizar</button>
                <button type="button" onclick="App.toggleStatementBatchStatus('${summary.primaryBatch.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold transition" title="Marcar este extrato como fechado/completo">✓ Fechar</button>
                <button type="button" onclick="App.openStatementImportModal('${summary.primaryBatch.id}')" class="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-[11px] font-bold transition">✏️ Alterar</button>
                <button type="button" onclick="App.openDeleteStatementModal('${summary.primaryBatch.id}')" class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-bold transition" title="Excluir importação">🗑️</button>
              `;
            } else {
              badgeHTML = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-extrabold">⏳ Pendente</span>`;
              barHTML = `
                <div class="w-full h-2 rounded-full bg-rose-50 border border-dashed border-rose-200 mt-1.5"></div>
              `;
              metaLine = `Nenhum extrato cadastrado para ${this.getMonthLabel(targetMonth)} • Ciclo previsto: ${this.formatDateBR(expected.periodStart)} → ${this.formatDateBR(expected.closeDate)}`;
              actionsHTML = `
                <button type="button" onclick="App.triggerAccountStatementUpload('${account.id}', '${targetMonth}')" class="px-3 py-1.5 rounded-lg bg-lime-700 hover:bg-lime-800 text-white text-[11px] font-extrabold transition">📤 Importar Extrato</button>
                <button type="button" onclick="App.openStatementImportModal(null, '${account.id}', '${targetMonth}')" class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 text-[11px] font-bold transition" title="Cadastrar manualmente ou marcar sem movimentação no mês">+ Sem mov.</button>
              `;
            }

            return `
              <div class="rounded-2xl border ${summary.status === "PENDING" ? "border-rose-200/80 bg-rose-50/25" : summary.status === "PARTIAL" ? "border-sky-200/90 bg-sky-50/25" : "border-stone-200/80 bg-[#fcfdf9]"} p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${account.color || "#84cc16"}"></span>
                    <span class="font-extrabold text-stone-900 text-xs sm:text-sm">${this.escapeHTML(account.name)}</span>
                    <span class="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[10px] font-bold">${owner.name}</span>
                    <span class="text-[10px] font-semibold text-stone-400">${isCard ? `Cartão • Vira dia ${account.closingDay || 9}` : "Conta Corrente"}</span>
                    ${badgeHTML}
                  </div>
                  ${barHTML}
                  <div class="text-[11px] text-stone-500 mt-1.5">${metaLine}</div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                  ${actionsHTML}
                </div>
              </div>
            `;
          })
          .join("");

    // Histórico de lotes salvos (filtrado pelas contas do usuário selecionado, ou todas em Ambos)
    const visibleAccIds = new Set(accounts.map(a => a.id));
    const allBatches = (this.state.statementImports || [])
      .filter(b => b && visibleAccIds.has(b.accountId))
      .sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""));
    const visibleBatches = this.statementsHistoryScope === "ALL"
      ? allBatches
      : allBatches.filter(b => b.competenceMonth === targetMonth);

    const batchesHTML = visibleBatches.length === 0
      ? `<tr><td colspan="6" class="py-5 px-4 text-center text-xs text-stone-400">Nenhuma importação de extrato registrada ${this.statementsHistoryScope === "ALL" ? "ainda" : `para ${this.getMonthLabel(targetMonth)}`}.</td></tr>`
      : visibleBatches
          .map(b => {
            const acc = this.getAccount(b.accountId);
            const liveTxs = this.getBatchedTransactions(b);
            const parser = window.StatementParser;
            const cov = parser && parser.evaluateStatementCoverage
              ? parser.evaluateStatementCoverage(acc, b.competenceMonth, b.cutoffDate || b.periodEnd, b.status)
              : { pct: b.status === "COMPLETE" ? 100 : 50 };
            const statusPill = b.status === "COMPLETE"
              ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-extrabold">✅ Completo</span>`
              : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 text-[10px] font-extrabold">🌗 Parcial (${cov.pct}%)</span>`;
            const impDate = b.importedAt ? this.formatDateBR(b.importedAt.substring(0, 10)) : "-";

            return `
              <tr class="border-b border-stone-100 hover:bg-stone-50/70 text-xs">
                <td class="py-2.5 px-4">
                  <div class="font-bold text-stone-800">${this.escapeHTML(acc ? acc.name : b.accountId)}</div>
                  <div class="text-[10px] text-stone-400">${this.getMonthLabel(b.competenceMonth)} • Importado em ${impDate}</div>
                </td>
                <td class="py-2.5 px-3">
                  <div class="font-semibold text-stone-700 truncate max-w-[210px]" title="${this.escapeHTML(b.fileName)}">📄 ${this.escapeHTML(b.fileName)}</div>
                  ${b.notes ? `<div class="text-[10px] text-stone-500 italic">${this.escapeHTML(b.notes)}</div>` : ""}
                </td>
                <td class="py-2.5 px-3 whitespace-nowrap">
                  ${statusPill}
                  <div class="text-[10px] text-stone-500 mt-0.5">${this.formatDateBR(b.periodStart)} → ${this.formatDateBR(b.cutoffDate || b.periodEnd)}</div>
                </td>
                <td class="py-2.5 px-3 text-center font-bold text-stone-700 whitespace-nowrap">
                  ${liveTxs.length} lanç.
                </td>
                <td class="py-2.5 px-3 text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-1">
                    <button type="button" onclick="App.openStatementImportModal('${b.id}')" class="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition">✏️ Alterar</button>
                    <button type="button" onclick="App.openDeleteStatementModal('${b.id}')" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] transition">🗑️ Deletar</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("");

    const userScopeLabel = this.activeUserFilter === "ALL"
      ? `Todas as <strong>${totalAccounts} contas cadastradas do casal</strong>`
      : `Contas de <strong>${this.getUser(this.activeUserFilter).name}</strong> (<strong>${totalAccounts} ${totalAccounts === 1 ? "conta cadastrada" : "contas cadastradas"}</strong>)`;

    panel.innerHTML = `
      <div class="px-5 py-4 bg-stone-50/80 border-b border-stone-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-extrabold text-stone-900 text-sm sm:text-base flex items-center gap-2">
              <i data-lucide="folder-check" class="w-4 h-4 text-lime-700"></i>
              Controle de Extratos & Importações
            </h3>
            <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-extrabold">✅ ${completeCount} fechados</span>
            ${partialCount > 0 ? `<span class="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 text-[11px] font-extrabold">🌗 ${partialCount} parciais</span>` : ""}
            ${pendingCount > 0 ? `<span class="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 text-[11px] font-extrabold">⏳ ${pendingCount} pendentes</span>` : ""}
          </div>
          <p class="text-xs text-stone-500 mt-0.5">
            ${userScopeLabel} devem ter extrato no mês (cobertura atual: <strong>${overallCoveragePct}%</strong>).${this.activeUserFilter === "ALL" ? "" : ` Selecione <strong>Ambos</strong> no topo para ver os extratos conjuntos do casal.`}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <select
            onchange="App.setStatementsPanelMonth(this.value)"
            class="oli-input rounded-xl px-3 py-1.5 text-xs font-bold bg-white"
            title="Filtrar competência do checklist de extratos"
          >
            ${monthSelectHTML}
          </select>
          <button
            type="button"
            onclick="App.openStatementImportModal(null, null, '${targetMonth}')"
            class="px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-bold transition"
          >
            + Registrar Manual
          </button>
          <button
            type="button"
            onclick="App.toggleStatementsPanelCollapse()"
            class="px-2.5 py-1.5 rounded-xl bg-stone-200/70 hover:bg-stone-200 text-stone-700 text-xs font-bold transition"
          >
            ${this.statementsPanelCollapsed ? "Mostrar ▼" : "Recolher ▲"}
          </button>
        </div>
      </div>

      ${this.statementsPanelCollapsed ? "" : `
        <div class="p-4 sm:p-5 space-y-5">
          <div class="space-y-2.5">
            ${accountRowsHTML}
          </div>

          <div class="rounded-2xl border border-stone-200/90 overflow-hidden">
            <div class="px-4 py-2.5 bg-stone-50 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-extrabold text-stone-800">
                Arquivos & Lotes de Importação Salvos (${visibleBatches.length})
              </span>
              <div class="inline-flex bg-white border border-stone-200 p-0.5 rounded-lg text-[11px]">
                <button
                  type="button"
                  onclick="App.setStatementsHistoryScope('ACTIVE_MONTH')"
                  class="px-2.5 py-1 rounded-md font-bold transition ${this.statementsHistoryScope !== "ALL" ? "bg-lime-700 text-white" : "text-stone-500 hover:text-stone-900"}"
                >
                  ${this.getMonthLabel(targetMonth)}
                </button>
                <button
                  type="button"
                  onclick="App.setStatementsHistoryScope('ALL')"
                  class="px-2.5 py-1 rounded-md font-bold transition ${this.statementsHistoryScope === "ALL" ? "bg-lime-700 text-white" : "text-stone-500 hover:text-stone-900"}"
                >
                  Todos os meses (${allBatches.length})
                </button>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-stone-100 text-[10px] font-bold uppercase text-stone-400 bg-white">
                    <th class="py-2 px-4">Conta / Competência</th>
                    <th class="py-2 px-3">Arquivo / Nota</th>
                    <th class="py-2 px-3">Situação & Cobertura</th>
                    <th class="py-2 px-3 text-center">Itens</th>
                    <th class="py-2 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${batchesHTML}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `}
    `;
  },

  // ==========================================================================
  // ABA CARTÕES & CONTAS POR USUÁRIO (DATA DE VIRADA + VIRTUAIS NA MESMA CONTA)
  // ==========================================================================
  renderCardsTab(monthYear) {
    const container = document.getElementById("user-cards-sections-container");
    if (!container) return;

    const userIds = this.activeUserFilter === "ALL"
      ? ["bruno", "nubia"]
      : [this.activeUserFilter];
    container.className = `grid grid-cols-1 ${userIds.length > 1 ? "lg:grid-cols-2" : "lg:grid-cols-1"} gap-6 items-start`;
    const users = userIds.map(uid => this.getUser(uid));
    const dayOptions = (selectedDay) => {
      let html = "";
      for (let d = 1; d <= 31; d++) {
        html += `<option value="${d}" ${Number(selectedDay) === d ? "selected" : ""}>Dia ${d}</option>`;
      }
      return html;
    };

    container.innerHTML = users
      .map(user => {
        const userCards = this.state.accounts.filter(
          a => a.type === "CREDIT_CARD" && a.ownerId === user.id
        );
        const userChecking = this.state.accounts.filter(
          a => a.type === "CHECKING" && a.ownerId === user.id
        );

        const cardsHTML = userCards.length === 0
          ? `
            <div class="rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 p-6 text-center text-xs text-stone-400">
              Nenhuma conta de cartão cadastrada para ${user.name} ainda. Utilize o formulário abaixo para cadastrar.
            </div>
          `
          : userCards
              .map(card => {
                const closingDay = Number(card.closingDay) || 9;
                const offset = typeof card.competenceOffset === "number" ? card.competenceOffset : 0;
                const vCards = Array.isArray(card.virtualCards) ? card.virtualCards : ["Cartão Físico"];
                const preview = window.StatementParser
                  ? window.StatementParser.getCyclePreviewForMonth(card, monthYear)
                  : { rangeStr: "-", closeDateStr: "-", modeLabel: "Mês da virada", fullText: "" };

                const vCardTagsHTML = vCards
                  .map(
                    (vcName, idx) => `
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-stone-200 text-[11px] font-bold text-stone-700 shadow-2xs">
                        <i data-lucide="credit-card" class="w-3 h-3 text-lime-700"></i>
                        <span>${vcName}</span>
                        <button
                          type="button"
                          onclick="App.removeVirtualCard('${card.id}', ${idx})"
                          class="text-stone-400 hover:text-rose-600 ml-0.5 font-extrabold"
                          title="Remover este cartão virtual da conta"
                        >
                          &times;
                        </button>
                      </span>
                    `
                  )
                  .join("");

                return `
                  <div class="rounded-2xl border border-stone-200/90 bg-[#fcfdf9] p-4 sm:p-5 space-y-4 shadow-2xs">
                    <!-- Topo da Conta do Cartão -->
                    <div class="flex items-start justify-between gap-3 pb-3 border-b border-stone-200/70">
                      <div class="flex items-center gap-2.5 flex-1 min-w-0">
                        <input
                          type="color"
                          value="${card.color || "#a855f7"}"
                          onchange="App.updateCardSettings('${card.id}', 'color', this.value)"
                          class="w-6 h-6 rounded-lg border-0 cursor-pointer shrink-0 bg-transparent"
                          title="Cor de identificação do cartão"
                        />
                        <div class="flex-1 min-w-0">
                          <input
                            type="text"
                            value="${card.name}"
                            onchange="App.updateCardSettings('${card.id}', 'name', this.value)"
                            class="w-full font-extrabold text-sm text-stone-900 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-lime-600 focus:outline-none py-0.5"
                            title="Clique para editar o nome da conta do cartão"
                          />
                          <div class="text-[11px] text-stone-400 font-medium">
                            Titular: <strong>${user.name}</strong> • Fatura única para físicos e virtuais
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onclick="App.deleteCardAccount('${card.id}')"
                        class="p-1.5 rounded-lg text-stone-300 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Excluir esta conta de cartão"
                      >
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                      </button>
                    </div>

                    <!-- Configuração de Data de Virada e Regra de Competência -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label class="block text-[11px] font-bold text-stone-600 mb-1">Data de Virada (Fechamento)</label>
                        <select
                          onchange="App.updateCardSettings('${card.id}', 'closingDay', this.value)"
                          class="w-full oli-input rounded-xl px-3 py-2 text-xs font-extrabold text-stone-800"
                        >
                          ${dayOptions(closingDay)}
                        </select>
                      </div>

                      <div>
                        <label class="block text-[11px] font-bold text-stone-600 mb-1">Competência da Fatura</label>
                        <select
                          onchange="App.updateCardSettings('${card.id}', 'competenceOffset', this.value)"
                          class="w-full oli-input rounded-xl px-3 py-2 text-xs font-extrabold text-lime-900"
                        >
                          <option value="0" ${offset === 0 ? "selected" : ""}>Mês da virada</option>
                          <option value="-1" ${offset === -1 ? "selected" : ""}>Mês anterior à virada</option>
                          <option value="1" ${offset === 1 ? "selected" : ""}>Mês seguinte à virada</option>
                        </select>
                      </div>
                    </div>

                    <!-- Resumo Dinâmico da Equação do Ciclo -->
                    <div class="rounded-xl bg-lime-50/90 border border-lime-200/80 px-3.5 py-2.5 text-xs text-lime-950 flex items-start justify-between gap-2">
                      <div>
                        <div class="font-extrabold text-[11px] uppercase tracking-wider text-lime-800">
                          Equação ativa para ${this.getMonthLabel(monthYear)}
                        </div>
                        <div class="mt-0.5 leading-snug">
                          Compras de <strong>${preview.rangeStr}</strong> (fatura que vira em <strong>${preview.closeDateStr}</strong>) entram na competência de <strong>${this.getMonthLabel(monthYear)}</strong> (<em>${preview.modeLabel}</em>).
                        </div>
                      </div>
                      <button
                        type="button"
                        onclick="App.recalculateCardTransactionsCompetence('${card.id}')"
                        class="shrink-0 px-2.5 py-1 rounded-lg bg-white hover:bg-lime-100 text-lime-800 border border-lime-300 text-[11px] font-bold transition"
                        title="Recalcular a competência dos lançamentos já existentes deste cartão com esta regra"
                      >
                        ↻ Recalcular
                      </button>
                    </div>

                    <!-- Cartões Virtuais e Físicos pertencentes a esta mesma conta -->
                    <div class="pt-1">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="text-[11px] font-bold text-stone-600">
                          Cartões Físicos & Virtuais pertencentes a esta conta (${vCards.length})
                        </span>
                        <span class="text-[10px] text-stone-400">Mesma fatura e mesma virada</span>
                      </div>

                      <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
                        ${vCardTagsHTML}
                      </div>

                      <div class="flex gap-2">
                        <input
                          id="new-vcard-input-${card.id}"
                          type="text"
                          placeholder="Adicionar cartão virtual na conta (Ex: Virtual iFood, Final 4812...)"
                          onkeydown="if(event.key==='Enter'){event.preventDefault();App.addVirtualCard('${card.id}');}"
                          class="flex-1 oli-input rounded-xl px-3 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onclick="App.addVirtualCard('${card.id}')"
                          class="px-3 py-1.5 rounded-xl bg-stone-200/80 hover:bg-stone-300 text-stone-800 text-xs font-bold whitespace-nowrap transition"
                        >
                          + Virtual
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join("");

        const checkingBadgesHTML = userChecking
          .map(
            cc => `
              <div class="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    type="color"
                    value="${cc.color || "#84cc16"}"
                    onchange="App.updateCheckingAccount('${cc.id}', 'color', this.value)"
                    class="w-5 h-5 rounded border-0 bg-transparent cursor-pointer shrink-0"
                    title="Cor da conta corrente"
                  />
                  <div class="min-w-0 flex-1">
                    <input
                      type="text"
                      value="${cc.name}"
                      onchange="App.updateCheckingAccount('${cc.id}', 'name', this.value)"
                      class="w-full font-bold text-stone-800 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-lime-600 focus:outline-none py-0.5"
                      title="Clique para editar o nome desta conta"
                    />
                    <div class="text-[10px] text-stone-400 font-medium">Conta Corrente / Débito / Carteira (Próprio mês)</div>
                  </div>
                </div>
                <button
                  type="button"
                  onclick="App.deleteCheckingAccount('${cc.id}')"
                  class="p-1.5 rounded-lg text-stone-300 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                  title="Excluir conta corrente"
                >
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            `
          )
          .join("");

        return `
          <div class="oli-card rounded-3xl p-5 sm:p-6 space-y-5">
            <!-- Cabeçalho da Seção do Usuário -->
            <div class="flex items-center justify-between pb-3 border-b border-stone-200/80">
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-extrabold text-sm shadow-xs"
                  style="background:${user.avatarColor || "#4d7c0f"}"
                >
                  ${user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 class="text-base font-extrabold text-stone-900">
                    Contas & Cartões de ${user.name}
                  </h3>
                  <p class="text-xs text-stone-500">
                    ${userChecking.length} conta(s) corrente(s) • ${userCards.length} ${userCards.length === 1 ? "cartão ativo" : "cartões ativos"}
                  </p>
                </div>
              </div>
              <span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">
                Seção ${user.name}
              </span>
            </div>

            <!-- Contas Correntes Independentes do Usuário -->
            <div class="space-y-2">
              <div class="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
                Contas Correntes / Débito / Carteira (${userChecking.length})
              </div>
              <div class="space-y-2">${checkingBadgesHTML}</div>
              <form
                onsubmit="App.handleNewCheckingAccount(event, '${user.id}')"
                class="flex items-center gap-2 pt-1"
              >
                <input
                  id="new-checking-color-${user.id}"
                  type="color"
                  value="${user.id === "bruno" ? "#0ea5e9" : "#f43f5e"}"
                  class="w-7 h-8 rounded-lg border border-stone-200 bg-white p-0.5 cursor-pointer shrink-0"
                  title="Cor da nova conta corrente"
                />
                <input
                  id="new-checking-name-${user.id}"
                  type="text"
                  required
                  placeholder="Nova conta de ${user.name} (Ex: Itaú CC, Nubank Conta, Carteira...)"
                  class="flex-1 oli-input rounded-xl px-3 py-2 text-xs font-medium"
                />
                <button
                  type="submit"
                  class="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold whitespace-nowrap transition cursor-pointer"
                >
                  + Conta
                </button>
              </form>
            </div>

            <!-- Lista de Contas de Cartão Cadastradas -->
            <div class="space-y-3">
              <div class="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
                Contas de Cartão de Crédito (Físico + Virtuais Unificados)
              </div>
              ${cardsHTML}
            </div>

            <!-- Formulário para Cadastrar Nova Conta de Cartão para este Usuário -->
            <form
              onsubmit="App.handleNewCardAccount(event, '${user.id}')"
              class="rounded-2xl bg-[#f5f8f0] border border-lime-700/20 p-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-extrabold text-lime-950 flex items-center gap-1.5">
                  <i data-lucide="plus-circle" class="w-4 h-4 text-lime-700"></i>
                  Cadastrar Nova Conta de Cartão para ${user.name}
                </span>
                <input
                  id="new-card-color-${user.id}"
                  type="color"
                  value="${user.id === "bruno" ? "#6366f1" : "#ec4899"}"
                  class="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                  title="Escolher cor do cartão"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                <div class="sm:col-span-5">
                  <label class="block text-[11px] font-bold text-stone-600 mb-1">Nome da Conta / Banco</label>
                  <input
                    id="new-card-name-${user.id}"
                    type="text"
                    required
                    placeholder="Ex: Cartão Nubank, Itaú, C6..."
                    class="w-full oli-input rounded-xl px-3 py-2 text-xs font-semibold"
                  />
                </div>

                <div class="sm:col-span-3">
                  <label class="block text-[11px] font-bold text-stone-600 mb-1">Dia da Virada</label>
                  <select
                    id="new-card-closing-${user.id}"
                    class="w-full oli-input rounded-xl px-2.5 py-2 text-xs font-bold"
                  >
                    ${dayOptions(9)}
                  </select>
                </div>

                <div class="sm:col-span-4">
                  <label class="block text-[11px] font-bold text-stone-600 mb-1">Competência</label>
                  <select
                    id="new-card-offset-${user.id}"
                    class="w-full oli-input rounded-xl px-2.5 py-2 text-xs font-bold"
                  >
                    <option value="0">Mês da virada</option>
                    <option value="-1">Mês anterior à virada</option>
                    <option value="1">Mês seguinte à virada</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-[11px] font-bold text-stone-600 mb-1">
                  Cartões Virtuais / Físicos vinculados à mesma conta (separados por vírgula)
                </label>
                <input
                  id="new-card-virtuals-${user.id}"
                  type="text"
                  placeholder="Ex: Cartão Físico, Virtual Compras Online, Virtual Recorrente"
                  value="Cartão Físico, Virtual Compras Online"
                  class="w-full oli-input rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <button
                type="submit"
                class="w-full bg-lime-700 hover:bg-lime-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <i data-lucide="check" class="w-4 h-4"></i>
                Salvar Conta de Cartão (${user.name})
              </button>
            </form>
          </div>
        `;
      })
      .join("");
  },

  handleNewCheckingAccount(e, ownerId) {
    e.preventDefault();
    const nameEl = document.getElementById(`new-checking-name-${ownerId}`);
    const colorEl = document.getElementById(`new-checking-color-${ownerId}`);
    const name = (nameEl && nameEl.value || "").trim();
    if (!name) return;

    const newAcc = {
      id: `cc_${ownerId}_${Date.now()}`,
      name,
      type: "CHECKING",
      ownerId,
      closingDay: null,
      dueDay: null,
      competenceOffset: 0,
      monthlyTarget: 0,
      color: colorEl ? colorEl.value : "#0ea5e9"
    };

    this.state.accounts.push(newAcc);
    if (nameEl) nameEl.value = "";
    this.saveState(true);
    this.renderAll();
    this.showToast(`🏦 Conta "${name}" cadastrada para ${this.getUser(ownerId).name}!`, "success");
  },

  updateCheckingAccount(accId, field, value) {
    const acc = this.state.accounts.find(a => a.id === accId && a.type === "CHECKING");
    if (!acc) return;
    if (field === "name") {
      const clean = String(value || "").trim();
      if (!clean) {
        this.renderCardsTab(this.state.settings.activeMonth);
        return;
      }
      acc.name = clean;
    } else if (field === "color") {
      acc.color = value || "#84cc16";
    }
    this.saveState(true);
    this.renderAll();
    this.showToast(`Conta "${acc.name}" atualizada!`, "success");
  },

  deleteCheckingAccount(accId) {
    const acc = this.state.accounts.find(a => a.id === accId && a.type === "CHECKING");
    if (!acc) return;
    const sameOwnerChecking = this.state.accounts.filter(a => a.type === "CHECKING" && a.ownerId === acc.ownerId);
    if (sameOwnerChecking.length <= 1) {
      this.showToast(`${this.getUser(acc.ownerId).name} precisa manter pelo menos 1 conta corrente principal.`, "error");
      return;
    }
    const txCount = this.state.transactions.filter(t => t.accountId === accId).length;
    if (txCount > 0 && !confirm(`A conta "${acc.name}" possui ${txCount} lançamento(s). Deseja realmente excluí-la?`)) {
      return;
    }
    this.state.accounts = this.state.accounts.filter(a => a.id !== accId);
    this.saveState(true);
    this.renderAll();
    this.showToast(`Conta "${acc.name}" removida (Ctrl+Z para desfazer).`, "info");
  },

  handleNewCardAccount(e, ownerId) {
    e.preventDefault();
    const nameEl = document.getElementById(`new-card-name-${ownerId}`);
    const closingEl = document.getElementById(`new-card-closing-${ownerId}`);
    const offsetEl = document.getElementById(`new-card-offset-${ownerId}`);
    const virtualsEl = document.getElementById(`new-card-virtuals-${ownerId}`);
    const colorEl = document.getElementById(`new-card-color-${ownerId}`);

    const name = nameEl ? nameEl.value.trim() : "";
    if (!name) {
      this.showToast("Informe o nome da conta do cartão.", "error");
      return;
    }

    const closingDay = Math.min(31, Math.max(1, parseInt(closingEl.value, 10) || 9));
    const competenceOffset = parseInt(offsetEl.value, 10) || 0;
    const dueDay = ((closingDay + 7 - 1) % 28) + 1;
    const virtualCards = (virtualsEl ? virtualsEl.value : "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (virtualCards.length === 0) virtualCards.push("Cartão Físico");

    const newCard = {
      id: `card_${ownerId}_${Date.now()}`,
      name,
      type: "CREDIT_CARD",
      ownerId,
      closingDay,
      dueDay,
      competenceOffset,
      virtualCards,
      monthlyTarget: 0,
      color: colorEl ? colorEl.value : "#6366f1"
    };

    this.state.accounts.push(newCard);
    this.importTargetAccountId = newCard.id;
    if (nameEl) nameEl.value = "";
    this.saveState(true);
    this.renderAll();

    const modeLabel = window.StatementParser
      ? window.StatementParser.getCompetenceModeLabel(competenceOffset)
      : "Mês da virada";
    this.showToast(`🫒 "${name}" cadastrado (Vira dia ${closingDay} • ${modeLabel})!`, "success");
  },

  updateCardSettings(cardId, field, rawValue) {
    const card = this.state.accounts.find(a => a.id === cardId);
    if (!card) return;

    if (field === "closingDay") {
      card.closingDay = Math.min(31, Math.max(1, parseInt(rawValue, 10) || 9));
      card.dueDay = ((card.closingDay + 7 - 1) % 28) + 1;
    } else if (field === "competenceOffset") {
      card.competenceOffset = parseInt(rawValue, 10) || 0;
    } else if (field === "name") {
      const trimmed = String(rawValue || "").trim();
      if (trimmed) card.name = trimmed;
    } else if (field === "color") {
      card.color = rawValue;
    }

    if (Array.isArray(this.stagedImports) && window.StatementParser) {
      this.stagedImports.forEach(item => {
        if (item.accountId === cardId) {
          item.competenceMonth = window.StatementParser.computeCompetenceMonth(
            item.transactionDate,
            card,
            this.state.settings.activeMonth
          );
        }
      });
    }

    this.saveState(true);
    this.renderAll();

    const modeLabel = window.StatementParser
      ? window.StatementParser.getCompetenceModeLabel(card.competenceOffset)
      : "";
    this.showToast(`🫒 ${card.name}: Virada dia ${card.closingDay} (${modeLabel}) salvo!`, "success");
  },

  addVirtualCard(cardId) {
    const card = this.state.accounts.find(a => a.id === cardId);
    const inputEl = document.getElementById(`new-vcard-input-${cardId}`);
    if (!card || !inputEl) return;

    const val = inputEl.value.trim();
    if (!val) {
      this.showToast("Digite o nome ou final do cartão virtual.", "error");
      return;
    }

    if (!Array.isArray(card.virtualCards)) card.virtualCards = ["Cartão Físico"];
    if (!card.virtualCards.includes(val)) {
      card.virtualCards.push(val);
    }
    inputEl.value = "";
    this.saveState(true);
    this.renderAll();
    this.showToast(`🫒 Cartão virtual "${val}" vinculado à conta ${card.name}!`, "success");
  },

  removeVirtualCard(cardId, idx) {
    const card = this.state.accounts.find(a => a.id === cardId);
    if (!card || !Array.isArray(card.virtualCards)) return;
    const removed = card.virtualCards.splice(idx, 1);
    this.saveState(true);
    this.renderAll();
    this.showToast(`Cartão "${removed[0] || ""}" removido da conta ${card.name}.`, "info");
  },

  recalculateCardTransactionsCompetence(cardId) {
    const card = this.state.accounts.find(a => a.id === cardId);
    if (!card || !window.StatementParser) return;

    let updatedCount = 0;
    this.state.transactions.forEach(tx => {
      if (tx.accountId === cardId && (tx.installmentTotal || 1) <= 1) {
        const newComp = window.StatementParser.computeCompetenceMonth(
          tx.transactionDate,
          card,
          tx.competenceMonth
        );
        if (newComp !== tx.competenceMonth) {
          tx.competenceMonth = newComp;
          updatedCount++;
        }
      }
    });

    this.saveState(true);
    this.renderAll();
    const modeLabel = window.StatementParser.getCompetenceModeLabel(card.competenceOffset);
    this.showToast(
      updatedCount > 0
        ? `🫒 ${updatedCount} lançamento(s) de "${card.name}" recalculado(s) para ${modeLabel}!`
        : `🫒 Todos os lançamentos de "${card.name}" já estão alinhados com a regra (${modeLabel}).`,
      "success"
    );
  },

  deleteCardAccount(cardId) {
    const card = this.state.accounts.find(a => a.id === cardId);
    if (!card) return;
    const txCount = this.state.transactions.filter(t => t.accountId === cardId).length;
    const warnMsg = txCount > 0
      ? `A conta "${card.name}" possui ${txCount} lançamento(s). Deseja realmente excluir esta conta de cartão?`
      : `Deseja excluir a conta de cartão "${card.name}"?`;
    if (!confirm(warnMsg)) return;

    this.state.accounts = this.state.accounts.filter(a => a.id !== cardId);
    this.saveState(true);
    this.renderAll();
    this.showToast(`Conta "${card.name}" removida.`, "info");
  },

  // ==========================================================================
  // ABA 6: CATEGORIAS MACRO, SUBCATEGORIAS & REGRAS
  // ==========================================================================
  renderCategoriesTab() {
    const container = document.getElementById("categories-list-container");
    if (!container) return;

    const catSelect = document.getElementById("new-sub-category-id");
    if (catSelect) {
      const prevCat = catSelect.value;
      catSelect.innerHTML = this.state.categories
        .map(c => `<option value="${c.id}">${c.name} (${c.type === "INCOME" ? "Receita" : "Despesa"})</option>`)
        .join("");
      if (prevCat && this.state.categories.some(c => c.id === prevCat)) {
        catSelect.value = prevCat;
      }
    }

    container.innerHTML = this.state.categories
      .map(cat => {
        const subs = this.state.subcategories.filter(s => s.categoryId === cat.id);
        const typeBadge = cat.type === "INCOME"
          ? `<span class="px-1.5 py-0.5 rounded bg-lime-100 text-lime-800 text-[10px] font-bold">Receita</span>`
          : `<span class="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[10px] font-bold">Despesa</span>`;

        return `
          <div class="oli-card rounded-2xl p-5">
            <div class="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-stone-100">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <input
                  type="color"
                  value="${cat.color || "#4d7c0f"}"
                  onchange="App.updateMacroCategory('${cat.id}', 'color', this.value)"
                  class="w-5 h-5 rounded border-0 bg-transparent cursor-pointer shrink-0"
                  title="Alterar cor da categoria macro"
                />
                <input
                  type="text"
                  value="${cat.name}"
                  onchange="App.updateMacroCategory('${cat.id}', 'name', this.value)"
                  class="font-extrabold text-stone-900 text-sm bg-transparent border-b border-transparent hover:border-stone-300 focus:border-lime-600 focus:outline-none py-0.5 min-w-0 flex-1"
                  title="Clique para editar o nome da categoria macro"
                />
                ${typeBadge}
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[11px] text-stone-400 font-semibold">${subs.length} sub</span>
                <button
                  type="button"
                  onclick="App.prefillNewSubcategory('${cat.id}')"
                  class="px-2 py-1 rounded-lg bg-lime-50 hover:bg-lime-100 text-lime-800 text-[11px] font-bold transition"
                  title="Adicionar subcategoria dentro desta categoria macro"
                >
                  + Sub
                </button>
                <button
                  type="button"
                  onclick="App.deleteMacroCategory('${cat.id}')"
                  class="p-1 rounded-lg text-stone-300 hover:text-rose-600 hover:bg-rose-50 transition"
                  title="Excluir categoria macro (somente se não houver subcategorias)"
                >
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
            <div class="space-y-2">
              ${
                subs.length === 0
                  ? `<div class="text-xs text-stone-400 italic py-3 text-center bg-stone-50/70 rounded-xl border border-dashed border-stone-200">Nenhuma subcategoria ainda. Clique em <strong>+ Sub</strong> acima para adicionar.</div>`
                  : subs
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
                      .join("")
              }
            </div>
          </div>
        `;
      })
      .join("");
  },

  handleNewMacroCategory(e) {
    e.preventDefault();
    const nameInput = document.getElementById("new-cat-name");
    const typeSelect = document.getElementById("new-cat-type");
    const colorInput = document.getElementById("new-cat-color");
    const createDefaultSub = document.getElementById("new-cat-create-default-sub");

    const name = (nameInput && nameInput.value || "").trim();
    if (!name) return;

    const alreadyExists = this.state.categories.some(
      c => c.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (alreadyExists) {
      this.showToast(`Já existe uma categoria macro chamada "${name}".`, "error");
      return;
    }

    const newCatId = "cat_" + Date.now();
    const type = (typeSelect && typeSelect.value) || "EXPENSE";
    const color = (colorInput && colorInput.value) || "#4d7c0f";
    const nextOrder = this.state.categories.reduce((max, c) => Math.max(max, Number(c.sortOrder) || 0), 0) + 1;

    this.state.categories.push({
      id: newCatId,
      name,
      type,
      icon: "folder",
      color,
      sortOrder: nextOrder
    });

    if (createDefaultSub && createDefaultSub.checked) {
      const defaultAcc = this.state.accounts.find(a => a.type === "CREDIT_CARD") || this.state.accounts[0] || { id: "cc_bruno" };
      this.state.subcategories.push({
        id: "sub_" + (Date.now() + 1),
        categoryId: newCatId,
        name,
        defaultOwnership: "COLLECTIVE",
        defaultAccountId: defaultAcc.id,
        defaultMeta: 0,
        isFixed: false,
        keywords: []
      });
    }

    if (nameInput) nameInput.value = "";
    this.saveState(true);
    this.renderAll();

    const subCatSelect = document.getElementById("new-sub-category-id");
    if (subCatSelect) subCatSelect.value = newCatId;

    this.showToast(`📁 Categoria macro "${name}" criada!`, "success");
  },

  updateMacroCategory(catId, field, value) {
    const cat = this.state.categories.find(c => c.id === catId);
    if (!cat) return;
    if (field === "name") {
      const clean = (value || "").trim();
      if (!clean) {
        this.renderCategoriesTab();
        return;
      }
      cat.name = clean;
    } else if (field === "color") {
      cat.color = value || "#4d7c0f";
    }
    this.saveState(true);
    this.renderAll();
    this.showToast(`Categoria macro "${cat.name}" atualizada!`, "success");
  },

  deleteMacroCategory(catId) {
    const cat = this.state.categories.find(c => c.id === catId);
    if (!cat) return;
    const childSubs = this.state.subcategories.filter(s => s.categoryId === catId);
    if (childSubs.length > 0) {
      const subIds = new Set(childSubs.map(s => s.id));
      const usedInTxs = this.state.transactions.some(t => subIds.has(t.subcategoryId));
      if (usedInTxs) {
        this.showToast(`Não é possível excluir "${cat.name}" porque existem lançamentos vinculados às suas subcategorias.`, "error");
        return;
      }
      if (!confirm(`"${cat.name}" possui ${childSubs.length} subcategoria(s) sem lançamentos. Deseja excluir a categoria macro e suas subcategorias vazias?`)) {
        return;
      }
      this.state.subcategories = this.state.subcategories.filter(s => s.categoryId !== catId);
    }
    this.state.categories = this.state.categories.filter(c => c.id !== catId);
    this.saveState(true);
    this.renderAll();
    this.showToast(`Categoria macro "${cat.name}" removida (Ctrl+Z para desfazer).`, "info");
  },

  prefillNewSubcategory(catId) {
    const catSelect = document.getElementById("new-sub-category-id");
    const nameInput = document.getElementById("new-sub-name");
    if (catSelect) catSelect.value = catId;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      if (nameInput) nameInput.focus();
    }, 200);
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

    const defaultAcc = this.state.accounts.find(a => a.type === "CREDIT_CARD") || this.state.accounts[0] || { id: "cc_bruno" };
    const newSubId = "sub_" + Date.now();
    this.state.subcategories.push({
      id: newSubId,
      categoryId,
      name,
      defaultOwnership,
      defaultAccountId: defaultAcc.id,
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
        accountId: defaultAcc.id,
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

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeTxNoteModal();
        return;
      }

      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
      const isTyping = (tag === "INPUT" && e.target.type !== "checkbox") || tag === "TEXTAREA" || (e.target && e.target.isContentEditable);

      // Atalho Global Ctrl+Z / Cmd+Z para Desfazer
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        if (!isTyping) {
          e.preventDefault();
          this.undoLastAction();
        }
        return;
      }

      // Tecla Delete quando há itens selecionados
      if (e.key === "Delete" && !isTyping && this.selectedTxIds.length > 0) {
        e.preventDefault();
        this.deleteSelectedTransactions();
      }
    });
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
