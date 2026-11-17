// api/_lib/transcrever.ts
import { createSign } from "node:crypto";

// api/_lib/http.ts
var ErroHttp = class extends Error {
  constructor(status, codigo, mensagem, detalhe) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhe = detalhe;
  }
  status;
  codigo;
  detalhe;
};
async function buscar(url, opcoes, config) {
  const padrao = Number(envOpcional("HTTP_TIMEOUT_MS") ?? 8e3);
  const prazoMs = config.prazoMs ?? (Number.isFinite(padrao) && padrao > 0 ? padrao : 8e3);
  const inicio = Date.now();
  try {
    const resposta = await fetch(url, { ...opcoes, signal: opcoes.signal ?? AbortSignal.timeout(prazoMs) });
    const corpo = await resposta.arrayBuffer();
    const semCorpo = corpo.byteLength === 0 || resposta.status === 204 || resposta.status === 304;
    return new Response(semCorpo ? null : corpo, {
      status: resposta.status,
      statusText: resposta.statusText,
      headers: resposta.headers
    });
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    const abortou = nome === "TimeoutError" || nome === "AbortError";
    const segundos = Math.max(1, Math.round(prazoMs / 1e3));
    const detalhe = `${Date.now() - inicio} ms \xB7 ${erro instanceof Error ? erro.message : String(erro)}`;
    if (abortou) {
      throw new ErroHttp(
        504,
        config.codigoTempo ?? "TEMPO_ESGOTADO",
        `O ${config.servico} n\xE3o respondeu em ${segundos} s e a opera\xE7\xE3o foi interrompida. ` + (config.dica ?? "Tente de novo em instantes."),
        detalhe
      );
    }
    throw new ErroHttp(
      502,
      config.codigoRede ?? "INALCANCAVEL",
      `N\xE3o consegui falar com ${config.servico}. ` + (config.dica ?? "Confira a conex\xE3o e o endere\xE7o configurado."),
      detalhe
    );
  }
}
function envOpcional(nome) {
  const valor = process.env[nome];
  return valor && valor.trim() !== "" ? valor.trim() : void 0;
}

