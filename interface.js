/**
 * interface.js
 * Tudo que mexe na tela: desenhar tabelas, abrir janelas e reagir aos cliques.
 * As regras de estoque ficam em estoque.js.
 */

// ====================================================================
// Utilitários
// ====================================================================

/**
 * Cria um elemento HTML.
 * Opções especiais: classe, texto, aoClicar. As demais viram atributos
 * (true liga o atributo, false/null/undefined ignora).
 * Usa textContent (nunca innerHTML), então o que o usuário digita é sempre seguro.
 */
function criarElemento(tag, opcoes = {}, ...filhos) {
  const elemento = document.createElement(tag);

  Object.entries(opcoes).forEach(([nome, valor]) => {
    if (nome === "classe") elemento.className = valor;
    else if (nome === "texto") elemento.textContent = valor;
    else if (nome === "aoClicar") elemento.addEventListener("click", valor);
    else if (valor === true) elemento.setAttribute(nome, "");
    else if (valor !== false && valor !== null && valor !== undefined) {
      elemento.setAttribute(nome, valor);
    }
  });

  filhos.forEach((filho) => elemento.append(filho));
  return elemento;
}

function mostrarErro(idElemento, mensagem) {
  document.getElementById(idElemento).textContent = mensagem;
}

function abrirDialogo(idDialogo) {
  document.getElementById(idDialogo).showModal();
}

function fecharDialogo(idDialogo) {
  document.getElementById(idDialogo).close();
}

function textoUnidades(quantidade) {
  return `${quantidade} ${quantidade === 1 ? "unidade" : "unidades"}`;
}

/** Ex.: "Azul / M" (só as variações que o produto tem). */
function descreverVariacoes(categoria, produto) {
  return categoria.variacoes
    .map((variacao) => Estoque.valorDaVariacao(categoria, produto, variacao))
    .filter(Boolean)
    .join(" / ");
}

/**
 * Devolve o texto com as palavras buscadas destacadas (<mark>),
 * ignorando acentos e maiúsculas.
 */
function criarTextoComDestaque(texto, palavras) {
  const fragmento = document.createDocumentFragment();
  const normalizado = Estoque.normalizarTexto(texto);

  // Se a normalização mudou o tamanho do texto, não dá para alinhar o destaque.
  if (palavras.length === 0 || normalizado.length !== texto.length) {
    fragmento.append(texto);
    return fragmento;
  }

  const marcado = new Array(texto.length).fill(false);
  palavras.forEach((palavra) => {
    Estoque.posicoesDaPalavra(normalizado, palavra).forEach((posicao) => {
      for (let i = posicao; i < posicao + palavra.length; i++) marcado[i] = true;
    });
  });

  let inicio = 0;
  for (let i = 1; i <= texto.length; i++) {
    if (i === texto.length || marcado[i] !== marcado[inicio]) {
      const trecho = texto.slice(inicio, i);
      fragmento.append(marcado[inicio] ? criarElemento("mark", { texto: trecho }) : trecho);
      inicio = i;
    }
  }
  return fragmento;
}

// ====================================================================
// Tela principal: categorias e tabelas
// ====================================================================

function desenharTela() {
  const container = document.getElementById("lista-categorias");
  container.replaceChildren();

  const categorias = Estoque.listarCategorias();
  limparSelecaoInexistente(categorias);
  desenharGraficos(categorias);
  desenharNotificacoes(categorias);
  atualizarBarraDeSelecao();

  if (categorias.length === 0) {
    container.append(
      criarElemento("p", {
        classe: "vazio",
        texto: 'Nenhuma categoria ainda. Clique em "+ Criar categoria" para começar.',
      })
    );
    return;
  }

  categorias.forEach((categoria) => container.append(criarCartaoCategoria(categoria)));
}

function criarCartaoCategoria(categoria) {
  const cabecalho = criarElemento(
    "div",
    { classe: "cartao-cabecalho" },
    criarElemento(
      "div",
      { classe: "cartao-titulo" },
      criarBotaoSeta(categoria),
      criarMiniatura(categoria.imagem, categoria.nome),
      criarElemento("h2", { texto: categoria.nome }),
      criarElemento("span", { classe: "cartao-meta", texto: resumoDaCategoria(categoria) })
    ),
    criarElemento(
      "div",
      { classe: "cartao-acoes" },
      criarElemento("button", {
        type: "button",
        classe: "botao botao-primario",
        texto: "+ Produto",
        aoClicar: () => abrirFormularioNovoProduto(categoria.id),
      }),
      criarElemento("button", {
        type: "button",
        classe: "botao botao-secundario",
        texto: "Editar categoria",
        aoClicar: () => abrirFormularioCategoria(categoria.id),
      }),
      criarElemento("button", {
        type: "button",
        classe: "botao botao-perigo",
        texto: "Excluir",
        aoClicar: () => confirmarExclusaoCategoria(categoria),
      })
    )
  );

  const recolhida = colapsadas.has(categoria.id);
  const cartao = criarElemento("section", { classe: ["cartao", recolhida && "recolhida", categoria.id === categoriaAtiva && "ativa"].filter(Boolean).join(" "), id: `categoria-${categoria.id}` }, cabecalho);
  if (recolhida) return cartao;

  cartao.append(criarElemento("div", { classe: "tabela-rolagem" }, criarTabelaProdutos(categoria)));
  return cartao;
}

function criarTabelaProdutos(categoria) {
  const titulos = [
    "Produto",
    ...categoria.variacoes.map((variacao) => variacao.nome),
    "Estoque",
    "Vendidos",
    "Ações",
  ];

  const cabecalho = criarElemento(
    "thead",
    {},
    criarElemento(
      "tr",
      {},
      criarElemento("th", { classe: "coluna-marcar" }, criarCaixaDeCategoria(categoria)),
      ...titulos.map((titulo) => criarElemento("th", { texto: titulo }))
    )
  );

  const corpo = criarElemento("tbody");

  if (categoria.produtos.length === 0) {
    corpo.append(
      criarElemento(
        "tr",
        {},
        criarElemento("td", {
          colspan: titulos.length + 1,
          classe: "vazio",
          texto: "Nenhum produto nesta categoria.",
        })
      )
    );
  } else {
    categoria.produtos.forEach((produto) => corpo.append(criarLinhaProduto(categoria, produto)));
  }

  return criarElemento("table", {}, cabecalho, corpo);
}

