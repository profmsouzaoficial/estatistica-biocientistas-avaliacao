# Guia do professor

Tudo é feito pelo celular, mas a tela de revisão é mais confortável no computador.

## 1. Entrar

1. Abra o endereço do aplicativo.
2. Entre com o e-mail institucional (`marcio.souza@ufjf.br`) e a senha definida na criação da conta.
3. Se esquecer a senha, use **Esqueci minha senha** — o link volta para o próprio app.

Contas de professor não são criadas pela tela de cadastro: use `pnpm professor:criar` (script em
`scripts/criar-professor.mjs`), que autoriza o e-mail e cria o usuário.

Logo abaixo do título aparece **Para começar**: seis conferências do primeiro uso (turma, lista,
primeira avaliação, SIGA, IA, leitura das fotos). Cada pendência tem um botão que leva ao lugar
certo. A lista desaparece quando tudo estiver pronto — se ela sumiu, não falta nada.

## 2. Preparar a turma

**Painel → Turmas e lista de alunos**

1. **Nova turma**: nome livre, código **igual ao do SIGA** (`CBV018GV-A`) e período (`2026/3`).
2. Cole a lista no formato `matrícula;nome;e-mail` (uma linha por aluno, com ou sem cabeçalho;
   vírgula e tabulação também funcionam).
3. **Conferir e importar** mostra quantos entraram e o que foi recusado (matrícula repetida,
   e-mail inválido).
4. **Sem os e-mails?** Desmarque **Exigir o e-mail na lista** logo abaixo da turma e importe só
   `matrícula;nome`. Nesse modo, cada aluno digita o próprio e-mail no cadastro e o e-mail fica
   registrado na lista — a matrícula continua sendo a chave, e ninguém entra com matrícula de
   outra pessoa sem saber o nome dela. A lista do SIGA (`pnpm turma:planilha`) já vem assim.

> Marcar a caixa é o modo mais seguro (só o dono do e-mail cadastrado entra). Desmarque apenas
> quando não houver mesmo como obter os e-mails da turma.

No cadastro, o aluno precisa aceitar o **aviso de privacidade** (link em outra aba). O aceite fica
com data e hora no banco, e o texto do aviso — o que é guardado, para onde vai, por quanto tempo e
como pedir exclusão — está em `/privacidade`, legível também sem login.

> O código do SIGA é o que define para onde as notas vão. Errar aqui lança nota na turma errada.

### Matrícula com letras

A lista do SIGA em Governador Valadares traz a matrícula com o sufixo do campus —
`202506007GV`, não só `202506007`. O app aceita os dois formatos e não diferencia maiúsculas de
minúsculas: o aluno pode digitar `202506007gv` que o cadastro encontra a linha da lista. Ao colar a
lista, mantenha o número exatamente como veio do SIGA; o app normaliza para maiúsculas sozinho.

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

## 4. Encerrar (e reabrir) as entregas

Na página da avaliação, a faixa de estado mostra se ela está **recebendo entregas**, **encerrada** ou
em **rascunho**, com o botão correspondente:

| Estado | O que o aluno vê | Botão |
|---|---|---|
| recebendo entregas | tema, rubrica e o botão de enviar | **Encerrar entregas** |
| entregas encerradas | continua vendo tema, rubrica e **a devolutiva**, mas não abre entrega nova | **Reabrir entregas** |
| rascunho | nada (a avaliação não aparece) | **Publicar para os alunos** |

Encerrar não apaga nada e é reversível. O bloqueio vale também no banco: mesmo que alguém tente
enviar por fora do app, a política de segurança recusa a entrega nova. Quem já tinha rascunho ou
teve a redação devolvida para reescrever continua conseguindo concluir.

## 5. Corrigir e revisar

Na tela da avaliação:

1. **Corrigir N pendente(s)** — envia cada texto ao Llama e grava a sugestão. Pode rodar de novo;
   só corrige quem ainda não tem correção.
   - **Sem IA configurada** (ou se preferir dar a nota você mesmo), abra o aluno e toque em
     **Corrigir manualmente**: a revisão abre com todos os critérios em 0, você digita os valores
     e aprova. O caminho seguinte é idêntico.
