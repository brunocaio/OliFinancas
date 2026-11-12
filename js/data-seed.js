// ============================================================================
// OLIFINANÇAS 🫒 - BASE DE DADOS INICIAL (EXTRAÍDA DA PLANILHA DE BRUNO & NÚBIA)
// ============================================================================

window.INITIAL_SEED_DATA = {
  version: "2.0.0-clean",
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
      defaultIncome: 0
    },
    {
      id: "nubia",
      name: "Núbia",
      email: "nubia@olifinancas.app",
      avatarColor: "#f43f5e",
      defaultIncome: 0
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
      id: "cc_nubia",
      name: "Conta Corrente Núbia",
      type: "CHECKING",
      ownerId: "nubia",
      closingDay: null,
      dueDay: null,
      monthlyTarget: 0,
      color: "#f43f5e"
    }
  ],

  categories: [
    { id: "cat_moradia", name: "Moradia & Contas Fixas", type: "EXPENSE", icon: "home", color: "#84cc16", sortOrder: 1 },
    { id: "cat_alimentacao", name: "Alimentação & Mercado", type: "EXPENSE", icon: "utensils", color: "#eab308", sortOrder: 2 },
    { id: "cat_transporte", name: "Transporte & Veículos", type: "EXPENSE", icon: "car", color: "#10b981", sortOrder: 3 },
    { id: "cat_saude", name: "Saúde & Autocuidado", type: "EXPENSE", icon: "heart-pulse", color: "#ef4444", sortOrder: 4 },
    { id: "cat_familia", name: "Família, Filhos & Apoio", type: "EXPENSE", icon: "users", color: "#a855f7", sortOrder: 5 },
    { id: "cat_pets", name: "Pets (Chicó)", type: "EXPENSE", icon: "dog", color: "#f97316", sortOrder: 6 },
    { id: "cat_assinaturas", name: "Assinaturas", type: "EXPENSE", icon: "tv", color: "#06b6d4", sortOrder: 7 },
    { id: "cat_lazer", name: "Lazer, Cultura & Social", type: "EXPENSE", icon: "sparkles", color: "#f43f5e", sortOrder: 8 },
    { id: "cat_taxas_bancarias", name: "Taxas & Tarifas Bancárias", type: "EXPENSE", icon: "receipt", color: "#f97316", sortOrder: 9 },
    { id: "cat_financeiro", name: "Anuidades & Parcelados", type: "EXPENSE", icon: "credit-card", color: "#78716c", sortOrder: 10 },
    { id: "cat_outros", name: "Outros (Triagem)", type: "EXPENSE", icon: "help-circle", color: "#a8a29e", sortOrder: 11 },
    { id: "cat_receitas", name: "Receitas & Salários", type: "INCOME", icon: "wallet", color: "#65a30d", sortOrder: 12 },
    { id: "cat_transferencia", name: "Pagamento de Fatura / Transferência", type: "TRANSFER", icon: "arrow-left-right", color: "#94a3b8", sortOrder: 13 }
  ],

  subcategories: [
    // 1. Moradia & Contas Fixas
    { id: "sub_aluguel", categoryId: "cat_moradia", name: "Aluguel", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: true, keywords: ["ALUGUEL", "IMOBILIARIA", "QUINTOANDAR"] },
    { id: "sub_condominio", categoryId: "cat_moradia", name: "Água / Condomínio", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["CONDOMINIO", "AGUA", "CEDAE", "SABESP", "AGUAS"] },
    { id: "sub_luz", categoryId: "cat_moradia", name: "Luz / Energia", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["LIGHT", "ENEL", "ENERGIA", "CPFL", "NEOENERGIA", "LUZ"] },
    { id: "sub_gas", categoryId: "cat_moradia", name: "Gás", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["NATURGY", "COMGAS", "ULTRAGAZ", "SUPERGASBRAS", "GAS"] },
    { id: "sub_internet", categoryId: "cat_moradia", name: "Internet Casa", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["CLARO NET", "NET VIRTUA", "VIVO FIBRA", "OI FIBRA", "INTERNET"] },
    { id: "sub_celular", categoryId: "cat_moradia", name: "Celular", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["TIM", "VIVO MOVEL", "CLARO MOVEL", "CELULAR"] },
    { id: "sub_vigias", categoryId: "cat_moradia", name: "Vigias / Segurança", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["VIGIA", "SEGURANCA RUA"] },
    { id: "sub_iptu", categoryId: "cat_moradia", name: "IPTU", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: true, keywords: ["IPTU", "PREFEITURA"] },
    { id: "sub_faxina", categoryId: "cat_moradia", name: "Faxina / Diarista", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["FAXINA", "DIARISTA"] },
    { id: "sub_manut_eletro", categoryId: "cat_moradia", name: "Manutenção Casa & Eletro", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["LEROY", "OBRAMAX", "CONSERTO", "ELETRO"] },

    // 2. Alimentação
    { id: "sub_feira_sup", categoryId: "cat_alimentacao", name: "Feira e Suprimentos (Mercado)", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["SUPERMERCADO", "MERCADO", "GUANABARA", "ZONA SUL", "MUNDIAL", "ASSAI", "ATACADAO", "CARREFOUR", "PAO DE ACUCAR", "HORTIFRUTI", "FEIRA"] },
    { id: "sub_feira_cc", categoryId: "cat_alimentacao", name: "Feira (Conta Corrente / Pix)", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: false, keywords: [] },
    { id: "sub_delivery", categoryId: "cat_alimentacao", name: "Delivery Comida (iFood)", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["IFOOD", "IFD*", "RAPPI", "ZE DELIVERY", "AIQFOME"] },
    { id: "sub_restaurantes", categoryId: "cat_alimentacao", name: "Restaurantes & Cafés", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["RESTAURANTE", "PADARIA", "LANCHONETE", "BAR ", "CAFE", "BISTRO", "PIZZARIA", "SUSHI", "BURGER"] },

    // 3. Transporte & Veículos
    { id: "sub_gasolina", categoryId: "cat_transporte", name: "Gasolina / Combustível", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["POSTO", "SHELL", "IPIRANGA", "PETROBRAS", "VIBRA", "COMBUSTIVEL", "GASOLINA", "AUTO POSTO"] },
    { id: "sub_manut_carro", categoryId: "cat_transporte", name: "Manutenção Carro", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["OFICINA", "MECANICA", "PNEU", "AUTOCENTER", "AUTO PECAS", "REVISAO", "LAVA JATO"] },
    { id: "sub_seguro_carro", categoryId: "cat_transporte", name: "Seguro Carro", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["PORTO SEGURO", "AZUL SEGUROS", "TOKIO MARINE", "SUHAI", "ALLIANZ", "YOUSE", "SEGURO AUTO"] },
    { id: "sub_nutag", categoryId: "cat_transporte", name: "NuTag / Pedágio", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["NUTAG", "TAGGY", "SEM PARAR", "VELOE", "CONECTCAR", "PEDAGIO"] },
    { id: "sub_estacionamento", categoryId: "cat_transporte", name: "Estacionamento", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["ESTACIONAMENTO", "ESTAPAR", "INDIGO", "PARK", "SHOPPING PARK"] },
    { id: "sub_flanelinhas", categoryId: "cat_transporte", name: "Flanelinhas", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["FLANELINHA", "GUARDADOR"] },
    { id: "sub_transporte_app", categoryId: "cat_transporte", name: "Transporte / Uber / 99", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["UBER", "99APP", "99 *", "TAXI", "METRO", "RIOCARD", "BILHETE"] },
    { id: "sub_ipva", categoryId: "cat_transporte", name: "IPVA / Licenciamento", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: true, keywords: ["IPVA", "DETRAN", "GRT"] },

    // 4. Saúde & Autocuidado
    { id: "sub_plano_saude", categoryId: "cat_saude", name: "Plano de Saúde", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["UNIMED", "AMIL", "SULAMERICA", "BRADESCO SAUDE", "ASSIM", "NOTREDAME", "PLANO DE SAUDE"] },
    { id: "sub_analise", categoryId: "cat_saude", name: "Análise / Terapia", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["ANALISE", "TERAPIA", "PSICOLOGA", "PSIQUIATRA"] },
    { id: "sub_fisioterapia", categoryId: "cat_saude", name: "Fisioterapia / Pilates", defaultOwnership: "INDIVIDUAL_NUBIA", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: true, keywords: ["FISIOTERAPIA", "PILATES", "ACADEMIA"] },
    { id: "sub_autocuidado", categoryId: "cat_saude", name: "Auto Cuidado & Farmácia", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["DROGARIA", "RAIA", "PACHECO", "VENANCIO", "FARMACIA", "BARBEARIA", "SALAO", "COSMETICO", "PERFUMARIA"] },

    // 5. Família, Filhos & Apoio
    { id: "sub_creche", categoryId: "cat_familia", name: "Creche / Escola", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["CRECHE", "ESCOLA", "COLEGIO"] },
    { id: "sub_pedro_gomes", categoryId: "cat_familia", name: "Pedro Gomes", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: true, keywords: ["PEDRO GOMES"] },
    { id: "sub_canguru", categoryId: "cat_familia", name: "Canguru", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: false, keywords: ["CANGURU"] },
    { id: "sub_fotografa", categoryId: "cat_familia", name: "Fotógrafa", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: false, keywords: ["FOTOGRAFA", "FOTOS", "ENSAIO"] },
    { id: "sub_caio", categoryId: "cat_familia", name: "Caio", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["CAIO"] },

    // 6. Pets (Chicó)
    { id: "sub_chico", categoryId: "cat_pets", name: "Chicó (Ração, Vet & Petshop)", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["PETZ", "COBASI", "PETLOVE", "VETERINARIO", "CHICO", "RACAO", "PETSHOP"] },

    // 7. Assinaturas
    { id: "sub_google_one", categoryId: "cat_assinaturas", name: "Google One", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["GOOGLE ONE", "GOOGLE*STORAGE", "GOOGLE CLOUD"] },
    { id: "sub_amazon_prime", categoryId: "cat_assinaturas", name: "Amazon Prime", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["AMAZON PRIME", "AMAZONPRIMEBR", "AMAZON AD FREE", "PRIME VIDEO", "AMAZON BR"] },
    { id: "sub_netflix", categoryId: "cat_assinaturas", name: "Netflix", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["NETFLIX"] },
    { id: "sub_youtube", categoryId: "cat_assinaturas", name: "YouTube Premium", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["YOUTUBE", "GOOGLE*YOUTUBE"] },
    { id: "sub_hbomax", categoryId: "cat_assinaturas", name: "HBO Max / Max", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["HBO", "MAX.COM", "WARNER"] },
    { id: "sub_globoplay", categoryId: "cat_assinaturas", name: "Globoplay", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["GLOBOPLAY", "GOOGLE GLOBOPLAY"] },
    { id: "sub_chatgpt", categoryId: "cat_assinaturas", name: "ChatGPT / OpenAI", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["CHATGPT", "OPENAI"] },
    { id: "sub_spotify", categoryId: "cat_assinaturas", name: "Spotify", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["SPOTIFY"] },
    { id: "sub_adobe", categoryId: "cat_assinaturas", name: "Adobe Creative Cloud", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["ADOBE"] },
    { id: "sub_outras_assinaturas", categoryId: "cat_assinaturas", name: "Outras Assinaturas (Serasa, iCloud, Disney...)", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["SERASA", "ICLOUD", "APPLE.COM/BILL", "DISNEY", "PARAMOUNT", "MELI+", "ASSINATURA"] },

    // 8. Lazer, Cultura & Social
    { id: "sub_lazer_geral", categoryId: "cat_lazer", name: "Lazer & Passeios", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["CINEMA", "INGRESSO", "SYMPLA", "EVENTIM", "TEATRO", "LAZER", "SHOW", "BARZINHO", "CHOPP"] },
    { id: "sub_jogos", categoryId: "cat_lazer", name: "Jogos / Games", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["STEAM", "PLAYSTATION", "SONY", "XBOX", "NINTENDO", "EPIC GAMES", "JOGOS"] },
    { id: "sub_maracatu", categoryId: "cat_lazer", name: "Maracatu / IPN", defaultOwnership: "INDIVIDUAL_NUBIA", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: true, keywords: ["MARACATU", "IPN"] },
    { id: "sub_festa", categoryId: "cat_lazer", name: "Festas & Comemorações", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: ["FESTA", "PRESENTES"] },

    // 9. Taxas & Tarifas Bancárias
    { id: "sub_tarifas_bancarias", categoryId: "cat_taxas_bancarias", name: "Tarifas & Taxas Bancárias", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["TARIFA PACOTE", "TARIFA DE SERVICO", "TARIFA EXTRATO", "PACOTE DE SERVICOS", "TAXA MANUTENCAO", "TAXA CONTA", "TARIFA MENSALIDADE", "IOF"] },

    // 10. Anuidades & Parcelados
    { id: "sub_anuidade", categoryId: "cat_financeiro", name: "Anuidade de Cartão", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["ANUIDADE", "ANUIDADE DIFERENCIADA", "PARCELA ANUIDADE"] },
    { id: "sub_parceladas", categoryId: "cat_financeiro", name: "Compras Parceladas", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: true, keywords: ["PARCELA", "MERCADOLIVRE", "MAGALU", "SHOPEE", "CASAS BAHIA"] },

    // 11. Outros (Triagem)
    { id: "sub_outros", categoryId: "cat_outros", name: "Outros / Diversos (Triar)", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: [] },
    { id: "sub_sem_categoria", categoryId: "cat_outros", name: "Sem Categoria", defaultOwnership: "COLLECTIVE", defaultAccountId: null, defaultMeta: 0.00, isFixed: false, keywords: [] },

    // 10. Receitas
    { id: "sub_salario_aoro", categoryId: "cat_receitas", name: "Salário AORO", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: true, keywords: ["AORO", "SALARIO", "PAGAMENTO FOLHA"] },
    { id: "sub_ressarc_aoro", categoryId: "cat_receitas", name: "Ressarcimento AORO", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["RESSARCIMENTO", "REEMBOLSO"] },
    { id: "sub_salario_unisuam", categoryId: "cat_receitas", name: "Salário UNISUAM", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_nubia", defaultMeta: 0.00, isFixed: true, keywords: ["UNISUAM"] },
    { id: "sub_rt_rendimentos", categoryId: "cat_receitas", name: "RT / Rendimentos / Caixinha", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["RENDIMENTO", "DIVIDENDO", "RT "] },

    // 11. Transferência / Movimentação entre Contas
    { id: "sub_transf_propria", categoryId: "cat_transferencia", name: "Transferência entre Contas Próprias", defaultOwnership: "INDIVIDUAL_BRUNO", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["MESMA TITULARIDADE", "ENTRE CONTAS", "TRANSFERENCIA PROPRIA", "PIX PROPRIO", "RESGATE", "APLICACAO", "DINHEIRO GUARDADO", "CAIXINHA"] },
    { id: "sub_pag_fatura", categoryId: "cat_transferencia", name: "Pagamento de Fatura Cartão", defaultOwnership: "COLLECTIVE", defaultAccountId: "cc_bruno", defaultMeta: 0.00, isFixed: false, keywords: ["PAGAMENTO DE FATURA", "PAGTO FATURA", "FATURA CARTAO"] }
  ],

  projections: [],

  transactions: []
};
