#!/usr/bin/env node
/**
 * A foto que sai do celular e chega ao app.
 *
 *   pnpm e2e:foto
 *
 * Uma câmera de celular produz 12 MP (4032×3024) e 4 a 8 MB. Se o app mandasse
 * esse arquivo como veio, três coisas quebrariam: o limite de corpo das funções
 * da Vercel (4,5 MB), o tempo de envio no 4G da sala de aula e o custo do OCR.
 * Por isso a foto é reduzida no próprio navegador para no máximo 1800 px de lado
 * e JPEG 85% antes de subir.
 *
 * Este teste gera uma foto sintética de 12 MP **ruidosa** (ruído não comprime:
 * é o pior caso para o JPEG), joga no seletor de arquivo como o aluno faria e
 * confere o que a tela mostra: dimensão reduzida, lado maior ≤ 1800, peso final
 * abaixo de 1 MB e tempo de processamento compatível com um celular.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const raiz = join(import.meta.dirname, '..')
const PORTA = 3214
const WEB = `http://127.0.0.1:${PORTA}`
const SAIDA = join(raiz, 'e2e', 'resultados')
mkdirSync(SAIDA, { recursive: true })

const LARGURA_FOTO = 4032
const ALTURA_FOTO = 3024
const LADO_MAXIMO = 1800
const PESO_MAXIMO = 1_000_000 // 1 MB, com folga sobre o JPEG 85% de uma folha
const TEMPO_MAXIMO = 8000 // ms, medido no computador; celular é mais lento

const fila = []
const checagens = []

function registrar(nome, ok, detalhe) {
  checagens.push({ nome, ok })
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
}

function rodar(cmd, args, env = {}) {
  const p = spawn(cmd, args, { cwd: raiz, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let saida = ''
  p.stdout.on('data', (d) => (saida += d))
  p.stderr.on('data', (d) => (saida += d))
  fila.push(() => p.kill('SIGTERM'))
  return { processo: p, saida: () => saida }
}

async function esperarHttp(url, tentativas = 160) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const r = await fetch(url)
      if (r.ok || r.status === 404) return
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`servidor não respondeu em ${url}`)
}

/**
 * Foto sintética de 12 MP com ruído: cada pixel é aleatório, então o JPEG não
 * consegue comprimir quase nada — o pior caso possível.
 */
async function gerarFotoGrande(page) {
  const base64 = await page.evaluate(
    async ({ largura, altura }) => {
      const canvas = document.createElement('canvas')
      canvas.width = largura
      canvas.height = altura
      const ctx = canvas.getContext('2d')
      const dados = ctx.createImageData(largura, altura)
      let semente = 123456789
      for (let i = 0; i < dados.data.length; i += 4) {
        semente = (semente * 1103515245 + 12345) & 0x7fffffff
        const tom = 150 + (semente % 90)
        dados.data[i] = tom
        dados.data[i + 1] = tom - 20
        dados.data[i + 2] = tom - 40
        dados.data[i + 3] = 255
      }
      ctx.putImageData(dados, 0, 0)
      return canvas.toDataURL('image/jpeg', 0.95).split(',')[1]
    },
    { largura: LARGURA_FOTO, altura: ALTURA_FOTO },
  )
  const caminho = join(SAIDA, 'foto-12mp.jpg')
  writeFileSync(caminho, Buffer.from(base64, 'base64'))
  return caminho
}

