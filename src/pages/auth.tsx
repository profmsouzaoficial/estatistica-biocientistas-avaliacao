import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowRight, BookOpen, KeyRound, Mail } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { usarRota } from '../lib/router'
import { Link } from '../lib/router'
import { Alerta, Botao, Campo, Selecao } from '../components/ui'
import type { Turma } from '../lib/types'
import type { MotivoValidacao } from '../lib/dados'

// ---------------------------------------------------------------------------
// Moldura comum das telas de entrada
// ---------------------------------------------------------------------------

export function MolduraAuth({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-verde text-white shadow-sm">
          <BookOpen className="size-6" aria-hidden />
        </div>
        <h1 className="font-serif text-[24px] leading-tight text-tinta">Avaliações</h1>
        <p className="mt-1 text-[13.5px] text-tinta-suave">Análise de Dados para Biocientistas · UFJF/GV</p>
      </div>
      {children}
      {rodape ? <div className="mt-6">{rodape}</div> : null}
      <p className="mt-8 text-center text-[11.5px] leading-relaxed text-tinta-fraca">
        Uso restrito a estudantes matriculados. Seus dados são usados apenas para avaliação
        e lançamento de notas.
      </p>
    </div>
  )
}

const mensagens: Record<MotivoValidacao, string> = {
  ok: '',
  matricula: 'Matrícula não encontrada nesta turma. Confira o número (com as letras do final, se houver) ou fale com o professor.',
  email: 'Este e-mail não é o que consta na lista da turma. Use o e-mail institucional cadastrado.',
  ja_cadastrado: 'Esta matrícula já tem cadastro. Use "Esqueci minha senha" para recuperar o acesso.',
  dados_incompletos: 'Preencha turma, matrícula e e-mail.',
  sem_email_na_lista:
    'A lista desta turma ainda não tem os e-mails. Peça ao professor para conferir a lista — ou avise que o cadastro está bloqueado.',
  erro: 'Não foi possível validar agora. Tente novamente.',
}

// ---------------------------------------------------------------------------

export function Entrar() {
  const { entrar, d } = usarSessao()
  const { navegar } = usarRota()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const demo = d?.modo === 'demo'

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(email, senha)
      navegar('/')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao entrar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MolduraAuth
      rodape={
        <div className="space-y-2 text-center text-[14px]">
          <p className="text-tinta-suave">
            Primeira vez aqui?{' '}
            <Link href="/cadastrar" className="font-medium text-verde underline-offset-2 hover:underline">
              Criar conta
            </Link>
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <Link href="/recuperar" className="text-[13px] text-tinta-suave underline-offset-2 hover:underline">
              Esqueci minha senha
            </Link>
            <Link href="/ajuda" className="text-[13px] text-tinta-suave underline-offset-2 hover:underline">
              Como enviar minha redação
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={submeter} className="space-y-4">
        <Campo
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@estudante.ufjf.br"
        />
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="••••••••"
        />
        {erro ? (
          <div className="flex items-start gap-2 rounded-xl bg-vermelho-claro px-3 py-2.5 text-[13.5px] text-vermelho">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{erro}</span>
          </div>
        ) : null}
        <Botao type="submit" largo carregando={enviando}>
          Entrar
        </Botao>
      </form>

      {demo ? (
        <div className="mt-5 rounded-xl border border-borda bg-white p-3.5 text-[13px] leading-relaxed text-tinta-suave">
          <p className="font-medium text-tinta">Modo demonstração</p>
          <p className="mt-1">
            Aluno: <code className="rounded bg-papel-fundo px-1 py-0.5">aluno@demo.local</code> · Professor:{' '}
            <code className="rounded bg-papel-fundo px-1 py-0.5">professor@demo.local</code>
            <br />
            Senha: <code className="rounded bg-papel-fundo px-1 py-0.5">demo12345</code>
          </p>
        </div>
      ) : null}
    </MolduraAuth>
  )
}

// ---------------------------------------------------------------------------

