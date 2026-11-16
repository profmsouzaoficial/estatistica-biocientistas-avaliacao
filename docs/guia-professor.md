# Guia do professor

Tudo é feito pelo celular, mas a tela de revisão é mais confortável no computador.

> Para o ciclo completo de uma avaliação — antes do semestre, cada etapa, calendário e o que fazer em
> cada erro — veja [operacao.md](operacao.md). Este guia explica as telas; aquele diz a ordem.

## 1. Entrar

1. Abra o endereço do aplicativo.
2. Entre com o e-mail institucional (`marcio.souza@ufjf.br`) e a senha definida na criação da conta.
3. **Para os alunos**, mande o endereço do app e a página **/ajuda** (abre sem login):
   `https://estatistica-biocientistas-avaliacao.vercel.app/ajuda`. Ela tem o passo a passo de
   cadastro, foto, conferência da transcrição, envio e devolutiva.
4. Se esquecer a senha, use **Esqueci minha senha** — o link volta para o próprio app, na tela
   **Definir nova senha**. Vale para o professor e para o aluno: o e-mail sai em nome do Supabase
   (remetente padrão), então peça para olhar o spam na primeira vez.

Contas de professor não são criadas pela tela de cadastro: use `pnpm professor:criar` (script em
`scripts/criar-professor.mjs`), que autoriza o e-mail e cria o usuário.

Logo abaixo do título aparece **Para começar**: seis conferências do primeiro uso (turma, lista,
primeira avaliação, SIGA, IA, leitura das fotos). Cada pendência tem um botão que leva ao lugar
certo. A lista desaparece quando tudo estiver pronto — se ela sumiu, não falta nada.

## 2. Preparar a turma

**Painel → Turmas e lista de alunos**

1. **Nova turma**: nome livre, código **igual ao do SIGA** (`CBV018GV-A`) e período (`2026/3`).
2. Cole a lista no formato `matrícula;nome;e-mail` (uma linha por aluno, com ou sem cabeçalho;
   vírgula e tabulação também funcionam). Se a planilha vier com as colunas em outra ordem —
   `Nome;Matrícula;Email`, por exemplo — pode colar assim: o cabeçalho é lido e as colunas são
   identificadas pelo nome.
3. **Conferir e importar** mostra quantos entraram e o que foi recusado, com o número da linha
   (matrícula repetida, e-mail inválido, matrícula com menos de 6 dígitos).
4. **Sem os e-mails?** Desmarque **Exigir o e-mail na lista** logo abaixo da turma e importe só
   `matrícula;nome`. Nesse modo, cada aluno digita o próprio e-mail no cadastro e o e-mail fica
   registrado na lista — a matrícula continua sendo a chave, e ninguém entra com matrícula de
   outra pessoa sem saber o nome dela. A lista do SIGA (`pnpm turma:planilha`) já vem assim.

### Enviar CSV em vez de colar

**Enviar CSV** aceita o arquivo direto da planilha. Dois detalhes que já causaram nome errado na
devolutiva:

| Situação | O que o app faz |
|---|---|
| Excel salvou em **Windows-1252** (o padrão do “CSV (vírgula)” em português) | lê os bytes, detecta que não é UTF-8, relê como Windows-1252 e **avisa em amarelo** para conferir os acentos |
| O arquivo é **.xlsx** (planilha, não CSV) | recusa e explica: salve como “CSV UTF-8 (delimitado por vírgulas)” |
| Colunas a mais (Curso, Situação) | ignora as que não são matrícula, nome ou e-mail |
| Arquivo com BOM do Excel | lê normalmente |

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

### O peso tem que ser o do SIGA

A nota sai daqui convertida para a escala da avaliação **no SIGA**. Se este app diz peso 20 e o SIGA
diz 10, uma redação nota máxima chega como 20 onde o teto é 10. A página da avaliação avisa quando os
dois pesos não batem e oferece **Usar o peso do SIGA** — um clique, e as próximas notas saem certas.
Ao criar a avaliação, use a busca do SIGA: o peso vem preenchido.

### Quem mexeu no quê

Cada aprovação, devolução, mudança de prazo e encerramento de entregas entra na trilha de auditoria
com a data, o seu usuário e o valor anterior. Se alguém perguntar "por que a nota mudou depois do
lançamento?" ou "quando o prazo foi estendido?", a resposta está lá — não depende de memória.

### Quem ainda não entregou

Abaixo dos contadores, a linha de **entregas da turma** mostra “3 de 4 alunos da turma entregaram” e, se
alguém faltou, **Faltam N** com o primeiro nome. Toque para abrir a lista com nome e matrícula; quem
aparece como **sem cadastro** ainda não criou a conta no app.

Use isso antes de fechar o prazo: quem não entregou fica sem nota nesta avaliação. Para dar segunda
chance, **Estender ou mudar o prazo** reabre o envio — não mexe em redação já enviada nem em nota já
lançada. A contagem considera só entrega confirmada pelo aluno: rascunho salvo no meio do caminho não
conta, porque rascunho ele ainda pode mudar.

