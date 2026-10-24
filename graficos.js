/**
 * graficos.js
 * Gráficos de vendas. Nenhum abre sozinho: a pessoa escolhe quais quer ver
 * e a escolha fica salva neste navegador.
 * Cada função "grafico..." devolve { id, titulo, elemento } (ou uma lista deles).
 */
const CORES_GRAFICO = ["#f4f4f5", "#b8c0d0", "#8693ab", "#d6d0c4", "#6b7280", "#a3a3a3", "#5f6b84", "#e5e7eb"]; // tons de branco e cinza
const CHAVE_GRAFICOS_ABERTOS = "sistema-estoque-graficos-abertos";
const graficosAbertos = new Set(Banco.lerPreferencia(CHAVE_GRAFICOS_ABERTOS, []));
let categoriaAtiva = null; // id da categoria escolhida; null = visão geral

// ---------- Utilitários ----------

function somar(produtos, campo) {
  return produtos.reduce((total, produto) => total + produto[campo], 0);
}

/** Quanto do que se teve (vendido + em estoque) já saiu, em %. */
function taxaDeVenda({ vendidos, estoque }) {
  return vendidos + estoque > 0 ? Math.round((vendidos / (vendidos + estoque)) * 100) : 0;
}

function criarBloco(id, titulo, subtitulo, ...filhos) {
  const elemento = criarElemento("article", { classe: "grafico" }, criarElemento("h3", { texto: titulo }), criarElemento("p", { classe: "dica", texto: subtitulo }), ...filhos);
  return { id, titulo, elemento };
}

/** Uma barra horizontal: rótulo e valor em cima, trilho preenchido embaixo. */
function criarBarra(rotulo, valor, maximo, cor, textoDoValor) {
  const preenchida = criarElemento("span", { classe: "barra-preenchida" });
  preenchida.style.width = `${maximo > 0 ? (valor / maximo) * 100 : 0}%`;
  preenchida.style.background = cor;
  return criarElemento(
    "div",
    { classe: "barra-linha" },
    criarElemento("div", { classe: "barra-texto" }, criarElemento("span", { texto: rotulo }), criarElemento("strong", { texto: textoDoValor })),
    criarElemento("div", { classe: "barra-trilho" }, preenchida)
  );
}

// ---------- Categoria escolhida ----------

function selecionarCategoria(idCategoria) {
  if (categoriaAtiva === idCategoria) return;
  categoriaAtiva = idCategoria;
  document.querySelectorAll(".cartao").forEach((cartao) => {
    cartao.classList.toggle("ativa", cartao.id === `categoria-${idCategoria}`);
  });
  desenharGraficos(Estoque.listarCategorias());
}

/** Clique num cartão escolhe a categoria; clique no fundo volta à visão geral. */
function aoClicarNaPagina(evento) {
  const ignorar = "button, input, select, label, a, dialog, .area-graficos, .barra-selecao, .painel-notificacoes";
  if (evento.target.closest(ignorar)) return;
  const cartao = evento.target.closest(".cartao");
  selecionarCategoria(cartao ? cartao.id.replace("categoria-", "") : null);
}

// ---------- Dados de apoio ----------

function montarContexto(categorias, escolhida) {
  const escopo = escolhida ? [escolhida] : categorias;
  const itens = escopo.flatMap((categoria) => categoria.produtos.map((produto) => ({ categoria, produto })));

  // Variações do mesmo produto (Azul/P, Azul/M...) somam como um produto só.
  const mapa = new Map();
  itens.forEach(({ categoria, produto }) => {
    const chave = `${categoria.id}|${Estoque.normalizarTexto(produto.nome)}`;
    const item = mapa.get(chave) || { nome: produto.nome, vendidos: 0, estoque: 0 };
    item.vendidos += produto.vendidos;
    item.estoque += produto.estoque;
    mapa.set(chave, item);
  });
  const produtos = [...mapa.values()];

  return { categorias, escolhida, itens, produtos, vendidos: somar(produtos, "vendidos"), emEstoque: somar(produtos, "estoque") };
}

const porcentagem = (valor, total) => Math.round((valor / total) * 100);

// ---------- Os gráficos ----------

