// ============================================================================
// OLIFINANÇAS 🫒 - BASE DE DADOS INICIAL (EXTRAÍDA DA PLANILHA DE BRUNO & NÚBIA)
// ============================================================================

window.INITIAL_SEED_DATA = {
  version: "1.5.0-oli",
  settings: {
    householdName: "OliFinanças • Bruno & Núbia",
    activeMonth: "2026-11",
    splitMode: "PROPORTIONAL",
    carryOverBalance: 0.00,
    cardCustomMeta: {}
  },

  users: [
    {
      id: "bruno",
      name: "Bruno",
      email: "bruno@olifinancas.app",
      avatarColor: "#84cc16",
      defaultIncome: 12416.99
    },
    {
      id: "nubia",
      name: "Núbia",
      email: "nubia@olifinancas.app",
      avatarColor: "#f43f5e",
      defaultIncome: 15338.00
    }
  ],

  accounts: [
    {
      id: "cc_bruno",
      name: "Conta Corrente Bruno",
      type: "CHECKING",
      ownerId: "bruno",
      closingDay: null,
      dueDay: null,
      monthlyTarget: 0,
      color: "#84cc16"
    },
    {
      id: "card_nubank_bruno",
      name: "Cartão Nubank Bruno",
      type: "CREDIT_CARD",
      ownerId: "bruno",
      closingDay: 9,
      dueDay: 16,
      competenceOffset: 0, // 0 = Mês da virada | -1 = Mês anterior à virada
      virtualCards: ["Cartão Físico", "Virtual Compras Online", "Virtual Assinaturas / Recorrente"],
      monthlyTarget: 10000.00,
      color: "#a855f7"
    },
    {
      id: "card_itau_bruno",
      name: "Cartão Itaú Bruno",
      type: "CREDIT_CARD",
      ownerId: "bruno",
      closingDay: 21,
      dueDay: 28,
      competenceOffset: 0, // 0 = Mês da virada | -1 = Mês anterior à virada
      virtualCards: ["Cartão Físico", "Virtual Carteira Digital"],
      monthlyTarget: 524.00,
      color: "#f97316"
    },
    {
      id: "cc_nubia",
      name: "Conta Corrente Núbia",
      type: "CHECKING",
      ownerId: "nubia",
      closingDay: null,
      dueDay: null,
      monthlyTarget: 0,
      color: "#f43f5e"
    },
    {
      id: "card_nubia",
      name: "Cartão Nubank Núbia",
      type: "CREDIT_CARD",
      ownerId: "nubia",
      closingDay: 5,
      dueDay: 12,
      competenceOffset: 0,
      virtualCards: ["Cartão Físico", "Virtual Compras Online"],
      monthlyTarget: 7000.00,
      color: "#ec4899"
    },
    {
      id: "inv_caixinha",
      name: "Caixinha Nubank / Reserva de Azeite",
      type: "INVESTMENT",
      ownerId: "bruno",
      closingDay: null,
      dueDay: null,
      monthlyTarget: 0,
      color: "#eab308"
    }
  ],

  categories: [
    { id: "cat_moradia", name: "Moradia & Contas Fixas", type: "EXPENSE", icon: "home", color: "#84cc16", sortOrder: 1 },
    { id: "cat_alimentacao", name: "Alimentação & Mercado", type: "EXPENSE", icon: "utensils", color: "#eab308", sortOrder: 2 },
    { id: "cat_transporte", name: "Transporte & Veículos", type: "EXPENSE", icon: "car", color: "#10b981", sortOrder: 3 },
    { id: "cat_saude", name: "Saúde & Autocuidado", type: "EXPENSE", icon: "heart-pulse", color: "#ef4444", sortOrder: 4 },
    { id: "cat_familia", name: "Família, Filhos & Apoio", type: "EXPENSE", icon: "users", color: "#a855f7", sortOrder: 5 },
    { id: "cat_pets", name: "Pets (Chicó)", type: "EXPENSE", icon: "dog", color: "#f97316", sortOrder: 6 },
    { id: "cat_assinaturas", name: "Assinaturas & Serviços Digitais", type: "EXPENSE", icon: "tv", color: "#06b6d4", sortOrder: 7 },
    { id: "cat_lazer", name: "Lazer, Cultura & Social", type: "EXPENSE", icon: "sparkles", color: "#f43f5e", sortOrder: 8 },
    { id: "cat_financeiro", name: "Parcelados, Cartão & Outros", type: "EXPENSE", icon: "credit-card", color: "#78716c", sortOrder: 9 },
    { id: "cat_receitas", name: "Receitas & Salários", type: "INCOME", icon: "wallet", color: "#65a30d", sortOrder: 10 },
    { id: "cat_transferencia", name: "Pagamento de Fatura / Transferência", type: "TRANSFER", icon: "arrow-left-right", color: "#94a3b8", sortOrder: 11 }
  ],

  subcategories: [
    // 1. Moradia & Contas Fixas
    { id: "sub_aluguel", categoryId: "cat_moradia", name: "Aluguel", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 3800.00, isFixed: true, keywords: ["ALUGUEL", "IMOBILIARIA", "QUINTOANDAR"] },
    { id: "sub_condominio", categoryId: "cat_moradia", name: "Água / Condomínio", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 675.00, isFixed: true, keywords: ["CONDOMINIO", "AGUA", "CEDAE", "SABESP", "AGUAS"] },
    { id: "sub_luz", categoryId: "cat_moradia", name: "Luz / Energia", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 350.00, isFixed: true, keywords: ["LIGHT", "ENEL", "ENERGIA", "CPFL", "NEOENERGIA", "LUZ"] },
    { id: "sub_gas", categoryId: "cat_moradia", name: "Gás", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 75.00, isFixed: true, keywords: ["NATURGY", "COMGAS", "ULTRAGAZ", "SUPERGASBRAS", "GAS"] },
    { id: "sub_internet", categoryId: "cat_moradia", name: "Internet Casa", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 100.00, isFixed: true, keywords: ["CLARO", "VIVO FIBRA", "OI FIBRA", "NET", "INTERNET"] },
    { id: "sub_celular", categoryId: "cat_moradia", name: "Celular", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 139.00, isFixed: true, keywords: ["TIM", "VIVO MOVEL", "CLARO MOVEL", "CELULAR"] },
    { id: "sub_vigias", categoryId: "cat_moradia", name: "Vigias / Segurança", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["VIGIA", "SEGURANCA RUA"] },
    { id: "sub_iptu", categoryId: "cat_moradia", name: "IPTU", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 400.00, isFixed: true, keywords: ["IPTU", "PREFEITURA"] },
    { id: "sub_faxina", categoryId: "cat_moradia", name: "Faxina / Diarista", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["FAXINA", "DIARISTA"] },
    { id: "sub_manut_eletro", categoryId: "cat_moradia", name: "Manutenção Casa & Eletro", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["LEROY", "OBRAMAX", "CONSERTO", "ELETRO"] },

    // 2. Alimentação
    { id: "sub_feira_sup", categoryId: "cat_alimentacao", name: "Feira e Suprimentos (Mercado)", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 1800.00, isFixed: false, keywords: ["SUPERMERCADO", "MERCADO", "GUANABARA", "ZONA SUL", "MUNDIAL", "ASSAI", "ATACADAO", "CARREFOUR", "PAO DE ACUCAR", "HORTIFRUTI", "FEIRA"] },
    { id: "sub_feira_cc", categoryId: "cat_alimentacao", name: "Feira (Conta Corrente / Pix)", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: false, keywords: [] },
    { id: "sub_delivery", categoryId: "cat_alimentacao", name: "Delivery Comida (iFood)", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 200.00, isFixed: false, keywords: ["IFOOD", "IFD*", "RAPPI", "ZE DELIVERY", "AIQFOME"] },
    { id: "sub_restaurantes", categoryId: "cat_alimentacao", name: "Restaurantes & Cafés", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 200.00, isFixed: false, keywords: ["RESTAURANTE", "PADARIA", "LANCHONETE", "BAR ", "CAFE", "BISTRO", "PIZZARIA", "SUSHI", "BURGER"] },

    // 3. Transporte & Veículos
    { id: "sub_gasolina", categoryId: "cat_transporte", name: "Gasolina / Combustível", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 570.00, isFixed: false, keywords: ["POSTO", "SHELL", "IPIRANGA", "PETROBRAS", "VIBRA", "COMBUSTIVEL", "GASOLINA", "AUTO POSTO"] },
    { id: "sub_manut_carro", categoryId: "cat_transporte", name: "Manutenção Carro", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 1364.00, isFixed: false, keywords: ["OFICINA", "MECANICA", "PNEU", "AUTOCENTER", "AUTO PECAS", "REVISAO", "LAVA JATO"] },
    { id: "sub_seguro_carro", categoryId: "cat_transporte", name: "Seguro Carro", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 384.26, isFixed: true, keywords: ["PORTO SEGURO", "AZUL SEGUROS", "TOKIO MARINE", "SUHAI", "ALLIANZ", "YOUSE", "SEGURO AUTO"] },
    { id: "sub_nutag", categoryId: "cat_transporte", name: "NuTag / Pedágio", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 15.58, isFixed: false, keywords: ["NUTAG", "TAGGY", "SEM PARAR", "VELOE", "CONECTCAR", "PEDAGIO"] },
    { id: "sub_estacionamento", categoryId: "cat_transporte", name: "Estacionamento", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 50.00, isFixed: false, keywords: ["ESTACIONAMENTO", "ESTAPAR", "INDIGO", "PARK", "SHOPPING PARK"] },
    { id: "sub_flanelinhas", categoryId: "cat_transporte", name: "Flanelinhas", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 100.00, isFixed: false, keywords: ["FLANELINHA", "GUARDADOR"] },
    { id: "sub_transporte_app", categoryId: "cat_transporte", name: "Transporte / Uber / 99", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_nubank_bruno", defaultMeta: 100.00, isFixed: false, keywords: ["UBER", "99APP", "99 *", "TAXI", "METRO", "RIOCARD", "BILHETE"] },
    { id: "sub_ipva", categoryId: "cat_transporte", name: "IPVA / Licenciamento", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: true, keywords: ["IPVA", "DETRAN", "GRT"] },

    // 4. Saúde & Autocuidado
    { id: "sub_plano_saude", categoryId: "cat_saude", name: "Plano de Saúde", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 2445.00, isFixed: true, keywords: ["UNIMED", "AMIL", "SULAMERICA", "BRADESCO SAUDE", "ASSIM", "NOTREDAME", "PLANO DE SAUDE"] },
    { id: "sub_analise", categoryId: "cat_saude", name: "Análise / Terapia", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["ANALISE", "TERAPIA", "PSICOLOGA", "PSIQUIATRA"] },
    { id: "sub_fisioterapia", categoryId: "cat_saude", name: "Fisioterapia / Pilates", defaultOwnership: "INDIVIDUAL_NUBIA", defaultAccountId: "cc_nubia", defaultMeta: 200.00, isFixed: true, keywords: ["FISIOTERAPIA", "PILATES", "ACADEMIA"] },
    { id: "sub_autocuidado", categoryId: "cat_saude", name: "Auto Cuidado & Farmácia", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_nubank_bruno", defaultMeta: 300.00, isFixed: false, keywords: ["DROGARIA", "RAIA", "PACHECO", "VENANCIO", "FARMACIA", "BARBEARIA", "SALAO", "COSMETICO", "PERFUMARIA"] },

    // 5. Família, Filhos & Apoio
    { id: "sub_creche", categoryId: "cat_familia", name: "Creche / Escola", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["CRECHE", "ESCOLA", "COLEGIO"] },
    { id: "sub_pedro_gomes", categoryId: "cat_familia", name: "Pedro Gomes", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 1500.00, isFixed: true, keywords: ["PEDRO GOMES"] },
    { id: "sub_canguru", categoryId: "cat_familia", name: "Canguru", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 200.00, isFixed: false, keywords: ["CANGURU"] },
    { id: "sub_fotografa", categoryId: "cat_familia", name: "Fotógrafa", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 200.00, isFixed: false, keywords: ["FOTOGRAFA", "FOTOS", "ENSAIO"] },
    { id: "sub_caio", categoryId: "cat_familia", name: "Caio", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["CAIO"] },

    // 6. Pets (Chicó)
    { id: "sub_chico", categoryId: "cat_pets", name: "Chicó (Ração, Vet & Petshop)", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 395.36, isFixed: false, keywords: ["PETZ", "COBASI", "PETLOVE", "VETERINARIO", "CHICO", "RACAO", "PETSHOP"] },

    // 7. Assinaturas & Serviços Digitais
    { id: "sub_google_one", categoryId: "cat_assinaturas", name: "Google One", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 194.90, isFixed: true, keywords: ["GOOGLE ONE", "GOOGLE*STORAGE", "GOOGLE CLOUD"] },
    { id: "sub_amazon_prime", categoryId: "cat_assinaturas", name: "Amazon Prime", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 119.50, isFixed: true, keywords: ["AMAZON PRIME", "PRIME VIDEO", "AMAZON BR"] },
    { id: "sub_netflix", categoryId: "cat_assinaturas", name: "Netflix", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 72.80, isFixed: true, keywords: ["NETFLIX"] },
    { id: "sub_youtube", categoryId: "cat_assinaturas", name: "YouTube Premium", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 26.90, isFixed: true, keywords: ["YOUTUBE", "GOOGLE*YOUTUBE"] },
    { id: "sub_hbomax", categoryId: "cat_assinaturas", name: "HBO Max / Max", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_nubank_bruno", defaultMeta: 14.90, isFixed: true, keywords: ["HBO", "MAX.COM", "WARNER"] },
    { id: "sub_chatgpt", categoryId: "cat_assinaturas", name: "ChatGPT / OpenAI", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_nubank_bruno", defaultMeta: 41.50, isFixed: true, keywords: ["CHATGPT", "OPENAI"] },
    { id: "sub_spotify", categoryId: "cat_assinaturas", name: "Spotify", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_itau_bruno", defaultMeta: 40.90, isFixed: true, keywords: ["SPOTIFY"] },
    { id: "sub_adobe", categoryId: "cat_assinaturas", name: "Adobe Creative Cloud", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_itau_bruno", defaultMeta: 275.00, isFixed: true, keywords: ["ADOBE"] },

    // 8. Lazer, Cultura & Social
    { id: "sub_lazer_geral", categoryId: "cat_lazer", name: "Lazer & Passeios", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_nubank_bruno", defaultMeta: 400.00, isFixed: false, keywords: ["CINEMA", "INGRESSO", "SYMPLA", "EVENTIM", "TEATRO", "LAZER", "SHOW", "BARZINHO", "CHOPP"] },
    { id: "sub_jogos", categoryId: "cat_lazer", name: "Jogos / Games", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_nubank_bruno", defaultMeta: 69.90, isFixed: false, keywords: ["STEAM", "PLAYSTATION", "SONY", "XBOX", "NINTENDO", "EPIC GAMES", "JOGOS"] },
    { id: "sub_maracatu", categoryId: "cat_lazer", name: "Maracatu / IPN", defaultOwnership: "INDIVIDUAL_NUBIA", defaultAccountId: "cc_nubia", defaultMeta: 240.00, isFixed: true, keywords: ["MARACATU", "IPN"] },
    { id: "sub_festa", categoryId: "cat_lazer", name: "Festas & Comemorações", defaultOwnership: "COLLECTIVE", defaultAccountId: "card_itau_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["FESTA", "PRESENTES"] },

    // 9. Financeiro, Parcelados & Outros
    { id: "sub_parceladas", categoryId: "cat_financeiro", name: "Compras Parceladas", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_nubank_bruno", defaultMeta: 548.96, isFixed: true, keywords: ["PARCELA", "MERCADOLIVRE", "MAGALU", "SHOPEE", "CASAS BAHIA"] },
    { id: "sub_anuidade", categoryId: "cat_financeiro", name: "Anuidade & Tarifas Cartão", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_itau_bruno", defaultMeta: 44.00, isFixed: true, keywords: ["ANUIDADE", "TARIFA", "IOF"] },
    { id: "sub_outros", categoryId: "cat_financeiro", name: "Outros / Diversos", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "card_nubank_bruno", defaultMeta: 0.00, isFixed: false, keywords: [] },

    // 10. Receitas
    { id: "sub_salario_aoro", categoryId: "cat_receitas", name: "Salário AORO", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 12000.00, isFixed: true, keywords: ["AORO", "SALARIO", "PAGAMENTO FOLHA"] },
    { id: "sub_ressarc_aoro", categoryId: "cat_receitas", name: "Ressarcimento AORO", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 416.99, isFixed: false, keywords: ["RESSARCIMENTO", "REEMBOLSO"] },
    { id: "sub_salario_unisuam", categoryId: "cat_receitas", name: "Salário UNISUAM", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 5338.00, isFixed: true, keywords: ["UNISUAM"] },
    { id: "sub_rt_rendimentos", categoryId: "cat_receitas", name: "RT / Rendimentos / Caixinha", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "inv_caixinha", defaultMeta: 0.00, isFixed: false, keywords: ["RENDIMENTO", "DIVIDENDO", "RT "] },

    // 11. Transferência / Fatura
    { id: "sub_pag_fatura", categoryId: "cat_transferencia", name: "Pagamento de Fatura Cartão", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["PAGAMENTO DE FATURA", "PAGTO FATURA", "FATURA CARTAO", "ITAU UNIBANCO SA", "NU PAGAMENTOS"] }
  ],

  projections: [
    // Conta Corrente Bruno
    { id: "proj_vigias", monthYear: "2026-11", subcategoryId: "sub_vigias", title: "Vigias da Rua", plannedAmount: 0.00, accountId: "cc_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 5 },
    { id: "proj_celular", monthYear: "2026-11", subcategoryId: "sub_celular", title: "Celular", plannedAmount: 139.00, accountId: "cc_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 10 },
    { id: "proj_luz", monthYear: "2026-11", subcategoryId: "sub_luz", title: "Luz / Energia", plannedAmount: 350.00, accountId: "cc_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 12 },
    { id: "proj_gas", monthYear: "2026-11", subcategoryId: "sub_gas", title: "Gás Encanado", plannedAmount: 75.00, accountId: "cc_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 15 },
    { id: "proj_internet", monthYear: "2026-11", subcategoryId: "sub_internet", title: "Internet Fibra", plannedAmount: 100.00, accountId: "cc_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 15 },
    { id: "proj_condominio", monthYear: "2026-11", subcategoryId: "sub_condominio", title: "Água / Condomínio", plannedAmount: 675.00, accountId: "cc_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 10 },
    { id: "proj_plano_saude", monthYear: "2026-11", subcategoryId: "sub_plano_saude", title: "Plano de Saúde", plannedAmount: 2445.00, accountId: "cc_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 20 },
    { id: "proj_flanelinhas", monthYear: "2026-11", subcategoryId: "sub_flanelinhas", title: "Flanelinhas", plannedAmount: 100.00, accountId: "cc_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 28 },

    // Cartão Nubank Bruno (Dia 8)
    { id: "proj_delivery", monthYear: "2026-11", subcategoryId: "sub_delivery", title: "Meta Delivery Comida", plannedAmount: 200.00, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 8 },
    { id: "proj_transporte", monthYear: "2026-11", subcategoryId: "sub_transporte_app", title: "Meta Transporte / Uber", plannedAmount: 100.00, accountId: "card_nubank_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: false, dueDay: 8 },
    { id: "proj_amazon", monthYear: "2026-11", subcategoryId: "sub_amazon_prime", title: "Amazon Prime", plannedAmount: 119.50, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 8 },
    { id: "proj_netflix", monthYear: "2026-11", subcategoryId: "sub_netflix", title: "Netflix", plannedAmount: 72.80, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 8 },
    { id: "proj_hbomax", monthYear: "2026-11", subcategoryId: "sub_hbomax", title: "HBO Max", plannedAmount: 14.90, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 8 },
    { id: "proj_youtube", monthYear: "2026-11", subcategoryId: "sub_youtube", title: "YouTube Premium", plannedAmount: 26.90, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 8 },
    { id: "proj_google_one", monthYear: "2026-11", subcategoryId: "sub_google_one", title: "Google One", plannedAmount: 194.90, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 8 },
    { id: "proj_chatgpt", monthYear: "2026-11", subcategoryId: "sub_chatgpt", title: "ChatGPT Plus", plannedAmount: 41.50, accountId: "card_nubank_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: true, dueDay: 8 },
    { id: "proj_nutag", monthYear: "2026-11", subcategoryId: "sub_nutag", title: "NuTag Pedágio", plannedAmount: 15.58, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 8 },
    { id: "proj_lazer", monthYear: "2026-11", subcategoryId: "sub_lazer_geral", title: "Meta Lazer", plannedAmount: 400.00, accountId: "card_nubank_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: false, dueDay: 8 },
    { id: "proj_restaurantes", monthYear: "2026-11", subcategoryId: "sub_restaurantes", title: "Meta Restaurantes", plannedAmount: 200.00, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 8 },
    { id: "proj_estacionamento", monthYear: "2026-11", subcategoryId: "sub_estacionamento", title: "Meta Estacionamento", plannedAmount: 50.00, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 8 },
    { id: "proj_feira", monthYear: "2026-11", subcategoryId: "sub_feira_sup", title: "Meta Feira e Suprimentos", plannedAmount: 1800.00, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 8 },
    { id: "proj_parceladas", monthYear: "2026-11", subcategoryId: "sub_parceladas", title: "Compras Parceladas Nubank", plannedAmount: 548.96, accountId: "card_nubank_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: true, dueDay: 8 },
    { id: "proj_chico", monthYear: "2026-11", subcategoryId: "sub_chico", title: "Chicó (Pet)", plannedAmount: 395.36, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 8 },
    { id: "proj_jogos", monthYear: "2026-11", subcategoryId: "sub_jogos", title: "Jogos / Games", plannedAmount: 69.90, accountId: "card_nubank_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: false, dueDay: 8 },
    { id: "proj_gasolina", monthYear: "2026-11", subcategoryId: "sub_gasolina", title: "Meta Gasolina", plannedAmount: 570.00, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 8 },
    { id: "proj_manut_carro", monthYear: "2026-11", subcategoryId: "sub_manut_carro", title: "Manutenção Carro", plannedAmount: 1364.00, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 8 },
    { id: "proj_seguro_carro", monthYear: "2026-11", subcategoryId: "sub_seguro_carro", title: "Seguro Carro", plannedAmount: 384.26, accountId: "card_nubank_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 8 },
    { id: "proj_autocuidado", monthYear: "2026-11", subcategoryId: "sub_autocuidado", title: "Meta Auto Cuidado", plannedAmount: 300.00, accountId: "card_nubank_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: false, dueDay: 8 },

    // Cartão Itaucard Bruno (Dia 19)
    { id: "proj_spotify", monthYear: "2026-11", subcategoryId: "sub_spotify", title: "Spotify", plannedAmount: 40.90, accountId: "card_itau_bruno", ownership: "COLLECTIVE", isFixed: true, dueDay: 19 },
    { id: "proj_adobe", monthYear: "2026-11", subcategoryId: "sub_adobe", title: "Adobe Creative Cloud", plannedAmount: 275.00, accountId: "card_itau_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: true, dueDay: 19 },
    { id: "proj_manut_itau", monthYear: "2026-11", subcategoryId: "sub_manut_carro", title: "Manutenção Carro (Itaú)", plannedAmount: 130.40, accountId: "card_itau_bruno", ownership: "COLLECTIVE", isFixed: false, dueDay: 19 },
    { id: "proj_anuidade_itau", monthYear: "2026-11", subcategoryId: "sub_anuidade", title: "Anuidade Itaucard", plannedAmount: 44.00, accountId: "card_itau_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: true, dueDay: 19 },
    { id: "proj_outros_itau", monthYear: "2026-11", subcategoryId: "sub_outros", title: "Outros Itaú", plannedAmount: 33.70, accountId: "card_itau_bruno", ownership: "INDIVIDUAL_BRUNO", isFixed: false, dueDay: 19 }
  ],

  transactions: [
    // RECEITAS BRUNO E NÚBIA
    { id: "tx_rec_1", transactionDate: "2026-11-05", competenceMonth: "2026-11", description: "Salário AORO - Bruno", amount: 12000.00, type: "INCOME", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_salario_aoro", projectionId: null, installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_rec_2", transactionDate: "2026-11-06", competenceMonth: "2026-11", description: "Ressarcimento AORO - Bruno", amount: 416.99, type: "INCOME", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_ressarc_aoro", projectionId: null, installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_rec_3", transactionDate: "2026-11-05", competenceMonth: "2026-11", description: "Salário AORO - Núbia", amount: 10000.00, type: "INCOME", accountId: "cc_nubia", paidByUserId: "nubia", ownership: "COLLECTIVE", subcategoryId: "sub_salario_aoro", projectionId: null, installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_rec_4", transactionDate: "2026-11-07", competenceMonth: "2026-11", description: "Salário UNISUAM - Núbia", amount: 5338.00, type: "INCOME", accountId: "cc_nubia", paidByUserId: "nubia", ownership: "COLLECTIVE", subcategoryId: "sub_salario_unisuam", projectionId: null, installmentCurrent: 1, installmentTotal: 1 },

    // DESPESAS CONTA CORRENTE BRUNO
    { id: "tx_cc_1", transactionDate: "2026-11-05", competenceMonth: "2026-11", description: "Vigias da Rua", amount: 200.00, type: "EXPENSE", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_vigias", projectionId: "proj_vigias", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_cc_2", transactionDate: "2026-11-10", competenceMonth: "2026-11", description: "Conta Celular TIM", amount: 139.00, type: "EXPENSE", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_celular", projectionId: "proj_celular", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_cc_3", transactionDate: "2026-11-12", competenceMonth: "2026-11", description: "Conta de Luz (Energia)", amount: 925.00, type: "EXPENSE", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_luz", projectionId: "proj_luz", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_cc_4", transactionDate: "2026-11-15", competenceMonth: "2026-11", description: "Conta de Gás", amount: 75.00, type: "EXPENSE", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_gas", projectionId: "proj_gas", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_cc_5", transactionDate: "2026-11-15", competenceMonth: "2026-11", description: "Internet Fibra Residencial", amount: 100.00, type: "EXPENSE", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_internet", projectionId: "proj_internet", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_cc_6", transactionDate: "2026-11-10", competenceMonth: "2026-11", description: "Água / Condomínio", amount: 200.86, type: "EXPENSE", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_condominio", projectionId: "proj_condominio", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_cc_7", transactionDate: "2026-11-20", competenceMonth: "2026-11", description: "Plano de Saúde", amount: 2500.00, type: "EXPENSE", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_plano_saude", projectionId: "proj_plano_saude", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_cc_8", transactionDate: "2026-11-22", competenceMonth: "2026-11", description: "Flanelinhas no mês", amount: 100.00, type: "EXPENSE", accountId: "cc_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_flanelinhas", projectionId: "proj_flanelinhas", installmentCurrent: 1, installmentTotal: 1 },

    // DESPESAS CARTÃO NUBANK BRUNO (VIRA DIA 9 -> Ciclo 09/Out a 08/Nov vira em 09/Nov -> Competência 2026-11)
    { id: "tx_nu_1a", transactionDate: "2026-10-12", competenceMonth: "2026-11", description: "iFood - Jantar Fim de Semana", amount: 184.90, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_delivery", projectionId: "proj_delivery", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_1b", transactionDate: "2026-10-25", competenceMonth: "2026-11", description: "iFood - Almoço & Lanches", amount: 245.12, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_delivery", projectionId: "proj_delivery", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_1c", transactionDate: "2026-11-03", competenceMonth: "2026-11", description: "Delivery Pedidos Diversos", amount: 385.00, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_delivery", projectionId: "proj_delivery", installmentCurrent: 1, installmentTotal: 1 },

    { id: "tx_nu_2a", transactionDate: "2026-10-18", competenceMonth: "2026-11", description: "Uber - Deslocamentos Semana 1", amount: 192.40, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_transporte_app", projectionId: "proj_transporte", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_2b", transactionDate: "2026-11-04", competenceMonth: "2026-11", description: "Uber / 99 - Corridas Semana 2", amount: 330.49, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_transporte_app", projectionId: "proj_transporte", installmentCurrent: 1, installmentTotal: 1 },

    { id: "tx_nu_3", transactionDate: "2026-10-15", competenceMonth: "2026-11", description: "Amazon Prime (Cartão Virtual)", amount: 119.50, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_amazon_prime", projectionId: "proj_amazon", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_4", transactionDate: "2026-10-15", competenceMonth: "2026-11", description: "Netflix (Cartão Virtual)", amount: 72.80, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_netflix", projectionId: "proj_netflix", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_5", transactionDate: "2026-10-16", competenceMonth: "2026-11", description: "HBO Max (Cartão Virtual)", amount: 14.90, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_hbomax", projectionId: "proj_hbomax", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_6", transactionDate: "2026-10-16", competenceMonth: "2026-11", description: "YouTube Premium (Cartão Virtual)", amount: 26.90, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_youtube", projectionId: "proj_youtube", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_7", transactionDate: "2026-10-20", competenceMonth: "2026-11", description: "Google One (Cartão Virtual)", amount: 194.90, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_google_one", projectionId: "proj_google_one", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_8", transactionDate: "2026-10-20", competenceMonth: "2026-11", description: "ChatGPT Plus (Cartão Virtual)", amount: 41.50, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_chatgpt", projectionId: "proj_chatgpt", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_9", transactionDate: "2026-11-02", competenceMonth: "2026-11", description: "NuTag Pedágio", amount: 52.26, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_nutag", projectionId: "proj_nutag", installmentCurrent: 1, installmentTotal: 1 },

    { id: "tx_nu_10a", transactionDate: "2026-10-24", competenceMonth: "2026-11", description: "Barzinho & Encontro Amigos", amount: 287.68, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_lazer_geral", projectionId: "proj_lazer", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_10b", transactionDate: "2026-11-05", competenceMonth: "2026-11", description: "Passeio & Lazer Fim de Semana", amount: 520.00, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_lazer_geral", projectionId: "proj_lazer", installmentCurrent: 1, installmentTotal: 1 },

    { id: "tx_nu_11", transactionDate: "2026-11-02", competenceMonth: "2026-11", description: "Restaurantes", amount: 168.90, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_restaurantes", projectionId: "proj_restaurantes", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_12", transactionDate: "2026-11-02", competenceMonth: "2026-11", description: "Estacionamento Shopping", amount: 12.00, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_estacionamento", projectionId: "proj_estacionamento", installmentCurrent: 1, installmentTotal: 1 },

    { id: "tx_nu_13a", transactionDate: "2026-10-22", competenceMonth: "2026-11", description: "Hortifruti & Feira da Semana", amount: 64.50, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_feira_sup", projectionId: "proj_feira", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_13b", transactionDate: "2026-11-06", competenceMonth: "2026-11", description: "Supermercado Suprimentos", amount: 94.86, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_feira_sup", projectionId: "proj_feira", installmentCurrent: 1, installmentTotal: 1 },

    { id: "tx_nu_14", transactionDate: "2026-10-14", competenceMonth: "2026-11", description: "Compras Parceladas Nubank", amount: 548.96, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_parceladas", projectionId: "proj_parceladas", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_15", transactionDate: "2026-10-28", competenceMonth: "2026-11", description: "Chicó (Ração & Petshop)", amount: 395.36, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_chico", projectionId: "proj_chico", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_16", transactionDate: "2026-10-29", competenceMonth: "2026-11", description: "Jogos / Games (Cartão Virtual)", amount: 69.90, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_jogos", projectionId: "proj_jogos", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_17", transactionDate: "2026-11-05", competenceMonth: "2026-11", description: "Posto Gasolina", amount: 284.04, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_gasolina", projectionId: "proj_gasolina", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_18", transactionDate: "2026-10-30", competenceMonth: "2026-11", description: "Manutenção Carro (Oficina)", amount: 1364.40, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_manut_carro", projectionId: "proj_manut_carro", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_19", transactionDate: "2026-11-01", competenceMonth: "2026-11", description: "Seguro Carro", amount: 384.26, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_seguro_carro", projectionId: "proj_seguro_carro", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_20", transactionDate: "2026-11-07", competenceMonth: "2026-11", description: "Farmácia & Auto Cuidado", amount: 171.78, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_autocuidado", projectionId: "proj_autocuidado", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_nu_21", transactionDate: "2026-11-08", competenceMonth: "2026-11", description: "Outros Gastos Nubank", amount: 331.69, type: "EXPENSE", accountId: "card_nubank_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_outros", projectionId: null, installmentCurrent: 1, installmentTotal: 1 },

    // DESPESAS ITAUCARD BRUNO (DIA 19)
    { id: "tx_it_1", transactionDate: "2026-11-10", competenceMonth: "2026-11", description: "Spotify", amount: 40.90, type: "EXPENSE", accountId: "card_itau_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_spotify", projectionId: "proj_spotify", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_it_2", transactionDate: "2026-11-11", competenceMonth: "2026-11", description: "Adobe Creative Cloud", amount: 275.00, type: "EXPENSE", accountId: "card_itau_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_adobe", projectionId: "proj_adobe", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_it_3", transactionDate: "2026-11-12", competenceMonth: "2026-11", description: "Manutenção Carro (Peças Itaú)", amount: 130.40, type: "EXPENSE", accountId: "card_itau_bruno", paidByUserId: "bruno", ownership: "COLLECTIVE", subcategoryId: "sub_manut_carro", projectionId: "proj_manut_itau", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_it_4", transactionDate: "2026-11-15", competenceMonth: "2026-11", description: "Anuidade Itaucard", amount: 44.00, type: "EXPENSE", accountId: "card_itau_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_anuidade", projectionId: "proj_anuidade_itau", installmentCurrent: 1, installmentTotal: 1 },
    { id: "tx_it_5", transactionDate: "2026-11-16", competenceMonth: "2026-11", description: "Outros Gastos Itaú", amount: 33.70, type: "EXPENSE", accountId: "card_itau_bruno", paidByUserId: "bruno", ownership: "INDIVIDUAL_BRUNO", subcategoryId: "sub_outros", projectionId: "proj_outros_itau", installmentCurrent: 1, installmentTotal: 1 }
  ]
};
