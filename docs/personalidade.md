# Personalidade no perfil — como foi feito e o que significa

> **Em uma frase:** o aluno responde a um questionário curto de 30 afirmações originais,
> inspirado no modelo dos 16 tipos do 16Personalities; o resultado fica no perfil e o
> professor vê o tipo e a cor do grupo na chamada. **Não é o teste oficial nem um
> diagnóstico psicológico.**

## 1. Por que uma adaptação, e não um iframe

O pedido era usar o site do 16Personalities como referência. Incorporar a página oficial
por `iframe` não funciona bem (o site bloqueia o enquadramento), mistura a identidade visual
de outra empresa com a da UFJF e cria uma dependência de disponibilidade e de cookies de
terceiros. Além disso, o resultado ficaria fora do nosso banco: o professor não conseguiria
usar a personalidade na lista de frequência.

A solução foi **estudar o modelo e escrever uma versão própria**, com:

- 30 afirmações em português, seis por eixo, três de cada lado;
- escala de 7 pontos, de “Discordo totalmente” a “Concordo totalmente”;
- cálculo de percentuais por eixo e composição do código de cinco letras;
- textos de descrição, características e pontos de atenção escritos para este app;
- atribuição ao 16Personalities e link para quem quiser fazer o teste original.

O app **não copia** o banco de 60 perguntas, os textos do relatório oficial, o layout ou as
marcas do site. Os nomes dos 16 tipos e dos quatro grupos são usados como referência ao
modelo, com crédito.

## 2. O que foi observado no site (registro técnico)

