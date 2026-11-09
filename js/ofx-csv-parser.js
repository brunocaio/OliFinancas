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

  parseOFX(content, account, competenceMonth, state) {
    const blocks = content.split(/<STMTTRN>/i).slice(1);
    const isCreditCard = account.type === "CREDIT_CARD" || /<CREDITCARDMSGSRSV1>/i.test(content);
    const results = [];

    const extractTag = (block, tag) => {
      const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
      const m = block.match(regex);
      return m ? m[1].trim() : "";
    };

    for (const rawBlock of blocks) {
      const block = rawBlock.split(/<\/STMTTRN>/i)[0];
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

      const absAmount = Math.abs(signedVal);
      const inst = this.detectInstallments(description);
      const classification = this.autoClassify(
        description,
        signedVal,
        isCreditCard,
        state.subcategories,
        state.projections,
        competenceMonth,
        account.ownerId || "bruno"
      );

      let finalType = classification.type;
      if (finalType !== "TRANSFER") {
        if (!isCreditCard && signedVal > 0) {
          finalType = "INCOME";
        } else if (!isCreditCard && signedVal < 0) {
          finalType = "EXPENSE";
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
        competenceMonth,
        description,
        amount: absAmount,
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

  parseCSV(content, account, competenceMonth, state) {
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

    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCSVLine(lines[i]);
      if (cols.length < 2) continue;

      const rawDate = cols[dateIdx] || cols[0];
      const rawDesc = cols[descIdx] || cols[1] || "Item CSV";
      const rawAmt = cols[amtIdx] !== undefined ? cols[amtIdx] : cols[cols.length - 1];

      const signedVal = this.parseMoneyValue(rawAmt);
      if (isNaN(signedVal) || signedVal === 0) continue;

      const txDate = this.parseDateString(rawDate, competenceMonth);
      const absAmount = Math.abs(signedVal);
      const inst = this.detectInstallments(rawDesc);
      const classification = this.autoClassify(
        rawDesc,
        signedVal,
        isCreditCard,
        state.subcategories,
        state.projections,
        competenceMonth,
        account.ownerId || "bruno"
      );

      let finalType = classification.type;
      if (finalType !== "TRANSFER") {
        if (!isCreditCard && signedVal > 0) {
          finalType = "INCOME";
        } else if (!isCreditCard && signedVal < 0) {
          finalType = "EXPENSE";
        }
      }

      const importHash = `csv_${account.id}_${txDate}_${absAmount.toFixed(2)}_${this.normalizeText(rawDesc).slice(0, 24)}`;
      const alreadyExists = state.transactions.some(t => t.importHash === importHash);

      results.push({
        tempId: "imp_" + Math.random().toString(36).substring(2, 9),
        selected: !alreadyExists && finalType !== "TRANSFER",
        alreadyExists,
        transactionDate: txDate,
        competenceMonth,
        description: rawDesc.replace(/^"|"$/g, ""),
        amount: absAmount,
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
<DTPOSTED>20261114120000[-3:BRT]
<TRNAMT>-245.80
<FITID>OLI_DEMO_001
<MEMO>Supermercado Guanabara - Feira & Azeitonas
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261115193000[-3:BRT]
<TRNAMT>-68.90
<FITID>OLI_DEMO_002
<MEMO>IFD*Ifood Pizza com Azeitona Preta
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261116101500[-3:BRT]
<TRNAMT>-180.00
<FITID>OLI_DEMO_003
<MEMO>Posto Ipiranga Gasolina
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261116150000[-3:BRT]
<TRNAMT>-115.00
<FITID>OLI_DEMO_004
<MEMO>Petz - Racao e Petiscos Chico
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261117090000[-3:BRT]
<TRNAMT>-34.90
<FITID>OLI_DEMO_005
<MEMO>Uber *Viagem Trabalho
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