function criarLinhaProduto(categoria, produto) {
  const linha = criarElemento("tr", { classe: selecao.has(produto.id) ? "selecionada" : "" });
  linha.append(
    criarElemento("td", { classe: "coluna-marcar" }, criarCaixaDoProduto(categoria, produto)),
    criarElemento(
      "td",
      { classe: "celula-nome" },
      criarElemento("div", { classe: "produto-linha" }, criarMiniatura(produto.imagem, produto.nome), criarElemento("span", { texto: produto.nome }))
    )
  );

  categoria.variacoes.forEach((variacao) => {
    const valor = Estoque.valorDaVariacao(categoria, produto, variacao);
    linha.append(criarElemento("td", { texto: valor || "—", "data-label": variacao.nome }));
  });

  linha.append(
    criarElemento("td", {
      texto: produto.estoque,
      classe: produto.estoque === 0 ? "estoque-zerado" : "estoque-ok",
      "data-label": "Estoque",
    }),
    criarElemento("td", { texto: produto.vendidos, classe: "vendidos-valor", "data-label": "Vendidos" }),
    criarElemento("td", { classe: "celula-acoes" }, criarAcoesDaLinha(categoria, produto))
  );

  return linha;
}

/** Botões Editar e Excluir ficam num bloco próprio para a célula da tabela não perder o alinhamento. */
function criarAcoesDaLinha(categoria, produto) {
  return criarElemento(
    "div",
    { classe: "acoes-linha" },
    criarElemento("button", {
      type: "button",
      classe: "botao botao-secundario botao-pequeno",
      texto: "Editar",
      aoClicar: () => abrirFormularioEdicaoProduto(categoria.id, produto.id),
    }),
    criarElemento("button", {
      type: "button",
      classe: "botao botao-perigo botao-pequeno",
      texto: "Excluir",
      aoClicar: () => confirmarExclusaoProduto(categoria, produto),
    })
  );
}

function confirmarExclusaoCategoria(categoria) {
  const mensagem = `Excluir a categoria "${categoria.nome}" e todos os seus produtos?`;
  if (!confirm(mensagem)) return;
  Estoque.excluirCategoria(categoria.id);
  desenharTela();
}

function confirmarExclusaoProduto(categoria, produto) {
  const detalhe = descreverVariacoes(categoria, produto);
  const nomeCompleto = detalhe ? `${produto.nome} (${detalhe})` : produto.nome;
  if (!confirm(`Excluir "${nomeCompleto}"?`)) return;
  Estoque.excluirProduto(categoria.id, produto.id);
  desenharTela();
}

// ====================================================================
// Janela: criar / editar categoria
// ====================================================================

let idCategoriaEmEdicao = null;
let variacoesEmEdicao = []; // [{ id, nome, opcoes: [{ id, nome }] }]; id é null enquanto for novo
let camposDeNovaOpcao = []; // um campo "adicionar opção" por variação, na mesma ordem

function abrirFormularioCategoria(idCategoria = null) {
  idCategoriaEmEdicao = idCategoria;
  const categoria = idCategoria ? Estoque.buscarCategoria(idCategoria) : null;

  document.getElementById("titulo-categoria").textContent = categoria
    ? "Editar categoria"
    : "Criar categoria";
  document.getElementById("categoria-nome").value = categoria ? categoria.nome : "";
  camposDeImagem.categoria.definir(categoria ? categoria.imagem : null);

  // Categoria nova já começa com um bloco de variação em branco, pronto para preencher.
  variacoesEmEdicao = categoria
    ? categoria.variacoes.map((variacao) => ({
        id: variacao.id,
        nome: variacao.nome,
        opcoes: variacao.opcoes.map((opcao) => ({ id: opcao.id, nome: opcao.nome })),
      }))
    : [{ id: null, nome: "", opcoes: [] }];

  mostrarErro("categoria-erro", "");
  desenharCamposVariacoes();
  abrirDialogo("dialogo-categoria");
}

/** Redesenha os blocos de variação. `foco` = { posicao, campo: "nome" | "opcao" } */
function desenharCamposVariacoes(foco = null) {
  const container = document.getElementById("categoria-variacoes");
  container.replaceChildren();
  camposDeNovaOpcao = [];
  let campoParaFocar = null;

  variacoesEmEdicao.forEach((variacao, posicao) => {
    const bloco = criarBlocoDeVariacao(variacao, posicao);
    container.append(bloco.elemento);
    camposDeNovaOpcao.push(bloco.campoNovaOpcao);

    if (foco && foco.posicao === posicao) {
      campoParaFocar = foco.campo === "nome" ? bloco.campoNome : bloco.campoNovaOpcao;
    }
  });

  if (campoParaFocar) campoParaFocar.focus();
}

function criarBlocoDeVariacao(variacao, posicao) {
  const campoNovaOpcao = criarElemento("input", {
    type: "text",
    placeholder: "Digite as opções (ex.: P, M, G) e aperte Enter",
    autocomplete: "off",
    "aria-label": "Adicionar opção",
  });

  const adicionarOpcoesDigitadas = () => {
    adicionarOpcoes(variacao, campoNovaOpcao.value);
    desenharCamposVariacoes({ posicao, campo: "opcao" });
  };

  campoNovaOpcao.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter") return;
    evento.preventDefault();
    adicionarOpcoesDigitadas();
  });

  const campoNome = criarElemento("input", {
    type: "text",
    placeholder: "Nome da variação (ex.: Cor, Tamanho)",
    value: variacao.nome,
    autocomplete: "off",
    "aria-label": "Nome da variação",
  });
  campoNome.addEventListener("input", () => (variacao.nome = campoNome.value));
  campoNome.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter") return;
    evento.preventDefault();
    campoNovaOpcao.focus();
  });

  const botaoRemoverVariacao = criarElemento("button", {
    type: "button",
    classe: "botao botao-perigo botao-pequeno",
    texto: "Remover variação",
    aoClicar: () => {
      variacoesEmEdicao.splice(posicao, 1);
      desenharCamposVariacoes();
    },
  });

  const listaDeChips = criarElemento("div", { classe: "chips" });
  variacao.opcoes.forEach((opcao, posicaoOpcao) => {
    const aoRemover = () => {
      variacao.opcoes.splice(posicaoOpcao, 1);
      desenharCamposVariacoes({ posicao, campo: "opcao" });
    };
    listaDeChips.append(criarChipDeOpcao(opcao, aoRemover));
  });

  const botaoAdicionar = criarElemento("button", {
    type: "button",
    classe: "botao botao-secundario",
    texto: "Adicionar",
    aoClicar: adicionarOpcoesDigitadas,
  });

  const elemento = criarElemento(
    "div",
    { classe: "bloco-variacao" },
    criarElemento("div", { classe: "linha-variacao" }, campoNome, botaoRemoverVariacao),
    listaDeChips,
    criarElemento("div", { classe: "linha-variacao" }, campoNovaOpcao, botaoAdicionar)
  );

  return { elemento, campoNome, campoNovaOpcao };
}