## Devolver uma redação

Na revisão, **Devolver para o aluno** manda a redação de volta com o seu comentário. O aluno vê
“Devolvida para ajuste”, reabre, corrige e reenvia. O reenvio volta para a sua fila como
**a revisar** — os critérios da rodada anterior ficam ali como ponto de partida, para você ajustar em
vez de começar do zero. Enquanto você não aprovar de novo, o aluno continua vendo “Em correção”, sem
nota. E a redação reenviada **não** entra no botão de lançar: ele conta só o que você aprovou depois do
reenvio (0 de 1, no caso), porque nota aprovada antes da reescrita não vale mais.

Se um aluno disser que “não consegue reenviar”, era defeito nosso até a versão de 16/11/2026: o banco
recusava a gravação da redação devolvida. Está corrigido — ele reabre, troca ou mantém a foto, ajusta o
texto e envia normalmente.

### Estender o prazo

Aluno que adoeceu, queda de internet na véspera: entre na avaliação e use **Prazo de entrega →
Estender ou mudar o prazo**. A data nova reabre o envio para quem faltou, sem tocar no que já foi
enviado nem nas notas. **Remover prazo** deixa a avaliação aceitando entregas sem data limite.

Depois do prazo, o aluno vê o botão desabilitado (“Prazo encerrado”) com o aviso para pedir a
extensão. Se uma redação for enviada depois da data — prazo encurtado depois do envio, por exemplo —
ela aparece marcada em âmbar como **fora do prazo** na lista e na revisão. A marca é informativa: não
muda a nota.

Encurtar o prazo de uma avaliação que já recebeu entregas mexe nessa marca, então o app **avisa antes
de gravar**: “2 entregas já feitas passariam a ser marcadas como fora do prazo”, com **Confirmar nova
data** e **Cancelar**. Não é proibição — é para a marca não aparecer sem você saber. Para simplesmente
fechar o envio sem recategorizar ninguém, use **Encerrar entregas**.

Ao criar a avaliação, uma data no passado é recusada de saída (a avaliação nasceria fechada e o aluno
leria “Prazo encerrado” em algo recém-publicado). Corrija a data e, se precisar mudá-la depois, use o
próprio cartão do prazo.

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

### Histórico de lançamentos

Na tela da avaliação, embaixo da linha do SIGA, o link **Histórico de lançamentos** abre o registro
de **cada tentativa** de gravar nota — inclusive as recusadas, com a mensagem que o SIGA devolveu:

| Coluna na tela | Para que serve |
|---|---|
| Data e hora | quando o envio aconteceu (fuso de Brasília) |
| Aluno e matrícula | quem recebeu a nota |
| Nota e escala | o número exato que foi (ou tentaria ser) gravado — `pontos` ou `0–10` |
| Aceito / Recusado + HTTP | a resposta do servidor do SIGA |
| Mensagem de erro | o texto do SIGA, quando ele recusa |
| Baixar CSV | leva o histórico para a planilha do semestre |

Serve para três perguntas que aparecem meses depois: *esta nota foi mesmo lançada?*, *por que o SIGA
recusou aquele aluno?* e *com que escala a nota foi enviada?*. O registro vem do servidor e **não há
botão para apagar**: auditoria que o app apaga não serve como comprovante.

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

## Ligar a IA de correção

Enquanto a IA não estiver ligada, o app funciona: o aluno digita o texto (ou você dita a transcrição) e
você corrige à mão, critério por critério. Para ligar a correção automática, uma pessoa com acesso ao
projeto roda **um comando** na pasta do código:

```bash
pnpm configurar:ia --ensaio \
  --base https://SEU-SERVICO.coolify.app/v1 --modelo Qwen2.5-7B-Instruct --chave sk-... \
  --visao-modelo Qwen2.5-VL-7B-Instruct --foto ~/uma-redacao-sua.jpg
```

`--ensaio` só mostra o plano. Sem ele, o comando grava as variáveis, publica na Vercel, refaz o deploy,
testa a correção com uma redação de exemplo, testa a leitura da **sua** foto e confere em `/api/saude` se
corretor, leitura e SIGA aparecem ligados.

O detalhe que economiza um serviço: se o modelo do Coolify enxerga imagem (Qwen2.5-VL, MiniCPM-V,
Llama 3.2 Vision), o **mesmo endpoint e a mesma chave** servem para corrigir e para ler a foto —
`--visao-modelo` cuida disso. Só é preciso outro provedor (Google Vision, por exemplo) se o modelo do
Coolify for só de texto.

Depois de ligado, a tela da avaliação mostra "Corrigir N pendente(s)"; a correção leva alguns segundos
por redação, e cada uma cai na fila "A revisar" para sua aprovação. Se o modelo estiver fora do ar, o
app avisa e a correção manual continua disponível.

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
| Correção falha | rode `pnpm configurar:ia --ensaio` para conferir URL/modelo; veja `GET /api/saude` |
| Transcrição vazia | foto escura/torta; peça nova foto ou use a digitação manual; teste com `pnpm test:ocr:foto` |
