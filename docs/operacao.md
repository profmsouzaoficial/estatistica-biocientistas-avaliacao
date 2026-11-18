# Operação — um ciclo de avaliação completo

Para quem vai tocar o app sem ninguém por perto. Cada passo diz **onde** fica, **o que conferir** e quanto
tempo leva. Os rótulos entre aspas são os textos que aparecem na tela.

---

## Antes do semestre (uma vez, ~20 min)

| # | Onde | O que fazer | Como saber que deu certo |
|---|---|---|---|
| 1 | `/prof/alunos` | criar a turma com **nome, código no SIGA e período** (ex.: `CBV018GV-A`, `2026/3`) | a turma aparece no painel |
| 2 | `/prof/alunos` | colar/importar a lista da coordenação no formato `matricula;nome;email` — ou `matricula;nome` se o e-mail não for obrigatório | "Conferir e importar" mostra quantos entraram e quantos já existiam |
| 3 | terminal | `pnpm backup` | gera `backups/backup-AAAA-MM-DD-HH-MM.json` |
| 4 | terminal | `pnpm verificar` | "✓ tudo consistente" |
| 5 | terminal | `pnpm diagnostico` | mostra Supabase, SIGA e IA ligados ou não |
| 6 | opcional | `pnpm configurar:ia --ensaio …` e depois sem `--ensaio` | `/api/saude` passa a mostrar corretor e leitura ligados |

Sem o passo 6 o app funciona: o aluno digita o texto e você corrige à mão. Com ele, a IA sugere a nota e
você aprova.

### Quando as listas chegam em CSV do SIGA

As turmas e os alunos podem ser pré-cadastrados de uma vez, sem passar tela por tela:

```bash
pnpm importar:listas -- --ensaio   # mostra quantos alunos por turma, sem gravar
pnpm importar:listas               # grava turmas, listas e contas
```

A pasta padrão é `~/.dsh/dados/2026-3/`, com um arquivo por turma nomeado pelo código do SIGA
(`CBV018GV_A_2026_3.csv`). O script cria a conta de cada aluno com **login = e-mail e senha inicial =
e-mail** e liga `precisa_trocar_senha`; o app mostra o aviso até a troca. Rodar de novo não mexe em quem
já tem conta.

Também é possível importar **pela tela**: `/prof/alunos` → **Importar lista** → enviar o CSV (ou colar o
texto). A lista alimenta o cadastro: o aluno abre `/cadastrar`, escolhe a **turma pelo código do SIGA**,
digita a **matrícula** e o app confere em `alunos_esperados`; nome, e-mail institucional e curso vêm
preenchidos da lista. Quem já tem conta vê o aviso e o atalho para entrar.

---

### Publicar uma versão nova (quando o app muda)

O site é a Vercel; o código fica no GitHub. **Todo push em `master` publica sozinho** — o projeto está
ligado ao repositório. Não é preciso rodar `vercel --prod`; fazer isso cria um segundo deployment do
mesmo código e gasta cota à toa.

| Passo | Comando | O que confirma |
|---|---|---|
| 1 | `git push` | dispara o build automático da Vercel |
| 2 | `pnpm versao` | commit do repositório × `<meta name="app-versao">` do site |
| 3 | `pnpm publicar` | espera o deploy aparecer e só publica pela CLI se ele não vier |
| 4 | `pnpm test:producao` | roda o fluxo real no site publicado |

O rodapé da tela **Ajuda** e o fim do painel do professor mostram `Versão abc1234 · compilada hoje às
18:40` — a mesma marca que o `pnpm versao` lê. Se o professor mandar uma captura de tela, dá para saber
exatamente qual código gerou aquilo.

Quatro armadilhas que já custaram caro:

- **Cota de 100 deployments por dia (Hobby).** A janela é **móvel de 24 h**: cada deployment criado há
  24 h libera uma vaga. Estourada a cota, a CLI responde `api-deployments-free-per-day` e o GitHub
  recebe o status **"Deployment rate limited — retry in 24 hours."**; o site fica no código antigo sem
  aviso na tela. Em 16/11/2026 isso levou à conclusão errada de que "a produção parou", quando o push
  das 21:25 já havia publicado. Por isso o caminho normal é push + `pnpm versao`, não `vercel --prod`.
  O `pnpm versao` lê esse status no GitHub e diz o motivo em uma linha, em vez de deixar você
  esperando ou mexendo no que não precisa.
