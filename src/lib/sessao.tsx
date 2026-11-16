import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dados as obterDados, type Dados } from './dados'
import type { Perfil } from './types'

interface CtxSessao {
  d: Dados | null
  perfil: Perfil | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<Perfil>
  sair: () => Promise<void>
  recarregar: () => Promise<void>
}

const Ctx = createContext<CtxSessao | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [d, setD] = useState<Dados | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    // `ativo` fica na closure do efeito: no StrictMode o efeito roda duas vezes e
    // um `ref` compartilhado deixaria a segunda execução permanentemente cancelada
    // (a tela ficaria presa em "Abrindo…").
    let ativo = true
    let desinscrever: (() => void) | undefined
    ;(async () => {
      try {
        const instancia = await obterDados()
        if (!ativo) return
        setD(instancia)
        const atual = await instancia.sessaoAtual()
        if (!ativo) return
        setPerfil(atual)
        desinscrever = instancia.observarSessao((p) => {
          if (ativo) setPerfil(p)
        })
      } catch (erro) {
        console.error('Falha ao iniciar a sessão', erro)
      } finally {
        if (ativo) setCarregando(false)
      }
    })()
    return () => {
      ativo = false
      desinscrever?.()
    }
  }, [])

  const entrar = useCallback(
    async (email: string, senha: string) => {
      if (!d) throw new Error('Aplicativo ainda iniciando. Tente de novo em instantes.')
      const p = await d.entrar(email, senha)
      setPerfil(p)
      return p
    },
    [d],
  )

  const sair = useCallback(async () => {
    if (!d) return
    await d.sair()
    setPerfil(null)
  }, [d])

  const recarregar = useCallback(async () => {
    if (!d) return
    setPerfil(await d.sessaoAtual())
  }, [d])

  const valor = useMemo<CtxSessao>(
    () => ({ d, perfil, carregando, entrar, sair, recarregar }),
    [d, perfil, carregando, entrar, sair, recarregar],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function usarSessao(): CtxSessao {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usarSessao precisa estar dentro de ProvedorSessao')
  return ctx
}

/** Atalho: exige um perfil carregado. */
export function usarPerfil(): Perfil {
  const { perfil } = usarSessao()
  if (!perfil) throw new Error('Sessão sem perfil')
  return perfil
}