2. Toque no nome do aluno para abrir a **revisão**:
   - aba **Transcrição** (texto que será corrigido) e **Foto original** (comprovante);
   - nota por critério com justificativa do modelo — ajuste qualquer valor se discordar;
   - se a justificativa citar um trecho **entre aspas** que não existe na transcrição, aparece um
     aviso âmbar: *"A citação entre aspas não aparece na transcrição — confira antes de aprovar."*
     É sinal de que o modelo inventou a evidência; nesse caso, dê a nota você mesmo;
   - **Pontos fortes** e **A desenvolver**: campos de texto, um item por linha. O que você
     escrever aqui substitui o texto do modelo e é o que o aluno lê na devolutiva.
3. **Aprovar e liberar para o aluno** (ou *Salvar ajustes e liberar*, se mudou algo). Nesse
   momento a devolutiva aparece para o aluno.
4. **Devolver para o aluno reescrever** quando a redação não corresponde ao combinado.

A nota final é sempre `soma dos critérios ÷ valor total × 10`, arredondada a uma casa. Não é o
modelo que decide a nota no SIGA.

### Conferir se a nota chegou ao SIGA

Depois de lançar, a página da avaliação tem o cartão **O que já está no SIGA**. Ele lê o quadro da
turma na API do SIGA (só leitura) e compara, aluno por aluno, o que o app enviou com o que está
gravado:

| Selo | Significado | O que fazer |
|---|---|---|
| **confere** | o valor enviado e o do SIGA são iguais | nada |
| **diverge** | o SIGA tem outro valor naquela coluna | confira a descrição da avaliação e lance de novo |
| **não chegou** | o app registrou o envio, mas o SIGA mostra vazio | lance de novo; se repetir, veja o log em `lancamentos_siga` |
| **a lançar** | ainda não foi enviado | use **Lançar N no SIGA** |
| **só no SIGA** | há nota no SIGA sem envio registrado no app | nota lançada à mão, direto no SIGA |

O cartão não altera nada. É o fecho do ciclo: sem ele, "lancei" e "está lá" seriam a mesma frase — e
não são.

**Tempo:** com o modelo em CPU, cada correção leva de 45 a 90 segundos. A hospedagem atual corta
pedidos em 60 s, então, para a turma inteira, o caminho é o lote no servidor do modelo
(`pnpm corrigir:lote`) — ele corrige sem limite de tempo e a tela passa a mostrar as correções
prontas. Redação que falhar continua pendente: dá para tentar de novo ou corrigir à mão.

## 6. Lançar no SIGA

1. Confira a descrição do SIGA na tela da avaliação.
2. **Lançar N no SIGA** (em lote) ou **Lançar X no SIGA** (aluno por aluno). O lote pede
   confirmação, com a turma e a descrição que serão gravadas.
3. Verde = aceito. Vermelho = recusado; a mensagem do SIGA aparece na tela e fica registrada em
   `lancamentos_siga` (com o corpo da resposta), então nada se perde.

**Se a avaliação ainda não existir no SIGA**, a tela mostra o aviso amarelo *Esta avaliação ainda
não existe no SIGA* com o resumo do que será criado — turma, descrição, peso e data — e o botão
**Criar no SIGA**. O SIGA recusa notas para avaliação inexistente, e criar por aqui evita cadastrar
tudo de novo no site do SIGA. Depois da criação, a conferência já reconhece a avaliação.

> A criação automática só funciona para descrições no formato de TVC (`TVC 3`, `4ª TVC`), porque é
> esse número que a rota `/api/criar-avaliacao` exige. Para outro tipo de avaliação (trabalho,
> relatório), cadastre no SIGA e use **Buscar** na criação da avaliação para copiar a descrição
> exata — assim o lançamento encontra a coluna certa.

### Remover a turma