let codigo = 1
try {
  console.log('\n  Foto do celular · compressão antes do envio\n')

  const build = rodar('npx', ['vite', 'build', '--outDir', 'dist-demo', '--logLevel', 'error'], { VITE_MODO_DEMO: '1' })
  await new Promise((ok, falha) => {
    build.processo.on('exit', (c) => (c === 0 ? ok() : falha(new Error(`build falhou:\n${build.saida()}`))))
  })

  const preview = rodar('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORTA), '--strictPort'])
  await esperarHttp(WEB)

  const navegador = await chromium.launch()
  const page = await navegador.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })

  const fotoGrande = await gerarFotoGrande(page)
  const { size: pesoOriginal } = await import('node:fs').then((fs) => fs.statSync(fotoGrande))
  console.log(`  · foto de teste: ${LARGURA_FOTO}×${ALTURA_FOTO} · ${(pesoOriginal / 1024 / 1024).toFixed(1)} MB\n`)
  registrar(
    'a foto de teste é maior que o limite de 4,5 MB da Vercel',
    pesoOriginal > 4.5 * 1024 * 1024,
    `${(pesoOriginal / 1024 / 1024).toFixed(1)} MB`,
  )

  await page.goto(WEB, { waitUntil: 'networkidle' })
  await page.getByLabel('E-mail').fill('aluno@demo.local')
  await page.getByLabel('Senha', { exact: true }).fill('demo12345')
  await page.getByRole('button', { name: /Entrar/ }).click()
  await page.waitForTimeout(1200)
  await page.goto(`${WEB}/avaliacoes/av-demo-2/enviar`, { waitUntil: 'networkidle' })

  const arquivos = page.locator('input[type=file]')
  await arquivos.first().waitFor({ state: 'attached', timeout: 20000 })
  const inicio = Date.now()
  await arquivos.nth((await arquivos.count()) - 1).setInputFiles(fotoGrande)
  const legenda = page.getByText(/^\d+×\d+ · \d+ KB$/)
  await legenda.waitFor({ timeout: TEMPO_MAXIMO + 12000 })
  const tempo = Date.now() - inicio
  const texto = (await legenda.textContent()) ?? ''
  await page.screenshot({ path: join(SAIDA, '31-foto-comprimida.png') })

  const [, largura, altura, kb] = texto.match(/^(\d+)×(\d+) · (\d+) KB$/) ?? []
  const ladoMaior = Math.max(Number(largura), Number(altura))
  const pesoFinal = Number(kb) * 1024

  registrar('a tela mostra a foto processada', Boolean(largura), texto)
  registrar(
    'o lado maior foi reduzido para no máximo 1800 px',
    ladoMaior > 0 && ladoMaior <= LADO_MAXIMO,
    `${largura}×${altura}`,
  )
  registrar('a proporção da folha foi mantida', Math.abs(Number(largura) / Number(altura) - LARGURA_FOTO / ALTURA_FOTO) < 0.01, `${(Number(largura) / Number(altura)).toFixed(3)}`)
  registrar(
    'o arquivo final ficou abaixo de 1 MB',
    pesoFinal > 0 && pesoFinal < PESO_MAXIMO,
    `${kb} KB (era ${(pesoOriginal / 1024 / 1024).toFixed(1)} MB)`,
  )
  registrar(
    'a redução foi de pelo menos 80%',
    pesoFinal / pesoOriginal < 0.2,
    `${(100 - (pesoFinal / pesoOriginal) * 100).toFixed(1)}% menor`,
  )
  registrar('o processamento terminou dentro do tempo', tempo < TEMPO_MAXIMO, `${tempo} ms`)

  // a foto precisa continuar utilizável: o botão de seguir aparece e a imagem renderiza
  const seguir = page.getByRole('button', { name: 'Usar esta foto' })
  registrar('o botão "Usar esta foto" aparece', await seguir.isVisible())
  const renderizou = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find((i) => i.src.startsWith('blob:'))
    return Boolean(img && img.naturalWidth > 0)
  })
  registrar('a pré-visualização renderiza a foto', renderizou)

  // ---- o arquivo que o navegador não abre --------------------------------
  // HEIC é o padrão do iPhone e Chrome/Firefox/Android não decodificam. O aluno
  // precisa saber o que fazer, não que "deu erro".
  const seletorGaleria = arquivos.last()
  await seletorGaleria.setInputFiles({
    name: 'IMG_0042.HEIC',
    mimeType: 'image/heic',
    buffer: Buffer.from('nao e uma imagem de verdade'),
  })
  const erroHeic = page.getByText(/HEIC, o formato padrão do iPhone/)
  await erroHeic.waitFor({ timeout: 20000 })
  const textoHeic = (await erroHeic.textContent()) ?? ''
  registrar('HEIC sem suporte é reconhecido pelo nome', /HEIC/.test(textoHeic))
  registrar('a mensagem manda tocar em "Tirar foto"', /Tirar foto/.test(textoHeic))
  registrar('a mensagem explica o ajuste do iPhone', /Ajustes/.test(textoHeic) && /Mais compatível/.test(textoHeic))
  await page.screenshot({ path: join(SAIDA, '32-foto-heic.png') })

  // A foto boa que já estava escolhida não pode ser perdida por causa da tentativa.
  const fotoAntes = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find((i) => i.src.startsWith('blob:'))
    return img ? img.getAttribute('src') : null
  })
  registrar('a foto anterior continua na tela depois da falha', Boolean(fotoAntes))

  // Corrompida com extensão suportada: a mensagem é a genérica, não a do HEIC.
  await seletorGaleria.setInputFiles({
    name: 'quebrada.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('lixo'),
  })
  const erroGenerico = page.getByText(/Formatos aceitos: JPG, PNG ou WEBP/)
  await erroGenerico.waitFor({ timeout: 20000 })
  registrar('arquivo corrompido não é tratado como HEIC', (await erroHeic.count()) === 0)

  // E o seletor volta a funcionar: a próxima escolha válida substitui o erro.
  await seletorGaleria.setInputFiles(fotoGrande)
  await legenda.waitFor({ timeout: TEMPO_MAXIMO + 12000 })
  registrar(
    'depois do erro, uma foto válida volta a ser aceita',
    /^\d+×\d+ · \d+ KB$/.test((await legenda.textContent()) ?? ''),
    (await legenda.textContent()) ?? '',
  )
  registrar('a mensagem de erro sai quando a foto é aceita', (await erroGenerico.count()) === 0)

  await navegador.close()

  const falhas = checagens.filter((c) => !c.ok).length
  console.log('')
  if (falhas > 0) {
    console.log(`\x1b[31m${falhas} de ${checagens.length} verificações falharam.\x1b[0m\n`)
    codigo = 1
  } else {
    console.log(`\x1b[32m${checagens.length} verificações da foto passaram.\x1b[0m\n`)
    codigo = 0
  }
} catch (e) {
  console.error(`\n  ✗ ${e.message}\n`)
} finally {
  for (const parar of fila) parar()
}
process.exit(codigo)