export function Cadastrar() {
  const { d } = usarSessao()
  const { navegar } = usarRota()
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [turmaId, setTurmaId] = useState('')
  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')
  const [email, setEmail] = useState('')
  const [curso, setCurso] = useState('Ciências Biológicas')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [consentiu, setConsentiu] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    d?.turmas()
      .then((t) => {
        setTurmas(t)
        if (t.length === 1) setTurmaId(t[0].id)
      })
      .catch(() => setErro('Não foi possível carregar as turmas.'))
  }, [d])

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setErro(null)
    setAviso(null)

    if (senha.length < 8) return setErro('A senha precisa ter ao menos 8 caracteres.')
    if (senha !== senha2) return setErro('As duas senhas não conferem.')
    if (!turmaId) return setErro('Escolha sua turma.')
    if (!consentiu) {
      return setErro('Para criar a conta, leia o aviso de privacidade e marque a caixa de concordância.')
    }

    setEnviando(true)
    try {
      const motivo = await d.validarMatricula(turmaId, matricula, email)
      if (motivo !== 'ok') return setErro(mensagens[motivo])

      const r = await d.cadastrar({
        nome_completo: nome,
        matricula,
        email,
        curso,
        turma_id: turmaId,
        senha,
        consentimento: consentiu,
      })
      if (r.precisaConfirmarEmail) {
        setAviso('Conta criada! Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, volte e entre.')
      } else {
        navegar('/')
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar a conta.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MolduraAuth
      rodape={
        <p className="text-center text-[14px] text-tinta-suave">
          Já tem conta?{' '}
          <Link href="/entrar" className="font-medium text-verde underline-offset-2 hover:underline">
            Entrar
          </Link>
        </p>
      }
    >
      <form onSubmit={submeter} className="space-y-4">
        <Selecao rotulo="Turma" value={turmaId} onChange={(e) => setTurmaId(e.target.value)} required>
          <option value="">Selecione…</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} · {t.periodo}
            </option>
          ))}
        </Selecao>
        <Campo
          rotulo="Nome completo"
          autoComplete="name"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Como consta na lista da turma"
        />
        <Campo
          rotulo="Matrícula"
          required
          value={matricula}
          // o SIGA em GV usa dígitos + sufixo do campus (202506007GV): deixa letras
          onChange={(e) =>
            setMatricula(e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 16))
          }
          placeholder="2026301001 ou 202506007GV"
          autoCapitalize="characters"
          autoComplete="username"
          dica="A matrícula precisa ser igual à da lista da turma — é por ela que a nota chega ao SIGA. Pode digitar as letras do final em minúsculas."
        />
        <Campo
          rotulo="E-mail institucional"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@estudante.ufjf.br"
          dica="Precisa ser o mesmo e-mail informado ao professor na lista da turma."
        />
        <Campo rotulo="Curso" required value={curso} onChange={(e) => setCurso(e.target.value)} />
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete="new-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          dica="Mínimo de 8 caracteres."
        />
        <Campo
          rotulo="Repita a senha"
          type="password"
          autoComplete="new-password"
          required
          value={senha2}
          onChange={(e) => setSenha2(e.target.value)}
        />

        <label className="flex items-start gap-2.5 rounded-xl bg-papel-fundo px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-verde)]"
            checked={consentiu}
            onChange={(e) => setConsentiu(e.target.checked)}
          />
          <span className="text-[13px] leading-snug text-tinta-suave">
            Li o{' '}
            <a
              href="/privacidade"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-verde underline-offset-2 hover:underline"
            >
              aviso de privacidade
            </a>{' '}
            e concordo com o uso dos meus dados (nome, matrícula, e-mail, foto e texto da redação) para corrigir a
            redação e lançar a nota no SIGA.
          </span>
        </label>

        {erro ? (
          <div className="flex items-start gap-2 rounded-xl bg-vermelho-claro px-3 py-2.5 text-[13.5px] text-vermelho">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{erro}</span>
          </div>
        ) : null}
        {aviso ? <Alerta tom="verde">{aviso}</Alerta> : null}

        <Botao type="submit" largo carregando={enviando} disabled={!consentiu}>
          Criar conta
        </Botao>
      </form>
    </MolduraAuth>
  )
}

// ---------------------------------------------------------------------------

export function Recuperar() {
  const { d } = usarSessao()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setErro(null)
    setEnviando(true)
    try {
      await d.recuperarSenha(email)
      setEnviado(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <MolduraAuth
      rodape={
        <p className="text-center text-[14px]">
          <Link href="/entrar" className="text-verde underline-offset-2 hover:underline">
            Voltar para o login
          </Link>
        </p>
      }
    >
      {enviado ? (
        <Alerta tom="verde" titulo="Link enviado">
          Se existir uma conta com <strong>{email}</strong>, o e-mail de recuperação chega em instantes. Confira também a
          caixa de spam.
        </Alerta>
      ) : (
        <form onSubmit={submeter} className="space-y-4">
          <p className="text-[14px] leading-snug text-tinta-suave">
            Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
          </p>
          <Campo
            rotulo="E-mail"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}
          <Botao type="submit" largo carregando={enviando} icone={<Mail className="size-4" />}>
            Enviar link
          </Botao>
        </form>
      )}
    </MolduraAuth>
  )
}

// ---------------------------------------------------------------------------

export function Redefinir() {
  const { d } = usarSessao()
  const { navegar } = usarRota()
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    if (senha.length < 8) return setErro('A senha precisa ter ao menos 8 caracteres.')
    if (senha !== senha2) return setErro('As duas senhas não conferem.')
    setEnviando(true)
    setErro(null)
    try {
      await d.alterarSenha(senha)
      setPronto(true)
      setTimeout(() => navegar('/'), 1200)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao alterar a senha.')
    } finally {
      setEnviando(false)
    }
  }

  if (pronto) {
    return (
      <MolduraAuth>
        <Alerta tom="verde" titulo="Senha alterada">
          Tudo certo. Estamos abrindo o aplicativo…
        </Alerta>
      </MolduraAuth>
    )
  }

  return (
    <MolduraAuth>
      <form onSubmit={submeter} className="space-y-4">
        <div className="flex items-center gap-2 text-tinta">
          <KeyRound className="size-5" aria-hidden />
          <p className="font-medium">Definir nova senha</p>
        </div>
        <Campo
          rotulo="Nova senha"
          type="password"
          autoComplete="new-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          dica="Mínimo de 8 caracteres."
        />
        <Campo
          rotulo="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          required
          value={senha2}
          onChange={(e) => setSenha2(e.target.value)}
        />
        {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}
        <Botao type="submit" largo carregando={enviando} icone={<ArrowRight className="size-4" />}>
          Salvar nova senha
        </Botao>
      </form>
    </MolduraAuth>
  )
}
