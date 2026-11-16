// src/lib/servidor.ts
var ErroApi = class extends Error {
  status;
  detalhe;
  constructor(mensagem, status, detalhe) {
    super(mensagem);
    this.status = status;
    this.detalhe = detalhe;
  }
};
var MENSAGENS_DA_PLATAFORMA = {
  504: "A hospedagem cortou a conex\xE3o por tempo (a corre\xE7\xE3o com o modelo em CPU pode passar do limite). Tente de novo com uma reda\xE7\xE3o por vez \u2014 ou use a corre\xE7\xE3o manual.",
  502: "O servi\xE7o respondeu com erro interno (502). Se foi uma corre\xE7\xE3o, confira a IA no diagn\xF3stico do painel.",
  503: "O servi\xE7o est\xE1 temporariamente indispon\xEDvel (503). Tente de novo em instantes."
};
var PRAZO_PADRAO_MS = 3e4;
var PRAZO_CORRECAO_MS = 65e3;
var PRAZO_OCR_MS = 4e4;
var PRAZO_SIGA_MS = 25e3;
var obterToken = null;
function configurarToken(fn) {
  obterToken = fn;
}
async function api(caminho, corpo, init, prazoMs = PRAZO_PADRAO_MS) {
  const headers = { "Content-Type": "application/json" };
  const token = obterToken ? await obterToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let resposta;
  let texto;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: corpo === void 0 ? "GET" : "POST",
      headers,
      body: corpo === void 0 ? void 0 : JSON.stringify(corpo),
      ...init,
      // O sinal cobre cabeçalho E corpo: a leitura do texto fica dentro do try.
      signal: init?.signal ?? AbortSignal.timeout(prazoMs)
    });
    texto = await resposta.text();
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    const segundos = Math.max(1, Math.round(prazoMs / 1e3));
    if (nome === "TimeoutError" || nome === "AbortError") {
      throw new ErroApi(
        `O servidor n\xE3o respondeu em ${segundos} s. ` + (caminho.includes("corrigir") ? "Se foi a corre\xE7\xE3o autom\xE1tica, o modelo em CPU pode estar sobrecarregado \u2014 tente de novo ou fa\xE7a a corre\xE7\xE3o manual." : "Confira sua conex\xE3o e tente de novo em instantes."),
        0
      );
    }
    throw new ErroApi("N\xE3o consegui falar com o servidor. Confira sua conex\xE3o e tente de novo.", 0);
  }
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!resposta.ok) {
    const obj = json ?? {};
    const mensagem = obj.erro || MENSAGENS_DA_PLATAFORMA[resposta.status] || `Falha na comunica\xE7\xE3o (${resposta.status})`;
    throw new ErroApi(mensagem, resposta.status, obj.detalhe);
  }
  return json;
}
export {
  ErroApi,
  PRAZO_CORRECAO_MS,
  PRAZO_OCR_MS,
  PRAZO_PADRAO_MS,
  PRAZO_SIGA_MS,
  api,
  configurarToken
};
