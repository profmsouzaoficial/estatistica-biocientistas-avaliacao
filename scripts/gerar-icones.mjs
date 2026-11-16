#!/usr/bin/env node
/**
 * Gera os ícones do PWA (192 e 512 px) sem depender de biblioteca de imagem.
 * Desenho: fundo verde, folha de papel branca com linhas — remete a redação.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '')
const saida = join(raiz, 'public')

const VERDE = [15, 95, 82]
const PAPEL = [247, 245, 239]
const TINTA = [22, 33, 31]

function desenhar(tamanho) {
  const px = new Uint8Array(tamanho * tamanho * 4)
  const pintar = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= tamanho || y >= tamanho) return
    const i = (y * tamanho + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }
  const retangulo = (x0, y0, largura, altura, cor, raio = 0) => {
    for (let y = y0; y < y0 + altura; y++) {
      for (let x = x0; x < x0 + largura; x++) {
        if (raio > 0) {
          const dx = Math.min(x - x0, x0 + largura - 1 - x)
          const dy = Math.min(y - y0, y0 + altura - 1 - y)
          if (dx < raio && dy < raio) {
            const cx = raio - dx
            const cy = raio - dy
            if (cx * cx + cy * cy > raio * raio) continue
          }
        }
        pintar(x, y, cor)
      }
    }
  }

  // fundo (com margem de segurança para ícone maskable)
  retangulo(0, 0, tamanho, tamanho, VERDE)

  const margem = Math.round(tamanho * 0.2)
  const larguraFolha = tamanho - margem * 2
  const alturaFolha = Math.round(larguraFolha * 1.25)
  const topo = Math.round((tamanho - alturaFolha) / 2)

  retangulo(margem, topo, larguraFolha, alturaFolha, PAPEL, Math.round(tamanho * 0.03))

  const linhaAltura = Math.max(2, Math.round(tamanho * 0.028))
  const espaco = Math.round(alturaFolha * 0.13)
  const recuo = Math.round(larguraFolha * 0.14)
  const larguraLinha = larguraFolha - recuo * 2
  const primeira = topo + Math.round(alturaFolha * 0.2)

  for (let i = 0; i < 4; i++) {
    const larguraFinal = i === 3 ? Math.round(larguraLinha * 0.55) : larguraLinha
    retangulo(margem + recuo, primeira + i * espaco, larguraFinal, linhaAltura, TINTA)
  }

  return px
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(tipo, dados) {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

function png(tamanho, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamanho, 0)
  ihdr.writeUInt32BE(tamanho, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  const bruto = Buffer.alloc(tamanho * tamanho * 4 + tamanho)
  for (let y = 0; y < tamanho; y++) {
    bruto[y * (tamanho * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * tamanho * 4, tamanho * 4).copy(bruto, y * (tamanho * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(bruto, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const tamanho of [192, 512]) {
  const bytes = png(tamanho, desenhar(tamanho))
  const arquivo = join(saida, `icone-${tamanho}.png`)
  writeFileSync(arquivo, bytes)
  console.log(`  ✓ ${arquivo} (${(bytes.length / 1024).toFixed(1)} KB)`)
}