No rodapé do cartão da turma existe o link **Remover esta turma…**. Ele mostra quantos alunos,
avaliações e redações serão apagados e só libera o botão depois que você digita o código do SIGA.
A remoção leva junto a lista, as avaliações, as redações e **as fotos** guardadas no bucket privado
(a mensagem final informa quantas fotos foram apagadas).
Se já houver nota lançada no SIGA, o app recusa — o histórico do lançamento não pode desaparecer.

### Excluir uma avaliação criada por engano

No fim da página de cada avaliação existe o cartão **Excluir esta avaliação**. Ele só funciona
enquanto ninguém enviou redação e nenhuma nota foi ao SIGA — duas travas deliberadas:

| Situação | O que acontece |
|---|---|
| Rascunho ou avaliação sem entregas | Apaga com confirmação pelo título |
| Já tem redação enviada | O app recusa e explica: apagar tiraria a entrega do aluno |
| Já tem nota lançada no SIGA | O app recusa: o histórico do lançamento não pode desaparecer |

Se você publicou com o peso ou a rubrica errados e **ninguém enviou ainda**, basta excluir e criar de
novo. Se já houver entregas, encerre as entregas, crie a avaliação corrigida e deixe a antiga como
histórico (ou remova a turma inteira, quando o período acabar).

### Quando a correção automática demora

A hospedagem gratuita da Vercel corta qualquer função em 60 segundos. O app espera até 55 s pelo
modelo e, se ele não responder, mostra *"O modelo passou de 55 s…"* em vez de uma tela de erro sem
explicação. Nesse caso há dois caminhos: corrigir aquela redação à mão, ou rodar o lote no seu
servidor com `pnpm corrigir:lote` — ele espera até 10 minutos por redação e grava as sugestões em
`correcoes`, prontas para você revisar no app.

### Escala da nota no SIGA

A documentação da API do SIGA não diz qual é a escala. Os dados da turma **CBV018GV-A (2026/3)**
resolveram a dúvida:

| Avaliação no SIGA | Peso | Notas já lançadas |
|---|---|---|
| Exercício Avaliativo | 10 | 10 · 9,5 · 10 · 10 · 9,5 · 10 · 10 |
| **Prova 1** | **20** | **19 · 17 · 16 · 16 · 12 · 10 · 10** |

Nota 19 num espaço de peso 20 só faz sentido se a escala for **0 até o peso**. Por isso o app está
configurado com `SIGA_ESCALA=pontos`: uma redação que soma 14 de 20 vai ao SIGA como **14**.

Se o peso no SIGA for diferente do valor total da rubrica, a nota é convertida proporcionalmente
(rubrica de 10 pontos, peso 20 no SIGA → uma nota 7 vira 14). O campo "Peso no SIGA" já vem
preenchido com o valor total, e a tela da avaliação mostra, embaixo do nome no SIGA, a escala usada
e o teto da nota; a confirmação do lançamento lista aluno por aluno o número exato que será gravado.

### O que o aluno vê

A devolutiva traz a nota, os pontos por critério com a justificativa, os pontos fortes, os pontos a
desenvolver e uma linha de transparência: se a sugestão veio de um modelo, o aluno lê que a nota foi
sugerida por IA e aprovada (ou ajustada) pelo professor, que é quem responde pela nota. Quando a
correção é manual, a linha diz isso. O nome técnico do modelo aparece só na sua tela.

## 7. Acompanhar

- **Painel**: quantas redações aguardam correção, revisão e lançamento.
- **CSV** na tela da avaliação: planilha com nome, matrícula, nota bruta, nota final e decisão —
  serve de backup independente do SIGA.
- A aba **no SIGA** de cada avaliação mostra quantas notas já foram aceitas.

## 8. Se algo der errado

| Sintoma | O que checar |
|---|---|
| "Esta avaliação não tem descrição do SIGA" | preencha `Descrição no SIGA` na criação |
| SIGA responde 403 | chave `SIGA_API_KEY` inválida ou expirada |
| SIGA responde 404 | turma, período ou descrição não existem no SIGA |
| Correção falha | `LLM_BASE_URL`/`LLM_MODEL` no ar; veja `GET /api/saude` |
| Transcrição vazia | foto escura/torta; peça nova foto ou use a digitação manual |