// api/_lib/transcrever.ts
var PROMPT = `Transcreva fielmente, em portugu\xEAs, o texto manuscrito que aparece nesta imagem.

Regras:
- Reproduza exatamente o que est\xE1 escrito, inclusive erros de ortografia, de concord\xE2ncia e rasuras leg\xEDveis.
- Preserve a divis\xE3o em par\xE1grafos.
- N\xE3o acrescente t\xEDtulos, coment\xE1rios, notas ou corre\xE7\xF5es.
- Se algum trecho estiver ileg\xEDvel, escreva [ileg\xEDvel] no lugar.
- Se a imagem n\xE3o contiver texto manuscrito, responda apenas: SEM_TEXTO

Responda somente com a transcri\xE7\xE3o.`;
function provedorDeVisao() {
  return (envOpcional("VISION_PROVIDER") ?? "openrouter").toLowerCase();
}
function ocrConfigurado() {
  if (envOpcional("VISION_API_KEY")) return true;
  return provedorDeVisao() === "deepseek" && Boolean(envOpcional("LLM_API_KEY"));
}
async function transcreverImagem(bytes, mimetype) {
  const provedor = provedorDeVisao();
  const chave = envOpcional("VISION_API_KEY") ?? (provedor === "deepseek" ? envOpcional("LLM_API_KEY") : void 0);
  if (!chave) {
    throw new ErroHttp(
      503,
      "OCR_NAO_CONFIGURADO",
      "A transcri\xE7\xE3o autom\xE1tica n\xE3o est\xE1 configurada no servidor (falta VISION_API_KEY). Digite o texto da reda\xE7\xE3o para continuar."
    );
  }
  if (provedor === "deepseek") {
    return transcricaoDeepSeek(chave, bytes, mimetype);
  }
  const base64 = Buffer.from(bytes).toString("base64");
  if (provedor === "google" || provedor === "gemini") {
    return transcricaoGoogle(chave, base64, mimetype);
  }
  if (provedor === "google-cloud" || provedor === "gcv" || provedor === "google-vision") {
    return transcricaoCloudVision(chave, base64);
  }
  if (provedor === "openrouter" || provedor === "openai" || provedor === "azure-openai") {
    return transcricaoCompativel(chave, base64, mimetype);
  }
  throw new ErroHttp(503, "OCR_PROVEDOR_DESCONHECIDO", `VISION_PROVIDER="${provedor}" n\xE3o \xE9 suportado.`);
}
var configOcr = (servico = "servi\xE7o de leitura da foto (OCR)", prazoPadrao = 25e3) => ({
  servico,
  dica: "A reda\xE7\xE3o n\xE3o foi transcrita. Tente de novo; se persistir, digite o texto \u2014 ele vale como entrega.",
  prazoMs: Number(envOpcional("OCR_TIMEOUT_MS") ?? prazoPadrao),
  codigoRede: "OCR_INALCANCAVEL",
  codigoTempo: "OCR_DEMOROU"
});
var EXTENSAO_POR_TIPO = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic"
};
async function transcricaoDeepSeek(chave, bytes, mimetype) {
  const base = (envOpcional("VISION_BASE_URL") ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const tipo = mimetype || "image/jpeg";
  const arquivo = new Blob([bytes], { type: tipo });
  const formulario = new FormData();
  formulario.append("purpose", "text_recognition");
  formulario.append("file", arquivo, `redacao.${EXTENSAO_POR_TIPO[tipo] ?? "jpg"}`);
  const resposta = await buscar(
    `${base}/v1/tools/ocr`,
    { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: formulario },
    // A DeepSeek aceita até 180 s no total; 35 s é o que uma página leva com folga
    // e ainda cabe no orçamento da função e no prazo que o navegador espera.
    configOcr("leitura da foto (OCR da DeepSeek)", 35e3)
  );
  const bruto = await resposta.text();
  if (!resposta.ok) {
    const dica = resposta.status === 413 ? "A foto \xE9 grande demais para a leitura. Tire outra em resolu\xE7\xE3o menor." : resposta.status === 429 ? "A leitura est\xE1 ocupada agora. Tente de novo em alguns segundos." : resposta.status === 400 ? "A leitura n\xE3o aceitou o arquivo. Tire outra foto (JPEG ou PNG)." : "A leitura da foto falhou. Tente de novo; se persistir, digite o texto.";
    throw new ErroHttp(502, "OCR_FALHOU", `A DeepSeek respondeu ${resposta.status}. ${dica}`, bruto.slice(0, 600));
  }
  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch {
    throw new ErroHttp(502, "OCR_FALHOU", "A leitura da foto respondeu algo que n\xE3o \xE9 JSON.", bruto.slice(0, 600));
  }
  const paginas = dados.pages ?? [];
  if (paginas.some((p) => p.finish_reason === "length")) {
    throw new ErroHttp(
      422,
      "OCR_INCOMPLETO",
      "A leitura parou no meio da p\xE1gina \u2014 a foto tem texto demais ou pouco contraste. Tire outra, com a folha inteira e boa luz."
    );
  }
  const conteudo = paginas.map((p) => p.text ?? "").join("\n\n");
  return finalizar(conteudo, "deepseek:ocr");
}
async function transcricaoCompativel(chave, base64, mimetype) {
  const base = (envOpcional("VISION_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const modelo = envOpcional("VISION_MODEL") ?? "google/gemini-2.5-flash";
  const rotulo = base.includes("openrouter") ? "openrouter" : "openai-compativel";
  const resposta = await buscar(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      ...base.includes("openrouter") ? { "HTTP-Referer": "https://estatistica-biocientistas.vercel.app" } : {}
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      max_tokens: 2e3,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } }
          ]
        }
      ]
    })
  }, configOcr());
  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new ErroHttp(502, "OCR_FALHOU", `O provedor de vis\xE3o respondeu ${resposta.status}.`, texto.slice(0, 600));
  }
  const dados = JSON.parse(texto);
  const conteudo = dados.choices?.[0]?.message?.content ?? "";
  return finalizar(conteudo, `${rotulo}:${modelo}`);
}
async function transcricaoGoogle(chave, base64, mimetype) {
  const modelo = envOpcional("VISION_MODEL") ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
  const resposta = await buscar(url, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: PROMPT }, { inline_data: { mime_type: mimetype, data: base64 } }]
        }
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 2e3 }
    })
  }, configOcr());
  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new ErroHttp(502, "OCR_FALHOU", `O Google respondeu ${resposta.status}.`, texto.slice(0, 600));
  }
  const dados = JSON.parse(texto);
  const conteudo = (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return finalizar(conteudo, `google:${modelo}`);
}
function pareceJson(chave) {
  return chave.trim().startsWith("{");
}
function baseVision() {
  return (envOpcional("GOOGLE_VISION_BASE") ?? "https://vision.googleapis.com").replace(/\/+$/, "");
}
async function tokenDaContaDeServico(conta) {
  if (!conta.client_email || !conta.private_key) {
    throw new ErroHttp(503, "OCR_CREDENCIAL", "O JSON da conta de servi\xE7o precisa de client_email e private_key.");
  }
  const agora = Math.floor(Date.now() / 1e3);
  const cabecalho = { alg: "RS256", typ: "JWT" };
  const corpo = {
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/cloud-vision",
    aud: conta.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const semAssinatura = `${b64(cabecalho)}.${b64(corpo)}`;
  const assinatura = createSign("RSA-SHA256").update(semAssinatura).sign(conta.private_key, "base64url");
  const jwt = `${semAssinatura}.${assinatura}`;
  const resposta = await buscar(
    corpo.aud,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt })
    },
    configOcr("login da conta de servi\xE7o do Google")
  );
  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new ErroHttp(502, "OCR_CREDENCIAL", "O Google recusou a conta de servi\xE7o.", texto.slice(0, 600));
  }
  const dados = JSON.parse(texto);
  if (!dados.access_token) throw new ErroHttp(502, "OCR_CREDENCIAL", "O Google n\xE3o devolveu access_token.");
  return dados.access_token;
}
async function transcricaoCloudVision(chave, base64) {
  let url = `${baseVision()}/v1/images:annotate`;
  const cabecalhos = { "Content-Type": "application/json" };
  if (pareceJson(chave)) {
    const conta = JSON.parse(chave);
    cabecalhos.Authorization = `Bearer ${await tokenDaContaDeServico(conta)}`;
  } else {
    url += `?key=${encodeURIComponent(chave)}`;
  }
  const resposta = await buscar(url, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["pt-BR", "pt"] }
        }
      ]
    })
  }, configOcr());
  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new ErroHttp(502, "OCR_FALHOU", `O Cloud Vision respondeu ${resposta.status}.`, texto.slice(0, 600));
  }
  const dados = JSON.parse(texto);
  const primeira = dados.responses?.[0];
  if (primeira?.error?.message) {
    throw new ErroHttp(502, "OCR_FALHOU", `Cloud Vision: ${primeira.error.message}`, texto.slice(0, 600));
  }
  const conteudo = primeira?.fullTextAnnotation?.text ?? primeira?.textAnnotations?.[0]?.description ?? "";
  return finalizar(conteudo, "google-vision:document-text");
}
function finalizar(bruto, modelo) {
  const texto = bruto.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!texto || /^SEM_TEXTO$/i.test(texto)) {
    throw new ErroHttp(
      422,
      "SEM_TEXTO",
      "N\xE3o encontrei texto manuscrito leg\xEDvel na foto. Tente outra foto, com mais luz e a folha inteira no enquadramento."
    );
  }
  if (texto.replace(/\s/g, "").length < 40) {
    throw new ErroHttp(
      422,
      "TEXTO_CURTO",
      "A transcri\xE7\xE3o saiu muito curta \u2014 provavelmente a foto est\xE1 tremida, escura ou cortou a folha."
    );
  }
  return { texto, modelo };
}
export {
  ocrConfigurado,
  provedorDeVisao,
  transcreverImagem
};
