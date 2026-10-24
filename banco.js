/**
 * banco.js
 * Responsável por guardar e ler os dados. Agora na nuvem (Supabase):
 *
 *  - login por e-mail e senha (cada pessoa só vê os próprios dados);
 *  - os dados são carregados uma vez ao entrar e ficam na memória (Estoque.dados),
 *    então a tela continua rápida e o resto do sistema não precisou mudar;
 *  - a cada alteração, só o que mudou é enviado ao banco, em segundo plano
 *    (cria/atualiza linhas novas e apaga as removidas), com nova tentativa se a internet cair.
 *
 * Estrutura no banco: tabelas categorias → variacoes → opcoes, e produtos (veja supabase/schema.sql).
 * Preferências da tela (gráficos abertos etc.) continuam só no navegador (localStorage).
 */
const Banco = {
  CHAVE: "sistema-estoque-v2", // dados antigos, de quando o sistema guardava tudo no navegador
  CHAVE_VERSAO_1: "sistema-estoque-v1",
  TAMANHO_PAGINA: 500,
  TAMANHO_LOTE: 100,

  cliente: null,
  usuario: null,
  status: "ocioso", // ocioso | salvando | salvo | erro
  aoMudarStatus: null, // (status, detalhe) => void
  aoSair: null, // chamado quando a sessão termina (sair, ou login expirou)

  _fonte: null, // referência aos dados em memória (Estoque.dados)
  _snapshot: null, // última versão confirmada na nuvem
  _sujo: false,
  _sincronizando: false,
  _temporizador: null,
  _tentativas: 0,

  // ====================================================================
  // Conexão e login
  // ====================================================================

  /** As chaves do projeto Supabase ficam em config.js. */
  configurado() {
    const config = window.CONFIG_SUPABASE;
    return Boolean(config && config.url && config.anonKey && !String(config.url).includes("COLE_AQUI"));
  },

  bibliotecaCarregada() {
    return Boolean(window.supabase && window.supabase.createClient);
  },

  conectar() {
    const { url, anonKey } = window.CONFIG_SUPABASE;
    this.cliente = window.supabase.createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.addEventListener("online", () => {
      if (this._sujo && !this._sincronizando) this._sincronizar();
    });
    this.cliente.auth.onAuthStateChange((evento, sessao) => {
      if (evento === "SIGNED_OUT" && this.usuario) {
        this._limparEstado();
        if (this.aoSair) this.aoSair();
      }
      if (sessao && sessao.user) this.usuario = sessao.user;
    });
  },

  /** Devolve o usuário já logado neste navegador, ou null. */
  async usuarioLogado() {
    const { data, error } = await this.cliente.auth.getSession();
    if (error) throw error;
    this.usuario = data.session ? data.session.user : null;
    return this.usuario;
  },

  async entrar(email, senha) {
    const { data, error } = await this.cliente.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(this.traduzirErro(error));
    this.usuario = data.user;
    return data.user;
  },

  /** Cria a conta. Se o projeto exigir confirmação por e-mail, `precisaConfirmar` vem true. */
  async criarConta(email, senha) {
    const { data, error } = await this.cliente.auth.signUp({ email, password: senha });
    if (error) throw new Error(this.traduzirErro(error));
    // E-mail já cadastrado: o Supabase não avisa (de propósito), devolve um usuário sem identidades.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("Já existe uma conta com esse e-mail. Use “Entrar”.");
    }
    if (data.session) this.usuario = data.user;
    return { precisaConfirmar: !data.session };
  },

  async sair() {
    const pendente = this._sujo || this._sincronizando;
    if (pendente) {
      await this.sincronizarAgora();
      if (this._sujo) throw new Error("Há alterações que ainda não chegaram à nuvem. Verifique a internet e tente sair de novo.");
    }
    const usuarioAnterior = this.usuario;
    this.usuario = null; // evita o aviso duplicado do onAuthStateChange
    this._limparEstado();
    await this.cliente.auth.signOut();
    return usuarioAnterior;
  },

  _limparEstado() {
    clearTimeout(this._temporizador);
    this._fonte = null;
    this._snapshot = null;
    this._sujo = false;
    this._tentativas = 0;
    this._mudarStatus("ocioso");
  },

  traduzirErro(erro) {
    const texto = String((erro && (erro.message || erro.error_description)) || erro || "").toLowerCase();
    const codigo = String((erro && erro.code) || "").toLowerCase();
    if (codigo === "pgrst205" || codigo === "42p01" || texto.includes("could not find the table") || texto.includes("does not exist")) {
      return "As tabelas ainda não foram criadas no Supabase. Rode o arquivo supabase/schema.sql no SQL Editor.";
    }
    if (texto.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
    if (texto.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).";
    if (texto.includes("already registered")) return "Já existe uma conta com esse e-mail. Use “Entrar”.";
    if (texto.includes("at least") && texto.includes("characters")) return "A senha precisa ter pelo menos 6 caracteres.";
    if (texto.includes("signups not allowed") || codigo === "signup_disabled") return "A criação de novas contas está desativada neste sistema.";
    if (texto.includes("rate limit") || codigo.includes("rate_limit")) return "Muitas tentativas seguidas. Aguarde um pouco e tente de novo.";
    if (texto.includes("invalid email") || texto.includes("unable to validate email")) return "Esse e-mail não parece válido.";
    if (texto.includes("failed to fetch") || texto.includes("networkerror") || texto.includes("load failed")) return "Sem conexão com a internet. Tente de novo.";
    if (texto.includes("jwt") || codigo === "pgrst301") return "Sua sessão expirou. Entre de novo.";
    return (erro && erro.message) || "Algo deu errado. Tente de novo.";
  },

  // ====================================================================
  // Ler da nuvem
  // ====================================================================

  /** Lê uma tabela inteira, em páginas (o Supabase devolve no máximo 1000 linhas por pedido). */
  async _lerTabela(tabela) {
    const linhas = [];
    for (let inicio = 0; ; inicio += this.TAMANHO_PAGINA) {
      const { data, error } = await this.cliente
        .from(tabela)
        .select("*")
        .order("posicao", { ascending: true })
        .order("id", { ascending: true })
        .range(inicio, inicio + this.TAMANHO_PAGINA - 1);
      if (error) throw new Error(this.traduzirErro(error));
      linhas.push(...data);
      if (data.length < this.TAMANHO_PAGINA) return linhas;
    }
  },

  /** Lê tudo do usuário logado e monta { categorias: [...] } no formato que o sistema já usa. */
  async carregarDaNuvem() {
    const [categorias, variacoes, opcoes, produtos] = await Promise.all(
      ["categorias", "variacoes", "opcoes", "produtos"].map((tabela) => this._lerTabela(tabela))
    );

    const agrupar = (linhas, campo) => {
      const mapa = new Map();
      linhas.forEach((linha) => {
        if (!mapa.has(linha[campo])) mapa.set(linha[campo], []);
        mapa.get(linha[campo]).push(linha);
      });
      return mapa;
    };
    const opcoesPorVariacao = agrupar(opcoes, "variacao_id");
    const variacoesPorCategoria = agrupar(variacoes, "categoria_id");
    const produtosPorCategoria = agrupar(produtos, "categoria_id");

    const dados = {
      categorias: categorias.map((categoria) => ({
        id: categoria.id,
        nome: categoria.nome,
        imagem: categoria.imagem || null,
        variacoes: (variacoesPorCategoria.get(categoria.id) || []).map((variacao) => ({
          id: variacao.id,
          nome: variacao.nome,
          opcoes: (opcoesPorVariacao.get(variacao.id) || []).map((opcao) => ({ id: opcao.id, nome: opcao.nome })),
        })),
        produtos: (produtosPorCategoria.get(categoria.id) || []).map((produto) => ({
          id: produto.id,
          nome: produto.nome,
          imagem: produto.imagem || null,
          variacoes: produto.escolhas || {},
          estoque: produto.estoque,
          vendidos: produto.vendidos,
        })),
      })),
    };

    return dados; // quem chamou decide quando adotar (veja adotarDados)
  },

  /** Declara que `dados` é exatamente o que está na nuvem agora. */
  adotarDados(dados) {
    clearTimeout(this._temporizador);
    this._fonte = dados;
    this._snapshot = this._achatar(dados);
    this._sujo = false;
    this._tentativas = 0;
    this._mudarStatus("salvo");
  },

  /** Há alterações ainda não confirmadas pela nuvem? */
  temPendencias() {
    return this._sujo || this._sincronizando;
  },

  // ====================================================================
  // Gravar na nuvem (só o que mudou)
  // ====================================================================

  /** Chamado pelo Estoque a cada alteração. Não espera: o envio acontece em segundo plano. */
  salvar(dados) {
    this._fonte = dados;
    if (!this.cliente || !this.usuario || !this._snapshot) return;
    this._sujo = true;
    this._mudarStatus("salvando");
    clearTimeout(this._temporizador);
    this._temporizador = setTimeout(() => this._sincronizar(), 250);
  },

  /** Envia agora o que estiver pendente e espera terminar (usado ao sair). */
  async sincronizarAgora() {
    clearTimeout(this._temporizador);
    if (this._sincronizando) {
      await new Promise((resolver) => {
        const espera = setInterval(() => {
          if (!this._sincronizando) {
            clearInterval(espera);
            resolver();
          }
        }, 100);
      });
    }
    if (this._sujo) await this._sincronizar();
  },

  async _sincronizar() {
    if (this._sincronizando || !this._snapshot) return;
    this._sincronizando = true;
    try {
      while (this._sujo) {
        this._sujo = false;
        const novo = this._achatar(this._fonte);
        await this._aplicarDiferencas(this._snapshot, novo);
        this._snapshot = novo;
      }
      this._tentativas = 0;
      this._mudarStatus("salvo");
    } catch (erro) {
      this._sujo = true; // nada se perde: a próxima tentativa reenvia o que faltou
      this._tentativas += 1;
      this._mudarStatus("erro", this.traduzirErro(erro));
      const espera = Math.min(30000, 3000 * this._tentativas);
      clearTimeout(this._temporizador);
      this._temporizador = setTimeout(() => this._sincronizar(), espera);
    } finally {
      this._sincronizando = false;
    }
  },

  /** Transforma os dados aninhados em linhas planas, uma lista por tabela: Map(id → { json, linha }). */
  _achatar(dados) {
    const idUsuario = this.usuario ? this.usuario.id : null;
    const tabelas = { categorias: new Map(), variacoes: new Map(), opcoes: new Map(), produtos: new Map() };
    const guardar = (tabela, linha) => tabelas[tabela].set(linha.id, { json: JSON.stringify(linha), linha });

    dados.categorias.forEach((categoria, posicaoCategoria) => {
      guardar("categorias", { id: categoria.id, user_id: idUsuario, nome: categoria.nome, imagem: categoria.imagem || null, posicao: posicaoCategoria });
      categoria.variacoes.forEach((variacao, posicaoVariacao) => {
        guardar("variacoes", { id: variacao.id, user_id: idUsuario, categoria_id: categoria.id, nome: variacao.nome, posicao: posicaoVariacao });
        variacao.opcoes.forEach((opcao, posicaoOpcao) => {
          guardar("opcoes", { id: opcao.id, user_id: idUsuario, variacao_id: variacao.id, nome: opcao.nome, posicao: posicaoOpcao });
        });
      });
      categoria.produtos.forEach((produto, posicaoProduto) => {
        guardar("produtos", {
          id: produto.id,
          user_id: idUsuario,
          categoria_id: categoria.id,
          nome: produto.nome,
          imagem: produto.imagem || null,
          escolhas: produto.variacoes || {},
          estoque: produto.estoque,
          vendidos: produto.vendidos,
          posicao: posicaoProduto,
        });
      });
    });
    return tabelas;
  },

  async _aplicarDiferencas(antigo, novo) {
    // 1) Criar e atualizar, de cima para baixo (a categoria precisa existir antes dos produtos dela).
    for (const tabela of ["categorias", "variacoes", "opcoes", "produtos"]) {
      const mudadas = [];
      novo[tabela].forEach(({ json, linha }, id) => {
        const anterior = antigo[tabela].get(id);
        if (!anterior || anterior.json !== json) mudadas.push(linha);
      });
      for (let i = 0; i < mudadas.length; i += this.TAMANHO_LOTE) {
        const { error } = await this.cliente.from(tabela).upsert(mudadas.slice(i, i + this.TAMANHO_LOTE), { onConflict: "id" });
        if (error) throw error;
      }
    }

    // 2) Apagar o que sumiu. Apagar uma categoria já leva junto variações, opções e produtos dela.
    const sumiram = (tabela) => [...antigo[tabela].keys()].filter((id) => !novo[tabela].has(id));
    const apagar = async (tabela, ids) => {
      for (let i = 0; i < ids.length; i += this.TAMANHO_LOTE) {
        const { error } = await this.cliente.from(tabela).delete().in("id", ids.slice(i, i + this.TAMANHO_LOTE));
        if (error) throw error;
      }
    };
    const paiAindaExiste = (tabela, id, campoPai, tabelaPai) => novo[tabelaPai].has(antigo[tabela].get(id).linha[campoPai]);

    await apagar("categorias", sumiram("categorias"));
    await apagar("variacoes", sumiram("variacoes").filter((id) => paiAindaExiste("variacoes", id, "categoria_id", "categorias")));
    await apagar("opcoes", sumiram("opcoes").filter((id) => paiAindaExiste("opcoes", id, "variacao_id", "variacoes")));
    await apagar("produtos", sumiram("produtos").filter((id) => paiAindaExiste("produtos", id, "categoria_id", "categorias")));
  },

  _mudarStatus(status, detalhe = "") {
    this.status = status;
    if (this.aoMudarStatus) this.aoMudarStatus(status, detalhe);
  },

  // ====================================================================
  // Dados antigos deste navegador (para importar para a nuvem na primeira vez)
  // ====================================================================

  /** Dados que o sistema guardava neste navegador antes de ir para a nuvem, ou null se não houver. */
  lerDadosLocais() {
    try {
      const texto = localStorage.getItem(this.CHAVE);
      if (texto) return JSON.parse(texto);
      const textoAntigo = localStorage.getItem(this.CHAVE_VERSAO_1);
      if (textoAntigo) return this._migrarDaVersao1(JSON.parse(textoAntigo));
    } catch (erro) {
      console.error("Não foi possível ler os dados antigos deste navegador:", erro);
    }
    return null;
  },

  /** Preferências simples da tela (gráficos abertos, notificações vistas...). Nunca lançam erro. */
  lerPreferencia(chave, padrao) {
    try {
      const texto = localStorage.getItem(chave);
      return texto === null ? padrao : JSON.parse(texto);
    } catch (erro) {
      return padrao;
    }
  },

  salvarPreferencia(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
      // Sem armazenamento: a escolha vale só até recarregar a página.
    }
  },

  /**
   * Na versão 1 cada produto guardava um texto livre por variação.
   * Aqui os textos diferentes viram opções da variação.
   */
  _migrarDaVersao1(dadosAntigos) {
    const categorias = dadosAntigos.categorias.map((categoria) => {
      const variacoes = categoria.variacoes.map((variacao) => {
        const nomesDasOpcoes = [];
        categoria.produtos.forEach((produto) => {
          const valor = (produto.variacoes[variacao.id] || "").trim();
          if (valor && !nomesDasOpcoes.includes(valor)) nomesDasOpcoes.push(valor);
        });

        return {
          id: variacao.id,
          nome: variacao.nome,
          opcoes: nomesDasOpcoes.map((nome, posicao) => ({ id: `${variacao.id}-${posicao}`, nome })),
        };
      });

      const produtos = categoria.produtos.map((produto) => {
        const escolhas = {};
        variacoes.forEach((variacao) => {
          const valor = (produto.variacoes[variacao.id] || "").trim();
          const opcao = variacao.opcoes.find((o) => o.nome === valor);
          if (opcao) escolhas[variacao.id] = opcao.id;
        });
        return { ...produto, variacoes: escolhas };
      });

      return { ...categoria, variacoes, produtos };
    });

    return { categorias };
  },
};
