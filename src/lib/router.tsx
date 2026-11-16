import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface CtxRota {
  caminho: string
  navegar: (destino: string) => void
  voltar: () => void
}

const Ctx = createContext<CtxRota | null>(null)

export function ProvedorRota({ children }: { children: ReactNode }) {
  const [caminho, setCaminho] = useState(() => window.location.pathname + window.location.search)

  useEffect(() => {
    const aoVoltar = () => setCaminho(window.location.pathname + window.location.search)
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  const navegar = useCallback((destino: string) => {
    if (destino === window.location.pathname + window.location.search) return
    window.history.pushState({}, '', destino)
    setCaminho(destino)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  const voltar = useCallback(() => {
    if (window.history.length > 1) window.history.back()
    else navegar('/')
  }, [navegar])

  const valor = useMemo(() => ({ caminho, navegar, voltar }), [caminho, navegar, voltar])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function usarRota(): CtxRota {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usarRota precisa estar dentro de ProvedorRota')
  return ctx
}

/** Casa "/avaliacoes/:id/enviar" com "/avaliacoes/abc/enviar". */
export function casarRota(padrao: string, caminho: string): Record<string, string> | null {
  const a = padrao.split('/').filter(Boolean)
  const b = caminho.split('?')[0].split('/').filter(Boolean)
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}

export function Link({
  href,
  children,
  className,
  onClick,
}: {
  href: string
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const { navegar } = usarRota()
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        onClick?.()
        navegar(href)
      }}
    >
      {children}
    </a>
  )
}
