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

Migração idempotente em `supabase/migrations/0001_init.sql`:

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
`Σ rubrica = valor_total`.

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
`nota_final = round(nota_bruta / valor_total × 10, 1)`. Se o JSON vier inválido, a correção falha
com erro claro — não há nota "inventada".

Variáveis: `LLM_BASE_URL` (ex.: `https://llama.sua-instancia.coolify.app/v1`), `LLM_MODEL`,
`LLM_API_KEY`, `LLM_JSON_MODE` (`1` se o servidor suportar `response_format`), `LLM_MAX_PALAVRAS`.

---

## 6. SIGA

| Ação | Rota do app | Chamada |
|---|---|---|
| lançar notas | `POST /api/siga/lancar` | `POST /api/lancar-notas` |
| criar avaliação (TVC) | `POST /api/siga/avaliacao` | `POST /api/criar-avaliacao` |
| conferir notas | `GET/POST /api/siga/notas` | `GET/POST /api/notas` |

A descrição em `avaliacoes.descricao_siga` precisa ser **idêntica** à do SIGA (`TVC 1`). O número
do TVC é extraído da descrição; peso e data vêm da avaliação. Toda resposta é gravada em
`lancamentos_siga` (inclusive falhas), então dá para reprocessar sem perder histórico.

> A chave atual em `~/.dsh/secrets/avaliacoes.env` é curta demais para ser uma chave real
> (10 caracteres). Enquanto não for trocada, o SIGA deve responder `403`.

---

## 7. Teste de ponta a ponta

```bash
SENHA_PROFESSOR='sua-senha' pnpm test:e2e
SENHA_PROFESSOR='sua-senha' pnpm test:e2e --manter   # não apaga os dados ao final
```

O teste sobe um **mock** de Llama e de SIGA (`e2e/mock-servicos.mjs`), roda o fluxo real no
Chromium em viewport de celular e valida o banco ao final:

1. professor entra → cria turma → importa lista → cria avaliação;
2. aluno se cadastra → fotografa → confere a transcrição → envia;
3. professor corrige → revisa → aprova → lança no SIGA;
4. aluno vê a devolutiva;
5. o teste confere `lancamentos_siga` (1 registro, nota entre 0 e 10).

Capturas em `e2e/resultados/`. Nada é enviado ao SIGA de verdade: `SIGA_API_BASE` aponta para o mock.

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
