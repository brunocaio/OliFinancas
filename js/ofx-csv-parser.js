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

  detectSubcategory(description, state) {
    const normDesc = this.normalizeText(description);
    if (!normDesc || !state || !state.subcategories) return null;
    for (const sub of state.subcategories) {
      if (!sub.keywords || sub.keywords.length === 0) continue;
      for (const kw of sub.keywords) {
        const normKw = this.normalizeText(kw);
        if (normKw && normDesc.includes(normKw)) {
          return sub;
        }
      }
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

  autoClassify(description, amount, isCreditCard, subcategories, projections, competenceMonth, ownerId = "bruno") {
    const normDesc = this.normalizeText(description);

    const faturaKeywords = ["PAGAMENTO DE FATURA", "PAGTO FATURA", "PAGAMENTO FATURA", "PAGAMENTO RECEBIDO", "FATURA CARTAO", "DEBITO AUTOMATICO FATURA"];
    for (const kw of faturaKeywords) {
      if (normDesc.includes(kw)) {
        return {
          type: "TRANSFER",
          subcategoryId: "sub_pag_fatura",
          ownership: "COLLECTIVE",
          projectionId: null,
          confidence: "HIGH"
        };
      }
    }

    let matchedSub = null;
    for (const sub of subcategories) {
      if (!sub.keywords || sub.keywords.length === 0) continue;
      for (const kw of sub.keywords) {
        const normKw = this.normalizeText(kw);
        if (normKw && normDesc.includes(normKw)) {
          matchedSub = sub;
          break;
        }
      }
      if (matchedSub) break;
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

    let resolvedOwnership = matchedProj ? matchedProj.ownership : (matchedSub.defaultOwnership || "COLLECTIVE");
    if (resolvedOwnership !== "COLLECTIVE") {
      resolvedOwnership = ownerId === "nubia" ? "INDIVIDUAL_NUBIA" : "INDIVIDUAL_BRUNO";
    }

    return {
      type: txType,
      subcategoryId: matchedSub.id,
      ownership: resolvedOwnership,
      projectionId: matchedProj ? matchedProj.id : null,
      confidence: matchedSub.id !== "sub_outros" ? "HIGH" : "LOW"
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
        account.ownerId || "bruno"
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
        ownership: classification.ownership,
        subcategoryId: classification.subcategoryId,
        projectionId: classification.projectionId,
        installmentCurrent: inst.current,
        installmentTotal: inst.total,
        importHash,
        confidence: classification.confidence
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
        account.ownerId || "bruno"
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
        ownership: classification.ownership,
        subcategoryId: classification.subcategoryId,
        projectionId: classification.projectionId,
        installmentCurrent: inst.current,
        installmentTotal: inst.total,
        importHash,
        confidence: classification.confidence
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