- **Commit só de documentação também gastaria cota.** O `vercel.json` agora tem `ignoreCommand`: se a
  mudança é só em `.md`, `docs/`, `scripts/` ou `e2e/`, a Vercel pula o build. O `pnpm versao` sabe
  disso e responde "o app no ar é o mesmo do repositório" em vez de acusar atraso.
- **Deploy não é publicação.** O build pode terminar "com sucesso" e a versão antiga continuar no ar
  por cache de borda. Por isso o script espera a marca de versão nova aparecer no HTML.
- **Publicar com arquivo não commitado.** O `vercel --prod` envia os arquivos do disco, não o commit:
  o site sairia com código que não está no GitHub carimbado com o hash do último commit. O
  `pnpm publicar --manual` recusa nesse caso e diz quantos arquivos faltam commitar.

O rodapé da tela **Ajuda** e o fim do painel do professor mostram `Versão abc1234 · compilada hoje às
18:40` — é a mesma marca que o `pnpm versao` lê. Se o professor mandar uma captura de tela, dá para
saber exatamente qual código gerou aquilo.

---

## A cada avaliação

### 1. Criar (5 min)

Em **Nova avaliação**:

| Campo | Cuidado |
|---|---|
| Turmas | marque uma ou mais; o seletor mostra curso, `codigo_siga` e período e cria uma avaliação em cada turma |
| Tema e instruções | é o que o aluno lê no celular; diga o número de linhas e se é à mão |
| Instruções de correção pela LLM | opcional; entra no prompt do sistema da correção automática, sem aparecer para o aluno |
| Valor total | padrão de 100 pontos; a rubrica precisa somar exatamente isso — o app recusa salvar se não fechar |
| Rubrica | 3 a 6 critérios; já vem com 4 critérios de 25 pontos, editáveis |
| Descrição no SIGA | começa igual ao título; use a lista que o app busca para as turmas marcadas e ajuste para o nome **idêntico** ao da avaliação no SIGA (ex.: `Trabalho sobre Probabilidades`). Se a TVC ainda não existir em alguma turma, marque **“Criar esta avaliação no SIGA agora”**: ao publicar, o app cria uma vez em cada turma que ainda não a tem e mostra o resultado por turma |
| Peso no SIGA | o peso que o SIGA usa para aquela avaliação; acompanha o valor total até você escolher uma TVC ou editar, e a nota é convertida proporcionalmente |
| Prazo / Data no SIGA | opcionais e espelhados: mudar um ajusta o outro. Datas passadas são aceitas para lançamento retroativo; a abertura recua para um dia antes do prazo |

Com mais de uma turma marcada, a publicação roda um laço: cria a avaliação local em cada turma e, quando
preciso, chama o SIGA uma vez por turma. O laço **não para no primeiro erro**; o cartão **Última
publicação** mostra o que deu certo e o motivo de cada falha. A criação no SIGA é **automática** quando a
descrição ainda não está na lista: o app usa a descrição, o peso e a data informados. O SIGA **não tem rota
para apagar** uma avaliação — por isso o formulário pede confirmação e a rota é idempotente (clique duplo
não cria duas). Se a chamada do SIGA falhar depois de salvar, a avaliação local fica salva e a tela dela
mostra **“Criar no SIGA”** para a segunda tentativa. Rascunho não cria nada no SIGA.

Ao publicar, **o formulário não é limpo nem troca de tela**. Os campos e as turmas continuam como estavam,
para repetir o mesmo conteúdo em outras turmas. O resultado fica logo abaixo do botão, com link para abrir
cada avaliação criada. Publicar de novo o mesmo título na mesma turma é bloqueado para evitar duplicata.

### 2. Publicar e acompanhar (2 min por dia)

Publicada, a avaliação aparece para o aluno. Na tela dela, abaixo dos contadores:

- **"X de Y alunos da turma entregaram"** — quantos já entregaram;
- **"Faltam N"** — toque para ver nome e matrícula de quem não entregou (e quem está **sem cadastro**).