/** Uma opção aparece como "etiqueta" editável com um × para remover. */
function criarChipDeOpcao(opcao, aoRemover) {
  const tamanhoMinimo = 3;

  const campo = criarElemento("input", {
    type: "text",
    classe: "chip-campo",
    value: opcao.nome,
    size: Math.max(opcao.nome.length, tamanhoMinimo),
    autocomplete: "off",
    "aria-label": "Nome da opção",
  });
  campo.addEventListener("input", () => {
    opcao.nome = campo.value;
    campo.size = Math.max(campo.value.length, tamanhoMinimo);
  });
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") evento.preventDefault();
  });

  const botaoRemover = criarElemento("button", {
    type: "button",
    classe: "chip-remover",
    texto: "×",
    "aria-label": `Remover opção ${opcao.nome}`,
    aoClicar: aoRemover,
  });

  return criarElemento("span", { classe: "chip" }, campo, botaoRemover);
}

/** Aceita várias opções separadas por vírgula e ignora as repetidas. */
function adicionarOpcoes(variacao, textoDigitado) {
  textoDigitado
    .split(",")
    .map((nome) => nome.trim())
    .filter(Boolean)
    .forEach((nome) => {
      const jaExiste = variacao.opcoes.some(
        (opcao) => Estoque.normalizarTexto(opcao.nome.trim()) === Estoque.normalizarTexto(nome)
      );
      if (!jaExiste) variacao.opcoes.push({ id: null, nome });
    });
}

function adicionarCampoVariacao() {
  variacoesEmEdicao.push({ id: null, nome: "", opcoes: [] });
  desenharCamposVariacoes({ posicao: variacoesEmEdicao.length - 1, campo: "nome" });
}

function salvarFormularioCategoria(evento) {
  evento.preventDefault();
  try {
    // Opções digitadas e ainda não confirmadas com Enter também entram.
    variacoesEmEdicao.forEach((variacao, posicao) => {
      adicionarOpcoes(variacao, camposDeNovaOpcao[posicao].value);
    });

    const nome = document.getElementById("categoria-nome").value;
    Estoque.salvarCategoria(idCategoriaEmEdicao, nome, variacoesEmEdicao, camposDeImagem.categoria.valor());
    fecharDialogo("dialogo-categoria");
    desenharTela();
  } catch (erro) {
    desenharCamposVariacoes();
    mostrarErro("categoria-erro", erro.message);
  }
}

// ====================================================================
// Janela: cadastrar produto (marcando as opções)
// ====================================================================

let idCategoriaDoNovoProduto = null;
let estoqueDigitado = {}; // chave da combinação → estoque digitado (mantém o valor ao marcar/desmarcar)

/** Identifica uma combinação, ex.: { cor: "a1", tam: "b2" } → "a1|b2". */
function chaveDaCombinacao(combinacao) {
  return Object.values(combinacao).join("|");
}

function abrirFormularioNovoProduto(idCategoria) {
  idCategoriaDoNovoProduto = idCategoria;
  estoqueDigitado = {};
  const categoria = Estoque.buscarCategoria(idCategoria);

  document.getElementById("titulo-produto").textContent = `Novo produto — ${categoria.nome}`;
  document.getElementById("produto-nome").value = "";
  camposDeImagem.produto.definir(null);
  mostrarErro("produto-erro", "");

  desenharCaixinhasDeOpcoes(categoria);
  desenharCombinacoes();
  abrirDialogo("dialogo-produto");
  document.getElementById("produto-nome").focus();
}

function desenharCaixinhasDeOpcoes(categoria) {
  const container = document.getElementById("produto-opcoes");
  container.replaceChildren();

  if (categoria.variacoes.length === 0) {
    container.append(
      criarElemento("p", {
        classe: "dica",
        texto:
          'Esta categoria não tem variações. Para adicionar (ex.: Cor, Tamanho), use "Editar categoria".',
      })
    );
    return;
  }

  categoria.variacoes.forEach((variacao) => {
    const caixas = [];

    const rotulos = variacao.opcoes.map((opcao) => {
      const caixa = criarElemento("input", {
        type: "checkbox",
        value: opcao.id,
        "data-id-variacao": variacao.id,
      });
      caixa.addEventListener("change", desenharCombinacoes);
      caixas.push(caixa);
      return criarElemento("label", { classe: "opcao-marcavel" }, caixa, criarElemento("span", { texto: opcao.nome }));
    });

    const botaoMarcarTodas = criarElemento("button", {
      type: "button",
      classe: "botao-link",
      texto: "Marcar todas",
      aoClicar: () => {
        caixas.forEach((caixa) => (caixa.checked = true));
        desenharCombinacoes();
      },
    });

    container.append(
      criarElemento(
        "fieldset",
        { classe: "grupo" },
        criarElemento("legend", { texto: variacao.nome }),
        criarElemento("div", { classe: "opcoes-marcaveis" }, ...rotulos, botaoMarcarTodas)
      )
    );
  });
}

/** Lê as caixinhas marcadas: { [idVariacao]: [idOpcao, ...] } */
function lerOpcoesMarcadas() {
  const marcadas = {};
  document.querySelectorAll("#produto-opcoes input:checked").forEach((caixa) => {
    const idVariacao = caixa.dataset.idVariacao;
    if (!marcadas[idVariacao]) marcadas[idVariacao] = [];
    marcadas[idVariacao].push(caixa.value);
  });
  return marcadas;
}

/** Mostra um campo de estoque para cada combinação marcada. */
function desenharCombinacoes() {
  const categoria = Estoque.buscarCategoria(idCategoriaDoNovoProduto);
  const container = document.getElementById("produto-combinacoes");
  container.replaceChildren();

  const combinacoes = Estoque.gerarCombinacoes(categoria, lerOpcoesMarcadas());

  if (combinacoes.length === 0) {
    container.append(
      criarElemento("p", {
        classe: "dica",
        texto: "Marque pelo menos uma opção de cada variação para definir o estoque.",
      })
    );
    return;
  }

  container.append(
    criarElemento("h3", { texto: combinacoes.length > 1 ? "Estoque de cada combinação" : "Estoque" })
  );
  combinacoes.forEach((combinacao) => container.append(criarLinhaDeCombinacao(categoria, combinacao)));
}

function criarLinhaDeCombinacao(categoria, combinacao) {
  const chave = chaveDaCombinacao(combinacao);
  const nomesDasOpcoes = categoria.variacoes.map(
    (variacao) => variacao.opcoes.find((opcao) => opcao.id === combinacao[variacao.id]).nome
  );
  const titulo = nomesDasOpcoes.length > 0 ? nomesDasOpcoes.join(" · ") : "Quantidade em estoque";

  const campo = criarElemento("input", {
    type: "number",
    min: 0,
    step: 1,
    value: estoqueDigitado[chave] ?? 0,
    "aria-label": `Estoque de ${titulo}`,
  });
  campo.addEventListener("input", () => (estoqueDigitado[chave] = campo.value));

  return criarElemento("label", { classe: "linha-combinacao" }, criarElemento("span", { texto: titulo }), campo);
}