function graficoIndicadores({ itens, vendidos, emEstoque }) {
  const ruptura = itens.filter(({ produto }) => produto.estoque === 0).length;
  const parados = itens.filter(({ produto }) => produto.estoque > 0 && produto.vendidos === 0).length;
  const indicadores = [
    [String(vendidos), "Unidades vendidas", "Total de vendas registradas", "kpi-vendidos"],
    [`${taxaDeVenda({ vendidos, estoque: emEstoque })}%`, "Taxa de venda", "Do que você teve (vendido + em estoque), quanto já saiu", ""],
    [`${Math.round((ruptura / itens.length) * 100)}%`, "Itens em ruptura", `${ruptura} de ${itens.length} itens sem estoque, perdendo venda`, ruptura > 0 ? "kpi-alerta" : ""],
    [String(parados), "Itens parados", "Têm estoque, mas nunca foram vendidos", parados > 0 ? "kpi-atencao" : ""],
  ];
  const elemento = criarElemento(
    "div",
    { classe: "kpis" },
    ...indicadores.map(([valor, rotulo, ajuda, classe]) =>
      criarElemento("div", { classe: `kpi ${classe}` }, criarElemento("strong", { texto: valor }), criarElemento("span", { texto: rotulo }), criarElemento("small", { texto: ajuda }))
    )
  );
  return { id: "indicadores", titulo: "Indicadores", elemento };
}

function graficoMaisVendidos({ produtos, vendidos }) {
  const ranking = produtos.filter((p) => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, 6);
  return criarBloco("mais-vendidos", "Mais vendidos", "Parte de cada produto no total vendido",
    ...ranking.map((p) => criarBarra(p.nome, p.vendidos, ranking[0].vendidos, CORES_GRAFICO[0], `${p.vendidos} (${porcentagem(p.vendidos, vendidos)}%)`)));
}

