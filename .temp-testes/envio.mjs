// src/lib/envio.ts
var ErroDeEnvio = class extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
    this.name = "ErroDeEnvio";
  }
  codigo;
};
var PRAZO_ENVIO_MS = 6e4;
function mensagemDeDemoraNoEnvio(ms) {
  const segundos = Math.max(1, Math.round(ms / 1e3));
  return `O envio da foto passou de ${segundos} s e eu parei de esperar. A foto continua no aparelho: confira o sinal (Wi-Fi ou dados) e toque em \u201CEnviar\u201D de novo.`;
}
function mensagemDeFalhaNoEnvio(detalhe) {
  const d = (detalhe ?? "").toLowerCase();
  if (/failed to fetch|load failed|network|fetch failed|err_internet|offline/.test(d)) {
    return "N\xE3o consegui falar com o servidor. Confira a conex\xE3o (Wi-Fi ou dados) e toque em \u201CEnviar\u201D de novo.";
  }
  if (/maximum allowed size|payload too large|entity too large|exceeded.*size|too large/.test(d)) {
    return "A foto ficou grande demais para o envio. Tire outra um pouco mais longe da folha \u2014 ou digite o texto.";
  }
  if (/row-level security|jwt|unauthorized|401|invalid.*token|expired/.test(d)) {
    return "Sua sess\xE3o expirou. Entre de novo \u2014 a foto continua no aparelho e o envio recome\xE7a do zero.";
  }
  return "N\xE3o consegui enviar a foto. Tente de novo em instantes; se continuar, digite o texto da reda\xE7\xE3o.";
}
function erroDeEnvio(detalhe) {
  const d = (detalhe ?? "").toLowerCase();
  const codigo = /maximum allowed size|payload too large|entity too large|exceeded.*size|too large/.test(
    d
  ) ? "tamanho" : /row-level security|jwt|unauthorized|401|invalid.*token|expired/.test(d) ? "sessao" : /failed to fetch|load failed|network|fetch failed|err_internet|offline/.test(d) ? "rede" : "outro";
  return new ErroDeEnvio(codigo, mensagemDeFalhaNoEnvio(detalhe));
}
function comPrazo(promessa, ms, mensagem = mensagemDeDemoraNoEnvio(ms)) {
  return new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new ErroDeEnvio("tempo", mensagem)), ms);
    promessa.then(
      (valor) => {
        clearTimeout(relogio);
        resolver(valor);
      },
      (erro) => {
        clearTimeout(relogio);
        rejeitar(erro);
      }
    );
  });
}
export {
  ErroDeEnvio,
  PRAZO_ENVIO_MS,
  comPrazo,
  erroDeEnvio,
  mensagemDeDemoraNoEnvio,
  mensagemDeFalhaNoEnvio
};