function salvarFormularioNovoProduto(evento) {
  evento.preventDefault();
  try {
    const categoria = Estoque.buscarCategoria(idCategoriaDoNovoProduto);
    const combinacoes = Estoque.gerarCombinacoes(categoria, lerOpcoesMarcadas()).map((variacoes) => ({
      variacoes,
      estoque: estoqueDigitado[chaveDaCombinacao(variacoes)] ?? 0,
    }));

    const nome = document.getElementById("produto-nome").value;
    Estoque.cadastrarProduto(idCategoriaDoNovoProduto, nome, combinacoes, camposDeImagem.produto.valor());
    fecharDialogo("dialogo-produto");
    desenharTela();
  } catch (erro) {
    mostrarErro("produto-erro", erro.message);
  }
}

// ====================================================================
// Janela: editar um item já cadastrado
// ====================================================================

let idCategoriaDaEdicao = null;
let idProdutoEmEdicao = null;

function abrirFormularioEdicaoProduto(idCategoria, idProduto) {
  idCategoriaDaEdicao = idCategoria;
  idProdutoEmEdicao = idProduto;

  const categoria = Estoque.buscarCategoria(idCategoria);
  const produto = categoria.produtos.find((p) => p.id === idProduto);

  document.getElementById("titulo-edicao-produto").textContent = `Editar produto — ${categoria.nome}`;
  document.getElementById("edicao-nome").value = produto.nome;
  document.getElementById("edicao-estoque").value = produto.estoque;
  document.getElementById("edicao-vendidos").value = produto.vendidos;
  camposDeImagem.edicao.definir(produto.imagem);

  const containerVariacoes = document.getElementById("edicao-variacoes");
  containerVariacoes.replaceChildren();
  categoria.variacoes.forEach((variacao) => {
    const seletor = criarElemento(
      "select",
      { "data-id-variacao": variacao.id },
      criarElemento("option", { value: "", texto: "Selecione..." }),
      ...variacao.opcoes.map((opcao) => criarElemento("option", { value: opcao.id, texto: opcao.nome }))
    );
    seletor.value = produto.variacoes[variacao.id] || "";
    containerVariacoes.append(criarElemento("label", { classe: "campo", texto: variacao.nome }, seletor));
  });

  mostrarErro("edicao-erro", "");
  abrirDialogo("dialogo-edicao-produto");
}

function salvarFormularioEdicaoProduto(evento) {
  evento.preventDefault();
  try {
    const escolhas = {};
    document.querySelectorAll("#edicao-variacoes select").forEach((seletor) => {
      escolhas[seletor.dataset.idVariacao] = seletor.value;
    });

    Estoque.atualizarProduto(idCategoriaDaEdicao, idProdutoEmEdicao, {
      nome: document.getElementById("edicao-nome").value,
      variacoes: escolhas,
      estoque: document.getElementById("edicao-estoque").value,
      vendidos: document.getElementById("edicao-vendidos").value,
      imagem: camposDeImagem.edicao.valor(),
    });
    fecharDialogo("dialogo-edicao-produto");
    desenharTela();
  } catch (erro) {
    mostrarErro("edicao-erro", erro.message);
  }
}

// ====================================================================
// Janela: registrar venda
// ====================================================================

let vendaSelecionada = null; // { categoria, produto }
let idCategoriaFiltro = null; // null = todas as categorias
let resultadosDaBusca = [];

function abrirFormularioVenda() {
  vendaSelecionada = null;
  idCategoriaFiltro = null;
  document.getElementById("venda-busca").value = "";
  mostrarSucessoDaVenda("");

  desenharFiltrosDeCategoria();
  desenharResultadosDaBusca();
  atualizarPainelDaVenda();
  abrirDialogo("dialogo-venda");
  document.getElementById("venda-busca").focus();
}

function mostrarSucessoDaVenda(mensagem) {
  const elemento = document.getElementById("venda-sucesso");
  elemento.textContent = mensagem;
  elemento.hidden = !mensagem;
}

/** Botões "Todas | Camisetas | Canecas..." (só aparecem se houver 2 ou mais categorias). */
function desenharFiltrosDeCategoria() {
  const container = document.getElementById("venda-filtros");
  container.replaceChildren();

  const categorias = Estoque.listarCategorias();
  container.hidden = categorias.length < 2;
  if (categorias.length < 2) return;

  [{ id: null, nome: "Todas" }, ...categorias].forEach((opcao) => {
    const ativo = opcao.id === idCategoriaFiltro;
    container.append(
      criarElemento("button", {
        type: "button",
        classe: ativo ? "filtro ativo" : "filtro",
        texto: opcao.nome,
        "aria-pressed": String(ativo),
        aoClicar: () => {
          idCategoriaFiltro = opcao.id;
          desenharFiltrosDeCategoria();
          desenharResultadosDaBusca();
        },
      })
    );
  });
}

function desenharResultadosDaBusca() {
  const lista = document.getElementById("venda-resultados");
  lista.replaceChildren();

  const termo = document.getElementById("venda-busca").value;
  const palavras = Estoque.separarPalavras(termo);
  resultadosDaBusca = Estoque.buscarProdutos(termo, idCategoriaFiltro);

  const total = resultadosDaBusca.length;
  document.getElementById("venda-contagem").textContent =
    total === 1 ? "1 produto encontrado" : `${total} produtos encontrados`;

  if (total === 0) {
    const existeProduto = Estoque.listarCategorias().some((c) => c.produtos.length > 0);
    const mensagem = existeProduto
      ? "Nenhum produto encontrado. Tente outra palavra ou mude o filtro de categoria."
      : "Nenhum produto cadastrado ainda. Cadastre produtos nas categorias para poder vendê-los.";
    lista.append(criarElemento("li", { classe: "vazio", texto: mensagem }));
    return;
  }

  resultadosDaBusca.forEach((resultado) => lista.append(criarItemDeResultado(resultado, palavras)));
  marcarResultadoSelecionado();
}