Faltando alguém perto do prazo, **"Estender ou mudar o prazo"** reabre o envio sem mexer em redação já
enviada nem em nota lançada.

Encurtar o prazo é legítimo, mas tem efeito colateral: quem já entregou pode passar a ser marcado como
**fora do prazo**. A tela mede isso antes de gravar e pede confirmação — “2 entregas já feitas
passariam a ser marcadas como fora do prazo”. Se a intenção é só fechar o envio, use **Encerrar
entregas**, que não recategoriza ninguém.

### 3. Corrigir e revisar (o grosso do trabalho)

1. **"Corrigir N pendente(s)"** — se a IA estiver ligada, cada redação leva alguns segundos e cai em
   **"A revisar"**. Se não estiver, abra a redação e use a correção manual.
2. Abra a redação do aluno. Confira, nesta ordem:
   - a **transcrição** contra a aba **"Foto original"** (números e nomes são onde o OCR erra);
   - a **"Nota por critério"** — ajuste o que discordar; a nota final é a soma;
   - os **pontos fortes** e os **pontos a desenvolver** (o aluno lê isso).
3. **"Salvar alterações"** e **"Aprovar e liberar para o aluno"**. A partir daí a devolutiva fica visível.
4. Se o texto precisa ser refeito, use **"Devolver para o aluno reescrever"**: o aluno reenvia e a redação
   volta para "A revisar" — não vai para o SIGA até nova aprovação.

### 4. Lançar no SIGA (2 min)

Pré-requisitos: a avaliação existe no SIGA com a **mesma descrição** e o **peso** confere.

1. **"Lançar N no SIGA"** → a confirmação lista aluno por aluno o número exato que será gravado.
2. Leia a lista antes de confirmar. Só o que está **aprovado** entra; devolvida e pendente ficam fora.
3. Confirmado, cada lançamento guarda o que foi enviado e o que o SIGA respondeu (auditoria).
4. Repetir não duplica: se aquela correção já foi lançada **com a mesma nota**, o servidor responde
   `repetido` sem chamar o SIGA e a tela diz "já estava lançada — nada foi reenviado". Se a nota mudou
   depois do lançamento, o envio acontece de novo (é correção, não duplicata).

| Resposta do SIGA | Significa | O que fazer |
|---|---|---|
| 403 | chave inválida/expirada | pedir a chave atualizada e atualizar `SIGA_API_KEY` |
| 404 | turma, período ou descrição não existem | conferir os três; a descrição precisa ser idêntica |
| 409 | o SIGA já tem nota para aquele aluno | conferir no SIGA; o app não sobrescreve sozinho |
| 422 | o SIGA recusou o dado (avaliação fechada, valor fora da faixa) | ler a mensagem em **Histórico de lançamentos** e corrigir o dado |
| 5xx | SIGA fora do ar | tentar mais tarde; nada se perde, o botão continua ali |

A recusa fica no histórico com o **HTTP de origem** (`Recusado · HTTP 422`) — antes gravava `null`, o
que confundia "o SIGA recusou" com "não houve resposta".

### 5. Fechar (5 min)

| # | O que | Por quê |
|---|---|---|
| 1 | conferir as notas no diário do SIGA | o SIGA é a fonte oficial |
| 2 | baixar o **CSV** da avaliação | planilha independente: nome, matrícula, nota bruta, nota final, decisão |
| 3 | `pnpm backup` | cópia do banco fora do Supabase |
| 4 | `pnpm verificar` | confere rubricas, notas e vínculos |
| 5 | `pnpm fotos:limpar` depois de tudo lançado | apaga do bucket as fotos que não estão em uso |

---

## Calendário sugerido

| Quando | O que |
|---|---|
| D−7 | criar e publicar a avaliação |
| D | prazo encerra; conferir **"Faltam N"** e decidir se estende |
| D+1 | corrigir e revisar (bloco de 1 h para 7 alunos) |
| D+2 | lançar no SIGA e conferir o diário |
| D+3 | backup + `pnpm verificar` |

---

## Se algo der errado