Em **18/11/2026**, a interface pública em `https://www.16personalities.com/br` foi
inspecionada com navegador automatizado (Playwright), seguindo a ideia do projeto
[REA — Reverse Engineering Agent](https://github.com/morluto/rea): abrir a página, observar
o fluxo real, registrar seletores, rede e armazenamento e então reconstruir o comportamento
em vez de adivinhar.

Observações úteis para entender o modelo (sem reproduzir o conteúdo proprietário):

| Observação | Como aparece |
|---|---|
| Banco oficial | 60 afirmações, apresentadas em 10 páginas de 6 |
| Escala | 7 pontos; a interface usa rótulos como “Concordo” e “Discordo” |
| Navegação | botão de avançar com rótulo acessível “Ir para as próximas perguntas”; no fim, “Ver resultado” |
| Eixos | energia (E/I), percepção (N/S), decisão (F/T), organização (J/P) e identidade (A/T) |
| Resultado | código de 5 letras (por exemplo, `INFJ-T`), papel, estratégia e percentuais por eixo |
| Persistência no navegador | as respostas ficam no `localStorage` durante o teste; a sessão do site é usada para retomar |
| Leitura por API | a sessão do site expõe escores por eixo e o tipo calculado |

O que **não** foi feito: copiar os textos das perguntas, automatizar respostas para gerar
resultados falsos, contornar paywall ou usar a API oficial como backend do nosso app.

## 3. O modelo adotado

### 3.1 Cinco eixos

| Eixo | Polo esquerdo | Polo direito | Pergunta que resume |
|---|---|---|---|
| Energia | Extroversão (E) | Introversão (I) | De onde vem a sua energia? |
| Percepção | Intuição (N) | Observação (S) | Como você absorve informação? |
| Decisão | Sentimento (F) | Pensamento (T) | O que pesa primeiro ao decidir? |
| Organização | Planejamento (J) | Flexibilidade (P) | Como você lida com planos e prazos? |
| Identidade | Assertividade (A) | Turbulência (T) | Como você reage a pressão e erro? |

As quatro primeiras letras formam o tipo base (`ENFJ`, `ISTP`…). A quinta letra é a
identidade (`A` ou `T`), que no site aparece como sufixo (`ENFJ-A`).

### 3.2 Cálculo

Cada afirmação vale de 1 a 7. O centro é 4; o desvio é `resposta - 4`, portanto vai de
-3 a +3. Nas afirmações do polo esquerdo, o desvio entra com o próprio sinal; nas do polo
direito, entra invertido. Cada eixo tem seis afirmações, então a soma vai de -18 a +18.
O percentual do polo esquerdo é:

```
percentual = round(((soma + 18) / 36) × 100)
```

- 100% = todas as respostas apontam para o polo esquerdo;
- 50% = equilíbrio;
- 0% = todas apontam para o polo direito.

O empate (50%) usa o polo esquerdo para formar o código. Isso é uma escolha de produto,
não uma regra do site oficial.

### 3.3 Grupos, tipos e cores

| Grupo | Tipos | Cor principal | Cor de fundo |
|---|---|---|---|
| Analistas | INTJ, INTP, ENTJ, ENTP | `#6D4AFF` | `#F1ECFF` |
| Diplomatas | INFJ, INFP, ENFJ, ENFP | `#2E8B57` | `#E9F7EF` |
| Sentinelas | ISTJ, ISFJ, ESTJ, ESFJ | `#2F6FED` | `#EAF1FF` |
| Exploradores | ISTP, ISFP, ESTP, ESFP | `#B47B00` | `#FFF4D8` |

A regra de grupo é derivada das letras, não aceita do cliente:

- **N + T** → Analistas;
- **N + F** → Diplomatas;
- **S + J** → Sentinelas (o J é a **quarta** letra, não a terceira);
- **S + P** → Exploradores.

A segunda letra (N/S) e a terceira (F/T) não bastam para separar Sentinelas de Exploradores:
é a quarta letra (J/P) que faz isso.

A cor é um apoio visual, nunca o único sinal: o código do tipo e o nome do grupo aparecem
por escrito. Isso mantém a lista utilizável por quem não distingue cores.

### 3.4 Estratégias

| Identidade | Introvertido | Extrovertido |
|---|---|---|
| Assertivo (A) | Individualismo Confiante | Domínio Social |
| Turbulento (T) | Aprimoramento Constante | Engajamento Social |

## 4. Onde ficam os dados

A migration `supabase/migrations/0020_perfil_foto_personalidade_frequencia.sql` adiciona:

| Campo | Tipo | Para que serve |
|---|---|---|
| `profiles.foto_path` | `text` | caminho no bucket privado `perfis`, no formato `<uid>/avatar.jpg` |
| `profiles.personalidade` | `jsonb` | tipo, grupo, estratégia, identidade, percentuais e versão |
| `profiles.personalidade_em` | `timestamptz` | quando o aluno concluiu ou refez o teste |

O aluno **não** tem `UPDATE` direto em `profiles`; duas funções `security definer` fazem o
caminho estreito:

- `public.salvar_foto_perfil(p_path text)`: só aceita um caminho dentro da pasta do próprio
  `auth.uid()`, ou `null` para limpar;
- `public.salvar_personalidade(p_resultado jsonb)`: valida o código, confere os cinco
  percentuais entre 0 e 100 e **deriva no servidor** o grupo e a estratégia. O cliente não
  consegue gravar um grupo incoerente com o tipo.

As fotos ficam no bucket **privado** `perfis` (5 MB, JPEG/PNG/WEBP). A leitura é feita por
URL assinada de 1 hora; o aluno vê a própria pasta e o professor vê todas as fotos para
montar a chamada.

## 5. Limites e cuidado

- **Não é diagnóstico.** O teste não mede transtorno, capacidade intelectual, mérito ou
  potencial acadêmico; não deve ser usado para selecionar, punir ou rotular ninguém.
- **Não é o teste oficial.** A escala e o modelo são inspirados no 16Personalities, mas as
  perguntas e descrições são nossas. Quem quiser o resultado oficial deve fazer o teste no
  site: <https://www.16personalities.com/br>.
- **Resultado é autodeclarado.** O aluno pode refazer o teste; o perfil guarda o último
  resultado e a data. O professor vê o que o aluno escolheu compartilhar, não uma avaliação
  independente.
- **Privacidade.** A foto e o resultado ficam restritos ao aluno e ao professor; a lista de
  frequência é visível apenas para o professor. A página `/privacidade` explica o restante.
- **Uso em sala.** A personalidade serve para o professor conhecer a turma e adaptar
  exemplos e dinâmicas; não deve ser critério de nota nem de frequência.

## 6. Como testar e evoluir

```bash
pnpm test:personalidade   # banco de perguntas, cálculo, 16 tipos, validação e grupos
pnpm lint                 # TypeScript
pnpm build                # produção
```

Arquivos principais:

| Arquivo | Papel |
|---|---|
| `src/lib/personalidade.ts` | afirmações, escala, tipos, grupos, cálculo e validação |
| `src/lib/types.ts` | tipos `ResultadoPersonalidade`, `DimensoesPersonalidade`, `Frequencia` |
| `src/components/TestePersonalidade.tsx` | questionário e cartão de resultado |
| `src/components/Personalidade.tsx` | selo e legenda de cores |
| `src/components/FotoPerfil.tsx` | envio, remoção e leitura da foto |
| `src/lib/dadosSupabase.ts` | RPCs, Storage e consultas de frequência |
| `src/lib/dadosDemo.ts` | versão de demonstração, com quatro perfis de exemplo |

Se as afirmações mudarem, atualize `PERGUNTAS` e o campo `versao` do resultado. Resultados
antigos continuam válidos para exibição; a versão permite distinguir os questionários no
futuro. Não altere o significado de um código já publicado sem uma migration e uma nota de
versão.

## 7. Atribuição

- Modelo de 16 tipos e nomes de grupos/tipos: [16Personalities](https://www.16personalities.com/br)
  (NERIS Type Explorer®). Este app não é afiliado nem endossado pelo site.
- Método de investigação por engenharia reversa assistida: [morluto/rea](https://github.com/morluto/rea).
- Perguntas, textos de descrição e implementação: equipe do projeto
  “Análise de Dados para Biocientistas” (UFJF/GV), 2026.
