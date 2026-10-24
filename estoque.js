/**
 * estoque.js
 * Regras de negócio do estoque. Não mexe na tela, só nos dados.
 *
 * Estrutura dos dados:
 * categoria = {
 *   id, nome, imagem,                                   // imagem = texto "data:image/..." ou null
 *   variacoes: [{ id, nome, opcoes: [{ id, nome }] }],   // ex.: Cor → Azul, Vermelho
 *   produtos:  [{ id, nome, imagem, variacoes: { [idVariacao]: idOpcao }, estoque, vendidos }]
 * }
 *
 * Cada item de `produtos` é uma combinação com estoque próprio
 * (ex.: "Camiseta básica · Azul · M" é um item, "Camiseta básica · Azul · G" é outro).
 */
const Estoque = {
  dados: { categorias: [] }, // preenchido após o login (veja iniciarSistema em interface.js)

  // ---------- Utilitários ----------

  _salvar() {
    Banco.salvar(this.dados);
  },

  _gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  /** Deixa o texto em minúsculas e sem acentos, para comparar e buscar. */
  normalizarTexto(texto) {
    return String(texto)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  },

  /** Separa o que foi digitado na busca em palavras normalizadas. */
  separarPalavras(texto) {
    return this.normalizarTexto(texto).split(/\s+/).filter(Boolean);
  },

  /**
   * Posições onde `palavra` aparece no texto (ambos já normalizados).
   * Palavras curtas (1 ou 2 letras, como "m" ou "p") só valem no começo de uma palavra,
   * senão "m" casaria com o meio de "Camisetas" e "Vermelho".
   */
  posicoesDaPalavra(textoNormalizado, palavra) {
    const exigeInicioDePalavra = palavra.length < 3;
    const posicoes = [];

    let posicao = textoNormalizado.indexOf(palavra);
    while (posicao !== -1) {
      const comecoDePalavra = posicao === 0 || !/[a-z0-9]/.test(textoNormalizado[posicao - 1]);
      if (!exigeInicioDePalavra || comecoDePalavra) posicoes.push(posicao);
      posicao = textoNormalizado.indexOf(palavra, posicao + 1);
    }

    return posicoes;
  },

  _validarQuantidade(valor, nomeCampo) {
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < 0) {
      throw new Error(`${nomeCampo} deve ser um número inteiro maior ou igual a zero.`);
    }
    return numero;
  },

  /** Aceita só imagens já reduzidas pela tela (data URL). Vazio vira null. */
  _validarImagem(imagem) {
    if (!imagem) return null;
    const valida = /^data:image\/(webp|jpeg|png);base64,/.test(imagem) && imagem.length <= 400000;
    if (!valida) throw new Error("Imagem inválida. Escolha outra.");
    return imagem;
  },

  _exigirCategoria(idCategoria) {
    const categoria = this.buscarCategoria(idCategoria);
    if (!categoria) throw new Error("Categoria não encontrada.");
    return categoria;
  },

  _exigirProduto(categoria, idProduto) {
    const produto = categoria.produtos.find((p) => p.id === idProduto);
    if (!produto) throw new Error("Produto não encontrado.");
    return produto;
  },

  /** Nome da opção escolhida pelo produto numa variação (ou "" se não tiver). */
  valorDaVariacao(categoria, produto, variacao) {
    const opcao = variacao.opcoes.find((o) => o.id === produto.variacoes[variacao.id]);
    return opcao ? opcao.nome : "";
  },

  // ---------- Categorias ----------

  listarCategorias() {
    return this.dados.categorias;
  },

  buscarCategoria(idCategoria) {
    return this.dados.categorias.find((c) => c.id === idCategoria);
  },

  /**
   * Cria uma categoria nova (idCategoria = null) ou atualiza uma existente.
   * `variacoes` = [{ id, nome, opcoes: [{ id, nome }] }]. Itens sem id são novos.
   * Variações e opções que sumiram da lista são removidas dos produtos também.
   */
  salvarCategoria(idCategoria, nome, variacoes, imagem = null) {
    nome = nome.trim();
    if (!nome) throw new Error("Informe o nome da categoria.");
    const imagemValidada = this._validarImagem(imagem);

    const variacoesValidadas = this._validarVariacoes(variacoes);
    const variacoesFinais = variacoesValidadas.map((variacao) => ({
      id: variacao.id || this._gerarId(),
      nome: variacao.nome,
      opcoes: variacao.opcoes.map((opcao) => ({
        id: opcao.id || this._gerarId(),
        nome: opcao.nome,
      })),
    }));

    let categoria = idCategoria ? this._exigirCategoria(idCategoria) : null;
    if (!categoria) {
      categoria = { id: this._gerarId(), nome, variacoes: [], produtos: [] };
      this.dados.categorias.push(categoria);
    }

    categoria.nome = nome;
    categoria.imagem = imagemValidada;
    categoria.variacoes = variacoesFinais;
    categoria.produtos.forEach((produto) => this._descartarEscolhasInvalidas(categoria, produto));

    this._salvar();
  },

  /** Confere nomes e opções. Ignora variações totalmente em branco. */
  _validarVariacoes(variacoes) {
    const preenchidas = variacoes
      .map((variacao) => ({
        id: variacao.id,
        nome: variacao.nome.trim(),
        opcoes: variacao.opcoes
          .map((opcao) => ({ id: opcao.id, nome: opcao.nome.trim() }))
          .filter((opcao) => opcao.nome),
      }))
      .filter((variacao) => variacao.nome || variacao.opcoes.length > 0);

    const nomesDasVariacoes = new Set();
    preenchidas.forEach((variacao) => {
      if (!variacao.nome) {
        throw new Error("Dê um nome para todas as variações (ex.: Cor, Tamanho).");
      }

      const chaveVariacao = this.normalizarTexto(variacao.nome);
      if (nomesDasVariacoes.has(chaveVariacao)) {
        throw new Error(`A variação "${variacao.nome}" está repetida.`);
      }
      nomesDasVariacoes.add(chaveVariacao);

      if (variacao.opcoes.length === 0) {
        throw new Error(`A variação "${variacao.nome}" precisa de pelo menos uma opção.`);
      }

      const nomesDasOpcoes = new Set();
      variacao.opcoes.forEach((opcao) => {
        const chaveOpcao = this.normalizarTexto(opcao.nome);
        if (nomesDasOpcoes.has(chaveOpcao)) {
          throw new Error(`A opção "${opcao.nome}" está repetida em "${variacao.nome}".`);
        }
        nomesDasOpcoes.add(chaveOpcao);
      });
    });

    return preenchidas;
  },

  /** Tira do produto escolhas de variações ou opções que não existem mais. */
  _descartarEscolhasInvalidas(categoria, produto) {
    Object.keys(produto.variacoes).forEach((idVariacao) => {
      const variacao = categoria.variacoes.find((v) => v.id === idVariacao);
      const opcaoExiste =
        variacao && variacao.opcoes.some((o) => o.id === produto.variacoes[idVariacao]);
      if (!opcaoExiste) delete produto.variacoes[idVariacao];
    });
  },

  excluirCategoria(idCategoria) {
    this.dados.categorias = this.dados.categorias.filter((c) => c.id !== idCategoria);
    this._salvar();
  },

  // ---------- Produtos ----------

  /**
   * Monta todas as combinações possíveis a partir das opções marcadas.
   * `opcoesMarcadas` = { [idVariacao]: [idOpcao, ...] }
   * Ex.: Cor (Azul, Vermelho) x Tamanho (P, M) → 4 combinações.
   * Categoria sem variações → 1 combinação vazia (o produto "puro").
   */
  gerarCombinacoes(categoria, opcoesMarcadas) {
    let combinacoes = [{}];

    categoria.variacoes.forEach((variacao) => {
      const marcadas = opcoesMarcadas[variacao.id] || [];
      combinacoes = combinacoes.flatMap((combinacao) =>
        marcadas.map((idOpcao) => ({ ...combinacao, [variacao.id]: idOpcao }))
      );
    });

    return combinacoes;
  },

  /** Garante que o produto escolheu uma opção válida em cada variação da categoria. */
  _validarEscolhas(categoria, escolhas) {
    const validadas = {};
    categoria.variacoes.forEach((variacao) => {
      const idOpcao = escolhas[variacao.id];
      if (!variacao.opcoes.some((o) => o.id === idOpcao)) {
        throw new Error(`Escolha uma opção de "${variacao.nome}".`);
      }
      validadas[variacao.id] = idOpcao;
    });
    return validadas;
  },

  _chaveDoProduto(nome, escolhas) {
    const opcoes = Object.keys(escolhas)
      .sort()
      .map((idVariacao) => escolhas[idVariacao]);
    return [this.normalizarTexto(nome.trim()), ...opcoes].join("|");
  },

  _existeProdutoIgual(categoria, nome, escolhas, idIgnorado = null) {
    const chave = this._chaveDoProduto(nome, escolhas);
    return categoria.produtos.some(
      (p) => p.id !== idIgnorado && this._chaveDoProduto(p.nome, p.variacoes) === chave
    );
  },

  /**
   * Cadastra um produto com uma ou várias combinações de uma vez.
   * `combinacoes` = [{ variacoes: { [idVariacao]: idOpcao }, estoque }]
   */
  cadastrarProduto(idCategoria, nome, combinacoes, imagem = null) {
    const categoria = this._exigirCategoria(idCategoria);

    nome = nome.trim();
    if (!nome) throw new Error("Informe o nome do produto.");
    if (combinacoes.length === 0) {
      throw new Error("Marque pelo menos uma opção de cada variação.");
    }

    const imagemValidada = this._validarImagem(imagem);
    const novos = combinacoes.map((combinacao) => ({
      id: this._gerarId(),
      nome,
      imagem: imagemValidada,
      variacoes: this._validarEscolhas(categoria, combinacao.variacoes),
      estoque: this._validarQuantidade(combinacao.estoque, "Estoque"),
      vendidos: 0,
    }));

    novos.forEach((novo) => {
      if (this._existeProdutoIgual(categoria, novo.nome, novo.variacoes)) {
        throw new Error(
          "Uma das combinações marcadas já está cadastrada. Edite o item na tabela ou desmarque a combinação."
        );
      }
    });

    categoria.produtos.push(...novos);
    this._salvar();
  },

  /** Edita um item (uma combinação) já cadastrado. */
  atualizarProduto(idCategoria, idProduto, dadosProduto) {
    const categoria = this._exigirCategoria(idCategoria);
    const produto = this._exigirProduto(categoria, idProduto);

    const nome = dadosProduto.nome.trim();
    if (!nome) throw new Error("Informe o nome do produto.");

    const escolhas = this._validarEscolhas(categoria, dadosProduto.variacoes);
    const estoque = this._validarQuantidade(dadosProduto.estoque, "Estoque");
    const vendidos = this._validarQuantidade(dadosProduto.vendidos, "Vendidos");
    const imagem = this._validarImagem(dadosProduto.imagem);

    if (this._existeProdutoIgual(categoria, nome, escolhas, idProduto)) {
      throw new Error("Já existe outro item com esse nome e essas opções.");
    }

    Object.assign(produto, { nome, imagem, variacoes: escolhas, estoque, vendidos });
    this._salvar();
  },

  excluirProduto(idCategoria, idProduto) {
    const categoria = this._exigirCategoria(idCategoria);
    categoria.produtos = categoria.produtos.filter((p) => p.id !== idProduto);
    this._salvar();
  },

  // ---------- Ações em massa ----------

  /** `itens` = [{ idCategoria, idProduto }] */
  excluirProdutos(itens) {
    itens.forEach(({ idCategoria, idProduto }) => {
      const categoria = this.buscarCategoria(idCategoria);
      if (categoria) categoria.produtos = categoria.produtos.filter((p) => p.id !== idProduto);
    });
    this._salvar();
  },

  /** `alteracao` = null (não mexe) ou { modo: "definir" | "somar" | "subtrair", valor }. */
  _aplicarNumero(atual, alteracao, nomeCampo) {
    if (!alteracao) return atual;
    const valor = this._validarQuantidade(alteracao.valor, nomeCampo);
    if (alteracao.modo === "somar") return atual + valor;
    if (alteracao.modo === "subtrair") {
      if (valor > atual) throw new Error(`${nomeCampo} ficaria negativo em algum dos itens selecionados.`);
      return atual - valor;
    }
    return valor;
  },

  /**
   * Altera vários itens de uma vez. Tudo ou nada: se qualquer item der erro, nenhum é alterado.
   * `alteracoes` = { nome, variacoes: { [idVariacao]: idOpcao }, estoque, vendidos, imagem }
   * Nome em branco, variação sem opção e número nulo significam "manter como está".
   */
  atualizarEmMassa(itens, alteracoes) {
    const idsSelecionados = new Set(itens.map((item) => item.idProduto));

    const planos = itens.map(({ idCategoria, idProduto }) => {
      const categoria = this._exigirCategoria(idCategoria);
      const produto = this._exigirProduto(categoria, idProduto);
      const escolhas = { ...produto.variacoes };
      Object.entries(alteracoes.variacoes || {}).forEach(([idVariacao, idOpcao]) => {
        if (idOpcao) escolhas[idVariacao] = idOpcao;
      });

      return {
        categoria,
        produto,
        escolhas,
        nome: (alteracoes.nome || "").trim() || produto.nome,
        estoque: this._aplicarNumero(produto.estoque, alteracoes.estoque, "Estoque"),
        vendidos: this._aplicarNumero(produto.vendidos, alteracoes.vendidos, "Vendidos"),
        // undefined = manter a imagem atual
        imagem: alteracoes.imagem === undefined ? produto.imagem ?? null : this._validarImagem(alteracoes.imagem),
      };
    });

    const chaves = new Set();
    planos.forEach((plano) => {
      this._validarEscolhas(plano.categoria, plano.escolhas);
      const chave = `${plano.categoria.id}|${this._chaveDoProduto(plano.nome, plano.escolhas)}`;
      if (chaves.has(chave)) {
        throw new Error("Essas alterações deixariam dois itens iguais (mesmo nome e mesmas opções).");
      }
      chaves.add(chave);

      const chaveDoPlano = this._chaveDoProduto(plano.nome, plano.escolhas);
      const conflito = plano.categoria.produtos.some(
        (outro) => !idsSelecionados.has(outro.id) && this._chaveDoProduto(outro.nome, outro.variacoes) === chaveDoPlano
      );
      if (conflito) throw new Error(`Já existe outro item igual a "${plano.nome}" com essas opções.`);
    });

    planos.forEach(({ produto, nome, escolhas, estoque, vendidos, imagem }) => {
      Object.assign(produto, { nome, imagem, variacoes: escolhas, estoque, vendidos });
    });
    this._salvar();
  },

  // ---------- Busca e venda ----------

  /**
   * Busca produtos de todas as categorias (ou só de uma).
   * Todas as palavras digitadas precisam aparecer no nome do produto,
   * da categoria ou das opções, em qualquer ordem e sem diferenciar acentos.
   * Ex.: "azul m" acha a camiseta Azul tamanho M.
   * Produtos com estoque aparecem antes dos esgotados.
   */
  buscarProdutos(termo, idCategoria = null) {
    const palavras = this.separarPalavras(termo);
    const resultados = [];

    this.dados.categorias.forEach((categoria) => {
      if (idCategoria && categoria.id !== idCategoria) return;

      categoria.produtos.forEach((produto) => {
        const opcoes = categoria.variacoes.map((v) => this.valorDaVariacao(categoria, produto, v));
        const texto = this.normalizarTexto([categoria.nome, produto.nome, ...opcoes].join(" "));

        if (palavras.every((palavra) => this.posicoesDaPalavra(texto, palavra).length > 0)) {
          resultados.push({ categoria, produto });
        }
      });
    });

    return resultados.sort((a, b) => (b.produto.estoque > 0) - (a.produto.estoque > 0));
  },

  /** Tira `quantidade` do estoque e soma em vendidos. */
  registrarVenda(idCategoria, idProduto, quantidade) {
    const categoria = this._exigirCategoria(idCategoria);
    const produto = this._exigirProduto(categoria, idProduto);

    const qtd = Number(quantidade);
    if (!Number.isInteger(qtd) || qtd < 1) {
      throw new Error("Informe uma quantidade de pelo menos 1.");
    }
    if (qtd > produto.estoque) {
      throw new Error(`Estoque insuficiente: restam apenas ${produto.estoque}.`);
    }

    produto.estoque -= qtd;
    produto.vendidos += qtd;
    this._salvar();
  },
};