function criarItemDeResultado(resultado, palavras) {
  const { categoria, produto } = resultado;
  const semEstoque = produto.estoque === 0;

  const etiquetasDasOpcoes = [];
  categoria.variacoes.forEach((variacao) => {
    const valor = Estoque.valorDaVariacao(categoria, produto, variacao);
    if (!valor) return;
    etiquetasDasOpcoes.push(
      criarElemento("span", { classe: "etiqueta-opcao", title: variacao.nome }, criarTextoComDestaque(valor, palavras))
    );
  });

  const selo = criarElemento("span", {
    classe: semEstoque ? "selo selo-zerado" : "selo selo-ok",
    texto: semEstoque ? "Sem estoque" : `${produto.estoque} em estoque`,
  });

  const botao = criarElemento(
    "button",
    {
      type: "button",
      classe: "resultado",
      "data-id-produto": produto.id,
      disabled: semEstoque,
      aoClicar: () => selecionarProdutoParaVenda(resultado),
    },
    criarMiniatura(produto.imagem, produto.nome),
    criarElemento(
      "div",
      { classe: "resultado-info" },
      criarElemento("span", { classe: "etiqueta" }, criarTextoComDestaque(categoria.nome, palavras)),
      criarElemento("strong", { classe: "resultado-nome" }, criarTextoComDestaque(produto.nome, palavras)),
      criarElemento("div", { classe: "chips-info" }, ...etiquetasDasOpcoes)
    ),
    selo
  );

  return criarElemento("li", {}, botao);
}

function marcarResultadoSelecionado() {
  document.querySelectorAll("#venda-resultados .resultado").forEach((botao) => {
    const selecionado = Boolean(vendaSelecionada) && botao.dataset.idProduto === vendaSelecionada.produto.id;
    botao.classList.toggle("selecionado", selecionado);
    botao.setAttribute("aria-pressed", String(selecionado));
  });
}

function selecionarProdutoParaVenda(resultado) {
  vendaSelecionada = resultado;
  mostrarSucessoDaVenda("");
  atualizarPainelDaVenda();
  marcarResultadoSelecionado();

  const painel = document.getElementById("venda-selecionado");
  if (painel.scrollIntoView) painel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Mostra (ou esconde) o painel com o produto escolhido e o seletor de quantidade. */
function atualizarPainelDaVenda() {
  document.getElementById("venda-vazio").hidden = Boolean(vendaSelecionada);
  document.getElementById("venda-selecionado").hidden = !vendaSelecionada;
  mostrarErro("venda-erro", "");
  if (!vendaSelecionada) return;

  const { categoria, produto } = vendaSelecionada;
  document.getElementById("venda-imagem").replaceChildren(criarMiniatura(produto.imagem, produto.nome, "miniatura-grande"));
  document.getElementById("venda-categoria").textContent = categoria.nome;
  document.getElementById("venda-nome").textContent = produto.nome;
  document.getElementById("venda-estoque").textContent = textoUnidades(produto.estoque);

  const etiquetas = document.getElementById("venda-variacoes");
  etiquetas.replaceChildren();
  categoria.variacoes.forEach((variacao) => {
    const valor = Estoque.valorDaVariacao(categoria, produto, variacao);
    if (valor) etiquetas.append(criarElemento("span", { classe: "etiqueta-opcao", texto: `${variacao.nome}: ${valor}` }));
  });

  const campoQuantidade = document.getElementById("venda-quantidade");
  campoQuantidade.max = produto.estoque;
  campoQuantidade.value = 1;
  atualizarResumoDaVenda();
}

function lerQuantidadeDaVenda() {
  return Number(document.getElementById("venda-quantidade").value);
}

/** Confere a quantidade digitada, mostra o estoque que vai sobrar e libera/bloqueia o botão. */
function atualizarResumoDaVenda() {
  if (!vendaSelecionada) return;

  const { produto } = vendaSelecionada;
  const quantidade = lerQuantidadeDaVenda();
  const resumo = document.getElementById("venda-resumo");
  const botao = document.getElementById("btn-confirmar-venda");

  const quantidadeValida = Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= produto.estoque;
  botao.disabled = !quantidadeValida;
  resumo.classList.toggle("resumo-invalido", !quantidadeValida);

  if (!quantidadeValida) {
    resumo.textContent =
      quantidade > produto.estoque
        ? `Você só tem ${textoUnidades(produto.estoque)} em estoque.`
        : "Digite um número inteiro a partir de 1.";
    botao.textContent = "Confirmar venda";
    return;
  }

  resumo.textContent = `Estoque depois da venda: ${produto.estoque - quantidade}`;
  botao.textContent = `Confirmar venda de ${textoUnidades(quantidade)}`;
}

/** Botões − e +: mexem na quantidade sem passar de 1 nem do estoque. */
function alterarQuantidadeDaVenda(diferenca) {
  if (!vendaSelecionada) return;

  const atual = lerQuantidadeDaVenda();
  const base = Number.isInteger(atual) ? atual : 1;
  const nova = Math.min(Math.max(base + diferenca, 1), vendaSelecionada.produto.estoque);

  document.getElementById("venda-quantidade").value = nova;
  atualizarResumoDaVenda();
}

/** Enter na busca escolhe o primeiro produto com estoque e vai direto para a quantidade. */
function aoApertarTeclaNaBusca(evento) {
  if (evento.key !== "Enter") return;
  evento.preventDefault(); // evita enviar o formulário sem querer

  const primeiro = resultadosDaBusca.find((resultado) => resultado.produto.estoque > 0);
  if (!primeiro) return;

  selecionarProdutoParaVenda(primeiro);
  const campoQuantidade = document.getElementById("venda-quantidade");
  campoQuantidade.focus();
  campoQuantidade.select();
}

function confirmarVenda(evento) {
  evento.preventDefault();
  if (!vendaSelecionada) return;

  const { categoria, produto } = vendaSelecionada;
  const quantidade = lerQuantidadeDaVenda();

  try {
    Estoque.registrarVenda(categoria.id, produto.id, quantidade);
  } catch (erro) {
    mostrarErro("venda-erro", erro.message);
    return;
  }

  // A janela continua aberta para registrar outra venda em seguida.
  const descricao = [produto.nome, descreverVariacoes(categoria, produto)].filter(Boolean).join(" — ");
  vendaSelecionada = null;

  desenharTela();
  desenharResultadosDaBusca();
  atualizarPainelDaVenda();
  mostrarSucessoDaVenda(`Venda registrada: ${textoUnidades(quantidade)} de ${descricao}.`);

  const campoBusca = document.getElementById("venda-busca");
  campoBusca.focus();
  campoBusca.select();
}

// ====================================================================
// Seleção e edição em massa
// ====================================================================

const selecao = new Map(); // idProduto → idCategoria

function limparSelecaoInexistente(categorias) {
  const existentes = new Set(categorias.flatMap((categoria) => categoria.produtos.map((p) => p.id)));
  [...selecao.keys()].forEach((id) => {
    if (!existentes.has(id)) selecao.delete(id);
  });
}

function itensSelecionados() {
  return [...selecao].map(([idProduto, idCategoria]) => ({ idCategoria, idProduto }));
}

function criarCaixaDoProduto(categoria, produto) {
  const caixa = criarElemento("input", {
    type: "checkbox",
    checked: selecao.has(produto.id),
    "aria-label": `Selecionar ${produto.nome}`,
  });
  caixa.addEventListener("change", () => {
    if (caixa.checked) selecao.set(produto.id, categoria.id);
    else selecao.delete(produto.id);
    caixa.closest("tr").classList.toggle("selecionada", caixa.checked);
    sincronizarSelecao();
  });
  return caixa;
}

/** Caixa do cabeçalho: marca ou desmarca todos os itens da categoria. */
function criarCaixaDeCategoria(categoria) {
  const caixa = criarElemento("input", {
    type: "checkbox",
    classe: "marcar-categoria",
    "data-id-categoria": categoria.id,
    "aria-label": `Selecionar todos de ${categoria.nome}`,
    disabled: categoria.produtos.length === 0,
  });
  atualizarCaixaDeCategoria(caixa, categoria);
  caixa.addEventListener("change", () => {
    categoria.produtos.forEach((produto) => {
      if (caixa.checked) selecao.set(produto.id, categoria.id);
      else selecao.delete(produto.id);
    });
    desenharTela();
  });
  return caixa;
}

function atualizarCaixaDeCategoria(caixa, categoria) {
  const marcados = categoria.produtos.filter((produto) => selecao.has(produto.id)).length;
  caixa.checked = marcados > 0 && marcados === categoria.produtos.length;
  caixa.indeterminate = marcados > 0 && !caixa.checked;
}

/** Atualiza as caixas dos cabeçalhos e a barra sem redesenhar a tabela. */
function sincronizarSelecao() {
  document.querySelectorAll(".marcar-categoria").forEach((caixa) => {
    atualizarCaixaDeCategoria(caixa, Estoque.buscarCategoria(caixa.dataset.idCategoria));
  });
  atualizarBarraDeSelecao();
}

function atualizarBarraDeSelecao() {
  const total = selecao.size;
  document.getElementById("barra-selecao").hidden = total === 0;
  document.getElementById("selecao-contagem").textContent =
    total === 1 ? "1 item selecionado" : `${total} itens selecionados`;
}

function selecionarTudo() {
  Estoque.listarCategorias().forEach((categoria) => {
    categoria.produtos.forEach((produto) => selecao.set(produto.id, categoria.id));
  });
  desenharTela();
}

function limparSelecao() {
  selecao.clear();
  desenharTela();
}

function excluirSelecionados() {
  const total = selecao.size;
  const quantos = total === 1 ? "1 item" : `${total} itens`;
  if (!confirm(`Excluir ${quantos}? Essa ação não pode ser desfeita.`)) return;
  Estoque.excluirProdutos(itensSelecionados());
  selecao.clear();
  desenharTela();
}

function abrirEdicaoEmMassa() {
  const itens = itensSelecionados();
  const idsCategorias = [...new Set(itens.map((item) => item.idCategoria))];

  document.getElementById("titulo-massa").textContent =
    itens.length === 1 ? "Editar 1 item" : `Editar ${itens.length} itens`;
  document.getElementById("form-massa").reset();
  camposDeImagem.massa.definir(null);
  mostrarErro("massa-erro", "");

  // Variações só podem ser trocadas em massa quando todos os itens são da mesma categoria.
  const container = document.getElementById("massa-variacoes");
  container.replaceChildren();
  if (idsCategorias.length === 1) {
    Estoque.buscarCategoria(idsCategorias[0]).variacoes.forEach((variacao) => {
      const seletor = criarElemento(
        "select",
        { "data-id-variacao": variacao.id },
        criarElemento("option", { value: "", texto: "Manter como está" }),
        ...variacao.opcoes.map((opcao) => criarElemento("option", { value: opcao.id, texto: opcao.nome }))
      );
      container.append(criarElemento("label", { classe: "campo", texto: variacao.nome }, seletor));
    });
  } else {
    container.append(
      criarElemento("p", {
        classe: "dica",
        texto: "Os itens escolhidos são de categorias diferentes, então as variações não podem ser alteradas em massa.",
      })
    );
  }

  abrirDialogo("dialogo-massa");
}

function lerAlteracaoNumerica(campo) {
  const valor = document.getElementById(`massa-${campo}`).value.trim();
  if (valor === "") return null;
  return { modo: document.getElementById(`massa-${campo}-modo`).value, valor };
}

function salvarEdicaoEmMassa(evento) {
  evento.preventDefault();

  const variacoes = {};
  document.querySelectorAll("#massa-variacoes select").forEach((seletor) => {
    if (seletor.value) variacoes[seletor.dataset.idVariacao] = seletor.value;
  });

  const alteracoes = {
    nome: document.getElementById("massa-nome").value,
    variacoes,
    estoque: lerAlteracaoNumerica("estoque"),
    vendidos: lerAlteracaoNumerica("vendidos"),
    imagem: camposDeImagem.massa.alterou() ? camposDeImagem.massa.valor() : undefined, // undefined = manter
  };

  const algoMudou =
    alteracoes.nome.trim() || Object.keys(variacoes).length > 0 || alteracoes.estoque || alteracoes.vendidos || camposDeImagem.massa.alterou();
  if (!algoMudou) {
    mostrarErro("massa-erro", "Preencha pelo menos um campo para alterar.");
    return;
  }

  try {
    Estoque.atualizarEmMassa(itensSelecionados(), alteracoes);
    fecharDialogo("dialogo-massa");
    desenharTela();
  } catch (erro) {
    mostrarErro("massa-erro", erro.message);
  }
}

// ====================================================================
// Esconder / mostrar a tabela de cada categoria
// ====================================================================

const CHAVE_COLAPSADAS = "sistema-estoque-colapsadas";
const colapsadas = new Set(lerColapsadasSalvas());

function lerColapsadasSalvas() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_COLAPSADAS) || "[]");
  } catch (erro) {
    return [];
  }
}

