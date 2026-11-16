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

`pnpm test:contraste` abre 9 telas na demonstração, lê a cor calculada de cada elemento com texto, acha o
fundo efetivo subindo a árvore e aplica a fórmula de luminância da WCAG. Reprova texto pequeno abaixo de
4.5:1 e grande abaixo de 3:1. Foi ele que encontrou os dois problemas de hoje: as legendas em
`tinta-fraca` (#8b968f) davam **2.59:1** em todos os fundos, e os botões desativados saíam a **1.09:1**
(verde a 50% com texto branco). A paleta mudou (`tinta-suave` #4b5853 = 6.30 · `tinta-fraca` #616964 =
4.79 · `ambar` #a74d08 = 4.79) e o botão desativado virou cinza com texto escuro — continua dizendo
“Corrigir 0 pendente(s)”, agora legível.

`pnpm e2e:mobile` mede os alvos de toque das 15 telas principais em 360×740 e reprova qualquer controle
abaixo de 40px. Foi ele que achou as abas “Transcrição/Foto original” (32px) e o “Voltar para a lista”
(20px) na tela de revisão.

### Ligar a IA em um comando

A correção precisa de um LLM compatível com OpenAI (o Llama no Coolify, por exemplo) e a leitura da foto
precisa de um modelo que enxergue imagem. **Podem ser o mesmo serviço:** se o modelo for multimodal
(Qwen2.5-VL, MiniCPM-V, Llama 3.2 Vision), o mesmo endpoint e a mesma chave servem para as duas etapas —
não é obrigatório ter Google Cloud.

```bash
pnpm configurar:ia --ensaio \
  --base https://SEU-SERVICO.coolify.app/v1 --modelo Qwen2.5-7B-Instruct --chave sk-... \
  --visao-modelo Qwen2.5-VL-7B-Instruct --foto ~/redacao.jpg
```

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

### Guia do aluno

`docs/guia-aluno.md` é a página que o professor manda para a turma antes da primeira entrega: como se
cadastrar (matrícula, e-mail da lista, senha), como fotografar a folha, por que conferir a transcrição,
o que cada selo significa, o prazo, a devolutiva, o reenvio e o que fazer quando o cadastro é recusado.
As imagens vêm de `pnpm e2e:mobile` (saída em `docs/img/`), então o guia não envelhece sozinho: se a
tela mudar, o teste de layout gera a captura nova.

### Conferência em tela pequena

A turma abre o link no celular, muitas vezes num aparelho de 360 px de largura e com o polegar. O
`pnpm e2e:mobile` monta o app em **modo demonstração** (sem Supabase, sem rede), abre quinze telas em
360×740 e reprova quando:

- alguma tela rola para o lado (`scrollWidth > innerWidth`) — o sintoma clássico de tabela ou
  `flex` sem `min-w-0`;
- algum botão fica abaixo de 40 px de altura (a utilidade `alvo-toque` garante o mínimo sem mudar o
  desenho);
- aparece erro de JavaScript no console.

São 15 telas e 125 alvos de toque medidos, com capturas em `e2e/resultados/mobile-*.png`. O modo
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

### Prazo de entrega

O prazo é bloqueante: passada a data, o aluno não abre entrega nova (o botão fica em “Prazo
encerrado”). O professor muda a data na própria avaliação, em **Prazo de entrega** — a mudança reabre
o envio para quem faltou e não altera redação enviada nem nota lançada (`mudarPrazoAvaliacao` no
contrato `Dados`). Redação enviada depois da data aparece marcada como **fora do prazo** na lista e na
revisão; a marca é informativa. `pnpm test:formato` cobre as fronteiras dessa conta (minuto exato,
datas ausentes e fusos diferentes); o passo 24 do `pnpm test:e2e` muda o prazo, confere a marca e remove o
prazo.

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
