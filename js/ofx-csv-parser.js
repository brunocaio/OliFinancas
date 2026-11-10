// ============================================================================
// OLIFINANÇAS 🫒 - MOTOR DE IMPORTAÇÃO DE EXTRATOS (OFX e CSV)
// ============================================================================

window.StatementParser = {
  normalizeText(str) {
    if (!str) return "";
    return str
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim();
  },

  detectInstallments(description) {
    const regex = /(?:PARC(?:ELA)?\s*)?\b(\d{1,2})\s*\/\s*(\d{1,2})\b/i;
    const match = description.match(regex);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      if (current >= 1 && total >= current && total <= 48) {
        return { current, total };
      }
    }
    return { current: 1, total: 1 };
  },

  getInstallmentBaseName(description) {
    return (description || "")
      .replace(/\s*-?\s*(?:PARC(?:ELA)?\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i, "")
      .trim();
  },

  monthToInt(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return 0;
    const [y, m] = ym.split("-").map(Number);
    return y * 12 + m;
  },

  areCorrelatedInstallments(txA, txB) {
    if (!txA || !txB) return false;
    const totalA = Number(txA.installmentTotal) || 1;
    const totalB = Number(txB.installmentTotal) || 1;
    if (totalA <= 1 || totalA !== totalB) return false;
    if (txA.accountId && txB.accountId && txA.accountId !== txB.accountId) return false;

    const baseA = this.normalizeText(this.getInstallmentBaseName(txA.description));
    const baseB = this.normalizeText(this.getInstallmentBaseName(txB.description));
    if (!baseA || baseA !== baseB) return false;

    const curA = Number(txA.installmentCurrent) || 1;
    const curB = Number(txB.installmentCurrent) || 1;
    const startA = this.monthToInt(txA.competenceMonth) - curA;
    const startB = this.monthToInt(txB.competenceMonth) - curB;
    if (startA !== startB) return false;

    const amtDiff = Math.abs(Math.abs(Number(txA.amount)) - Math.abs(Number(txB.amount)));
    return amtDiff <= 0.10;
  },

  findSiblingInstallmentClassification(candidateTx, state) {
    if (!candidateTx || (Number(candidateTx.installmentTotal) || 1) <= 1) return null;
    const existing = (state && state.transactions) || [];
    const fallbackIds = new Set(["sub_parceladas", "sub_outros"]);
    const matches = existing.filter(t => t.type === "EXPENSE" && this.areCorrelatedInstallments(t, candidateTx));
    if (matches.length === 0) return null;
    // Prioriza parcela já recategorizada fora de Parceladas/Outros
    const preferred = matches.find(m => !fallbackIds.has(m.subcategoryId)) || matches[0];
    return {
      subcategoryId: preferred.subcategoryId,
      ownership: preferred.ownership
    };
  },

  normalizeMerchantKey(description) {
    let s = this.normalizeText(description);
    if (!s) return null;
    s = s
      .replace(/^ESTORNO\s+DE\s+/i, "")
      .replace(/\s*-?\s*(?:PARC(?:ELA)?\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i, "")
      .replace(/\s*-\s*NUPAY\b/gi, "")
      .replace(/^(?:IFD|MP|EC|ZP|PB|PAG|FLY)\s*\*?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (s.length < 3) return null;

    // Evita memorizar marketplaces genéricos sem identificação do vendedor
    const genericMarketplaces = new Set([
      "MERCADOLIVRE*MERCADOL",
      "MERCADO*MERCADOLIVRE",
      "MERCADOLIVRE",
      "MERCADO LIVRE",
      "AMAZONMKTPLC",
      "AMAZON MARKETPLACE CC",
      "ALIEXPRESS",
      "SHOPEE"
    ]);
    if (genericMarketplaces.has(s)) return null;
    return s;
  },

  findHistoricalMerchantMatch(description, state, requireExplicitMemory = false) {
    if (!state) return null;
    const key = this.normalizeMerchantKey(description);
    if (!key) return null;

    const validSubIds = new Set((state.subcategories || []).map(s => s.id));
    const memory = state.merchantMemory || {};
    if (memory[key] && validSubIds.has(memory[key].subcategoryId)) {
      return {
        subcategoryId: memory[key].subcategoryId,
        ownership: memory[key].ownership || null,
        source: "MEMORY"
      };
    }

    if (requireExplicitMemory) return null;

    const fallbackIds = new Set(["sub_outros", "sub_parceladas", "sub_pag_fatura"]);
    const txs = state.transactions || [];
    for (let i = txs.length - 1; i >= 0; i--) {
      const t = txs[i];
      if (!t || t.type === "TRANSFER" || fallbackIds.has(t.subcategoryId)) continue;
      if (!validSubIds.has(t.subcategoryId)) continue;
      if (this.normalizeMerchantKey(t.description) === key) {
        return {
          subcategoryId: t.subcategoryId,
          ownership: t.ownership || null,
          source: "HISTORY"
        };
      }
    }
    return null;
  },

  findBestKeywordMatch(normDesc, subcategories) {
    let bestSub = null;
    let bestLen = 0;
    for (const sub of subcategories || []) {
      if (!sub.keywords || sub.keywords.length === 0) continue;
      for (const kw of sub.keywords) {
        const normKw = this.normalizeText(kw);
        if (!normKw || normKw.length <= bestLen) continue;
        if (normDesc.includes(normKw)) {
          bestSub = sub;
          bestLen = normKw.length;
        }
      }
    }
    return bestSub;
  },

  detectSubcategory(description, state) {
    const normDesc = this.normalizeText(description);
    if (!normDesc || !state || !state.subcategories) return null;

    const explicitMem = this.findHistoricalMerchantMatch(description, state, true);
    if (explicitMem) {
      const found = state.subcategories.find(s => s.id === explicitMem.subcategoryId);
      if (found) return found;
    }

    const kwMatch = this.findBestKeywordMatch(normDesc, state.subcategories);
    if (kwMatch) return kwMatch;

    const histMatch = this.findHistoricalMerchantMatch(description, state, false);
    if (histMatch) {
      return state.subcategories.find(s => s.id === histMatch.subcategoryId) || null;
    }
    return null;
  },

  shiftYearMonth(year, month, deltaMonths) {
    const d = new Date(year, month - 1 + deltaMonths, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  },

  // Equaciona a regra de virada do cartão:
  // Cada compra em (y, m, day) pertence à fatura que fecha/vira no dia `closingDay`:
  // - Se day < closingDay: a fatura vira no próprio mês `m` (invoiceClosingDelta = 0)
  // - Se day >= closingDay: a fatura vira no mês seguinte `m + 1` (invoiceClosingDelta = 1)
  // Em seguida, aplica-se a escolha de competência da conta do cartão sobre o Mês da Virada:
  // - competenceOffset = 0  ("CLOSING_MONTH")  -> Competência no Mês da Virada
  // - competenceOffset = -1 ("PREVIOUS_MONTH") -> Competência no Mês Anterior à Virada
  // - competenceOffset = 1  ("NEXT_MONTH")     -> Competência no Mês Seguinte à Virada
  computeCompetenceMonth(txDate, account, fallbackMonth = "2026-11") {
    if (!txDate || !/^\d{4}-\d{2}-\d{2}/.test(txDate)) {
      return fallbackMonth;
    }
    const y = parseInt(txDate.substring(0, 4), 10);
    const m = parseInt(txDate.substring(5, 7), 10);
    const day = parseInt(txDate.substring(8, 10), 10);

    if (!account || account.type !== "CREDIT_CARD") {
      return `${y}-${String(m).padStart(2, "0")}`;
    }

    const closingDay = Number(account.closingDay) || 9;
    const offset = typeof account.competenceOffset === "number" ? account.competenceOffset : 0;

    const invoiceClosingDelta = day < closingDay ? 0 : 1;
    return this.shiftYearMonth(y, m, invoiceClosingDelta + offset);
  },

  getCompetenceModeLabel(offset) {
    const num = Number(offset) || 0;
    if (num === -1) return "Mês anterior à virada";
    if (num === 1) return "Mês seguinte à virada";
    return "Mês da virada";
  },

  // Retorna o intervalo exato de compras que compõe a fatura de uma determinada competência (ex: "2026-11")
  getCyclePreviewForMonth(account, targetCompetenceMonth = "2026-11") {
    if (!account || account.type !== "CREDIT_CARD") {
      return "Compras no débito/espécie dentro do próprio mês.";
    }
    const closingDay = Math.min(28, Math.max(1, Number(account.closingDay) || 9));
    const offset = typeof account.competenceOffset === "number" ? account.competenceOffset : 0;
    const [compY, compM] = targetCompetenceMonth.split("-").map(Number);

    // Mês em que a fatura vira: M_virada = Competência - offset
    const closingYM = this.shiftYearMonth(compY, compM, -offset);
    const [closeY, closeM] = closingYM.split("-").map(Number);
    // Mês em que a fatura abriu: M_virada - 1
    const openYM = this.shiftYearMonth(closeY, closeM, -1);
    const [, openM] = openYM.split("-").map(Number);

    const monthShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const pad = (n) => String(n).padStart(2, "0");
    const endDay = closingDay - 1;
    const rangeStr = endDay >= 1
      ? `${pad(closingDay)}/${monthShort[openM - 1]} a ${pad(endDay)}/${monthShort[closeM - 1]}`
      : `01/${monthShort[openM - 1]} a 30/${monthShort[openM - 1]}`;
    const closeDateStr = `${pad(closingDay)}/${monthShort[closeM - 1]}`;

    return {
      rangeStr,
      closeDateStr,
      modeLabel: this.getCompetenceModeLabel(offset),
      fullText: `Fatura que vira em ${closeDateStr} (compras de ${rangeStr}) → Competência ${monthShort[compM - 1]}/${compY} (${this.getCompetenceModeLabel(offset)})`
    };
  },

  // Quando o arquivo OFX/CSV representa uma única fatura fechada/mensal (intervalo de até 40 dias),
  // retorna a competência dessa fatura com base na data de fechamento (maior data do extrato).
  inferInvoiceMonthFromDates(isoDates, account, fallbackMonth = "2026-11") {
    if (!account || account.type !== "CREDIT_CARD" || !Array.isArray(isoDates) || isoDates.length === 0) {
      return null;
    }
    const valid = isoDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (valid.length === 0) return null;
    const minD = new Date(valid[0] + "T12:00:00");
    const maxD = new Date(valid[valid.length - 1] + "T12:00:00");
    const spanDays = Math.round((maxD - minD) / (1000 * 60 * 60 * 24));
    if (spanDays > 45) {
      return null;
    }
    return this.computeCompetenceMonth(valid[valid.length - 1], account, fallbackMonth);
  },

  isLikelyRefundDescription(description) {
    const norm = this.normalizeText(description);
    return (
      norm.startsWith("ESTORNO") ||
      norm.includes("ESTORNO DE") ||
      norm.includes("REEMBOLSO") ||
      norm.includes("CASHBACK")
    );
  },

  describeCardCycleRule(account, activeMonth = "2026-11") {
    if (!account || account.type !== "CREDIT_CARD") {
      return "Débito / Espécie: competência no próprio mês da data do gasto.";
    }
    const preview = this.getCyclePreviewForMonth(account, activeMonth);
    const vCards = Array.isArray(account.virtualCards) && account.virtualCards.length > 0
      ? ` • Cartões na mesma conta: ${account.virtualCards.join(", ")}`
      : "";
    return `${preview.fullText}${vCards}`;
  },

  autoClassify(description, amount, isCreditCard, subcategories, projections, competenceMonth, ownerId = "bruno", state = null) {
    const normDesc = this.normalizeText(description);

    const faturaKeywords = ["PAGAMENTO DE FATURA", "PAGTO FATURA", "PAGAMENTO FATURA", "PAGAMENTO RECEBIDO", "FATURA CARTAO", "DEBITO AUTOMATICO FATURA"];
    for (const kw of faturaKeywords) {
      if (normDesc.includes(kw)) {
        return {
          type: "TRANSFER",
          subcategoryId: "sub_pag_fatura",
          ownership: "COLLECTIVE",
          projectionId: null,
          confidence: "HIGH",
          matchedBy: "TRANSFER"
        };
      }
    }

    let matchedSub = null;
    let matchedBy = "FALLBACK";
    let memoryOwnership = null;

    // 1. Memória explícita de recategorizações anteriores desse estabelecimento
    const explicitMem = state ? this.findHistoricalMerchantMatch(description, state, true) : null;
    if (explicitMem) {
      matchedSub = subcategories.find(s => s.id === explicitMem.subcategoryId) || null;
      if (matchedSub) {
        matchedBy = "MEMORY";
        memoryOwnership = explicitMem.ownership;
      }
    }

    // 2. Regras por palavras-chave cadastradas (prioriza palavra-chave mais longa/específica)
    if (!matchedSub) {
      const kwSub = this.findBestKeywordMatch(normDesc, subcategories);
      if (kwSub) {
        matchedSub = kwSub;
        matchedBy = "KEYWORD";
      }
    }

    // 3. Memória automática baseada em transações históricas desse mesmo estabelecimento
    if (!matchedSub && state) {
      const histMatch = this.findHistoricalMerchantMatch(description, state, false);
      if (histMatch) {
        matchedSub = subcategories.find(s => s.id === histMatch.subcategoryId) || null;
        if (matchedSub) {
          matchedBy = "HISTORY";
          memoryOwnership = histMatch.ownership;
        }
      }
    }

    const inst = this.detectInstallments(description);
    if (!matchedSub && inst.total > 1) {
      matchedSub = subcategories.find(s => s.id === "sub_parceladas") || null;
    }

    if (!matchedSub) {
      matchedSub = subcategories.find(s => s.id === "sub_outros") || subcategories[0];
    }

    const monthProjections = projections.filter(p => p.monthYear === competenceMonth);
    const matchedProj = monthProjections.find(p => p.subcategoryId === matchedSub.id) || null;

    let txType = "EXPENSE";
    if (matchedSub.categoryId === "cat_receitas") {
      txType = "INCOME";
    } else if (matchedSub.categoryId === "cat_transferencia") {
      txType = "TRANSFER";
    }

    let resolvedOwnership = memoryOwnership || (matchedProj ? matchedProj.ownership : (matchedSub.defaultOwnership || "COLLECTIVE"));
    if (resolvedOwnership !== "COLLECTIVE") {
      resolvedOwnership = ownerId === "nubia" ? "INDIVIDUAL_NUBIA" : "INDIVIDUAL_BRUNO";
    }

    return {
      type: txType,
      subcategoryId: matchedSub.id,
      ownership: resolvedOwnership,
      projectionId: matchedProj ? matchedProj.id : null,
      confidence: matchedSub.id !== "sub_outros" ? "HIGH" : "LOW",
      matchedBy
    };
  },

  parseOFX(content, account, competenceMonth, state, competenceMode = "SMART_INVOICE") {
    const blocks = content.split(/<STMTTRN>/i).slice(1);
    const isCreditCard = account.type === "CREDIT_CARD" || /<CREDITCARDMSGSRSV1>/i.test(content);
    const rawItems = [];

    const extractTag = (block, tag) => {
      const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
      const m = block.match(regex);
      return m ? m[1].trim() : "";
    };

    for (const rawBlock of blocks) {
      const block = rawBlock.split(/<\/STMTTRN>/i)[0];
      const trnType = extractTag(block, "TRNTYPE").toUpperCase();
      const dtPosted = extractTag(block, "DTPOSTED");
      const trnAmtRaw = extractTag(block, "TRNAMT");
      const fitId = extractTag(block, "FITID");
      const memo = extractTag(block, "MEMO");
      const name = extractTag(block, "NAME");

      let description = memo || name || "Lançamento Importado";
      if (name && memo && !memo.toUpperCase().includes(name.toUpperCase())) {
        description = `${name} - ${memo}`;
      }

      let txDate = `${competenceMonth}-01`;
      if (dtPosted && dtPosted.length >= 8) {
        const y = dtPosted.substring(0, 4);
        const m = dtPosted.substring(4, 6);
        const d = dtPosted.substring(6, 8);
        txDate = `${y}-${m}-${d}`;
      }

      const cleanAmt = trnAmtRaw.replace(",", ".");
      const signedVal = parseFloat(cleanAmt);
      if (isNaN(signedVal) || signedVal === 0) continue;

      rawItems.push({ trnType, txDate, signedVal, fitId, description });
    }

    // Determina a competência da fatura se modo for SMART_INVOICE ou mês explícito (YYYY-MM)
    let forcedInvoiceMonth = null;
    if (/^\d{4}-\d{2}$/.test(competenceMode)) {
      forcedInvoiceMonth = competenceMode;
    } else if (competenceMode === "SMART_INVOICE" && isCreditCard) {
      forcedInvoiceMonth = this.inferInvoiceMonthFromDates(
        rawItems.map(r => r.txDate),
        account,
        competenceMonth
      );
    }

    const results = [];
    for (const raw of rawItems) {
      const { trnType, txDate, signedVal, fitId, description } = raw;
      const absAmount = Math.abs(signedVal);
      const inst = this.detectInstallments(description);
      const itemCycleMonth = this.computeCompetenceMonth(txDate, account, competenceMonth);
      const resolvedCompetence = forcedInvoiceMonth || itemCycleMonth;
      const classification = this.autoClassify(
        description,
        signedVal,
        isCreditCard,
        state.subcategories,
        state.projections,
        resolvedCompetence,
        account.ownerId || "bruno",
        state
      );

      let finalType = classification.type;
      let isInvoiceCredit = false;
      let finalAmount = absAmount;

      if (finalType !== "TRANSFER") {
        if (isCreditCard) {
          // No OFX de cartão de crédito: débitos/compras têm TRNAMT negativo (< 0),
          // enquanto estornos/créditos na fatura têm TRNAMT positivo (> 0).
          // Confiar estritamente no sinal do arquivo bancário evita falsos positivos em nomes como "Assinatura ... desconto Nubank".
          if (signedVal > 0) {
            isInvoiceCredit = true;
            finalType = "EXPENSE";
            finalAmount = -absAmount;
          } else {
            finalType = "EXPENSE";
            finalAmount = absAmount;
          }
        } else {
          if (signedVal > 0) {
            finalType = "INCOME";
          } else {
            finalType = "EXPENSE";
          }
        }
      }

      const importHash = fitId
        ? `ofx_${account.id}_${fitId}`
        : `ofx_${account.id}_${txDate}_${absAmount.toFixed(2)}_${this.normalizeText(description).slice(0, 20)}`;

      const alreadyExists = state.transactions.some(t => t.importHash === importHash);

      const candidateForSibling = {
        description,
        accountId: account.id,
        competenceMonth: resolvedCompetence,
        installmentCurrent: inst.current,
        installmentTotal: inst.total,
        amount: finalAmount
      };
      const siblingMatch = finalType === "EXPENSE"
        ? this.findSiblingInstallmentClassification(candidateForSibling, state)
        : null;

      results.push({
        tempId: "imp_" + Math.random().toString(36).substring(2, 9),
        selected: !alreadyExists && finalType !== "TRANSFER",
        alreadyExists,
        transactionDate: txDate,
        competenceMonth: resolvedCompetence,
        cycleCompetenceMonth: itemCycleMonth,
        description,
        amount: finalAmount,
        isInvoiceCredit,
        type: finalType,
        accountId: account.id,
        paidByUserId: account.ownerId || "bruno",
        ownership: siblingMatch ? siblingMatch.ownership : classification.ownership,
        subcategoryId: siblingMatch ? siblingMatch.subcategoryId : classification.subcategoryId,
        projectionId: classification.projectionId,
        installmentCurrent: inst.current,
        installmentTotal: inst.total,
        importHash,
        confidence: siblingMatch ? "HIGH" : classification.confidence,
        memoryMatched: Boolean(siblingMatch || classification.matchedBy === "MEMORY" || classification.matchedBy === "HISTORY")
      });
    }

    return results;
  },

  parseMoneyValue(raw) {
    if (!raw) return NaN;
    let s = raw.toString().replace(/[R$\s"]/g, "").trim();
    if (!s) return NaN;

    const hasComma = s.includes(",");
    const hasDot = s.includes(".");

    if (hasComma && hasDot) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (hasComma) {
      s = s.replace(",", ".");
    }
    return parseFloat(s);
  },

  parseDateString(raw, fallbackMonth) {
    if (!raw) return `${fallbackMonth}-01`;
    const s = raw.toString().replace(/["']/g, "").trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.substring(0, 10);
    }
    const brMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (brMatch) {
      const d = brMatch[1].padStart(2, "0");
      const m = brMatch[2].padStart(2, "0");
      let y = brMatch[3] || fallbackMonth.substring(0, 4);
      if (y.length === 2) y = "20" + y;
      return `${y}-${m}-${d}`;
    }
    return `${fallbackMonth}-01`;
  },

  parseCSV(content, account, competenceMonth, state, competenceMode = "SMART_INVOICE") {
    const lines = content
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length < 2) return [];

    const isCreditCard = account.type === "CREDIT_CARD";
    const delimiter = lines[0].includes(";") ? ";" : ",";

    const splitCSVLine = (line) => {
      const cols = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === delimiter && !inQuotes) {
          cols.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      cols.push(cur.trim());
      return cols;
    };

    const headers = splitCSVLine(lines[0]).map(h => this.normalizeText(h));
    let dateIdx = headers.findIndex(h => h.includes("DATA") || h.includes("DATE"));
    let descIdx = headers.findIndex(h => h.includes("TITLE") || h.includes("DESC") || h.includes("LANCAMENTO") || h.includes("HISTORICO") || h.includes("ESTABELECIMENTO"));
    let amtIdx = headers.findIndex(h => h.includes("AMOUNT") || h.includes("VALOR") || h.includes("VALUE"));

    if (dateIdx === -1) dateIdx = 0;
    if (amtIdx === -1) amtIdx = headers.length - 1;
    if (descIdx === -1) descIdx = headers.length >= 3 ? headers.length - 2 : 1;

    const parsedRows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i]);
      if (cols.length < 2) continue;

      const rawDate = cols[dateIdx] || cols[0];
      const rawDesc = (cols[descIdx] || cols[1] || "Item CSV").replace(/^"|"$/g, "");
      const rawAmt = cols[amtIdx] !== undefined ? cols[amtIdx] : cols[cols.length - 1];

      const signedVal = this.parseMoneyValue(rawAmt);
      if (isNaN(signedVal) || signedVal === 0) continue;

      const txDate = this.parseDateString(rawDate, competenceMonth);
      parsedRows.push({ txDate, rawDesc, signedVal });
    }

    // Detecta convenção de sinal no CSV do cartão: Nubank CSV usa positivos para compras e negativos para estornos
    const posCount = parsedRows.filter(r => r.signedVal > 0).length;
    const negCount = parsedRows.filter(r => r.signedVal < 0).length;
    const purchasesArePositive = posCount >= negCount;

    let forcedInvoiceMonth = null;
    if (/^\d{4}-\d{2}$/.test(competenceMode)) {
      forcedInvoiceMonth = competenceMode;
    } else if (competenceMode === "SMART_INVOICE" && isCreditCard) {
      forcedInvoiceMonth = this.inferInvoiceMonthFromDates(
        parsedRows.map(r => r.txDate),
        account,
        competenceMonth
      );
    }

    const results = [];
    for (const row of parsedRows) {
      const { txDate, rawDesc, signedVal } = row;
      const absAmount = Math.abs(signedVal);
      const inst = this.detectInstallments(rawDesc);
      const itemCycleMonth = this.computeCompetenceMonth(txDate, account, competenceMonth);
      const resolvedCompetence = forcedInvoiceMonth || itemCycleMonth;
      const classification = this.autoClassify(
        rawDesc,
        signedVal,
        isCreditCard,
        state.subcategories,
        state.projections,
        resolvedCompetence,
        account.ownerId || "bruno",
        state
      );

      let finalType = classification.type;
      let isInvoiceCredit = false;
      let finalAmount = absAmount;

      if (finalType !== "TRANSFER") {
        if (isCreditCard) {
          const isOppositeSign = purchasesArePositive ? signedVal < 0 : signedVal > 0;
          if (isOppositeSign) {
            isInvoiceCredit = true;
            finalType = "EXPENSE";
            finalAmount = -absAmount;
          } else {
            finalType = "EXPENSE";
            finalAmount = absAmount;
          }
        } else {
          if (signedVal > 0) {
            finalType = "INCOME";
          } else {
            finalType = "EXPENSE";
          }
        }
      }

      const importHash = `csv_${account.id}_${txDate}_${absAmount.toFixed(2)}_${this.normalizeText(rawDesc).slice(0, 24)}`;
      const alreadyExists = state.transactions.some(t => t.importHash === importHash);

      const candidateForSibling = {
        description: rawDesc,
        accountId: account.id,
        competenceMonth: resolvedCompetence,
        installmentCurrent: inst.current,
        installmentTotal: inst.total,
        amount: finalAmount
      };
      const siblingMatch = finalType === "EXPENSE"
        ? this.findSiblingInstallmentClassification(candidateForSibling, state)
        : null;

      results.push({
        tempId: "imp_" + Math.random().toString(36).substring(2, 9),
        selected: !alreadyExists && finalType !== "TRANSFER",
        alreadyExists,
        transactionDate: txDate,
        competenceMonth: resolvedCompetence,
        cycleCompetenceMonth: itemCycleMonth,
        description: rawDesc,
        amount: finalAmount,
        isInvoiceCredit,
        type: finalType,
        accountId: account.id,
        paidByUserId: account.ownerId || "bruno",
        ownership: siblingMatch ? siblingMatch.ownership : classification.ownership,
        subcategoryId: siblingMatch ? siblingMatch.subcategoryId : classification.subcategoryId,
        projectionId: classification.projectionId,
        installmentCurrent: inst.current,
        installmentTotal: inst.total,
        importHash,
        confidence: siblingMatch ? "HIGH" : classification.confidence,
        memoryMatched: Boolean(siblingMatch || classification.matchedBy === "MEMORY" || classification.matchedBy === "HISTORY")
      });
    }

    return results;
  },

  getSampleNubankOFX() {
    return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<CCSTMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261004120000[-3:BRT]
<TRNAMT>-245.80
<FITID>OLI_DEMO_001
<MEMO>Supermercado Guanabara - Feira & Suprimentos
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261007193000[-3:BRT]
<TRNAMT>-68.90
<FITID>OLI_DEMO_002
<MEMO>IFD*Ifood Jantar
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261103101500[-3:BRT]
<TRNAMT>-180.00
<FITID>OLI_DEMO_003
<MEMO>Posto Ipiranga Gasolina (Antes do dia 9 -> Vai p/ Dezembro)
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261106150000[-3:BRT]
<TRNAMT>-115.00
<FITID>OLI_DEMO_004
<MEMO>Petz - Racao Chico (Antes do dia 9 -> Vai p/ Dezembro)
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261107090000[-3:BRT]
<TRNAMT>-34.90
<FITID>OLI_DEMO_005
<MEMO>Uber *Viagem Trabalho (Antes do dia 9 -> Vai p/ Dezembro)
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261108080000[-3:BRT]
<TRNAMT>6559.00
<FITID>OLI_DEMO_006
<MEMO>Pagamento de Fatura
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</CCSTMTTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>`;
  }
};