function alternarCategoria(idCategoria) {
  if (colapsadas.has(idCategoria)) colapsadas.delete(idCategoria);
  else colapsadas.add(idCategoria);
  try {
    localStorage.setItem(CHAVE_COLAPSADAS, JSON.stringify([...colapsadas]));
  } catch (erro) {
    // Sem armazenamento: a escolha vale só até recarregar a página.
  }
  desenharTela();
}

/** Seta para cima (^) com a tabela aberta; para baixo (v) com ela escondida. */
function criarBotaoSeta(categoria) {
  const recolhida = colapsadas.has(categoria.id);
  return criarElemento("button", {
    type: "button",
    classe: "botao-seta",
    "aria-expanded": String(!recolhida),
    "aria-label": `${recolhida ? "Mostrar" : "Esconder"} tabela de ${categoria.nome}`,
    aoClicar: () => alternarCategoria(categoria.id),
  });
}

function resumoDaCategoria(categoria) {
  const itens = categoria.produtos.length;
  const unidades = categoria.produtos.reduce((total, produto) => total + produto.estoque, 0);
  return `${itens === 1 ? "1 item" : `${itens} itens`}, ${unidades} em estoque`;
}

// ====================================================================
// Sininho: notificações de itens sem estoque
// ====================================================================

function alternarPainelNotificacoes(abrir) {
  const painel = document.getElementById("painel-notificacoes");
  const mostrar = abrir === undefined ? painel.hidden : abrir;
  painel.hidden = !mostrar;
  document.getElementById("btn-sino").setAttribute("aria-expanded", String(mostrar));
  if (mostrar) marcarNotificacoesComoVistas();
}

