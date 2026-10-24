/**
 * imagens.js
 * Imagens de categorias e produtos: reduz a foto escolhida, desenha a miniatura
 * e monta o campo "Escolher imagem" usado nas janelas.
 * A imagem é guardada junto dos dados (texto base64), por isso é reduzida antes.
 */
const LADO_MAXIMO_IMAGEM = 256; // pixels
const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024; // 10 MB

function carregarImagem(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const endereco = URL.createObjectURL(arquivo);
    const imagem = new Image();
    imagem.onload = () => {
      URL.revokeObjectURL(endereco);
      resolver(imagem);
    };
    imagem.onerror = () => {
      URL.revokeObjectURL(endereco);
      rejeitar(new Error("Não foi possível abrir essa imagem."));
    };
    imagem.src = endereco;
  });
}

/** Devolve a imagem reduzida (WebP, ou JPEG se o navegador não souber WebP). */
async function reduzirImagem(arquivo) {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem (JPG, PNG, WebP...).");
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) throw new Error("A imagem é muito grande (máximo de 10 MB).");

  const imagem = await carregarImagem(arquivo);
  const escala = Math.min(1, LADO_MAXIMO_IMAGEM / Math.max(imagem.width, imagem.height));
  const quadro = document.createElement("canvas");
  quadro.width = Math.max(1, Math.round(imagem.width * escala));
  quadro.height = Math.max(1, Math.round(imagem.height * escala));

  const pincel = quadro.getContext("2d");
  pincel.drawImage(imagem, 0, 0, quadro.width, quadro.height);

  const webp = quadro.toDataURL("image/webp", 0.82);
  if (webp.startsWith("data:image/webp")) return webp;

  pincel.globalCompositeOperation = "destination-over"; // fundo branco atrás (JPEG não tem transparência)
  pincel.fillStyle = "#fff";
  pincel.fillRect(0, 0, quadro.width, quadro.height);
  return quadro.toDataURL("image/jpeg", 0.85);
}

/** Miniatura quadrada. Sem imagem, mostra a inicial do nome. `tamanho`: "" ou "miniatura-grande". */
function criarMiniatura(imagem, nome, tamanho = "") {
  const classe = `miniatura ${tamanho}`.trim();
  if (imagem) return criarElemento("img", { classe, src: imagem, alt: nome });
  const inicial = (nome.trim()[0] || "?").toUpperCase();
  return criarElemento("span", { classe: `${classe} miniatura-vazia`, "aria-hidden": "true", texto: inicial });
}

/**
 * Campo para escolher uma imagem.
 * valor() = imagem atual (ou null) · alterou() = a pessoa mexeu nele · definir(imagem) = preenche e zera o "alterou".
 */
function criarCampoDeImagem({ permitirRemover = true } = {}) {
  let valor = null;
  let alterou = false;

  const previa = criarElemento("div", { classe: "imagem-previa" });
  const aviso = criarElemento("p", { classe: "erro", role: "alert" });
  const entrada = criarElemento("input", { type: "file", accept: "image/*", hidden: true });
  const botaoEscolher = criarElemento("label", { classe: "botao botao-secundario botao-pequeno" }, "Escolher imagem", entrada);
  const botaoRemover = criarElemento("button", {
    type: "button",
    classe: "botao botao-perigo botao-pequeno",
    texto: "Remover",
    aoClicar: () => {
      valor = null;
      alterou = true;
      desenhar();
    },
  });

  function desenhar() {
    previa.replaceChildren(criarMiniatura(valor, "+", "miniatura-grande"));
    botaoRemover.hidden = !permitirRemover || !valor;
    aviso.textContent = "";
  }

  entrada.addEventListener("change", async () => {
    const arquivo = entrada.files[0];
    entrada.value = "";
    if (!arquivo) return;
    try {
      valor = await reduzirImagem(arquivo);
      alterou = true;
      desenhar();
    } catch (erro) {
      aviso.textContent = erro.message;
    }
  });

  const elemento = criarElemento(
    "div",
    { classe: "campo-imagem" },
    previa,
    criarElemento(
      "div",
      { classe: "campo-imagem-acoes" },
      criarElemento("strong", { texto: "Imagem (opcional)" }),
      criarElemento("div", { classe: "linha-botoes" }, botaoEscolher, botaoRemover),
      aviso
    )
  );

  desenhar();
  return {
    elemento,
    valor: () => valor,
    alterou: () => alterou,
    definir(imagem) {
      valor = imagem || null;
      alterou = false;
      desenhar();
    },
  };
}

// Um campo para cada janela que aceita imagem. A edição em massa só troca (não remove) a imagem.
const camposDeImagem = {};

function montarCamposDeImagem() {
  [["categoria", true], ["produto", true], ["edicao", true], ["massa", false]].forEach(([nome, permitirRemover]) => {
    camposDeImagem[nome] = criarCampoDeImagem({ permitirRemover });
    document.getElementById(`${nome}-imagem`).append(camposDeImagem[nome].elemento);
  });
}