| Sintoma | Primeiro passo | Depois |
|---|---|---|
| Aluno diz que não consegue entrar | conferir na lista: matrícula e e-mail iguais aos dele | `/prof/alunos` → editar o cadastro |
| "Minha matrícula não está na lista" | procurar a matrícula na lista da turma | importar de novo ou corrigir a linha |
| A foto não abre na revisão | **"Tentar de novo"** (o link é temporário) | corrigir pela transcrição; pedir nova foto se necessário |
| Transcrição ruim | comparar com a foto; ajustar o texto | pedir foto com mais luz / usar digitação |
| “Serviço não respondeu” (`*_DEMOROU`) | banco, SIGA, OCR ou Storage passou do prazo: tentar de novo em instantes | se repetir, conferir `status.supabase.com` / o painel do SIGA / o provedor de visão |
| “Já foi criada no SIGA” (`SIGA_JA_CRIADA`) | a avaliação existe lá com outros dados; criar de novo duplica. Confirme em “Criar de novo mesmo assim” só se a antiga estiver errada |
| “Já estou criando” (`SIGA_EM_ANDAMENTO`) | outra requisição está no SIGA agora; espere alguns segundos e recarregue |
| Correção automática falha | a própria mensagem diz o código: `LLM_INALCANCAVEL` (serviço fora do ar), `LLM_FALHOU` (status 401/500), `LLM_DEMOROU` (passou do prazo), `RESPOSTA_TRUNCADA` (aumente `LLM_MAX_TOKENS`), `RESPOSTA_INVALIDA` (modelo devolveu lixo) | `pnpm diagnostico` e `/api/saude`; se persistir, corrija à mão — a fila não trava |
| Nota estranha no SIGA | conferir o **peso** da avaliação no app e no SIGA | "Peso no SIGA" na tela da avaliação alinha |
| Conferir se a nota foi lançada | tela da avaliação → **Histórico de lançamentos** | mostra também as recusas, com a resposta do SIGA |
| Aluno perdeu a senha | ele mesmo usa **Esqueci minha senha** (link vale 1 h) | se o e-mail da lista estiver errado, corrija o cadastro e mande pedir de novo |
| Aluno diz “o link expirou” | mandar pedir outro, na mesma tela | o app já explica isso ao abrir o link vencido |
| Nada faz sentido | `pnpm verificar` | `pnpm backup` antes de qualquer correção manual no banco |

---

## Segurança e senhas

- A senha do professor se troca em **Perfil** → **"Salvar alterações"**. Use uma senha só deste app.
- Chaves (Supabase, SIGA, IA, Vercel) ficam em `~/.dsh/secrets/avaliacoes.env`, fora do repositório, e na
  Vercel como variáveis de ambiente. Nunca no código.
- O bucket das fotos é privado: cada abertura gera um link assinado e temporário.
- Antes de apagar qualquer coisa no banco, faça `pnpm backup`. Turma apagada leva junto alunos,
  avaliações e redações.

---

## Como saber que o sistema está saudável

```bash
pnpm verificar          # dados: rubricas, notas, vínculos
pnpm test:e2e           # fluxo completo pelas telas, em modo demonstração
pnpm test:producao      # o app publicado, ponta a ponta (não lança nota no SIGA)
pnpm e2e:mobile         # layout e alvos de toque em 360×740
pnpm test:contraste     # legibilidade dos textos
pnpm test:documentacao  # este guia não ficou para trás
pnpm test:prazos        # regras de prazo (retroativo, encurtar, remover)
pnpm e2e:foto           # foto de 12 MP, HEIC do iPhone e arquivo corrompido
pnpm test:imagem        # mensagem certa para cada tipo de falha na foto
pnpm test:llm:mock      # o que a correção faz quando o modelo falha (sem modelo)
pnpm test:a11y          # 16 telas no axe-core (leitor de tela, teclado, rótulos)
pnpm test:rede          # prazo e mensagem quando banco, SIGA, OCR ou Storage não respondem
pnpm test:envio         # envio da foto no celular: prazo, mensagem e chamadas /api
pnpm test:siga:criar    # criar no SIGA: idempotência, confirmação de duplicata e auditoria
pnpm test:ocr:deepseek  # leitura da foto pela DeepSeek: multipart, páginas, limites e prazo
```

Os dez últimos não precisam de credencial nenhuma: rodam contra a demonstração local ou servidores falsos.