const CHAVE_NOTIFICACOES_VISTAS = "sistema-estoque-notificacoes-vistas";
const notificacoesVistas = new Set(Banco.lerPreferencia(CHAVE_NOTIFICACOES_VISTAS, []));
let idsSemEstoque = []; // itens sem estoque neste momento

/** Ao abrir o painel, tudo que está nele conta como visto e o selo vermelho some. */
function marcarNotificacoesComoVistas() {
  idsSemEstoque.forEach((id) => notificacoesVistas.add(id));
  Banco.salvarPreferencia(CHAVE_NOTIFICACOES_VISTAS, [...notificacoesVistas]);
  atualizarSeloDoSino();
}

/** O selo mostra só o que ainda não foi visto; item reposto e zerado de novo volta a ser novidade. */
function atualizarSeloDoSino() {
  const novas = idsSemEstoque.filter((id) => !notificacoesVistas.has(id)).length;
  const selo = document.getElementById("sino-contador");
  selo.hidden = novas === 0;
  selo.textContent = novas > 99 ? "99+" : String(novas);
  document.getElementById("btn-sino").setAttribute("aria-label", novas ? `Notificações: ${novas} novas` : "Notificações");
}

function desenharNotificacoes(categorias) {
  const semEstoque = categorias.flatMap((categoria) =>
    categoria.produtos.filter((produto) => produto.estoque === 0).map((produto) => ({ categoria, produto }))
  );

  idsSemEstoque = semEstoque.map(({ produto }) => produto.id);
  [...notificacoesVistas].forEach((id) => {
    if (!idsSemEstoque.includes(id)) notificacoesVistas.delete(id);
  });
  if (document.getElementById("painel-notificacoes").hidden) atualizarSeloDoSino();
  else marcarNotificacoesComoVistas();

  const lista = document.getElementById("lista-notificacoes");
  lista.replaceChildren();

  if (semEstoque.length === 0) {
    lista.append(criarElemento("li", { classe: "vazio", texto: "Tudo em dia. Nenhum item sem estoque." }));
    return;
  }

  semEstoque.forEach(({ categoria, produto }) => {
    const detalhe = descreverVariacoes(categoria, produto);
    const texto = criarElemento(
      "span",
      {},
      criarElemento("strong", { texto: detalhe ? `${produto.nome} (${detalhe})` : produto.nome }),
      criarElemento("small", { texto: `Sem estoque em ${categoria.nome}` })
    );
    lista.append(
      criarElemento(
        "li",
        {},
        criarElemento(
          "button",
          { type: "button", classe: "notificacao", aoClicar: () => irParaCategoria(categoria.id) },
          criarElemento("i", { classe: "notificacao-ponto" }),
          texto
        )
      )
    );
  });
}

