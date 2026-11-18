import { useEffect, type ReactNode } from 'react'
import { CalendarCheck, ClipboardList, LayoutDashboard, UserRound, Users } from 'lucide-react'
import { ProvedorRota, casarRota, usarRota, Link } from './lib/router'
import { ProvedorSessao, usarSessao } from './lib/sessao'
import { guardarAvisoDoLink, lerErroDoLink } from './lib/linkRecuperacao'
import { Carregando } from './components/ui'
import { Cadastrar, Entrar, Recuperar, Redefinir } from './pages/auth'
import { AlunoAvaliacao, AlunoInicio } from './pages/aluno'
import { AlunoEnvio } from './pages/alunoEnvio'
import { Devolutiva } from './pages/devolutiva'
import { Perfil } from './pages/perfil'
import { ProfessorInicio, ProfessorNovaAvaliacao } from './pages/professor'
import { ProfessorAvaliacao, ProfessorRevisao } from './pages/professorAvaliacao'
import { ProfessorHistorico } from './pages/professorHistorico'
import { ProfessorAlunos } from './pages/professorAlunos'
import { ProfessorFrequencia } from './pages/professorFrequencia'
import { Ajuda } from './pages/ajuda'
import { Privacidade } from './pages/privacidade'

// /privacidade é pública mas não redireciona quem já está logado: o aviso
// precisa ser legível antes de criar a conta e depois, a qualquer momento.
const PUBLICAS = ['/entrar', '/cadastrar', '/recuperar', '/redefinir', '/privacidade', '/ajuda']

export default function App() {
  return (
    <ProvedorSessao>
      <ProvedorRota>
        <Roteador />
      </ProvedorRota>
    </ProvedorSessao>
  )
}

function Roteador() {
  const { perfil, carregando } = usarSessao()
  const { caminho, navegar } = usarRota()
  const limpo = caminho.split('?')[0]

  useEffect(() => {
    if (carregando) return
    // Link de recuperação que expirou ou já foi usado: o Supabase devolve o erro
    // no hash e nenhuma sessão. Sem isto, a pessoa cai no login sem explicação.
    const erroDoLink = lerErroDoLink(window.location.hash, window.location.search)
    if (erroDoLink) {
      guardarAvisoDoLink(erroDoLink)
      window.history.replaceState({}, '', window.location.pathname)
      navegar('/recuperar')
      return
    }
    if (window.location.hash.includes('type=recovery') && perfil) {
      navegar('/redefinir')
      return
    }
    if (!perfil && !PUBLICAS.includes(limpo)) {
      navegar('/entrar')
      return
    }
    if (
      perfil &&
      PUBLICAS.includes(limpo) &&
      limpo !== '/redefinir' &&
      limpo !== '/recuperar' &&
      limpo !== '/privacidade' &&
      limpo !== '/ajuda'
    ) {
      navegar('/')
    }
  }, [carregando, perfil, limpo, navegar])

  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Carregando texto="Abrindo…" />
      </div>
    )
  }

  if (!perfil) {
    if (limpo === '/privacidade') return <Privacidade />
    if (limpo === '/ajuda') return <Ajuda />
    if (limpo === '/cadastrar') return <Cadastrar />
    if (limpo === '/recuperar') return <Recuperar />
    if (limpo === '/redefinir') return <Redefinir />
    return <Entrar />
  }

  if (limpo === '/redefinir') return <Redefinir />
  // Quem já está conectado também pode receber um link vencido (o celular guarda
  // a sessão). Sem esta linha, o aviso do link sumia e a pessoa voltava ao início.
  if (limpo === '/recuperar') return <Recuperar />
  if (limpo === '/privacidade') return <Privacidade />
  if (limpo === '/ajuda') return <Ajuda />
  if (limpo === '/perfil') return <ComBarra><Perfil /></ComBarra>

  if (perfil.papel === 'professor') {
    if (limpo === '/' || limpo === '') return <ComBarra><ProfessorInicio /></ComBarra>
    if (limpo === '/prof/avaliacoes/nova') return <ComBarra><ProfessorNovaAvaliacao /></ComBarra>
    if (limpo === '/prof/alunos') return <ComBarra><ProfessorAlunos /></ComBarra>
    if (limpo === '/prof/frequencia') return <ComBarra><ProfessorFrequencia /></ComBarra>

    const historico = casarRota('/prof/avaliacoes/:id/historico', caminho)
    if (historico) return <ProfessorHistorico avaliacaoId={historico.id} />

    const revisao = casarRota('/prof/avaliacoes/:id/revisao/:submissao', caminho)
    if (revisao) return <ProfessorRevisao avaliacaoId={revisao.id} submissaoId={revisao.submissao} />

    const avaliacao = casarRota('/prof/avaliacoes/:id', caminho)
    if (avaliacao) return <ComBarra><ProfessorAvaliacao id={avaliacao.id} /></ComBarra>
  }

  if (limpo === '/' || limpo === '') return <ComBarra><AlunoInicio /></ComBarra>

  const enviar = casarRota('/avaliacoes/:id/enviar', caminho)
  if (enviar) return <AlunoEnvio id={enviar.id} />

  const devolutiva = casarRota('/avaliacoes/:id/devolutiva', caminho)
  if (devolutiva) return <Devolutiva id={devolutiva.id} />

  const detalhe = casarRota('/avaliacoes/:id', caminho)
  if (detalhe) return <AlunoAvaliacao id={detalhe.id} />

  return <NaoEncontrado />
}

function ComBarra({ children }: { children: ReactNode }) {
  const { perfil } = usarSessao()
  return (
    <div className="min-h-dvh pb-16">
      {children}
      <BarraInferior papel={perfil?.papel ?? 'aluno'} />
    </div>
  )
}

function BarraInferior({ papel }: { papel: 'aluno' | 'professor' }) {
  const { caminho } = usarRota()
  const limpo = caminho.split('?')[0]

  const itens =
    papel === 'professor'
      ? [
          { href: '/', rotulo: 'Painel', Icone: LayoutDashboard },
          { href: '/prof/frequencia', rotulo: 'Frequência', Icone: CalendarCheck },
          { href: '/prof/alunos', rotulo: 'Alunos', Icone: Users },
          { href: '/perfil', rotulo: 'Perfil', Icone: UserRound },
        ]
      : [
          { href: '/', rotulo: 'Avaliações', Icone: ClipboardList },
          { href: '/perfil', rotulo: 'Perfil', Icone: UserRound },
        ]

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-papel/95 backdrop-blur">
      <div className={`mx-auto flex max-w-2xl ${papel === 'professor' ? 'justify-around' : 'justify-center gap-16'} px-2 py-1.5`}>
        {itens.map(({ href, rotulo, Icone }) => {
          const ativo = href === '/' ? limpo === '/' || limpo.startsWith('/avaliacoes') : limpo.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] ${
                ativo ? 'text-marinho' : 'text-tinta-fraca'
              }`}
            >
              <Icone className="size-5" aria-hidden />
              {rotulo}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function NaoEncontrado() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-serif text-[22px] text-tinta">Página não encontrada</p>
      <p className="text-[14px] text-tinta-suave">O endereço mudou ou não existe.</p>
      <Link href="/" className="text-[14px] font-medium text-marinho underline-offset-2 hover:underline">
        Voltar ao início
      </Link>
    </div>
  )
}
