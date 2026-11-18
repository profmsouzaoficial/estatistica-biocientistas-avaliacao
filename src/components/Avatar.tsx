import { useEffect, useState } from 'react'

/** Iniciais para quando não há foto (ou a URL assinada expirou). */
export function iniciaisDe(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!partes.length) return '?'
  if (partes.length === 1) return partes[0].slice(0, 1).toUpperCase()
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
}

export function Avatar({
  nome,
  url,
  tamanho = 48,
  cor,
  className = '',
}: {
  nome: string
  url?: string | null
  tamanho?: number
  /** Cor de fundo do fallback; normalmente a cor do grupo de personalidade. */
  cor?: string
  className?: string
}) {
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    setFalhou(false)
  }, [url])

  const estilo = { width: tamanho, height: tamanho, backgroundColor: cor ?? 'var(--color-marinho)' }

  if (url && !falhou) {
    return (
      <img
        src={url}
        alt={`Foto de ${nome}`}
        width={tamanho}
        height={tamanho}
        loading="lazy"
        className={`shrink-0 rounded-full border border-black/5 object-cover ${className}`}
        style={{ width: tamanho, height: tamanho }}
        onError={() => setFalhou(true)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ ...estilo, fontSize: Math.max(11, Math.round(tamanho * 0.33)) }}
    >
      {iniciaisDe(nome)}
    </span>
  )
}
