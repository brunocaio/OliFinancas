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

  detectInstallments(description, isCreditCard = true) {
    const desc = description || "";
    // Nunca confundir datas de Pix/extrato (ex: "08/11 13:06" ou "Pix - Enviado - 08/11") com parcelas
    if (/\b\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\b/.test(desc) || /\bPIX\b/i.test(desc)) {
      const explicitParc = desc.match(/PARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
      if (!explicitParc) return { current: 1, total: 1 };
      const c = parseInt(explicitParc[1], 10);
      const t = parseInt(explicitParc[2], 10);
      return (c >= 1 && t >= c && t <= 48) ? { current: c, total: t } : { current: 1, total: 1 };
    }
    if (!isCreditCard) {
      const explicitParc = desc.match(/PARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
      if (!explicitParc) return { current: 1, total: 1 };
    }
    const regex = /(?:PARC(?:ELA)?\s*)?\b(\d{1,2})\s*\/\s*(\d{1,2})\b/i;
    const match = desc.match(regex);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      if (current >= 1 && total >= current && total <= 48) {
        return { current, total };
      }
    }
    return { current: 1, total: 1 };
  },

  extractTransferPixDetails(description, finalType = "EXPENSE", account = null) {
    const raw = (description || "").trim();
    const norm = this.normalizeText(raw);
    const isPixOrTransfer =
      finalType === "TRANSFER" ||
      /\b(PIX|TED|DOC|TRANSF|TRANSFERENCIA|RESGATE|APLICACAO|RESGATE RDB|APLICACAO RDB)\b/i.test(norm);

    if (!isPixOrTransfer) {
      return {
        isPixOrTransfer: false,
        direction: null,
        counterparty: "",
        originLabel: "",
        destinationLabel: ""
      };
    }

    let direction = "SENT";
    if (/\b(RECEBID[OA]|CREDITO EM CONTA|RESGATE)\b/i.test(norm) || finalType === "INCOME") {
      direction = "RECEIVED";
    } else if (/\b(ENVIAD[OA]|APLICACAO)\b/i.test(norm)) {
      direction = "SENT";
    }

    let counterparty = "";
    let bankDetails = "";

    // Padrão 1 (Nubank Conta): "Transferência enviada pelo Pix - NOME - CPF/CNPJ - BANCO (COD) Agência: AG Conta: CC"
    const nubankMatch = raw.match(/Transfer[êe]ncia\s+(?:enviada|recebida)\s+pelo\s+Pix\s*-\s*(.+)$/i);
    if (nubankMatch) {
      const rest = nubankMatch[1]
        .replace(/\s*\(Transfer[êe]ncia\s+(?:enviada|recebida)\)\s*$/i, "")
        .trim();
      const parts = rest.split(/\s+-\s+/);
      counterparty = (parts[0] || "").trim();

      // Extrai Banco, Agência e Conta quando presentes (geralmente após CPF/CNPJ mascarado)
      const bankChunkMatch = rest.match(/([A-Za-z0-9À-ÿ.\s/&-]+\(\d{3,4}\).*)$/i);
      if (bankChunkMatch) {
        bankDetails = bankChunkMatch[1]
          .replace(/Ag[êe]ncia:\s*/i, "Ag. ")
          .replace(/\s+Conta:\s*/i, " • Cc. ")
          .replace(/\s+/g, " ")
          .trim();
      } else if (parts.length >= 3) {
        bankDetails = parts.slice(2).join(" - ").trim();
      }
    }

    // Padrão 2 (Banco do Brasil OFX): "Pix - Enviado - 08/11 13:06 [CPF/CNPJ opcional] NOME"
    if (!counterparty) {
      const bbMatch = raw.match(/Pix\s*-\s*(?:Enviado|Recebido)\s*-\s*(?:\d{2}\/\d{2}\s+\d{2}:\d{2}\s+)?(?:\d{11,14}\s+)?(.+)$/i);
      if (bbMatch) {
        counterparty = bbMatch[1].trim();
      }
    }

    // Padrão 3 (Itaú / Genérico): "PIX TRANSF NOME", "PIX TRANSF NUBIA F08/11", "PIX QRS NOME", "TED NOME"
    if (!counterparty) {
      const genMatch = raw.match(/(?:PIX\s+(?:TRANSF|QRS|ENVIADO|RECEBIDO)|TED|DOC)\s*[:-]?\s*(.+)$/i);
      if (genMatch) {
        counterparty = genMatch[1].replace(/\s+[FC]?\d{2}\/\d{2}$/i, "").trim();
      }
    }

    const accName = (account && account.name) || "Conta do Extrato";
    const counterpartAccountStr = bankDetails || (counterparty ? `Não informado (${counterparty})` : "");

    let originLabel = "";
    let destinationLabel = "";
    if (direction === "SENT") {
      originLabel = accName;
      destinationLabel = bankDetails || (finalType === "TRANSFER" && counterparty ? `Conta de ${counterparty} (Banco não informado no OFX)` : "");
    } else {
      originLabel = bankDetails || (counterparty ? `Origem: ${counterparty}` : "");
      destinationLabel = accName;
    }

    return {
      isPixOrTransfer: true,
      direction,
      counterparty,
      bankDetails,
      originLabel,
      destinationLabel
    };
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
    const notedSibling = matches.find(m => m.notes && String(m.notes).trim().length > 0);
    return {
      subcategoryId: preferred.subcategoryId,
      ownership: preferred.ownership,
      notes: notedSibling ? String(notedSibling.notes).trim() : ""
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

  getTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  extractOFXDateRange(content) {
    if (!content) return { dtStart: null, dtEnd: null };
    const parseTag = (tag) => {
      const m = content.match(new RegExp(`<${tag}>(\\d{8})`, "i"));
      if (!m) return null;
      const raw = m[1];
      return `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
    };
    return {
      dtStart: parseTag("DTSTART"),
      dtEnd: parseTag("DTEND")
    };
  },

  getAccountExpectedPeriod(account, targetCompetenceMonth = "2026-11") {
    const [compY, compM] = (targetCompetenceMonth || "2026-11").split("-").map(Number);
    const pad = (n) => String(n).padStart(2, "0");

    if (!account || account.type !== "CREDIT_CARD") {
      const lastDay = new Date(compY, compM, 0).getDate();
      return {
        periodStart: `${compY}-${pad(compM)}-01`,
        periodEnd: `${compY}-${pad(compM)}-${pad(lastDay)}`,
        closeDate: `${compY}-${pad(compM)}-${pad(lastDay)}`
      };
    }

    const closingDay = Math.min(28, Math.max(1, Number(account.closingDay) || 9));
    const offset = typeof account.competenceOffset === "number" ? account.competenceOffset : 0;
    const closingYM = this.shiftYearMonth(compY, compM, -offset);
    const [closeY, closeM] = closingYM.split("-").map(Number);
    const openYM = this.shiftYearMonth(closeY, closeM, -1);

    return {
      periodStart: `${openYM}-${pad(closingDay)}`,
      periodEnd: `${closingYM}-${pad(closingDay)}`,
      closeDate: `${closingYM}-${pad(closingDay)}`
    };
  },

  evaluateStatementCoverage(account, competenceMonth, cutoffDate, status = "PARTIAL") {
    const expected = this.getAccountExpectedPeriod(account, competenceMonth);
    const startMs = new Date(expected.periodStart + "T12:00:00").getTime();
    const endMs = new Date(expected.periodEnd + "T12:00:00").getTime();
    const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);

    if (status === "COMPLETE") {
      return {
        expected,
        totalDays,
        coveredDays: totalDays,
        missingDays: 0,
        pct: 100
      };
    }

    if (!cutoffDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
      return {
        expected,
        totalDays,
        coveredDays: 0,
        missingDays: totalDays,
        pct: 0
      };
    }

    const cutMs = new Date(cutoffDate + "T12:00:00").getTime();
    const rawCovered = Math.round((cutMs - startMs) / 86400000) + 1;
    const coveredDays = Math.min(totalDays, Math.max(1, rawCovered));
    const missingDays = Math.max(0, totalDays - coveredDays);
    const pct = Math.min(99, Math.max(5, Math.round((coveredDays / totalDays) * 100)));

    return {
      expected,
      totalDays,
      coveredDays,
      missingDays,
      pct
    };
  },

  inferStatementImportStatus(account, competenceMonth, cutoffDate = null, todayISO = null) {
    const today = todayISO || this.getTodayISO();
    const expected = this.getAccountExpectedPeriod(account, competenceMonth);

    // Antes da data de fechamento (fim do mês para conta corrente ou virada do cartão), o extrato é parcial
    if (today < expected.closeDate) {
      return "PARTIAL";
    }

    // Para conta corrente em mês passado ou recém-encerrado, se a data de corte for bem anterior ao último dia do mês, marca como parcial
    if ((!account || account.type !== "CREDIT_CARD") && cutoffDate && /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
      const cutMs = new Date(cutoffDate + "T12:00:00").getTime();
      const closeMs = new Date(expected.closeDate + "T12:00:00").getTime();
      const gapDays = Math.round((closeMs - cutMs) / 86400000);
      if (gapDays >= 3) {
        return "PARTIAL";
      }
    }

    return "COMPLETE";
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
    if (isCreditCard) {
      faturaKeywords.push("PAGAMENTO EFETUADO", "PAGTO EFETUADO");
    }
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

    const ownTransferKeywords = [
      "MESMA TITULARIDADE",
      "ENTRE CONTAS",
      "TRANSFERENCIA PROPRIA",
      "PIX PROPRIO",
      "TRANSF ENTRE CONTAS",
      "DINHEIRO GUARDADO",
      "RESGATE RDB",
      "APLICACAO RDB"
    ];
    const ownerSelfTokens = ownerId === "nubia"
      ? ["NUBIA ", "NUBIA F"]
      : ["BRUNO CAIO", "BRUNO CAIO DE OLIVEIRA", "BRUNO C"];
    const looksLikeSelfTransfer =
      ownTransferKeywords.some(kw => normDesc.includes(kw)) ||
      (!isCreditCard &&
        (ownerSelfTokens.some(tok => normDesc.includes(tok)) || normDesc.includes("PIX TRANSF BRUNO") || normDesc.includes("PIX TRANSF NUBIA")) &&
        (normDesc.includes("PIX") || normDesc.includes("TRANSF") || normDesc.includes("TED") || normDesc.includes("DOC")));
    if (looksLikeSelfTransfer) {
      return {
        type: "TRANSFER",
        subcategoryId: "sub_transf_propria",
        ownership: ownerId === "nubia" ? "INDIVIDUAL_NUBIA" : "INDIVIDUAL_BRUNO",
        projectionId: null,
        confidence: "HIGH",
        matchedBy: "TRANSFER"
      };
    }

    let matchedSub = null;
    let matchedBy = "FALLBACK";
    let memoryOwnership = null;

    const isCheckingInflow = !isCreditCard && Number(amount) > 0;
    const isSubAllowedForDirection = (sub) => {
      if (!sub) return false;
      if (isCheckingInflow) {
        return sub.categoryId === "cat_receitas" || sub.categoryId === "cat_transferencia";
      }
      return true;
    };

    // 1. Memória explícita de recategorizações anteriores desse estabelecimento
    const explicitMem = state ? this.findHistoricalMerchantMatch(description, state, true) : null;
    if (explicitMem) {
      const candidate = subcategories.find(s => s.id === explicitMem.subcategoryId) || null;
      if (isSubAllowedForDirection(candidate)) {
        matchedSub = candidate;
        matchedBy = "MEMORY";
        memoryOwnership = explicitMem.ownership;
      }
    }

    // 2. Regras por palavras-chave cadastradas (prioriza palavra-chave mais longa/específica)
    if (!matchedSub) {
      const pool = isCheckingInflow
        ? (subcategories || []).filter(s => s.categoryId === "cat_receitas" || s.categoryId === "cat_transferencia")
        : subcategories;
      const kwSub = this.findBestKeywordMatch(normDesc, pool);
      if (kwSub) {
        matchedSub = kwSub;
        matchedBy = "KEYWORD";
      }
    }

    // Fallbacks específicos para conta corrente (ex: financiamento imobiliário abreviado "FINANC IMOB...")
    if (!matchedSub && !isCreditCard && Number(amount) < 0 && /\bFINANC(?:\.|IAMENTO)?\s+IMOB/i.test(normDesc)) {
      matchedSub = (subcategories || []).find(s => s.id === "sub_financiamento_imob") || null;
      if (matchedSub) matchedBy = "KEYWORD";
    }

    // 3. Memória automática baseada em transações históricas desse mesmo estabelecimento
    if (!matchedSub && state) {
      const histMatch = this.findHistoricalMerchantMatch(description, state, false);
      if (histMatch) {
        const candidate = subcategories.find(s => s.id === histMatch.subcategoryId) || null;
        if (isSubAllowedForDirection(candidate)) {
          matchedSub = candidate;
          matchedBy = "HISTORY";
          memoryOwnership = histMatch.ownership;
        }
      }
    }

    const inst = this.detectInstallments(description, isCreditCard);
    if (!matchedSub && inst.total > 1) {
      matchedSub = subcategories.find(s => s.id === "sub_parceladas") || null;
    }

    if (!matchedSub) {
      if (isCheckingInflow) {
        matchedSub = subcategories.find(s => s.id === "sub_rt_rendimentos") ||
          subcategories.find(s => s.categoryId === "cat_receitas") ||
          subcategories[0];
      } else {
        matchedSub = subcategories.find(s => s.id === "sub_outros") || subcategories[0];
      }
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
      const inst = this.detectInstallments(description, isCreditCard);
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
      const pixInfo = this.extractTransferPixDetails(description, finalType, account);

      results.push({
        tempId: "imp_" + Math.random().toString(36).substring(2, 9),
        selected: !alreadyExists && finalType !== "TRANSFER",
        alreadyExists,
        transactionDate: txDate,
        competenceMonth: resolvedCompetence,
        cycleCompetenceMonth: itemCycleMonth,
        description,
        notes: (siblingMatch && siblingMatch.notes) || "",
        counterparty: pixInfo.counterparty || "",
        originLabel: pixInfo.originLabel || "",
        destinationLabel: pixInfo.destinationLabel || "",
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
      const inst = this.detectInstallments(rawDesc, isCreditCard);
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
      const pixInfo = this.extractTransferPixDetails(rawDesc, finalType, account);

      results.push({
        tempId: "imp_" + Math.random().toString(36).substring(2, 9),
        selected: !alreadyExists && finalType !== "TRANSFER",
        alreadyExists,
        transactionDate: txDate,
        competenceMonth: resolvedCompetence,
        cycleCompetenceMonth: itemCycleMonth,
        description: rawDesc,
        notes: (siblingMatch && siblingMatch.notes) || "",
        counterparty: pixInfo.counterparty || "",
        originLabel: pixInfo.originLabel || "",
        destinationLabel: pixInfo.destinationLabel || "",
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
  },

  groupPdfItemsIntoRows(items, yTolerance = 3.2) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const sorted = items
      .filter(it => it && it.str && it.str.trim().length > 0 && Array.isArray(it.transform))
      .map(it => ({
        str: it.str.trim(),
        x: Number(it.transform[4]) || 0,
        y: Number(it.transform[5]) || 0,
        w: Number(it.width) || 0
      }))
      .sort((a, b) => {
        if (Math.abs(b.y - a.y) > yTolerance) return b.y - a.y;
        return a.x - b.x;
      });

    const rows = [];
    for (const item of sorted) {
      const lastRow = rows[rows.length - 1];
      if (lastRow && Math.abs(lastRow.y - item.y) <= yTolerance) {
        lastRow.items.push(item);
      } else {
        rows.push({ y: item.y, items: [item] });
      }
    }

    return rows.map(row => {
      row.items.sort((a, b) => a.x - b.x);
      let lineText = "";
      let prevEnd = null;
      let prevStr = "";
      for (const it of row.items) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          if (gap > 1.2 || /\d$/.test(prevStr) || /^[-+]?\s*(?:R\$|\d)/.test(it.str)) {
            lineText += " ";
          } else if (gap >= 0.4) {
            lineText += " ";
          }
        }
        lineText += it.str;
        prevEnd = it.x + it.w;
        prevStr = it.str;
      }
      return {
        y: row.y,
        text: lineText.replace(/\s+/g, " ").trim()
      };
    }).filter(r => r.text.length > 0);
  },

  async extractPdfTextLines(arrayBuffer, password = null) {
    if (!window.pdfjsLib) {
      throw new Error("PDF_LIB_MISSING");
    }
    const cdnWorker = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = cdnWorker;
    }

    // Garante disponibilidade do worker no escopo global caso WebWorker cross-origin falhe (file:// ou CSP)
    if (!window.pdfjsWorker) {
      await new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = cdnWorker;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });
    }

    const loadTask = window.pdfjsLib.getDocument({
      data: arrayBuffer,
      password: password || undefined
    });
    const pdfDoc = await loadTask.promise;

    const allLines = [];
    const headerLines = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width || 595;
      const textContent = await page.getTextContent();
      const rawItems = textContent.items || [];

      if (pageNum === 1) {
        const unsplitP1 = this.groupPdfItemsIntoRows(rawItems);
        unsplitP1.forEach(r => headerLines.push(r.text));
      }

      // Detecta layout em 2 colunas típico das faturas do Cartão Itaú
      const rightColDateHits = rawItems.filter(it => {
        if (!it || !it.str || !Array.isArray(it.transform)) return false;
        const x = Number(it.transform[4]) || 0;
        const t = it.str.trim();
        return x >= pageWidth * 0.45 && x <= pageWidth * 0.72 && /^\d{2}\/\d{2}(?:\/\d{2,4})?$/.test(t);
      }).length;

      const leftColDateHits = rawItems.filter(it => {
        if (!it || !it.str || !Array.isArray(it.transform)) return false;
        const x = Number(it.transform[4]) || 0;
        const t = it.str.trim();
        return x < pageWidth * 0.45 && /^\d{2}\/\d{2}(?:\/\d{2,4})?$/.test(t);
      }).length;

      if (rightColDateHits >= 2 && leftColDateHits >= 1) {
        const splitX = pageWidth * 0.48;
        const leftItems = rawItems.filter(it => Array.isArray(it.transform) && (Number(it.transform[4]) || 0) < splitX);
        const rightItems = rawItems.filter(it => Array.isArray(it.transform) && (Number(it.transform[4]) || 0) >= splitX);
        this.groupPdfItemsIntoRows(leftItems).forEach(r => allLines.push(r.text));
        this.groupPdfItemsIntoRows(rightItems).forEach(r => allLines.push(r.text));
      } else {
        this.groupPdfItemsIntoRows(rawItems).forEach(r => allLines.push(r.text));
      }
    }

    return { headerLines, lines: allLines };
  },

  extractItauPdfMetadata(headerLines, allLines, fallbackMonth = "2026-11") {
    const [fbY, fbM] = (fallbackMonth || "2026-11").split("-").map(Number);
    let refYear = fbY || 2026;
    let refMonth = fbM || 11;
    let explicitCutoffISO = null;

    const searchPool = [...(headerLines || []), ...(allLines || []).slice(0, 60)];
    let foundRef = false;
    for (const line of searchPool) {
      // Vencimento: 19/11/2026 | Emissão: 12/11/2026 | Fechamento: 12/11/2026
      const mVenc = line.match(/(?:VENCIMENTO|VENC\.?|FECHAMENTO|EMISS[AÃ]O|PER[IÍ]ODO\s+AT[EÉ])[^0-9]{0,20}(\d{2})\/(\d{2})\/(\d{4})/i);
      if (mVenc) {
        if (!foundRef) {
          refMonth = parseInt(mVenc[2], 10) || refMonth;
          refYear = parseInt(mVenc[3], 10) || refYear;
          foundRef = true;
        }
        if (/FECHAMENTO|EMISS|PER[IÍ]ODO/i.test(line) && !explicitCutoffISO) {
          explicitCutoffISO = `${mVenc[3]}-${mVenc[2]}-${mVenc[1]}`;
        }
        if (foundRef && explicitCutoffISO) break;
      }
    }

    if (!foundRef) {
      for (const line of searchPool) {
        const mYear = line.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
        if (mYear) {
          refMonth = parseInt(mYear[2], 10) || refMonth;
          refYear = parseInt(mYear[3], 10) || refYear;
          break;
        }
      }
    }

    return { refYear, refMonth, explicitCutoffISO };
  },

  resolveItauDateToken(dateToken, refYear, refMonth) {
    const parts = (dateToken || "").split("/");
    const dd = String(parseInt(parts[0], 10) || 1).padStart(2, "0");
    const mmNum = parseInt(parts[1], 10) || refMonth || 1;
    const mm = String(mmNum).padStart(2, "0");

    let yyyy = refYear || 2026;
    if (parts[2]) {
      yyyy = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
    } else {
      // Virada de ano entre dezembro e janeiro/fevereiro
      if (refMonth <= 2 && mmNum >= 11) {
        yyyy = refYear - 1;
      } else if (refMonth >= 11 && mmNum <= 2) {
        yyyy = refYear + 1;
      }
    }
    return `${yyyy}-${mm}-${dd}`;
  },

  parseItauPdfLines(lines, headerLines, account, competenceMonth, state, competenceMode = "SMART_INVOICE") {
    const isCreditCard = !account || account.type === "CREDIT_CARD";
    const meta = this.extractItauPdfMetadata(headerLines, lines, competenceMonth);
    const rawItems = [];

    let skipSummarySection = false;
    let currentCardEnding = "";
    let currentSectionType = "PURCHASES";

    const txRegex = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\s*[-+]?(?:\s*[CD])?)$/i;

    for (const rawLine of lines || []) {
      const line = (rawLine || "").replace(/\s+/g, " ").trim();
      if (!line) continue;
      const norm = this.normalizeText(line);

      // Seções de resumo futuro / limites / encargos do Itaú que NÃO devem entrar como lançamentos atuais
      if (
        /COMPRAS\s+PARCELADAS\s*[-–]?\s*PROXIMAS|PROXIMAS\s+FATURAS|LANCAMENTOS\s+FUTUROS|LIMITE\s+DE\s+CREDITO|ENCARGOS\s+FINANCEIROS|TAXAS\s+DE\s+JUROS|FINANCIAMENTO\s+DA\s+FATURA/.test(
          norm
        )
      ) {
        skipSummarySection = true;
        continue;
      }

      if (
        /LANCAMENTOS\s*:?\s*COMPRAS|LANCAMENTOS\s+NO\s+CARTAO|LANCAMENTOS\s+NACIONAIS|LANCAMENTOS\s+INTERNACIONAIS|DESPESAS\s+NO\s+CARTAO|MOVIMENTACAO\s+DE\s+CONTA|EXTRATO\s+MENSAL/.test(
          norm
        )
      ) {
        skipSummarySection = false;
        currentSectionType = "PURCHASES";
      } else if (/PAGAMENTOS\s+E\s+CREDITOS|CREDITOS\s+E\s+ESTORNOS|ESTORNOS\s+E\s+CREDITOS/.test(norm)) {
        skipSummarySection = false;
        currentSectionType = "CREDITS";
      } else if (/PRODUTOS\s+E\s+SERVICOS/.test(norm)) {
        skipSummarySection = false;
        currentSectionType = "PURCHASES";
      }

      const mCard = line.match(/\(final\s*(\d{4})\)|\bfinal\s*(\d{4})\b/i);
      if (mCard && !txRegex.test(line)) {
        currentCardEnding = mCard[1] || mCard[2] || "";
        continue;
      }

      if (skipSummarySection) continue;

      // Linhas de saldo / totais não devem virar transação
      if (
        /^(SALDO\s+ANTERIOR|SALDO\s+FINAL|SALDO\s+DO\s+DIA|SALDO\s+DISPONIVEL|S\s*A\s*L\s*D\s*O|TOTAL\s|SUBTOTAL)/.test(
          norm
        ) ||
        norm.includes("SALDO ANTERIOR") ||
        norm.includes("SALDO DO DIA") ||
        norm.includes("TOTAL DOS LANCAMENTOS") ||
        norm.includes("TOTAL DESTA FATURA") ||
        norm.includes("PAGAMENTO MINIMO")
      ) {
        continue;
      }

      const m = line.match(txRegex);
      if (!m) continue;

      const dateToken = m[1];
      let desc = (m[2] || "").replace(/\s+/g, " ").trim();
      const valToken = (m[3] || "").trim();
      const normDesc = this.normalizeText(desc);

      // Evita falsos matches em cabeçalhos numéricos ou resumo
      if (
        !desc ||
        desc.length < 2 ||
        /^(TOTAL|SUBTOTAL|VALOR\s+DA\s+FATURA|FATURA\s+ANTERIOR|PAGAMENTO\s+MINIMO|ENCARGOS)/.test(normDesc)
      ) {
        continue;
      }

      const numMatch = valToken.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
      if (!numMatch) continue;
      const absAmount = parseFloat(numMatch[1].replace(/\./g, "").replace(",", "."));
      if (isNaN(absAmount) || absAmount === 0) continue;

      const hasMinus = valToken.includes("-") || /\s-/.test(valToken);
      const hasCreditTag = /\bC$/i.test(valToken) || currentSectionType === "CREDITS";
      const hasDebitTag = /\bD$/i.test(valToken);

      const txDate = this.resolveItauDateToken(dateToken, meta.refYear, meta.refMonth);

      // Convenção interna:
      // - Cartão de crédito: despesas < 0 e estornos/créditos > 0
      // - Conta corrente: valores positivos (verde, sem '-') são ENTRADAS (> 0); negativos (vermelho, com '-' ou 'D') são SAÍDAS (< 0)
      let signedVal;
      if (isCreditCard) {
        const isCreditLine = hasMinus || hasCreditTag || this.isLikelyRefundDescription(desc);
        signedVal = isCreditLine ? absAmount : -absAmount;
      } else {
        const isDebitLine = hasMinus || hasDebitTag;
        signedVal = isDebitLine ? -absAmount : absAmount;
      }

      rawItems.push({
        txDate,
        description: desc,
        signedVal,
        absAmount,
        cardEnding: currentCardEnding
      });
    }

    if (rawItems.length === 0) {
      return [];
    }

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

    const baseCounts = new Map();
    const results = [];

    for (const raw of rawItems) {
      const { txDate, description, signedVal, absAmount, cardEnding } = raw;
      const inst = this.detectInstallments(description, isCreditCard);
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
          if (signedVal > 0) {
            isInvoiceCredit = true;
            finalType = "EXPENSE";
            finalAmount = -absAmount;
          } else {
            finalType = "EXPENSE";
            finalAmount = absAmount;
          }
        } else {
          finalType = signedVal > 0 ? "INCOME" : "EXPENSE";
        }
      }

      const baseHash = `pdf_itau_${account.id}_${txDate}_${absAmount.toFixed(2)}_${this.normalizeText(description).slice(0, 24)}`;
      const occ = (baseCounts.get(baseHash) || 0) + 1;
      baseCounts.set(baseHash, occ);
      const importHash = occ > 1 ? `${baseHash}_${occ}` : baseHash;

      const alreadyExists = (state.transactions || []).some(t => t.importHash === importHash);

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
      const pixInfo = this.extractTransferPixDetails(description, finalType, account);

      let defaultNote = (siblingMatch && siblingMatch.notes) || "";
      if (!defaultNote && cardEnding && isCreditCard) {
        defaultNote = `Final ${cardEnding}`;
      }

      results.push({
        tempId: "imp_" + Math.random().toString(36).substring(2, 9),
        selected: !alreadyExists && finalType !== "TRANSFER",
        alreadyExists,
        transactionDate: txDate,
        competenceMonth: resolvedCompetence,
        cycleCompetenceMonth: itemCycleMonth,
        description,
        notes: defaultNote,
        counterparty: pixInfo.counterparty || "",
        originLabel: pixInfo.originLabel || "",
        destinationLabel: pixInfo.destinationLabel || "",
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
        memoryMatched: Boolean(siblingMatch || classification.matchedBy === "MEMORY" || classification.matchedBy === "HISTORY"),
        pdfExplicitCutoff: meta.explicitCutoffISO || null
      });
    }

    return results;
  },

  async parseItauPDF(arrayBuffer, account, competenceMonth, state, competenceMode = "SMART_INVOICE", password = null) {
    const { headerLines, lines } = await this.extractPdfTextLines(arrayBuffer, password);
    return this.parseItauPdfLines(lines, headerLines, account, competenceMonth, state, competenceMode);
  },

  parseBRLNumber(str) {
    const clean = String(str || "").replace(/R\$\s*/i, "").replace(/\./g, "").replace(",", ".").trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  },

  async parseItauDDCPDF(arrayBuffer, password = null) {
    const { headerLines, lines } = await this.extractPdfTextLines(arrayBuffer, password);
    const fullHeader = (headerLines || []).join(" \n ");

    const contractMatch = fullHeader.match(/N[uú]mero do contrato\s+(\d+)/i);
    const termMatch = fullHeader.match(/Prazo total opera[cç][aã]o\s+(\d+)/i);
    const rateMonthlyMatch = fullHeader.match(/Taxa de Juros \(mensal\)\s+([\d,]+%)/i);
    const rateAnnualMatch = fullHeader.match(/Taxa de Juros \(anual\)\s+([\d,]+%)/i);
    const rateEffMatch = fullHeader.match(/Taxa efetiva \(anual\)\s+([\d,]+%)/i);

    const schedule = [];
    const seenNums = new Set();

    for (const rawLine of lines || []) {
      const line = (rawLine || "").replace(/\s+/g, " ").trim();
      const m = line.match(/^(\d{1,3})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(Paga|Projetada)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/i);
      if (!m) continue;

      const num = parseInt(m[1], 10);
      if (!num || seenNums.has(num)) continue;
      seenNums.add(num);

      const dueDateBR = m[2];
      const [dd, mm, yyyy] = dueDateBR.split("/");
      const numTokens = (m[3].match(/\d{1,3}(?:\.\d{3})*,\d+/g) || []).map(v => this.parseBRLNumber(v));

      const amortization = numTokens[0] || 0;
      const interest = numTokens[1] || 0;
      const mip = numTokens[3] || 0;
      const dfi = numTokens[4] || 0;
      const tca = numTokens[6] !== undefined ? numTokens[6] : 25;

      schedule.push({
        installment: num,
        dueDate: `${yyyy}-${mm}-${dd}`,
        dueDateBR,
        competenceMonth: `${yyyy}-${mm}`,
        amortization,
        interest,
        mip,
        dfi,
        tca,
        status: /^Paga$/i.test(m[4]) ? "Paga" : "Projetada",
        total: this.parseBRLNumber(m[5]),
        balance: this.parseBRLNumber(m[6])
      });
    }

    schedule.sort((a, b) => a.installment - b.installment);

    return {
      contractNumber: contractMatch ? contractMatch[1] : null,
      totalTermMonths: termMatch ? parseInt(termMatch[1], 10) : schedule.length,
      monthlyInterestRate: rateMonthlyMatch ? rateMonthlyMatch[1] : null,
      annualInterestRate: rateAnnualMatch ? rateAnnualMatch[1] : null,
      annualEffectiveRate: rateEffMatch ? rateEffMatch[1] : null,
      lastInstallmentValue: schedule.length > 0 ? schedule[schedule.length - 1].total : 0,
      lastDueDate: schedule.length > 0 ? schedule[schedule.length - 1].dueDate : null,
      schedule
    };
  }
};
