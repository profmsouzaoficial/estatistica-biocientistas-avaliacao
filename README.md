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
| `profiles` | dados do usuário autenticado + papel (`aluno`/`professor`) |
| `avaliacoes` | tema, instruções, valor total, rubrica (JSONB), descrição/peso/data no SIGA |
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

A descrição em `avaliacoes.descricao_siga` precisa ser **idêntica** à do SIGA (`TVC 1`). O número
do TVC é extraído da descrição; peso e data vêm da avaliação. Toda resposta é gravada em
`lancamentos_siga` (inclusive falhas), então dá para reprocessar sem perder histórico.

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

O passo 22 do `pnpm e2e` percorre o caminho real (gera o link pela API de administração, abre no
navegador, define a senha e entra com ela). Já está aplicado no projeto `ozjpshdqpqrpdzisfkzq`.

### Conferência do lançamento

`GET /api/siga/notas?turma=…&periodo=…` lê o quadro da turma no SIGA (só leitura, exige sessão de
professor) e devolve alunos, notas por avaliação e situação. A página da avaliação usa isso para
comparar o que o app enviou com o que está gravado — enviado ≠ gravado é o erro que deixa o aluno
sem nota sem ninguém perceber. O passo 21 do `pnpm e2e` cobre esse ciclo e também confere que a rota
recusa chamada sem sessão.

### Ajuda ao aluno

`/ajuda` é pública (não exige login) e explica em uma tela: criar a conta, fotografar a folha, conferir
a transcrição, enviar, prazo e devolutiva — e o que fazer nos problemas comuns (matrícula fora da
lista, e-mail diferente, foto que não sobe). Está linkada no login, na lista de avaliações do aluno e
no rodapé da devolutiva. O passo 23 do `pnpm e2e` confere que ela abre sem sessão.

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
O prompt está em `api/_lib/rubrica.ts` (versão `rubrica-v2`): itens de devolutiva precisam citar um
trecho concreto da redação, frases genéricas são proibidas e "pontos a desenvolver" começam com
verbo de ação.

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
