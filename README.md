# Avaliação de redações — Análise de Dados para Biocientistas

Aplicativo web (mobile-first) para receber redações manuscritas dos estudantes, transcrevê-las,
corrigi-las com uma rubrica definida pelo professor e lançar a nota no SIGA — com a devolutiva
(nota + pontos fortes + pontos a desenvolver) publicada para cada aluno.

Livro-base: <https://estatistica-biocientistas.vercel.app/> · DOI
[10.5281/zenodo.23858966](https://doi.org/10.5281/zenodo.23858966) · UFJF/GV.

---

## 1. O que o aplicativo faz

```
 aluno                                   servidor                          professor
 ─────                                   ────────                          ─────────
 fotografa a folha  ──►  Supabase Storage (privado)
                         │
                         ├─►  /api/transcrever  ──►  OCR em nuvem  ──►  texto
                         │                                              │
                         └─►  (aluno confere e envia o texto) ──────────► banco
                                                                        │
                                        /api/corrigir  ◄── Llama (texto) ┘
                                              │
                                        rubrica → notas por critério
                                              │
                                        soma → nota 0–10 (SIGA)
                                              │
                       professor revisa, aprova  ──►  /api/siga/lancar  ──►  SIGA
                                              │
                                        aluno vê a devolutiva
```

Decisões de projeto:

| Decisão | Por quê |
|---|---|
| **Duas etapas** (OCR em nuvem → correção com Llama de texto) | O Llama auto-hospedado não lê imagem. Separar as etapas deixa cada uma no hardware certo: visão em API, texto na sua máquina. |
| **Nota determinística** | O modelo só pontua cada critério entre 0 e o máximo. A soma e a conversão para 0–10 são feitas em código, nunca pelo modelo. |
| **Professor aprova antes de lançar** | Nenhuma nota chega ao SIGA sem revisão humana. Toda tentativa fica registrada em `lancamentos_siga`. |
| **Lista de alunos importada** | O cadastro só é aceito se matrícula **e** e-mail constarem na lista da turma (função `validar_matricula` + gatilho no banco). |

---

## 2. Stack

- **Front-end:** Vite 8, React 19, TypeScript 7, Tailwind CSS 4, `lucide-react`, PWA instalável.
- **Back-end:** funções serverless em `api/` (Vercel Functions, Node `(req, res)`), bundladas por
  esbuild no modo local.
- **Banco/Auth/Storage:** Supabase (Postgres + RLS, Auth, bucket privado `redacoes`).
- **IA:** provedor compatível com OpenAI para OCR (OpenRouter, OpenAI, Gemini) e para o corretor
  (`LLM_BASE_URL` aponta para o Llama no Coolify ou qualquer endpoint compatível).
- **Integração acadêmica:** API do SIGA (`https://siga-api.sparklingtech.com.br`, header `X-API-Key`).

---

## 3. Rodando localmente

```bash
pnpm install
cp .env.example .env.local      # preencha o que for usar
pnpm dev                        # UI em http://127.0.0.1:3210 · API em http://127.0.0.1:3101
```

`pnpm dev` sobe dois processos: o Vite (3210, com proxy `/api` → 3101) e um espelho local das
funções da Vercel (3101), recompilado a cada mudança em `api/`.

**Modo demonstração:** sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, o app usa
`src/lib/dadosDemo.ts` (dados no `localStorage`, nenhuma chamada externa). Serve para mostrar a
interface; OCR, correção e SIGA ficam desligados.

Variáveis lidas pelo servidor (nunca expostas ao navegador): `SUPABASE_SERVICE_ROLE_KEY`,
`LLM_API_KEY`, `VISION_API_KEY`, `SIGA_API_KEY`, `SUPABASE_ACCESS_TOKEN`.

---

## 4. Banco de dados

Migrações idempotentes em `supabase/migrations/` — `0001_init.sql` (estrutura) e
`0002_encerrada.sql` (avaliação encerrada continua visível ao aluno, mas não aceita entrega nova) e
`0003_email_opcional.sql` (turma sem e-mails na lista, com o e-mail informado no cadastro) e
`0004_consentimento.sql` (data do aceite do aviso de privacidade em `profiles.consentimento_em`):

| Tabela | Papel |
|---|---|
| `turmas` | código no SIGA (`CBV018GV-A`), período (`2026/3`), curso |
| `alunos_esperados` | lista importada pelo professor (matrícula, nome, e-mail) |
| `professores_autorizados` | e-mails que podem ter papel de professor |
| `profiles` | dados do usuário autenticado + papel (`aluno`/`professor`); professor tem `departamento`/`instituto` |
| `avaliacoes` | tema, instruções do aluno, instruções de correção da LLM, valor total, rubrica (JSONB), descrição/peso/data no SIGA |
| `submissoes` | foto, transcrição, texto final, status |
| `correcoes` | notas por critério, nota bruta, nota final, pontos fortes/desenvolver, decisão |
| `lancamentos_siga` | trilha de auditoria de cada envio (sucesso, HTTP, erro, payload) |
| `auditoria` | log de ações sensíveis |

Garantias no banco: RLS em todas as tabelas, bucket privado, gatilho `handle_new_user` que recusa
cadastro fora da lista (`MATRICULA_NAO_LISTADA`, `EMAIL_NAO_CONFERE`) e gatilho que exige
`Σ rubrica = valor_total`. A política de `submissoes` só aceita **insert** quando a avaliação está
`publicada` — encerrar entrega não depende da boa vontade da tela.

```bash
pnpm db:aplicar          # aplica as migrações via Management API
pnpm db:aplicar --simular
```

### Configuração do Supabase usada

- **Confirmação de e-mail desligada** (`mailer_autoconfirm`): o professor já validou o e-mail na
  lista da turma e o projeto não tem SMTP próprio; sem isso o cadastro esbarra no limite de
  e-mails do Supabase.
- **Bucket `redacoes` privado**, acesso por URL assinada (1 h) apenas para o dono e professores.

---

## 5. Corretor (Llama) — contrato

`api/_lib/rubrica.ts` monta um prompt com tema, instruções, texto do aluno e a rubrica no formato:

```
1. id="c1-abc" | Precisão conceitual | máximo 6 pts | Usa corretamente os conceitos do capítulo.
```

O modelo **só** devolve JSON:

```json
{
  "criterios": [{ "id": "c1-abc", "valor": 4.5, "justificativa": "…" }],
  "pontos_fortes": ["…"],
  "pontos_desenvolver": ["…"],
  "comentario": "…",
  "confianca": 0.82
}
```

O servidor valida cada `id`, corta valores fora de `[0, máximo]`, soma e calcula
`nota_final = round(nota_bruta / valor_total × 10, 1)`.

Antes de pontuar, a resposta do modelo passa por um **leitor tolerante** (`api/_lib/rubrica.ts`):
modelos pequenos esquecem chaves de fechamento, deixam vírgula pendente ou cortam o texto. O leitor
reconstrói o JSON respeitando strings e a pilha de `{` `[`, e só aceita a correção quando **todos**
os critérios da rubrica vieram. Se a resposta foi cortada por limite de tokens (`finish_reason: length`),
a correção falha com `RESPOSTA_TRUNCADA` em vez de dar zero nos critérios que faltaram — correção
parcial silenciosa seria pior que correção nenhuma.

Testes desse leitor: `pnpm test:parser` (casos reais observados em execução com llama3:8b).

Variáveis: `LLM_BASE_URL` (ex.: `https://llama.sua-instancia.coolify.app/v1`), `LLM_MODEL`,
`LLM_API_KEY`, `LLM_JSON_MODE` (`1` se o servidor suportar `response_format`), `LLM_MAX_PALAVRAS`,
`LLM_MAX_TOKENS`.

---

## 6. SIGA

| Ação | Rota do app | Chamada |
|---|---|---|
| lançar notas | `POST /api/siga/lancar` | `POST /api/lancar-notas` |
| criar avaliação (TVC) | `POST /api/siga/avaliacao` | `POST /api/criar-avaliacao` |
| listar avaliações da turma | `GET /api/siga/avaliacoes` | `GET /api/notas` |
| conferir notas | `GET/POST /api/siga/notas` | `GET/POST /api/notas` |

A descrição em `avaliacoes.descricao_siga` precisa ser **idêntica** à do SIGA. O `num_tvc` **não**
vem da descrição: a rota consulta `GET /api/notas` da turma/período, conta as avaliações já
cadastradas e envia a próxima posição (`quantidade + 1`). Peso e data vêm da avaliação. Toda
resposta é gravada em `lancamentos_siga` (inclusive falhas), então dá para reprocessar sem perder
histórico.

Para não errar a descrição, o formulário de nova avaliação tem o botão **Buscar** em *Lançamento
no SIGA*: ele consulta `GET /api/notas` da turma/período, lista as avaliações existentes
(`TVC 1`, `Prova 2`, …) e preenche descrição, peso e data com um clique. O endpoint devolve só
o quadro de avaliações — nomes e notas dos alunos não saem dele.

> A chave em `~/.dsh/secrets/avaliacoes.env` foi validada em 16/11/2026 contra
> `GET /api/notas?turma=CBV018GV-A&periodo=2026/3`: respondeu `200` com o quadro real (7 alunos,
> 4 avaliações). A turma `CBV018GV-A` / `2026/3` existe e está acessível.

### Conferir a configuração

```bash
pnpm diagnostico
```

Testa Supabase, Llama (envia um prompt mínimo e mede tokens/s), credencial do OCR e SIGA
(`/health` + quadro da turma), e estima o tempo de corrigir 40 redações na sua CPU.
Serviço não configurado aparece como `○` (o app continua útil); serviço configurado e
quebrado aparece em vermelho e o comando sai com código 1.

### Importar a turma do SIGA

```bash
pnpm turma:planilha -- --turma CBV018GV-A --periodo 2026/3
```

Lê o quadro do SIGA (somente leitura) e grava `importacao/turma-CBV018GV-A-2026-3.csv` com
matrícula e nome preenchidos e a coluna de e-mail vazia. O SIGA não expõe e-mail. Duas saídas:

1. colar os e-mails à mão antes de enviar o CSV; ou
2. desmarcar **Exigir o e-mail na lista** em *Turmas e alunos* — aí a lista vale só com matrícula
   e nome (migration `0003_email_opcional.sql`), e o aluno informa o próprio e-mail no cadastro;
   o e-mail digitado fica gravado em `alunos_esperados` e as próximas consultas já o mostram.
A pasta `importacao/` está no `.gitignore` (contém nomes de alunos).

### Limite de tempo da hospedagem (importante com IA em CPU)

A Vercel no plano Hobby corta a função em **60 s** (o `maxDuration: 300` do `vercel.json` só vale
em planos pagos). Uma correção com Llama 7B em CPU gasta 45–90 s, então parte dos pedidos morre
com 504 — a tela agora explica isso e sugere as saídas:

| Situação | Caminho |
|---|---|
| Poucas redações, modelo rápido (GPU ou API) | **Corrigir pendentes** na tela da avaliação |
| Turma inteira com modelo em CPU | `pnpm corrigir:lote` no servidor do modelo (sem limite de tempo) |
| IA indisponível | correção manual na revisão |

### Backup dos dados

`pnpm backup` grava um JSON com todas as tabelas em `backups/` (ignorado pelo git, porque tem dados
pessoais). Com `--fotos` baixa também as imagens do bucket privado. Rode antes de migrations grandes
e no fim de cada período.

`pnpm fotos:limpar` mostra as fotos que ficaram sem submissão (o Storage não segue o cascade do
banco); `pnpm fotos:limpar --apagar` remove. A remoção de turma pela tela já apaga as fotos dela.

### Se o modelo demorar mais que o limite da Vercel

`LLM_TIMEOUT_MS` (padrão 55 s) define quanto o app espera pela resposta do modelo antes de devolver
um erro explicativo. O plano Hobby da Vercel corta funções em ~60 s; para um modelo grande rodando
em CPU, use `pnpm corrigir:lote` na sua máquina — o script já espera 10 minutos por redação.

### A conta da nota

`pnpm test:rubrica` roda 39 verificações sobre a normalização da resposta do modelo — valor acima do
máximo do critério, número em texto, vírgula decimal, critério faltando, critério fora de ordem,
campos ausentes, nível declarado que não bate com a nota e citação entre aspas que não existe no
texto. Não chama o modelo: empacota `api/_lib/rubrica.ts` com esbuild (como a Vercel faz) e testa a
função que decide a nota.

### A auditoria do SIGA, na tela

`lancamentos_siga` guarda cada tentativa — aceita ou recusada — com payload, resposta, HTTP status e
escala. Até esta rodada, esse registro só existia no banco: para responder *"esta nota foi lançada?"*
ou *"por que o SIGA recusou?"* era preciso abrir o SQL editor.

Agora a tela da avaliação tem **Histórico de lançamentos** (`/prof/avaliacoes/:id/historico`):

| O que mostra | De onde vem |
|---|---|
| data, aluno, matrícula | `lancamentos_siga` + `profiles` |
| nota e escala (`pontos` ou `0–10`) | coluna `nota` e `escala` (migration 0007) |
| aceito/recusado, HTTP e mensagem do SIGA | `sucesso`, `http_status`, `erro` |
| **Baixar CSV** | o mesmo recorte, para a planilha do semestre |

Duas decisões de projeto:

- **Filtra pelo que foi enviado** (turma + descrição do SIGA), não pelos ids atuais. Se uma correção
  for apagada depois, o lançamento continua no histórico, porque a pergunta é sobre o SIGA, não sobre
  o banco local.
- **Não há botão de apagar.** A tela lê com a RLS do professor (`eh_professor()`); escrita é só com a
  service role, no servidor. `pnpm test:seguranca` ganhou a prova de que uma aluna **não** lê essa
  tabela.

### Lançar duas vezes não lança duas vezes

O botão de lançar é o único que escreve em sistema de terceiro, e clicar duas vezes (ou repetir depois
de um timeout) chamava o SIGA duas vezes e criava duas linhas iguais na auditoria. Agora o servidor
guarda a chave: **`correcao_id` + `nota`**.

| Situação | O que acontece | O que o professor vê |
|---|---|---|
| O **último** envio foi com a mesma nota | não chama o SIGA | `Esta nota já estava lançada no SIGA com o mesmo valor — nada foi reenviado.` |
| Nota mudou depois do lançamento | chama o SIGA de novo | lançamento normal (é correção, não duplicata) |
| Lançou 8, ajustou para 9, voltou para 8 | chama de novo (o SIGA está com 9) | lançamento normal |
| Lote com algumas repetidas | pula as repetidas | `3 nota(s) lançadas no SIGA; 2 já estava(m) lá (nada reenviado)` |

E quando o SIGA **recusa**, a auditoria passou a guardar o status de origem: antes `http_status` era
`null` em toda falha (só dava para ver o 502 que o app devolve ao navegador), agora fica o 403/422 que
o SIGA respondeu e o histórico mostra `Recusado · HTTP 422` com a mensagem. A diferença importa:
`null` = não houve resposta, 422 = o SIGA respondeu e recusou — o professor corrige o dado em vez de
esperar.

### Senha: o caminho de quem já perdeu o acesso

O fluxo de recuperação tinha três buracos, todos no mesmo lugar — o aluno sem acesso e sem paciência.

| Situação | Antes | Agora |
|---|---|---|
| link expirado ou já usado | caía na tela de login **sem explicação**; o erro do Supabase era descartado | o app lê `#error=…`, traduz e mostra “Este link expirou… peça outro abaixo” na tela de recuperação |
| link vencido com sessão aberta (celular que guarda login) | o roteador devolvia ao início e o aviso sumia | `/recuperar` abre para quem está conectado |
| abrir `/redefinir` sem sessão | formulário que falhava com mensagem em inglês | orientação em português + link para pedir outro |
| trocar a senha no **Perfil** | bastava a sessão aberta (celular na mesa) | pede a **senha atual**, recusa a nova igual à antiga e **desconecta os outros aparelhos** |

`src/lib/linkRecuperacao.ts` traduz os códigos do GoTrue (`otp_expired`, `access_denied`, `invalid`) e
guarda o recado em `sessionStorage`, porque o hash é limpo logo depois. `pnpm test:recuperacao` cobre 9
casos com hashes reais do Supabase — inclusive o fluxo PKCE, que põe o erro na query em vez do hash — e
reprova se a mensagem mostrar texto em inglês. O `e2e:mobile` abre o link vencido de verdade e confere o
aviso na tela (15 telas, 125 alvos).

### A lista da turma, lida dos bytes

O caminho que todo semestre começa — importar a lista — tinha um defeito silencioso: o app lia o
arquivo escolhido com `arquivo.text()`, que só entende UTF-8. O Excel em português salva “CSV (separado
por vírgulas)” em **Windows-1252**, então:

```
antes   "2026301001;Ana Concei��o;ana@x.br"
agora   "2026301001;Ana Conceição;ana@x.br"
```

O nome errado não ficava só na tela: ia para a devolutiva do aluno. `decodificarArquivo()` em
`src/lib/csv.ts` lê os bytes, tenta UTF-8 **estrito** (`TextDecoder` com `fatal: true`) e, se falhar,
relê como Windows-1252 com um aviso amarelo na prévia. Planilha `.xlsx` (que começa com `PK`) é recusada
com instrução em vez de importar lixo.

`pnpm test:csv` passou de 16 para **24 verificações**, incluindo as que dependem de bytes: Windows-1252
preservando acentos, UTF-8 com e sem BOM, `.xlsx` recusado, `.xls` antigo recusado, cabeçalho com
colunas extras e uma turma de 40 alunos sem perder ninguém.

### O roteiro de operação

`docs/operacao.md` é o documento para tocar o app sem ninguém por perto: os seis passos de antes do
semestre, o ciclo de uma avaliação (criar → publicar → corrigir → lançar → fechar), o calendário sugerido,
o que fazer em cada resposta de erro do SIGA e como saber que o sistema está saudável.

`pnpm test:documentacao` impede que ele envelheça em silêncio. O teste cobra três contratos objetivos:
todo `pnpm <script>` citado existe no `package.json`; todo caminho de arquivo citado existe no
repositório; todo rótulo de tela citado (23 deles) existe em `src/`. Também deriva do `e2e/mobile.mjs`
quantas telas a suíte mede e reprova qualquer documento que diga outro número.

Na primeira execução ele achou o que ninguém tinha visto: este README mandava rodar dois comandos que
**não existem** (os certos são `pnpm test:e2e` e `pnpm test:seguranca`) e ainda anunciava uma contagem de
telas e de alvos de toque que a suíte já tinha superado. Um teste de mutação confirma que ele reprova de
verdade: trocar um comando e um número no README faz o teste sair com código 1 e apontar exatamente os
dois.

### Contraste e toque

`pnpm test:contraste` abre 10 telas na demonstração, lê a cor calculada de cada elemento com texto, acha o
fundo efetivo subindo a árvore e aplica a fórmula de luminância da WCAG. Reprova texto pequeno abaixo de
4.5:1 e grande abaixo de 3:1. Foi ele que encontrou os dois problemas de hoje: as legendas em
`tinta-fraca` (#8b968f) davam **2.59:1** em todos os fundos, e os botões desativados saíam a **1.09:1**
(verde a 50% com texto branco). O botão desativado virou cinza com texto escuro — continua dizendo
“Corrigir 0 pendente(s)”, agora legível.

### Identidade visual

A paleta atual sai do **brasão da UFJF**: azul-marinho `#123e66`, vermelho `#b02a23`, dourado `#8a5a00`
e papel quente `#f8f5ec`. O brasão oficial, com fundo transparente, fica em `public/brasao-ufjf.png` e
aparece nas telas de entrada (grande) e no topo de todas as telas internas (pequeno). Favicon e ícones do
PWA são gerados a partir dele com `node scripts/gerar-icones.mjs` (usa o Chromium do Playwright, sem
dependência de ImageMagick).

Contraste medido: `tinta-suave` #46536b = 6.28 · `tinta-fraca` #5a6678 = 4.72 · branco sobre marinho =
11.01 · branco sobre vermelho = 6.56 · dourado sobre dourado-claro = 5.31.

`pnpm e2e:mobile` mede os alvos de toque das 16 telas principais em 360×740 e reprova qualquer controle
abaixo de 40px. Foi ele que achou as abas “Transcrição/Foto original” (32px) e o “Voltar para a lista”
(20px) na tela de revisão.

O mesmo teste passou a cobrar duas garantias que se apoiam uma na outra:

| Garantia | Por quê |
|---|---|
| nenhum `maximum-scale`/`user-scalable=no` no viewport | quem tem baixa visão precisa ampliar com dois dedos (WCAG 1.4.4) |
| todo `input`/`textarea`/`select` visível com fonte ≥ 16px | é o que impede o iOS de ampliar sozinho ao focar o campo — o motivo pelo qual a trava de zoom existia |

A trava saiu do `index.html` e quatro campos que ainda estavam em 13–14px na tela do professor
(importar lista, descrição do critério, nota por critério, pontos fortes/desenvolver) passaram a
`text-base` no celular e a fonte original a partir de `sm:`. No primeiro uso do novo teste, ele reprovou
**4 das 16 telas** — todos eram campos de verdade, não falso positivo.

### Pré-cadastro das turmas e alunos

As listas do SIGA (CSV com matrícula, nome e e-mail institucional) alimentam as turmas, a lista de
alunos esperados e as contas de acesso de uma vez:

```bash
# as listas ficam fora do repositório, em ~/.dsh/dados/2026-3/
pnpm importar:listas -- --ensaio     # confere quantos alunos, sem gravar
pnpm importar:listas                 # grava turmas, listas e contas
```

O nome do arquivo é o código do SIGA (`CBV018GV_A_2026_3.csv` → `CBV018GV-A`); a disciplina e o horário
vêm do mapa `TURMAS`, dentro do script. Em 2026/3 são quatro turmas e 60 alunos:

| Turma | Disciplina | Alunos |
|---|---|---|
| CBV018GV-A | Introdução à Bioestatística e à Ciência de Dados na Saúde | 7 |
| CBV018GV-B | Introdução à Bioestatística e à Ciência de Dados na Saúde | 20 |
| CBV044GV-A | Noções de Bioestatística | 31 |
| EST006GV-A | Bioestatística | 2 |

**Login e senha inicial são o mesmo e-mail institucional.** A conta já nasce com
`profiles.precisa_trocar_senha = true`: ao entrar, o aluno vê o aviso “Defina uma senha só sua” na
tela inicial e em *Meus dados*, e a marca desaparece quando ele troca a senha. A senha inicial fraca
é uma decisão de operação — o aviso existe para que ninguém fique nela. O script é idempotente: quem
já tem conta não é recriado; `--redefinir-senhas` devolve a senha inicial a todos (use só em caso de
perda geral de acesso).

### Ligar a IA em um comando

**Caminho recomendado: um provedor só, a API da DeepSeek.** Ela faz as duas etapas com a mesma chave:

| Etapa | Endpoint | O que volta |
|---|---|---|
| ler a foto | `POST https://api.deepseek.com/v1/tools/ocr` (multipart, `purpose=text_recognition`) | `pages[].text` — texto da página, sem passar por modelo de chat |
| corrigir | `POST https://api.deepseek.com/chat/completions` (`deepseek-v4-pro`) | JSON da rubrica: nota por critério, pontos fortes e a desenvolver |

```bash
pnpm configurar:ia --deepseek --chave sk-... --foto ~/redacao.jpg
```

O `--deepseek` preenche `LLM_BASE_URL=https://api.deepseek.com`, `LLM_MODEL=deepseek-v4-pro`,
`VISION_PROVIDER=deepseek`, `LLM_JSON_MODE=1` e `LLM_SEM_PENSAMENTO=1` — e usa `LLM_API_KEY` também na
leitura, porque exigir duas chaves do mesmo fornecedor só cria chance de errar uma.

Três detalhes que a configuração não pode esquecer:

- **desligar o “pensamento”.** A DeepSeek liga `reasoning_effort: high` por padrão; sem
  `thinking: {type: "disabled"}` a resposta vem com raciocínio antes do JSON e demora o que o prazo de
  55 s não tem. O app manda o campo só quando `LLM_SEM_PENSAMENTO=1` ou quando o endereço é
  `api.deepseek.com` — servidores locais podem recusar parâmetro desconhecido.
- **modo JSON.** `LLM_JSON_MODE=1` pede `response_format: json_object`; sem ele o modelo às vezes
  devolve o JSON dentro de um bloco de código e a correção falha na leitura.
- **página truncada não vira nota.** Se o OCR devolver `finish_reason: "length"`, o app recusa a
  transcrição (`OCR_INCOMPLETO`) e pede outra foto, em vez de corrigir metade da redação.

#### O que a primeira prova real mostrou (17/11/2026)

Teste com uma prova manuscrita de verdade (5 páginas, letra cursiva densa, foto de celular
em A4 escaneado). O texto volta **fiel ao que está escrito** — nada de reescrever a redação —, mas
a qualidade varia com a imagem, e o mesmo trecho pode sair diferente a cada chamada:

| Entrada | Resultado |
|---|---|
| página a 170 dpi, 694 KB | 281 palavras, reconhecível, vários nomes trocados (`Haesbaert` → `Hausbacht`) |
| página a 300 dpi, 1,5 MB | 281 palavras, praticamente igual |
| página reduzida a 1800 px (o que o app envia) | 292 palavras, mesma qualidade |
| recorte só da folha, cor | **laço**: o mesmo parágrafo 17 vezes, 31 mil caracteres, `finish_reason: length` |
| recorte em cinza, autocontraste | 1.846 caracteres, sem laço, mesma qualidade |
| recorte com nitidez extra | `SEM_TEXTO` — falso negativo |

Conclusões que viraram código:

- **resolução não é o gargalo** (1800 px rendeu como 300 dpi); não vale aumentar o peso da foto;
- **`rich_layout_recognition` não serve para manuscrito** (devolveu texto vazio no mesmo arquivo);
- **o modelo entra em laço** — daí a guarda `OCR_REPETIDO` (janela de 80 caracteres repetida 5×);
- **`SEM_TEXTO` pode ser falso negativo** — a tela já oferece “digitar o texto”, que é a saída.

Por isso o desenho mantém o aluno no circuito: a transcrição aparece para ele **conferir e corrigir**
antes de enviar, e o professor vê a foto ao lado do texto na revisão. O OCR é ponto de partida, não
a palavra final.

`pnpm test:ocr:deepseek` (18 verificações) sobe um `/v1/tools/ocr` falso e confere o multipart enviado,
a junção das páginas, os limites (429/400), o texto truncado, a foto sem texto e o prazo — sem gastar
chamada. Para testar a leitura de verdade, `pnpm test:ocr:foto ~/redacao.jpg` (ou `--foto` no `configurar:ia`).

Os caminhos antigos continuam valendo — modelo multimodal em `/v1` compatível com OpenAI
(`--visao-modelo Qwen2.5-VL-7B-Instruct`) ou Cloud Vision (`VISION_PROVIDER=google-cloud`):

Sem `--ensaio` (que só mostra o plano), o script: grava as variáveis em `~/.dsh/secrets/avaliacoes.env`
sem apagar as que já existem, publica as mesmas na Vercel (Production, `encrypted`), refaz o deploy, roda
`pnpm test:llm`, roda `pnpm test:ocr:foto` na foto indicada e consulta `/api/saude` em produção para
confirmar que corretor, leitura e SIGA aparecem ligados. Se a Vercel recusar uma variável, ele para e diz
qual foi — sem deixar a configuração pela metade em silêncio.

`pnpm test:configuracao` (23 verificações) prova que o arquivo de segredos sobrevive: chaves novas são
acrescentadas, existentes são atualizadas no lugar, comentários e as outras chaves (Supabase, SIGA)
ficam intactos, e a permissão continua 600. `pnpm test:configuracao:vercel` (12) faz o mesmo contra um
servidor que imita a API da Vercel: 8 `POST` + 1 `PATCH` (para a chave que já existe), sempre com
`target: ["production"]` e `type: "encrypted"`, e o script abortando com mensagem clara quando a Vercel
responde 500.

### Conferir os dados (e o backup)

Nota de aluno é documento. `pnpm verificar` lê o banco e responde se os dados fazem sentido:

| Conferência | Exemplo de problema que ela pega |
|---|---|
| rubrica × valor total | avaliação com rubrica somando 19 e valor total 20 |
| nota final × fórmula | correção com `nota_final` 8 para 15/20 |
| critérios × nota bruta | critério revisado sem atualizar a nota |
| vínculos | redação apontando para avaliação apagada, perfil numa turma inexistente |
| matrícula × conta | `alunos_esperados.user_id` apontando para conta que sumiu |
| envio | submissão `enviada` sem data, aprovada sem revisão |
| SIGA | lançamento apontando para correção apagada, nota negativa |
| duplicidade | duas submissões para a mesma avaliação e aluno |
| fotos (`--fotos`) | arquivo no bucket sem submissão apontando para ele |

`pnpm verificar --arquivo backups/backup-....json` faz o mesmo no arquivo de backup, sem tocar no banco:
é o teste que responde "esse backup presta?" sem esperar o dia do desastre.

O `pnpm test:integridade` (20 verificações) prova que a conferência **detecta** as coisas: cada caso
estraga um dado de propósito e exige o código de erro correspondente. Sem isso, uma tela verde num
banco vazio não significaria nada.

Duas coisas que a conferência ensina: mudar `valor_total` depois de existir correção desalinha
`nota_final` (o app não oferece essa edição de propósito), e `nota_bruta` fora de `0..valor_total` é
erro, não arredondamento.

### A foto do celular

Uma câmera de celular produz 12 MP e 4 a 8 MB — acima do limite de 4,5 MB de corpo das funções da
Vercel, caro no 4G da sala de aula e desnecessário para o OCR. A foto é reduzida **no navegador**
antes de sair do aparelho: lado maior de 1800 px (≈154 dpi numa folha A4) e JPEG 85%. Em seguida vai
direto para o bucket privado do Supabase, sem passar pelo corpo da função.

`pnpm e2e:foto` gera uma foto sintética de 4032×3024 **com ruído** (o pior caso para o JPEG, 7,5 MB),
coloca no seletor de arquivo como o aluno faria e confere o que a tela mostra: 1800×1350, proporção
mantida, 881 KB (−88,6% em relação ao original), 194 ms de processamento e pré-visualização
renderizada. Se o app parar de comprimir, o teste acusa antes de o primeiro aluno tentar enviar no 4G.

#### Quando o navegador não abre o arquivo

O caminho feliz é JPEG. O que ninguém testava era o arquivo que o navegador **não consegue decodificar**
— e ele tem uma causa dominante: **HEIC**, o formato padrão do iPhone, que Chrome, Firefox e Android não
abrem. Os dois casos caíam na mesma frase (“Não foi possível abrir a imagem.”), que não diz se o
problema é a foto, o celular, a internet ou o app.

Agora a falha tem código (`src/lib/imagem.ts`) e instrução:

| Arquivo | Mensagem |
|---|---|
| HEIC/HEIF (tipo ou extensão) | “Esta foto está em HEIC… Toque em ‘Tirar foto’ — a câmera do navegador entrega JPEG… Ajustes → Câmera → Formatos → ‘Mais compatível’” |
| Outro formato/corrompido | “Formatos aceitos: JPG, PNG ou WEBP. Se ela veio do iPhone, toque em ‘Tirar foto’” |
| Demora > 20 s para decodificar | “A imagem demorou demais para abrir. Tente de novo ou escolha uma foto menor” |
| Arquivo vazio | “O arquivo chegou vazio. Escolha a foto de novo” |

A tentativa de decodificação tem duas portas (`createImageBitmap` e a tag `<img>`, que aceita formatos
que a primeira recusa) dentro de um limite de tempo, e o `object URL` temporário é revogado nos dois
caminhos. `pnpm test:imagem` cobre a decisão (13 casos) e o `pnpm e2e:foto` cobre o caminho real: joga
um `.HEIC` no seletor, confere a mensagem, **que a foto anterior não é perdida** e que uma foto válida
volta a ser aceita depois do erro.

### Guia do aluno

`docs/guia-aluno.md` é a página que o professor manda para a turma antes da primeira entrega: como se
cadastrar (matrícula, e-mail da lista, senha), como fotografar a folha, por que conferir a transcrição,
o que cada selo significa, a data de referência, a devolutiva, o reenvio e o que fazer quando o cadastro é recusado.
As imagens vêm de `pnpm e2e:mobile` (saída em `docs/img/`), então o guia não envelhece sozinho: se a
tela mudar, o teste de layout gera a captura nova.

### Acessibilidade (leitor de tela e teclado)

`pnpm test:a11y` roda o [axe-core](https://github.com/dequelabs/axe-core) em 16 telas, na largura de
360 px, logado como aluno e como professor: rótulo de campo, nome acessível de botão de ícone,
`role` de aba, região com rolagem alcançável pelo teclado, link dentro de texto distinguível sem
depender de cor. Contraste fica de fora — `pnpm test:contraste` mede com o fundo real de cada texto,
que o axe não consegue descobrir atrás de gradiente.

Reprovam **grave** e **crítica**; moderada e leve são impressas como lista de trabalho. A auditoria
achou cinco defeitos reais, todos corrigidos:

| Onde | Defeito | Correção |
|---|---|---|
| `/prof/avaliacoes/nova` | os quatro campos de valor da rubrica não tinham nome acessível | `aria-label` com o nome do critério |
| `/prof/avaliacoes/nova` | o `select` de turma não tinha nome acessível | `aria-label="Turma"` |
| revisão | a nota por critério não tinha nome acessível | `aria-label` com nome e máximo |
| revisão | a transcrição com rolagem não era alcançável pelo teclado | `tabIndex={0}` + `role="region"` |
| `/privacidade` | link só se distinguia pela cor | sublinhado |

### Conferência em tela pequena

A turma abre o link no celular, muitas vezes num aparelho de 360 px de largura e com o polegar. O
`pnpm e2e:mobile` monta o app em **modo demonstração** (sem Supabase, sem rede), abre dezesseis telas em
360×740 e reprova quando:

- alguma tela rola para o lado (`scrollWidth > innerWidth`) — o sintoma clássico de tabela ou
  `flex` sem `min-w-0`;
- algum botão fica abaixo de 40 px de altura (a utilidade `alvo-toque` garante o mínimo sem mudar o
  desenho);
- aparece erro de JavaScript no console.

São 16 telas e 128 alvos de toque medidos, com capturas em `e2e/resultados/mobile-*.png`. O modo
demonstração também deixou de chamar a API do SIGA (não há servidor ali), o que eliminava um erro de
rede no console sem função nenhuma.

### O peso do SIGA manda na escala

A nota que chega ao SIGA não é a nota de 0 a 10 do app: é a nota na escala da avaliação **no SIGA**,
definida pelo peso dela lá. Com `SIGA_ESCALA=pontos`, o envio é
`round(bruta / valor_total × peso × 100) / 100`.

Se o peso marcado aqui for outro, a nota chega multiplicada ou dividida — e os dois números parecem
plausíveis. O formulário de criação já preenche o peso quando a avaliação é escolhida na busca do
SIGA; digitando a descrição à mão dá para errar. Por isso a página da avaliação consulta o peso
oficial e, quando diverge, mostra o aviso *“O peso aqui não é o peso do SIGA”* com a conta explícita
(“a nota máxima 20/20 seria enviada como 20; com o peso do SIGA, iria como 10”) e um botão que alinha
o peso em um clique. `pnpm test:peso` cobre a regra (19 verificações) e o passo 25 do `pnpm test:e2e`
exercita o aviso de ponta a ponta.

### Trilha de auditoria

Toda decisão que muda o que o aluno vê ou o que vai ao SIGA fica registrada em `auditoria`
(`ator`, `acao`, `entidade`, `entidade_id`, `detalhe` com o valor anterior e o novo):

| Ação | Quem grava |
|---|---|
| `corrigir_ia`, `correcao_manual` | rota da API, com o id do professor |
| `revisar_correcao` (aprovar, ajustar, devolver) | gatilho `trg_auditar_revisao` |
| `mudar_prazo`, `mudar_status_avaliacao` | gatilho `trg_auditar_avaliacao` |

Os lançamentos no SIGA têm trilha própria em `lancamentos_siga` (payload enviado, resposta, HTTP e
erro). O gatilho existe porque três chamadas da API mandavam a coluna `ator_id` — que não existe — e o
erro era engolido por um `catch` vazio: a tabela ficou **vazia** em todas as rodadas de teste até isso
ser descoberto. Agora a falha de auditoria aparece no log mesmo sem derrubar a requisição.

`pnpm test:auditoria` cobre os gatilhos numa transação revertida; o passo final do `pnpm test:e2e` confere
que a rodada gerou `corrigir_ia`, `revisar_correcao` e `mudar_prazo`, e a limpeza apaga esses
registros antes de derrubar as contas (senão a cascata os deixaria órfãos).

### Devolver e reenviar

O professor pode devolver a redação ("reenvie com a segunda folha"): a submissão volta como
**devolvida**, o aluno reabre, corrige o texto e reenvia. Quando o reenvio acontece, a correção
anterior volta para **pendente** (gatilho `trg_reenvio_redacao`, migration 0009) — sem isso a redação
reenviada não entrava na fila de revisão e caía em "Lançar no SIGA" com uma decisão que ninguém
aprovou (o servidor recusava com `409 NAO_APROVADA`, mas o botão aparecia). A fila de lançamento agora
só considera decisões `aprovada` e `ajustada`.

`pnpm test:reenvio` exercita o gatilho dentro de uma transação que termina em `ROLLBACK` (nada fica no
banco): devolução → reenvio devolve a decisão para pendente, reenvio sem devolução não mexe em nada e
aprovação já dada não é desfeita.

Mas o gatilho sozinho não bastava: a política de UPDATE do aluno exigia que a linha **nova** ficasse em
`rascunho` ou `enviada`. Quem reescreve está em `devolvida`, então salvar a nova foto, a nova
transcrição ou o próprio envio era recusado com `new row violates row-level security policy for table
"submissoes"` — o botão "Devolver" era um beco sem saída, e nenhum teste pegava porque o teste do
gatilho rodava como `postgres`, sem RLS. A migration 0011 aceita `devolvida` na linha nova (sem
permitir sair de `enviada`). O passo 26 do `pnpm test:e2e` percorre o ciclo inteiro pelas telas, e o
`pnpm test:seguranca` confirma que a aluna A grava e reenvia a própria redação devolvida enquanto a
aluna B não altera a de A.

### Data de referência e recebimento

**A data não abre nem fecha o envio.** Ela é uma referência temporal: marca como **fora do prazo**
quem entregar depois dela. Quem decide se a avaliação aceita entrega é o status escolhido pelo
professor, na própria página, pelo quadrado **Recebendo trabalhos**:

| Status | O que o aluno vê | Entrega |
|---|---|---|
| `rascunho` | nada ainda | não aparece |
| `publicada` | tema, instruções e botão de envio | **recebendo**, mesmo com a data no passado |
| `encerrada` | avaliação e devolutiva | não envia; o professor precisa reabrir |

O banco confirma a mesma regra: a política de INSERT já exigia `publicada`, e a migration
`0019_recebimento_aberto.sql` fecha também o caminho de UPDATE — nem o rascunho que ficou pela metade
vira `enviada` depois de encerrar. A data continua no banco (`prazo_em`) porque é ela que alimenta a
marca de atraso e o espelho com a **Data no SIGA**; ela não participa da decisão de aceitar ou não a
entrega.

O professor muda a data na própria avaliação, em **Data de referência** — a mudança não altera redação
enviada nem nota lançada (`mudarPrazoAvaliacao` no contrato `Dados`). Se encurtar a data de quem já
entregou, a tela avisa quantas entregas passariam a ser marcadas como fora do prazo e só grava depois
do **Confirmar nova data**. `pnpm test:formato` cobre as fronteiras da marca (minuto exato, datas
ausentes e fusos diferentes); o passo 24 do `pnpm test:e2e` muda a data, confere a marca e remove a
referência.

Duas coisas dão errado com data digitada à mão, e as duas agora são tratadas antes de gravar:

| Situação | Antes | Agora |
|---|---|---|
| Data no passado ao criar | o trigger `trg_avaliacao_prazo` recusava o INSERT se a abertura fosse posterior à data | é aceito para lançamento retroativo: o app recua `abre_em` para um dia antes da data e o mesmo trigger continua garantindo a coerência |
| Encurtar a data de quem já entregou | gravava calado; o aluno que entregou antes passava a aparecer como atrasado | a tela diz quantas entregas mudam de estado e só grava depois do **Confirmar nova data** |

A conta do aviso, da abertura retroativa e da regra de recebimento fica em `src/lib/prazos.ts`
(funções puras, sem relógio dentro). O `pnpm test:prazos` cobre 30 casos: data vazia, inválida, no
passado (aceita, com abertura um dia antes), encurtar, estender, remover, recebimento por status e o
caso de quem já estava atrasado não contar duas vezes. O `pnpm test:recebimento` prova, numa transação
revertida, que avaliação encerrada recusa até rascunho existente, que data no passado não bloqueia
avaliação publicada e que reabrir libera de novo. O passo 3 do `pnpm test:e2e` confere o espelho entre
data de referência e data do SIGA; o passo 15b confere que uma data no passado mantém o botão de envio
na tela do aluno; o passo 24 confirma o aviso de encurtamento.

### A lista de alunos

`pnpm test:csv` roda 16 verificações sobre o leitor da lista (`src/lib/csv.ts`) — o texto que o
professor cola ou importa do SIGA. Aceita `;`, `,` ou tabulação, com ou sem cabeçalho, colunas em
qualquer ordem e campos entre aspas (`"Souza, Ana Clara"`); recusa matrícula fora do padrão, e-mail
inválido, linha repetida e linha sem nome, dizendo o número da linha. A matrícula precisa ter ao
menos 6 dígitos (`202506007GV` ou `202506007`), o que barra ano e RA digitados por engano.

### Comparar modelos

`pnpm comparar:modelos` manda a **mesma** redação (três níveis: fraca, média, boa) para dois modelos,
com a rubrica e o prompt do app, e mostra nota, tempo e se a ordem se manteve. É o teste que responde
"o modelo que vou usar no Coolify separa uma redação boa de uma fraca?".

```bash
LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_API_KEY=ollama pnpm comparar:modelos
```

### Links de e-mail (confirmação e recuperação de senha)

O Supabase monta o link com o **Site URL** do projeto. Se ele continuar em `http://localhost:3000`,
o aluno recebe um link que não abre. O ajuste é no painel (Authentication → URL Configuration):

| Campo | Valor |
|---|---|
| Site URL | `https://estatistica-biocientistas-avaliacao.vercel.app` |
| Redirect URLs | `https://estatistica-biocientistas-avaliacao.vercel.app/**`, `http://localhost:3210/**` |

O passo 22 do `pnpm test:e2e` percorre o caminho real (gera o link pela API de administração, abre no
navegador, define a senha e entra com ela). Já está aplicado no projeto `ozjpshdqpqrpdzisfkzq`.

### Conferência do lançamento

`GET /api/siga/notas?turma=…&periodo=…` lê o quadro da turma no SIGA (só leitura, exige sessão de
professor) e devolve alunos, notas por avaliação e situação. A página da avaliação usa isso para
comparar o que o app enviou com o que está gravado — enviado ≠ gravado é o erro que deixa o aluno
sem nota sem ninguém perceber. O passo 21 do `pnpm test:e2e` cobre esse ciclo e também confere que a rota
recusa chamada sem sessão.

### Ajuda ao aluno

`/ajuda` é pública (não exige login) e explica em uma tela: criar a conta, fotografar a folha, conferir
a transcrição, enviar, prazo e devolutiva — e o que fazer nos problemas comuns (matrícula fora da
lista, e-mail diferente, foto que não sobe). Está linkada no login, na lista de avaliações do aluno e
no rodapé da devolutiva. O passo 23 do `pnpm test:e2e` confere que ela abre sem sessão.

### Isolamento entre alunos

`pnpm test:seguranca` cria duas contas descartáveis no Supabase de produção, envia uma redação com
a primeira e tenta, com a segunda, ler o que não é dela: submissão, devolutiva, perfil, foto e até
apagar a turma e a avaliação. Termina apagando tudo. São 14 verificações; nenhuma nota vai ao SIGA.

### Antes de publicar

1. `pnpm lint` (tipos) e `pnpm build`.
2. `pnpm test:e2e` com o professor configurado — o teste local usa o Supabase de produção e o
   SIGA **simulado**, então ele pega desde erro de tela até coluna que falta no banco (foi assim
   que a coluna `escala` de `lancamentos_siga` apareceu).
3. `pnpm db:aplicar` se houver migration nova.
4. `pnpm test:producao` depois do deploy — cria e apaga uma turma descartável, sem lançar nota.

### Verificação de produção

`pnpm test:producao` roda o fluxo real contra a Vercel: cria uma turma e um aluno
descartáveis, publica uma avaliação, o aluno envia (foto + texto), o professor corrige à mão,
aprova, o aluno vê a devolutiva, a confirmação do SIGA é conferida e **cancelada** — e a turma é
removida pela própria tela, com a confirmação por código. Nada é lançado no SIGA e a turma real
não é tocada.

```bash
SENHA_PROFESSOR=... pnpm test:producao
```

### Pré-voo do corretor (Llama do Coolify)

Antes de um aluno enviar redação de verdade, `pnpm test:llm` conversa com o endpoint do Coolify sem
tocar no banco: confere `/models`, a chave, o modelo disponível, o tempo de uma correção e se o JSON
volta completo (critérios com valor, pontos fortes e pontos a desenvolver).

```bash
LLM_BASE_URL=https://seu-servico.exemplo.com/v1 LLM_MODEL=qwen2.5-7b-instruct \
  LLM_API_KEY=... pnpm test:llm
```

Ele avisa quando a correção passa de 55 s (limite da Vercel no plano atual) e manda usar
`pnpm corrigir:lote`.

### O que o corretor faz quando o modelo falha

`pnpm test:llm:mock` não precisa de credencial: sobe um servidor HTTP local no lugar do Coolify e
responde o que cada caso precisa. É o único jeito de testar o caminho do erro — com o modelo de
verdade, 401 e resposta cortada não acontecem na hora que você quer.

| O modelo devolve | Código | Retenta? | O que o professor lê |
|---|---|---|---|
| JSON certo (ou entre ` ```json `) | — | — | nota + devolutiva |
| Texto sem JSON | `RESPOSTA_INVALIDA` | sim, 1× | “devolveu um JSON que não consegui interpretar… use a correção manual” |
| JSON sem todos os critérios | `RESPOSTA_INCOMPLETA` | sim, 1× | correção recusada, sem nota zero silenciosa |
| `finish_reason: length` | `RESPOSTA_TRUNCADA` | não | “aumente LLM_MAX_TOKENS” |
| HTTP 500 / 401 | `LLM_FALHOU` | não | “o modelo respondeu 500/401. Verifique LLM_BASE_URL/LLM_MODEL” |
| Demora > `LLM_TIMEOUT_MS` | `LLM_DEMOROU` | não | “passou de 55 s… corrija à mão ou use `pnpm corrigir:lote`” |
| Serviço fora do ar | `LLM_INALCANCAVEL` | não | “confira LLM_BASE_URL e se o serviço no Coolify está no ar” |
| `LLM_TIMEOUT_MS` < 6 s | `LLM_DEMOROU` | não chama | “o prazo configurado é curto demais… use o padrão (55000)” |

A contagem de tentativas é verificada: retentar o que não adianta (resposta truncada, rede) gasta
tempo do professor e cota do modelo; não retentar o que adianta (JSON quebrado de modelo pequeno)
manda corrigir à mão por causa de uma vírgula.

O teste também confere o **pedido** que sai: `model`, `temperature: 0.1`, `max_tokens`, duas
mensagens (sistema + usuário), tema, texto e rubrica dentro do prompt, `Authorization: Bearer` só
quando há chave, `LLM_MAX_PALAVRAS` truncando o texto e `LLM_JSON_MODE=1` pedindo `response_format`.

Foi ele que achou um caso real: com `LLM_TIMEOUT_MS` abaixo de 6 s, o laço de tentativas saía com
`throw null` e o professor recebia **“Erro interno ao processar a solicitação”** — sem nada para
ajustar. Agora sai `LLM_DEMOROU` dizendo qual variável mudar, antes de gastar chamada.

### Quando um serviço externo não responde

Todo pedido que sai do app (banco, login, Storage, SIGA, OCR, modelo) tem prazo. Sem isso, o serviço
que engasga não gera erro: gera espera até a Vercel matar a função — e o navegador recebe um 504
**sem corpo**, que a tela mostra como "erro de rede". O professor tenta de novo sem saber o que caiu.

`pnpm test:rede` sobe um servidor local fazendo o papel de cada serviço e confere código, mensagem e
tempo (21 verificações):

| Serviço | Prazo padrão | Variável | Não respondeu | Fora do ar |
|---|---|---|---|---|
| banco, login, Storage (Supabase) | 8 s | `HTTP_TIMEOUT_MS` | `SUPABASE_DEMOROU` / `AUTH_DEMOROU` / `STORAGE_DEMOROU` | `SUPABASE_INALCANCAVEL`… |
| API do SIGA | 15 s | `SIGA_TIMEOUT_MS` | `SIGA_DEMOROU` (“a nota não foi lançada”) | `SIGA_INALCANCAVEL` |
| leitura da foto (OCR) | 25 s | `OCR_TIMEOUT_MS` | `OCR_DEMOROU` (“digite o texto — ele vale como entrega”) | `OCR_INALCANCAVEL` |
| modelo (Llama) | 55 s | `LLM_TIMEOUT_MS` | `LLM_DEMOROU` | `LLM_INALCANCAVEL` |
| download da foto | 15 s | `STORAGE_TIMEOUT_MS` | `STORAGE_DEMOROU` | `STORAGE_INALCANCAVEL` |

O prazo cobre **cabeçalho e corpo**: o corpo é lido dentro do prazo, porque um servidor que manda
`200` e trava no meio da resposta escapa de um timeout aplicado só ao `fetch`. Foi assim que apareceu
o defeito mais enganoso desta rodada — OCR lento devolvia `SEM_TEXTO`, ou seja, o aluno lia “não
encontrei texto manuscrito legível na foto” quando o problema era fila no serviço, não a letra dele.

### Uma avaliação, várias turmas

O formulário de **Nova avaliação** aceita mais de uma turma. O seletor não é um `<select multiple>`:
é um botão que abre caixas de seleção, cada uma identificada pelo `codigo_siga` (a chave que o SIGA
usa) e pelo nome da turma. No celular, isso evita a lista cinza em que o toque erra o alvo.

Ao publicar, o app percorre a seleção e cria **uma linha em `avaliacoes` por turma**, com o mesmo
título, tema, instruções, rubrica e data de referência. Cada aluno continua vendo só a avaliação da própria turma.
Se a descrição do SIGA não existir em alguma delas, a criação no SIGA também roda em laço — uma
chamada por turma que ainda não tem a TVC. Uma falha não desfaz as avaliações já criadas e não
interrompe as seguintes: o cartão **Última publicação** lista o resultado de cada turma, com link para
abrir a avaliação e o motivo do erro quando houver.

O formulário **não é limpo nem navega sozinho** depois de publicar. Isso é intencional: o professor
reaproveita o mesmo conteúdo para outras turmas trocando apenas a seleção. Para impedir duplicata por
clique duplo, o app consulta os títulos existentes e recusa o mesmo título na mesma turma; a chave
local é `(turma_id, título normalizado)`, verificada na interface (não há índice único no banco, para
não bloquear títulos repetidos legítimos em contextos diferentes).

### Criar a avaliação no SIGA — uma vez só

Criar avaliação é a **única** escrita do app que muda estrutura no SIGA, e o SIGA não tem rota
para apagar. Um clique duplo deixaria “Trabalho sobre Probabilidades” duplicado numa disciplina
real, para sempre. A rota `POST /api/siga/avaliacao` agora decide assim:

| O que já aconteceu | O que faz |
|---|---|
| nada | cria no SIGA e grava o pedido na auditoria |
| criou com **os mesmos dados** | não chama o SIGA; responde `repetido: true` (“já estava criada”). O `num_tvc` usado fica na auditoria e não é recalculado |
| criou com **dados diferentes** (peso, data, descrição) | `409 SIGA_JA_CRIADA` — a tela mostra o que existe lá e pede confirmação; só `forcar: true` cria de novo |
| a **descrição já existe** na turma, mas não há sucesso local | `409 SIGA_JA_EXISTE` — não duplica; use **Buscar** para selecionar a avaliação existente |
| o SIGA responde **sem a lista de avaliações** | `502 SIGA_RESPOSTA_INVALIDA` — não cria com número inventado |
| já existe uma requisição **em andamento** (até 2 min) | `409 SIGA_EM_ANDAMENTO` — o duplo clique não passa |
| a última tentativa **falhou** | deixa tentar de novo (falha não bloqueia) |

O “em andamento” é gravado **antes** de consultar a lista e chamar o SIGA, e o registro é
atualizado no fim com o resultado. É isso que fecha a janela entre dois cliques quase simultâneos.

Se o token da sessão estiver vencido, a camada `src/lib/servidor.ts` tenta renová-lo uma vez e
repete a chamada; sem isso, uma aba deixada aberta por horas criava a avaliação local e deixava a
TVC sem criar no SIGA. Quando a renovação não resolve, a tela pede para entrar de novo, mas **não**
desfaz a avaliação local: abra-a no painel e use **Criar no SIGA**.

`pnpm test:siga:criar` (49 verificações) sobe um SIGA falso e um Supabase falso e conta quantas
vezes o SIGA foi chamado em cada cenário — inclusive o pedido idêntico que **não** pode chamar de
novo, o peso alterado que **precisa** de confirmação e a criação abandonada há 5 minutos, que não
pode travar a avaliação para sempre.

A auditoria desse fluxo fica em `auditoria`, com `acao = 'siga.criar-avaliacao'`, o professor em
`ator`, o pedido enviado e a resposta do SIGA (ou o erro e o status HTTP, quando falha).

### O envio da foto no celular

O upload sai do navegador direto para o Storage do Supabase, e o SDK **não aceita `AbortSignal`**.
Sem prazo, a tela ficava em “Enviando a foto…” até o navegador desistir sozinho — e o erro que chegava
era de infraestrutura, como `Failed to fetch`, sem instrução para quem está no 4G do corredor.

`pnpm test:envio` (41 verificações) cobre as duas metades:

| Situação | O que o aluno lê |
|---|---|
| passou de 60 s | “O envio da foto passou de 60 s… a foto continua no aparelho: confira o sinal e toque em ‘Enviar’ de novo.” |
| sem rede | “Não consegui falar com o servidor. Confira a conexão…” |
| foto grande demais | “A foto ficou grande demais para o envio. Tire outra um pouco mais longe da folha — ou digite o texto.” |
| sessão vencida | “Sua sessão expirou. Entre de novo — a foto continua no aparelho…” |

O prazo é dado por fora (`comPrazo` em `src/lib/envio.ts`): o upload pode até terminar em segundo
plano, mas como o caminho é fixo e o envio usa `upsert`, tocar em “Enviar” de novo é seguro.

A chamada `/api/*` também ganhou prazo, com orçamento por rota — 30 s no padrão, 40 s para OCR, 65 s
para a correção (o servidor já desiste em 55 s) e 25 s para o SIGA. Quando o navegador perde a
conexão no meio, o botão para de girar e explica.

**Detalhe de teste que vale registrar:** `AbortSignal.timeout` usa timer *unref* no Node — sozinho,
ele não segura o processo acordado, e o script de teste “travava” sem nunca estourar o prazo. Um
`setInterval` vazio mantém o processo vivo durante o caso. Em produção não muda nada: quem espera a
resposta é o servidor HTTP, que segura o processo.

### OCR da foto

A leitura da letra é uma etapa à parte (o Llama é de texto). O caminho recomendado é o **Google
Cloud Vision** (`VISION_PROVIDER=google-cloud`), que aceita chave de API simples ou o JSON da conta
de serviço. Passo a passo: [deploy/ocr-google-vision.md](deploy/ocr-google-vision.md).
Sem credencial, o app funciona: o aluno digita o texto e a foto fica como comprovante.

```bash
pnpm test:ocr     # confere o envio ao Google e o tratamento de erro, sem chamada real
```

### Conferir o prompt com um modelo de verdade

O teste de ponta a ponta roda com um LLM simulado. Para trocar pelo Ollama da máquina (ou por
qualquer servidor compatível com OpenAI) e ver o JSON real, as notas dentro do máximo e a devolutiva:

```bash
LLM_REAL=1 LLM_MODEL=llama3:latest SENHA_PROFESSOR='...' node e2e/smoke.mjs --manter
```

`--manter` deixa os dados no banco para inspecionar `correcoes`; sem a flag, o teste limpa tudo.
O prompt está em `api/_lib/rubrica.ts` (versão `rubrica-v4`, gravada em `correcoes.prompt_versao`): itens de devolutiva precisam citar um
trecho concreto da redação, frases genéricas são proibidas e "pontos a desenvolver" começam com
verbo de ação. Cada avaliação pode acrescentar **instruções de correção pela LLM** (campo
`instrucoes_correcao`, migration 0018); elas entram no prompt do **sistema**, depois das regras
fixas, e valem para as correções seguintes daquela avaliação.

### Correção sem IA

`POST /api/corrigir-manual` cria uma correção com todos os critérios em 0 e justificativa
"atribuída manualmente". Serve quando o Llama não está configurado ou quando o professor quer
dar a nota sem sugestão automática: a tela de revisão abre editável e o fluxo segue igual
(aprovar → lançar no SIGA). O modelo fica registrado como `manual` e a ação vai para `auditoria`.

---

### Painel "Para começar"

Ao entrar, o professor vê uma lista de conferência com seis itens (turma, lista de alunos, primeira
avaliação, SIGA, corretor de IA e leitura de fotos). Cada item pendente traz um botão que leva
direto ao lugar certo, e o painel **desaparece sozinho** quando os seis estão prontos. Os três
últimos vêm de `GET /api/saude`, então refletem o servidor de verdade — não uma suposição da tela.

## 7. Teste de ponta a ponta

```bash
SENHA_PROFESSOR='sua-senha' pnpm test:e2e
SENHA_PROFESSOR='sua-senha' pnpm test:e2e --manter   # não apaga os dados ao final
```

O teste sobe um **mock** de Llama e de SIGA (`e2e/mock-servicos.mjs`), roda o fluxo real no
Chromium em viewport de celular e valida o banco ao final:

1. professor entra → cria turma → importa lista → cria avaliação (com o seletor do SIGA);
2. aluno se cadastra → fotografa → confere a transcrição → envia;
3. professor corrige pela IA → revisa → aprova → lança no SIGA;
4. aluno vê a devolutiva;
5. o teste confere `lancamentos_siga` (1 registro, nota entre 0 e 10);
6. **segunda avaliação, sem IA**: o aluno envia outra redação e o professor usa
   **Corrigir manualmente** → digita notas, pontos fortes e a desenvolver → aprova → lança;
7. o teste confere a segunda nota, a decisão `ajustada` e o texto gravado em `pontos_fortes`;
8. o professor cria uma terceira avaliação e **encerra as entregas**; o teste tenta inserir uma
   submissão pela API REST com o token do aluno e exige **403** da RLS;
9. o aluno vê "Entregas encerradas" sem botão de envio e o professor **reabre**;
10. o cadastro só libera depois do aceite do aviso de privacidade (`/privacidade`), e o aceite é
    conferido no banco;
11. uma avaliação criada fora do SIGA mostra o aviso e é criada pela própria tela (`/api/siga/avaliacao`);
12. o professor desmarca a exigência de e-mail e importa um aluno só com matrícula e nome;
    esse aluno se cadastra informando o próprio e-mail, e o banco confere que o e-mail e o
    `user_id` ficaram gravados na lista.

Capturas em `e2e/resultados/`. Nada é enviado ao SIGA de verdade: `SIGA_API_BASE` aponta para o mock.

### Correção com modelo real (não só mock)

Em 16/11/2026 rodei a correção de verdade, com um `llama3:8b` servido pelo Ollama local, sobre uma
redação de ~300 palavras e rubrica de 4 critérios (20 pontos):

| Cenário | Medida | Leitura |
|---|---|---|
| GPU (RTX 3050 8 GB) | 7,8 s por redação | confortável para uso interativo |
| CPU (12 vCPU, `num_gpu=0`) | 9,2 tokens/s ≈ 55 s por devolutiva | viável em lote: 40 alunos ≈ 40 min |
| Nota calculada | 19/20 → **9,5** | soma dos critérios confere, nenhum acima do máximo |

O JSON veio com **uma chave de fechamento faltando** — o leitor tolerante reparou e a correção foi
aceita. Com `LLM_MAX_TOKENS=90` (forçando corte), a resposta foi recusada com `RESPOSTA_TRUNCADA`
em vez de dar zero aos critérios ausentes. Esses dois comportamentos estão cobertos por
`pnpm test:parser`.

---

## 8. Implantação na Vercel

Produção: <https://estatistica-biocientistas-avaliacao.vercel.app>

```bash
vercel link
vercel env add VITE_SUPABASE_URL production       # valor de SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY production  # valor de SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel --prod
```

`vercel.json` já define região `gru1`, função com 300 s / 1024 MB e rewrite de SPA. As variáveis
`VITE_*` são embutidas no build; as demais ficam só no servidor.

### Publicar sem ficar no escuro

Cada build carrega o commit do Git — `<meta name="app-versao" content="abc1234">` no HTML e
`Versão abc1234 · compilada hoje às 18:40` no rodapé da ajuda e no painel do professor. Com isso:

```bash
git push        # o projeto é ligado ao GitHub: push em master publica sozinho
pnpm versao     # commit do repositório × commit no ar (sai 1 só quando o app está atrás)
pnpm publicar   # espera o deploy automático; publica pela CLI só com --manual
```

Por que a cerimônia: em 16/11/2026 a conta bateu o teto de **100 deployments/dia** do plano Hobby
(janela móvel de 24 h) e a CLI passou a responder `api-deployments-free-per-day`. A conclusão errada
foi "a produção parou" — o push das 21:25 já tinha publicado o commit. Faltava um jeito de olhar.

O `vercel.json` tem `ignoreCommand`: commit só de `.md`, `docs/`, `scripts/` ou `e2e/` não gera build,
então documentação não consome cota. E `pnpm versao` distingue os dois casos — mesmo commit, ou
commits diferentes em que só mudou documentação ("o app no ar é o mesmo"). Publicar pela CLI
(`--manual`) cria um deployment duplicado do mesmo código; é exceção, não rotina.

| Situação | `pnpm versao` | O que fazer |
|---|---|---|
| produção = repositório | `✓ produção roda o mesmo código` | nada |
| produção atrás | `! produção está atrás` | `pnpm publicar` |
| sem a marca no HTML | `(site no ar, mas sem a marca app-versao…)` | build anterior ao marcador: publique uma vez |
| árvore suja | `3 arquivo(s) não commitado(s)` | commitar antes: `vercel --prod` envia o disco, não o commit |
| só documentação mudou | `✓ o app no ar é o mesmo do repositório` | nada: o build é pulado de propósito |
| site fora do ar | `(não consegui ler: …)` | conferir a Vercel antes de publicar |

Detalhe que custa caro: as funções usam **ESM** (`"type": "module"` no `package.json`), então todo
import relativo em `api/` termina em `.js` (`./_lib/http.js`). Sem isso o runtime da Vercel sobe a
função e ela morre com `FUNCTION_INVOCATION_FAILED` — o build passa, o erro só aparece na chamada.

---

## 9. Privacidade (LGPD)

- A **foto** fica em bucket privado; o acesso é por URL assinada temporária.
- A **transcrição** é enviada a um provedor de OCR em nuvem (Google/OpenAI/OpenRouter). Isso
  significa que o texto sai do servidor da UFJF. É preciso constar no termo de consentimento da
  turma, com a finalidade (correção) e a base legal (execução do contrato educacional).
- A correção com Llama no Coolify mantém o texto na infraestrutura da universidade; só o OCR é
  externo.
- Estudantes podem pedir exclusão dos dados; `submissoes` e `correcoes` têm `ON DELETE CASCADE`
  a partir de `avaliacoes`/`profiles`.

---

## 10. Estrutura

```
api/               funções serverless (transcrever, corrigir, saude, siga/*)
  _lib/            http, transcrever, rubrica, siga, corrigirServico
src/
  lib/             tipos, dados (contrato), dadosSupabase, dadosDemo, sessão, router
  components/      ui (Campo, Botao, Cartao…), Camera
  pages/           auth, aluno, alunoEnvio, devolutiva, perfil, professor*
supabase/          migrações SQL
scripts/           dev, migrações, criar professor, corrigir em lote, ícones
e2e/               smoke test + mock de Llama/SIGA
docs/              guia do professor, guia do aluno
```
