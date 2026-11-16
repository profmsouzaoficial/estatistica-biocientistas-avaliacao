# Guia do professor

Tudo é feito pelo celular, mas a tela de revisão é mais confortável no computador.

## 1. Entrar

1. Abra o endereço do aplicativo.
2. Entre com o e-mail institucional (`marcio.souza@ufjf.br`) e a senha definida na criação da conta.
3. Se esquecer a senha, use **Esqueci minha senha** — o link volta para o próprio app.

Contas de professor não são criadas pela tela de cadastro: use `pnpm professor:criar` (script em
`scripts/criar-professor.mjs`), que autoriza o e-mail e cria o usuário.

## 2. Preparar a turma

**Painel → Turmas e lista de alunos**

1. **Nova turma**: nome livre, código **igual ao do SIGA** (`CBV018GV-A`) e período (`2026/3`).
2. Cole a lista no formato `matrícula;nome;e-mail` (uma linha por aluno, com ou sem cabeçalho;
   vírgula e tabulação também funcionam).
3. **Conferir e importar** mostra quantos entraram e o que foi recusado (matrícula repetida,
   e-mail inválido).

> O código do SIGA é o que define para onde as notas vão. Errar aqui lança nota na turma errada.

## 3. Criar a avaliação

**Painel → Nova**

| Campo | Dica |
|---|---|
| Título | aparece para o aluno (`Redação 1 — Testes diagnósticos`) |
| Tema | uma frase; é o que o aluno lê na hora de escrever |
| Instruções | número de linhas, se pode consultar, critérios de formatação |
| Capítulo do livro | liga a redação ao capítulo 1–10 |
| Valor total | a nota máxima em pontos (ex.: 20) |
| Rubrica | 3–5 critérios; **a soma tem de fechar com o valor total** |
| Descrição no SIGA | idêntica à do SIGA — use **Buscar** para escolher da lista real |
| Peso / Data | usados ao criar a avaliação no SIGA |

A rubrica é o coração da correção: cada critério tem nome, descrição (o que se espera) e valor
máximo. O modelo só pode pontuar dentro desse máximo. O botão **Distribuir 20 pts** preenche
30%/30%/20%/20% como ponto de partida.

Em **Lançamento no SIGA**, toque em **Buscar**: o app pergunta ao SIGA quais avaliações já
existem naquela turma/período e mostra cada uma com data e peso. Um toque preenche descrição,
peso e data — assim a nota não cai na avaliação errada por causa de uma letra.

Deixe **Publicar agora** marcado para o aluno ver; desmarque para rascunho.

## 4. Corrigir e revisar

Na tela da avaliação:

1. **Corrigir N pendente(s)** — envia cada texto ao Llama e grava a sugestão. Pode rodar de novo;
   só corrige quem ainda não tem correção.
   - **Sem IA configurada** (ou se preferir dar a nota você mesmo), abra o aluno e toque em
     **Corrigir manualmente**: a revisão abre com todos os critérios em 0, você digita os valores
     e aprova. O caminho seguinte é idêntico.
2. Toque no nome do aluno para abrir a **revisão**:
   - aba **Transcrição** (texto que será corrigido) e **Foto original** (comprovante);
   - nota por critério com justificativa do modelo — ajuste qualquer valor se discordar;
   - pontos fortes e pontos a desenvolver, editáveis.
3. **Aprovar e liberar para o aluno** (ou *Salvar ajustes e liberar*, se mudou algo). Nesse
   momento a devolutiva aparece para o aluno.
4. **Devolver para o aluno reescrever** quando a redação não corresponde ao combinado.

A nota final é sempre `soma dos critérios ÷ valor total × 10`, arredondada a uma casa. Não é o
modelo que decide a nota no SIGA.

## 5. Lançar no SIGA

1. Confira a descrição do SIGA na tela da avaliação.
2. **Lançar N no SIGA** (em lote) ou **Lançar X no SIGA** (aluno por aluno).
3. Verde = aceito. Vermelho = recusado; a mensagem do SIGA aparece na tela e fica registrada em
   `lancamentos_siga` (com o corpo da resposta), então nada se perde.

Se a avaliação ainda não existir no SIGA, crie lá primeiro (SIGA → Turma → Avaliações) e depois
use **Buscar** na criação da avaliação para escolher a descrição exata. A criação automática existe
só para TVCs (`POST /api/siga/avaliacao`, exige descrição no formato "TVC 3") e não tem botão na
interface — é uma chamada de API, para não criar avaliação errada por engano.

## 6. Acompanhar

- **Painel**: quantas redações aguardam correção, revisão e lançamento.
- **CSV** na tela da avaliação: planilha com nome, matrícula, nota bruta, nota final e decisão —
  serve de backup independente do SIGA.
- A aba **no SIGA** de cada avaliação mostra quantas notas já foram aceitas.

## 7. Se algo der errado

| Sintoma | O que checar |
|---|---|
| "Esta avaliação não tem descrição do SIGA" | preencha `Descrição no SIGA` na criação |
| SIGA responde 403 | chave `SIGA_API_KEY` inválida ou expirada |
| SIGA responde 404 | turma, período ou descrição não existem no SIGA |
| Correção falha | `LLM_BASE_URL`/`LLM_MODEL` no ar; veja `GET /api/saude` |
| Transcrição vazia | foto escura/torta; peça nova foto ou use a digitação manual |