/** Curva ABC: quantos produtos sustentam as vendas. */
function graficoCurvaAbc({ produtos, vendidos }) {
  const classes = { A: [], B: [], C: [] };
  const cores = { A: "#34d399", B: "#fbbf24", C: "#94a3b8" };
  let acumulado = 0;
  [...produtos].sort((a, b) => b.vendidos - a.vendidos).forEach((p) => {
    const antes = acumulado / vendidos;
    classes[antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C"].push(p);
    acumulado += p.vendidos;
  });
  return criarBloco("curva-abc", "Curva ABC", "A: produtos que geram até 80% das vendas. B: até 95%. C: o restante.",
    ...Object.entries(classes).map(([nome, lista]) => {
      const vendasDaClasse = somar(lista, "vendidos");
      const produtosTexto = `${lista.length} ${lista.length === 1 ? "produto" : "produtos"}`;
      return criarBarra(`Classe ${nome}`, vendasDaClasse, vendidos, cores[nome], `${produtosTexto}, ${porcentagem(vendasDaClasse, vendidos)}% das vendas`);
    }));
}

/** O que gira e o que está encalhado. */
function graficoTaxaDeVenda({ categorias, escolhida, produtos }) {
  const grupos = escolhida
    ? produtos
    : categorias.map((c) => ({ nome: c.nome, vendidos: somar(c.produtos, "vendidos"), estoque: somar(c.produtos, "estoque") }));
  const ordenados = grupos.map((g) => ({ ...g, taxa: taxaDeVenda(g) })).sort((a, b) => b.taxa - a.taxa).slice(0, 8);
  return criarBloco("taxa-de-venda", `Taxa de venda por ${escolhida ? "produto" : "categoria"}`, "Alta: vende bem, cuidado para não faltar. Baixa: está encalhado, vale promover.",
    ...ordenados.map((g) => criarBarra(g.nome, g.taxa, 100, g.taxa >= 60 ? "#34d399" : g.taxa >= 30 ? "#fbbf24" : "#f87171", `${g.taxa}% (${g.vendidos} de ${g.vendidos + g.estoque})`)));
}

/** Um gráfico para cada variação (cor, tamanho...): o que o cliente prefere. */
function graficosPorVariacao({ itens, vendidos }) {
  const porVariacao = new Map();
  itens.forEach(({ categoria, produto }) => {
    categoria.variacoes.forEach((variacao) => {
      const valor = Estoque.valorDaVariacao(categoria, produto, variacao);
      if (!valor) return;
      const chaveVariacao = Estoque.normalizarTexto(variacao.nome);
      const grupo = porVariacao.get(chaveVariacao) || { id: chaveVariacao, nome: variacao.nome, opcoes: new Map() };
      const chaveOpcao = Estoque.normalizarTexto(valor);
      const opcao = grupo.opcoes.get(chaveOpcao) || { nome: valor, vendidos: 0 };
      opcao.vendidos += produto.vendidos;
      grupo.opcoes.set(chaveOpcao, opcao);
      porVariacao.set(chaveVariacao, grupo);
    });
  });

  return [...porVariacao.values()].slice(0, 4).flatMap((grupo) => {
    const opcoes = [...grupo.opcoes.values()].filter((o) => o.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, 5);
    if (opcoes.length === 0) return [];
    return [criarBloco(`variacao-${grupo.id}`, `${grupo.nome} que mais vende`, "O que o cliente prefere: guia para repor e divulgar",
      ...opcoes.map((o) => criarBarra(o.nome, o.vendidos, opcoes[0].vendidos, CORES_GRAFICO[1], `${o.vendidos} (${porcentagem(o.vendidos, vendidos)}%)`)))];
  });
}

/** Rosca com o peso de cada categoria (só na visão geral). */
function graficoVendasPorCategoria({ categorias, vendidos }) {
  const porCategoria = categorias
    .map((c, posicao) => ({ nome: c.nome, vendidos: somar(c.produtos, "vendidos"), cor: CORES_GRAFICO[posicao % CORES_GRAFICO.length] }))
    .filter((c) => c.vendidos > 0);
  let inicio = 0;
  const fatias = porCategoria.map((c) => {
    const de = inicio;
    inicio += (c.vendidos / vendidos) * 100;
    return `${c.cor} ${de}% ${inicio}%`;
  });
  const rosca = criarElemento("div", { classe: "rosca", role: "img", "aria-label": "Vendas por categoria" }, criarElemento("span", { texto: vendidos }));
  rosca.style.background = `conic-gradient(${fatias.join(", ")})`;
  const legenda = criarElemento("ul", { classe: "legenda" }, ...porCategoria.map((c) => {
    const ponto = criarElemento("i");
    ponto.style.background = c.cor;
    return criarElemento("li", {}, ponto, criarElemento("span", { texto: c.nome }), criarElemento("strong", { texto: `${porcentagem(c.vendidos, vendidos)}%` }));
  }));
  return criarBloco("vendas-por-categoria", "Vendas por categoria", "Unidades vendidas no total", criarElemento("div", { classe: "rosca-area" }, rosca, legenda));
}

// ---------- Tela ----------

function alternarGrafico(id) {
  if (graficosAbertos.has(id)) graficosAbertos.delete(id);
  else graficosAbertos.add(id);
  salvarGraficosAbertos();
  desenharGraficos(Estoque.listarCategorias());
}

function salvarGraficosAbertos() {
  Banco.salvarPreferencia(CHAVE_GRAFICOS_ABERTOS, [...graficosAbertos]);
}

/** Botões para abrir/fechar cada gráfico. */
function desenharSeletorDeGraficos(blocos) {
  const seletor = document.getElementById("seletor-graficos");
  seletor.replaceChildren();

  blocos.forEach((bloco) => {
    const aberto = graficosAbertos.has(bloco.id);
    seletor.append(criarElemento("button", {
      type: "button",
      classe: aberto ? "filtro ativo" : "filtro",
      texto: bloco.titulo,
      "aria-pressed": String(aberto),
      aoClicar: () => alternarGrafico(bloco.id),
    }));
  });

  if (blocos.some((bloco) => graficosAbertos.has(bloco.id))) {
    seletor.append(criarElemento("button", {
      type: "button",
      classe: "botao-link",
      texto: "Fechar todos",
      aoClicar: () => {
        graficosAbertos.clear();
        salvarGraficosAbertos();
        desenharGraficos(Estoque.listarCategorias());
      },
    }));
  }
}

function desenharGraficos(categorias) {
  const area = document.getElementById("area-graficos");
  const container = document.getElementById("graficos");
  container.replaceChildren();
  document.getElementById("seletor-graficos").replaceChildren();
  area.hidden = categorias.length === 0;

  const escolhida = categorias.find((categoria) => categoria.id === categoriaAtiva);
  if (!escolhida) categoriaAtiva = null;
  document.getElementById("titulo-graficos").textContent = `Desempenho de vendas: ${escolhida ? escolhida.nome : "visão geral"}`;
  document.getElementById("btn-ver-geral").hidden = !escolhida;

  const contexto = montarContexto(categorias, escolhida);
  if (contexto.itens.length === 0) {
    container.append(criarElemento("p", { classe: "vazio", texto: "Esta categoria ainda não tem produtos." }));
    return;
  }

  const blocos = [graficoIndicadores(contexto)];
  if (contexto.vendidos > 0) {
    blocos.push(graficoMaisVendidos(contexto), graficoCurvaAbc(contexto), graficoTaxaDeVenda(contexto), ...graficosPorVariacao(contexto));
    if (!escolhida) blocos.push(graficoVendasPorCategoria(contexto));
  }
  desenharSeletorDeGraficos(blocos);

  const abertos = blocos.filter((bloco) => graficosAbertos.has(bloco.id));
  if (abertos.length === 0) {
    container.append(criarElemento("p", { classe: "vazio", texto: "Escolha acima os gráficos que quer ver." }));
  } else {
    container.append(...abertos.map((bloco) => bloco.elemento));
  }
  if (contexto.vendidos === 0) {
    container.append(criarElemento("p", { classe: "vazio", texto: "Registre vendas para liberar os demais gráficos." }));
  }
}
