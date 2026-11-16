# OCR com Google Cloud Vision

A correção roda em um Llama de **texto**: ele não enxerga a foto. A leitura da letra é uma etapa
separada, feita no Cloud Vision (recurso *Document Text Detection*), que devolve a transcrição para
o app guardar e corrigir. O aluno sempre confere e pode corrigir o texto antes de enviar.

O app também aceita `openrouter`, `openai` e `google` (Gemini) — mas para manuscrito em português o
Cloud Vision foi o que se saiu melhor nos testes de leitura.

## 1. Criar a credencial no Google Cloud

Você precisa de um projeto no [Google Cloud Console](https://console.cloud.google.com/) com
**faturamento ativo** (o Cloud Vision exige cartão, mesmo dentro da cota gratuita).

1. **APIs e serviços → Biblioteca** → procure *Cloud Vision API* → **Ativar**.
2. Escolha **uma** das credenciais:

| Opção | Como criar | Vantagem |
|---|---|---|
| **Chave de API** (mais simples) | *APIs e serviços → Credenciais → Criar credenciais → Chave de API* | dois cliques; restrinja a chave à Cloud Vision API |
| **Conta de serviço** | *Credenciais → Criar credenciais → Conta de serviço* → papel **Usuário da API Cloud Vision** → *Chaves → Adicionar chave → JSON* | não expira; melhor para produção |

O app aceita as duas na mesma variável: se o valor começar com `{`, ele trata como JSON de conta de
serviço (assina um JWT RS256 e troca por token OAuth); senão, usa como chave de API.

## 2. Configurar a variável

Na Vercel (Production e Preview) e/ou no `~/.dsh/secrets/avaliacoes.env`:

```bash
VISION_PROVIDER=google-cloud
VISION_API_KEY=AIza...                           # chave simples
# ou, em uma linha só, o JSON da conta de serviço:
VISION_API_KEY={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"visao@....iam.gserviceaccount.com","token_uri":"https://oauth2.googleapis.com/token"}
```

O JSON tem quebras de linha dentro da `private_key`. Ao colar na Vercel, mantenha os `\n` literais
(como no JSON original) — o app não reformata a chave.

Depois de salvar, **redeploy** é necessário: a função lê a variável em tempo de execução, mas só
depois de um novo deployment ela aparece no ambiente.

## 3. Conferir

```bash
pnpm test:ocr     # roda contra um Google falso local, sem gastar chamada
```

O teste confere: URL e `?key=`, o recurso `DOCUMENT_TEXT_DETECTION`, o `languageHints` em pt-BR, a
imagem em base64, a assinatura do JWT da conta de serviço, o erro do Google virando mensagem legível
e a foto em branco virando `SEM_TEXTO` com orientação para o aluno.

Com a chave real configurada, o caminho é enviar uma foto de teste em uma avaliação de mentira:

```bash
# no app, como aluno: enviar foto → a tela mostra a transcrição para conferência
```

Se o Cloud Vision recusar a credencial, a mensagem no app diz qual foi o código (403 chave
inválida, 400 imagem ruim) e o texto completo fica no log da função na Vercel.

## 4. Custo

O Cloud Vision cobra por unidade de *Document Text Detection*; a tabela pública isenta as primeiras
1.000 unidades por mês e cobra cerca de US$ 1,50 por 1.000 depois disso — **confirme na
[página de preços](https://cloud.google.com/vision/pricing) antes de contar com a cota**. Uma turma
de 30 alunos com 4 redações cada dá 120 páginas: cabe na cota gratuita.

O app nunca manda a foto para o modelo de correção e nunca manda o nome do aluno para o Google: a
imagem tem só a redação manuscrita. O aviso de privacidade (`/privacidade`) descreve isso.

## 5. Sem OCR

Se `VISION_API_KEY` estiver vazia, o app **continua funcionando**: o aluno vê "a transcrição
automática ainda não está configurada" e digita o texto; a foto fica guardada como comprovante. É o
modo usado hoje enquanto a chave não chega.