/** Fecha o painel, abre a tabela da categoria (se estiver escondida) e rola até ela. */
function irParaCategoria(idCategoria) {
  alternarPainelNotificacoes(false);
  if (colapsadas.has(idCategoria)) alternarCategoria(idCategoria);
  const cartao = document.getElementById(`categoria-${idCategoria}`);
  if (cartao) cartao.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ====================================================================
// Inicialização
// ====================================================================

function ligarEventos() {
  montarCamposDeImagem();
  document.getElementById("btn-criar-categoria").addEventListener("click", () => abrirFormularioCategoria());
  document.getElementById("btn-venda").addEventListener("click", abrirFormularioVenda);
  document.getElementById("btn-add-variacao").addEventListener("click", adicionarCampoVariacao);

  document.getElementById("form-categoria").addEventListener("submit", salvarFormularioCategoria);
  document.getElementById("form-produto").addEventListener("submit", salvarFormularioNovoProduto);
  document.getElementById("form-edicao-produto").addEventListener("submit", salvarFormularioEdicaoProduto);
  document.getElementById("form-venda").addEventListener("submit", confirmarVenda);
  document.getElementById("btn-ver-geral").addEventListener("click", () => selecionarCategoria(null));
  document.addEventListener("click", aoClicarNaPagina);
  document.getElementById("btn-sino").addEventListener("click", () => alternarPainelNotificacoes());
  document.addEventListener("click", (evento) => {
    if (!evento.target.closest(".notificacoes")) alternarPainelNotificacoes(false);
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") alternarPainelNotificacoes(false);
  });
  document.getElementById("form-massa").addEventListener("submit", salvarEdicaoEmMassa);
  document.getElementById("btn-editar-massa").addEventListener("click", abrirEdicaoEmMassa);
  document.getElementById("btn-excluir-massa").addEventListener("click", excluirSelecionados);
  document.getElementById("btn-selecionar-tudo").addEventListener("click", selecionarTudo);
  document.getElementById("btn-limpar-selecao").addEventListener("click", limparSelecao);

  const campoBusca = document.getElementById("venda-busca");
  campoBusca.addEventListener("input", () => {
    mostrarSucessoDaVenda("");
    desenharResultadosDaBusca();
  });
  campoBusca.addEventListener("keydown", aoApertarTeclaNaBusca);

  document.getElementById("venda-menos").addEventListener("click", () => alterarQuantidadeDaVenda(-1));
  document.getElementById("venda-mais").addEventListener("click", () => alterarQuantidadeDaVenda(1));
  document.getElementById("venda-quantidade").addEventListener("input", atualizarResumoDaVenda);

  // Qualquer botão com data-fechar fecha a janela em que está.
  document.querySelectorAll("[data-fechar]").forEach((botao) => {
    botao.addEventListener("click", () => botao.closest("dialog").close());
  });
}

// ====================================================================
// Login, carregamento e salvamento na nuvem
// ====================================================================

const TEXTOS_DE_STATUS = {
  ocioso: "",
  salvando: "Salvando…",
  salvo: "Salvo na nuvem",
  erro: "Não salvou",
};

function mostrarTela(nome) {
  document.getElementById("tela-carregando").hidden = nome !== "carregando";
  document.getElementById("tela-login").hidden = nome !== "login";
  document.body.classList.toggle("sem-sessao", nome !== "sistema");
}

/** Mostra o login. `erro` aparece em vermelho; `desativar` trava o formulário (falta configurar). */
function mostrarLogin(erro = "", desativar = false) {
  mostrarTela("login");
  mostrarErro("login-erro", erro);
  document.getElementById("login-info").hidden = true;
  ["login-email", "login-senha", "btn-entrar", "btn-criar-conta"].forEach((id) => {
    document.getElementById(id).disabled = desativar;
  });
  if (!desativar) document.getElementById("login-email").focus();
}

function atualizarStatusDeSalvamento(status, detalhe = "") {
  const elemento = document.getElementById("status-salvamento");
  elemento.dataset.status = status;
  elemento.textContent = status === "erro" ? `Não salvou: ${detalhe} Tentando de novo…` : TEXTOS_DE_STATUS[status] || "";
  document.getElementById("btn-recarregar").hidden = status !== "erro";
}

function definirOcupadoNoLogin(ocupado) {
  ["btn-entrar", "btn-criar-conta"].forEach((id) => (document.getElementById(id).disabled = ocupado));
  document.getElementById("btn-entrar").textContent = ocupado ? "Aguarde…" : "Entrar";
}

function lerCredenciais() {
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  if (!email || !senha) {
    mostrarErro("login-erro", "Preencha o e-mail e a senha.");
    return null;
  }
  return { email, senha };
}

async function aoEnviarLogin(evento) {
  evento.preventDefault();
  const credenciais = lerCredenciais();
  if (!credenciais) return;
  mostrarErro("login-erro", "");
  document.getElementById("login-info").hidden = true;
  definirOcupadoNoLogin(true);
  try {
    const usuario = await Banco.entrar(credenciais.email, credenciais.senha);
    await abrirSistema(usuario);
  } catch (erro) {
    mostrarLogin(erro.message);
  } finally {
    definirOcupadoNoLogin(false);
  }
}

async function aoCriarConta() {
  const credenciais = lerCredenciais();
  if (!credenciais) return;
  mostrarErro("login-erro", "");
  definirOcupadoNoLogin(true);
  try {
    const { precisaConfirmar } = await Banco.criarConta(credenciais.email, credenciais.senha);
    if (precisaConfirmar) {
      const info = document.getElementById("login-info");
      info.textContent = "Conta criada! Enviamos um e-mail de confirmação. Clique no link dele e depois volte aqui para entrar.";
      info.hidden = false;
    } else {
      await abrirSistema(Banco.usuario);
    }
  } catch (erro) {
    mostrarLogin(erro.message);
  } finally {
    definirOcupadoNoLogin(false);
  }
}

/** Primeira vez na nuvem: se este navegador tem dados antigos, oferece enviá-los. */
async function oferecerImportacao(usuario) {
  if (Estoque.dados.categorias.length > 0) return;
  const local = Banco.lerDadosLocais();
  if (!local || !Array.isArray(local.categorias) || local.categorias.length === 0) return;

  const chaveRecusa = `sistema-estoque-importacao-recusada-${usuario.id}`;
  if (Banco.lerPreferencia(chaveRecusa, false)) return;

  const produtos = local.categorias.reduce((total, categoria) => total + categoria.produtos.length, 0);
  const pergunta = `Encontramos dados salvos neste navegador: ${local.categorias.length} categoria(s) e ${produtos} produto(s).\n\nEnviar para a nuvem agora? (Os dados daqui não são apagados.)`;
  if (!confirm(pergunta)) {
    Banco.salvarPreferencia(chaveRecusa, true);
    return;
  }
  Estoque.dados.categorias = local.categorias;
  Banco.salvar(Estoque.dados);
  await Banco.sincronizarAgora();
}

async function abrirSistema(usuario) {
  mostrarTela("carregando");
  try {
    const dados = await Banco.carregarDaNuvem();
    Banco.adotarDados(dados);
    Estoque.dados = dados;
    await oferecerImportacao(usuario);
  } catch (erro) {
    mostrarLogin(Banco.traduzirErro(erro));
    return;
  }
  document.getElementById("conta-email").textContent = usuario.email || "";
  mostrarTela("sistema");
  desenharTela();
}

async function sairDaConta() {
  try {
    await Banco.sair();
  } catch (erro) {
    alert(erro.message);
    return;
  }
  location.reload(); // volta ao login com a tela limpa
}

async function recarregarDaNuvem() {
  const descartar = Banco.temPendencias();
  if (descartar && !confirm("Isso descarta as alterações que ainda não foram salvas e traz o que está na nuvem. Continuar?")) return;
  try {
    const dados = await Banco.carregarDaNuvem();
    Banco.adotarDados(dados);
    Estoque.dados = dados;
    desenharTela();
  } catch (erro) {
    alert(Banco.traduzirErro(erro));
  }
}

/** Ao voltar para a aba (ex.: vendeu pelo celular), traz as mudanças feitas em outro aparelho. */
let ultimaAtualizacao = Date.now();
async function atualizarAoVoltarParaAba() {
  if (document.visibilityState !== "visible" || !Banco.usuario || Banco.temPendencias()) return;
  if (Date.now() - ultimaAtualizacao < 10000 || document.querySelector("dialog[open]")) return;
  ultimaAtualizacao = Date.now();
  try {
    const dados = await Banco.carregarDaNuvem();
    // Se a pessoa mexeu enquanto buscávamos, o que ela fez vale mais.
    if (Banco.temPendencias() || document.querySelector("dialog[open]")) return;
    if (JSON.stringify(dados) === JSON.stringify(Estoque.dados)) return;
    Banco.adotarDados(dados);
    Estoque.dados = dados;
    desenharTela();
  } catch (erro) {
    // Sem internet agora: segue com o que está na tela.
  }
}

async function iniciarSistema() {
  ligarEventos();
  document.getElementById("form-login").addEventListener("submit", aoEnviarLogin);
  document.getElementById("btn-criar-conta").addEventListener("click", aoCriarConta);
  document.getElementById("btn-sair").addEventListener("click", sairDaConta);
  document.getElementById("btn-recarregar").addEventListener("click", recarregarDaNuvem);
  document.addEventListener("visibilitychange", atualizarAoVoltarParaAba);
  window.addEventListener("beforeunload", (evento) => {
    if (!Banco.temPendencias()) return;
    evento.preventDefault();
    evento.returnValue = "";
  });

  if (!Banco.bibliotecaCarregada()) {
    mostrarLogin("Não foi possível carregar o Supabase. Verifique a internet e recarregue a página.", true);
    return;
  }
  if (!Banco.configurado()) {
    mostrarLogin("Falta configurar o Supabase: preencha a URL e a chave no arquivo config.js.", true);
    return;
  }

  Banco.conectar();
  Banco.aoMudarStatus = atualizarStatusDeSalvamento;
  Banco.aoSair = () => location.reload();

  try {
    const usuario = await Banco.usuarioLogado();
    if (usuario) await abrirSistema(usuario);
    else mostrarLogin();
  } catch (erro) {
    mostrarLogin(Banco.traduzirErro(erro));
  }
}

iniciarSistema();
