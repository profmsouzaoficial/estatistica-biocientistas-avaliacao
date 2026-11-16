# Serviço Docker Compose para o Coolify — llama.cpp em CPU

Este arquivo é um **template para colar no Coolify** (New Resource → Docker Compose).
Ele sobe o `llama-server` com API compatível com OpenAI em `/v1`.

### Qual modelo escolher (medido em CPU, 12 vCPU)

`pnpm comparar:modelos` manda a mesma redação em três níveis (fraca, média, boa) para cada modelo,
com a rubrica do app. O que medi nesta máquina:

| Modelo | fraca | média | boa | tempo por redação | observação |
|---|---|---|---|---|---|
| `llama3:8b` | 7,0 | 7,6 | 8,1 | ~9 s | não separa bem; cita a rubrica como se fosse o texto |
| `deepseek-r1:8b` | 2,5 | 9,7 | — | 26–68 s | separa melhor, mas estoura o limite de 60 s da Vercel e trunca |

Conclusão prática: prefira um modelo **instruct de 7B a 14B** (o compose abaixo usa
`Qwen2.5-7B-Instruct`), com `LLM_MAX_TOKENS` em 2000 e `LLM_TIMEOUT_MS` em 55000 na Vercel. Modelos
de raciocínio (R1 e afins) gastam o orçamento de tokens "pensando" e são piores para o limite de
60 s; se quiser usá-los, rode `pnpm corrigir:lote` num servidor sem esse limite.

Ajuste `THREADS` para o número de **núcleos físicos** da máquina (não hyperthreads):
`grep -c ^processor /proc/cpuinfo` costuma contar threads; use metade se for o caso.

```yaml
services:
  llama:
    image: ghcr.io/ggml-org/llama.cpp:server
    command: >
      -hf Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M
      --host 0.0.0.0
      --port 8080
      --ctx-size 8192
      --threads 8
      --parallel 1
      --api-key ${LLAMA_API_KEY}
      --no-webui
    environment:
      - LLAMA_API_KEY=${LLAMA_API_KEY}
    volumes:
      - llama-cache:/root/.cache/llama.cpp
    ports:
      - "8080"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 300s
    restart: unless-stopped

volumes:
  llama-cache:
```

## No Coolify

1. **New Resource → Docker Compose**, cole o bloco acima.
2. Em **Environment Variables**, crie `LLAMA_API_KEY` com um valor longo e aleatório
   (`openssl rand -hex 24`).
3. Em **Domains**, aponte `https://llama.seudominio.com` para a porta `8080`.
   Sem domínio público, a Vercel não alcança o serviço — nesse caso use o modo lote
   (`pnpm corrigir:lote`) rodando na sua rede.
4. **Deploy**. O primeiro start baixa o modelo (~4,5 GB) e pode levar alguns minutos;
   o `start_period` de 300 s existe para isso.
5. Confira: `curl -H "Authorization: Bearer $LLAMA_API_KEY" https://SEU-DOMINIO/v1/models`.

## O que colocar nas variáveis do app

| Variável | Valor |
|---|---|
| `LLM_BASE_URL` | `https://SEU-DOMINIO/v1` |
| `LLM_MODEL` | o `id` devolvido por `/v1/models` (no `-hf`, costuma ser o nome do repositório + quantização) |
| `LLM_API_KEY` | o mesmo `LLAMA_API_KEY` |
| `LLM_JSON_MODE` | `0` (llama.cpp aceita `response_format` em versões recentes; se der erro 400, deixe 0) |
| `LLM_MAX_PALAVRAS` | `1200` |

Depois de preencher, rode `pnpm diagnostico` — ele envia uma rubrica de teste e mostra a
latência real da sua CPU.

## Escolha do modelo

| Máquina | Modelo sugerido | Comentário |
|---|---|---|
| 8 GB RAM, 4 núcleos | `Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M` | rápido; notas mais genéricas |
| 16 GB RAM, 8 núcleos | `Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M` | melhor equilíbrio |
| 32 GB RAM, 16 núcleos | `Qwen/Qwen2.5-14B-Instruct-GGUF:Q4_K_M` | ~1 token/s por núcleo; notas mais consistentes |

`Llama-3.1-8B-Instruct-GGUF:Q4_K_M` também funciona; o Qwen2.5 segue instruções em português
com mais firmeza na mesma faixa de tamanho.

> Visão (ler a foto) **não** entra nesta máquina: para isso o app usa OCR em nuvem. Ver
> `README.md` §5.
