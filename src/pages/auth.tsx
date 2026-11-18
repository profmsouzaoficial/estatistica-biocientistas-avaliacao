import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowRight, KeyRound, Mail } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { limparAvisoDoLink, lerAvisoDoLink, type ErroDoLink } from '../lib/linkRecuperacao'
import { usarRota } from '../lib/router'
import { Link } from '../lib/router'
import { Alerta, Botao, BrasaoUFJF, Campo, Selecao } from '../components/ui'
import type { Turma } from '../lib/types'
import type { ConsultaMatricula, MotivoValidacao } from '../lib/dados'

// ---------------------------------------------------------------------------
// Moldura comum das telas de entrada
// ---------------------------------------------------------------------------

export function MolduraAuth({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7 text-center">
        <BrasaoUFJF className="mx-auto mb-2 h-24 drop-shadow-sm" alt="Brasão da Universidade Federal de Juiz de Fora" />
        <div className="mx-auto mb-3 h-0.5 w-10 rounded-full bg-dourado/70" aria-hidden />
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
            <Link href="/cadastrar" className="font-medium text-marinho underline-offset-2 hover:underline">
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

      <div className="mt-4 rounded-xl border border-azul/20 bg-azul-claro px-3.5 py-3 text-[13px] leading-snug text-azul">
        <p className="font-medium">Primeiro acesso do aluno</p>
        <p className="mt-0.5">
          Alunos pré-cadastrados usam o e-mail institucional nos dois campos: a senha inicial é o
          mesmo e-mail, e o app pede a troca por uma senha só sua. Professores usam a senha definida
          no cadastro.
        </p>
      </div>

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

  // Conferência da matrícula na lista da turma (alunos_esperados).
  const [consulta, setConsulta] = useState<ConsultaMatricula | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [erroConsulta, setErroConsulta] = useState<string | null>(null)
  // A lista pode vir sem e-mail (turma que permite); aí o aluno digita o dele.
  const [emailEditavel, setEmailEditavel] = useState(false)

  useEffect(() => {
    d?.turmas()
      .then((t) => {
        setTurmas(t)
        if (t.length === 1) setTurmaId(t[0].id)
      })
      .catch(() => setErro('Não foi possível carregar as turmas.'))
  }, [d])

  // Espera o aluno terminar de digitar e confere sozinho: com turma + matrícula
  // válidas, nome/e-mail/curso vêm da lista e o aluno só escolhe a senha.
  useEffect(() => {
    setConsulta(null)
    setErroConsulta(null)
    if (!d || !turmaId || matricula.trim().length < 6) {
      setConferindo(false)
      return
    }
    let vivo = true
    const timer = setTimeout(async () => {
      setConferindo(true)
      try {
        const r = await d.consultarMatricula(turmaId, matricula)
        if (!vivo) return
        setConsulta(r)
        if (r.ok && !r.ja_cadastrado) {
          setNome(r.nome ?? '')
          setEmail(r.email ?? '')
          setCurso(r.curso ?? 'Ciências Biológicas')
          setEmailEditavel(!r.email)
        } else {
          setEmailEditavel(false)
          if (!r.ok) setNome('')
        }
      } catch (e) {
        if (!vivo) return
        setConsulta(null)
        setErroConsulta(e instanceof Error ? e.message : 'Não consegui conferir a matrícula agora.')
      } finally {
        if (vivo) setConferindo(false)
      }
    }, 450)
    return () => {
      vivo = false
      clearTimeout(timer)
    }
  }, [d, turmaId, matricula])

  const podeCriar = consulta?.ok === true && consulta.ja_cadastrado !== true

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setErro(null)
    setAviso(null)

    if (!turmaId) return setErro('Escolha sua turma.')
    if (!consulta?.ok || consulta.ja_cadastrado) {
      return setErro('Confira a matrícula na lista da turma antes de criar a conta.')
    }
    if (senha.length < 8) return setErro('A senha precisa ter ao menos 8 caracteres.')
    if (senha !== senha2) return setErro('As duas senhas não conferem.')
    if (!email.trim()) return setErro('Informe o e-mail institucional.')
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

  const jaTemConta = consulta?.ok === true && consulta.ja_cadastrado === true

  return (
    <MolduraAuth
      rodape={
        <p className="text-center text-[14px] text-tinta-suave">
          Já tem conta?{' '}
          <Link href="/entrar" className="font-medium text-marinho underline-offset-2 hover:underline">
            Entrar
          </Link>
        </p>
      }
    >
      <form onSubmit={submeter} className="space-y-4">
        <p className="text-[13px] leading-snug text-tinta-suave">
          Escolha a turma e digite a matrícula: o app confere na lista do professor e preenche nome, e-mail e
          curso. Você só define a senha.
        </p>

        <Selecao rotulo="Turma" value={turmaId} onChange={(e) => setTurmaId(e.target.value)} required>
          <option value="">Selecione…</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.codigo_siga} · {t.periodo}
            </option>
          ))}
        </Selecao>

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

        {conferindo ? (
          <p className="text-[12.5px] text-tinta-suave">Conferindo a matrícula na lista da turma…</p>
        ) : null}

        {consulta && !consulta.ok ? (
          <Alerta tom="vermelho">
            {consulta.motivo === 'matricula'
              ? 'Matrícula não encontrada nesta turma. Confira o número (com as letras do final, se houver) ou fale com o professor.'
              : 'Informe a turma e a matrícula para conferir.'}
          </Alerta>
        ) : null}

        {erroConsulta ? <Alerta tom="vermelho">{erroConsulta}</Alerta> : null}

        {jaTemConta ? (
          <Alerta tom="dourado">
            <p className="font-medium">Esta matrícula já tem conta.</p>
            <p className="mt-1">
              Entre com o e-mail institucional
              {consulta?.email_mascarado ? (
                <>
                  {' '}
                  (<strong>{consulta.email_mascarado}</strong>)
                </>
              ) : null}{' '}
              e a senha inicial — que é o mesmo e-mail. Se já trocou a senha, use a senha nova.
            </p>
            <Link
              href="/entrar"
              className="mt-2 inline-flex items-center gap-1 font-medium text-marinho underline-offset-2 hover:underline"
            >
              Ir para entrar
            </Link>
          </Alerta>
        ) : null}

        {podeCriar ? (
          <Alerta tom="marinho">
            Matrícula encontrada na lista da turma. Confira seus dados e defina a senha.
          </Alerta>
        ) : null}

        {!jaTemConta ? (
          <>
            <Campo
              rotulo="Nome completo"
              autoComplete="name"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como consta na lista da turma"
              disabled={!podeCriar}
              readOnly={podeCriar}
              dica={podeCriar ? 'Veio da lista da turma. Se estiver errado, fale com o professor.' : undefined}
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
              disabled={!podeCriar}
              readOnly={podeCriar && !emailEditavel}
              dica={
                emailEditavel && podeCriar
                  ? 'A lista desta turma não tinha seu e-mail. Digite o e-mail institucional.'
                  : 'Preenchido a partir da lista da turma.'
              }
            />
            <Campo
              rotulo="Curso"
              required
              value={curso}
              onChange={(e) => setCurso(e.target.value)}
              disabled={!podeCriar}
              readOnly={podeCriar}
            />
            <Campo
              rotulo="Senha"
              type="password"
              autoComplete="new-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              dica="Mínimo de 8 caracteres."
              disabled={!podeCriar}
            />
            <Campo
              rotulo="Repita a senha"
              type="password"
              autoComplete="new-password"
              required
              value={senha2}
              onChange={(e) => setSenha2(e.target.value)}
              disabled={!podeCriar}
            />

            <label className="flex items-start gap-2.5 rounded-xl bg-papel-fundo px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-marinho)]"
                checked={consentiu}
                onChange={(e) => setConsentiu(e.target.checked)}
              />
              <span className="text-[13px] leading-snug text-tinta-suave">
                Li o{' '}
                <a
                  href="/privacidade"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-marinho underline-offset-2 hover:underline"
                >
                  aviso de privacidade
                </a>{' '}
                e concordo com o uso dos meus dados (nome, matrícula, e-mail, foto e texto da redação) para corrigir a
                redação e lançar a nota no SIGA.
              </span>
            </label>
          </>
        ) : null}


        {erro ? (
          <div className="flex items-start gap-2 rounded-xl bg-vermelho-claro px-3 py-2.5 text-[13.5px] text-vermelho">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{erro}</span>
          </div>
        ) : null}
        {aviso ? <Alerta tom="marinho">{aviso}</Alerta> : null}

        {!jaTemConta ? (
          <Botao type="submit" largo carregando={enviando} disabled={!consentiu || !podeCriar}>
            Criar conta
          </Botao>
        ) : null}
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
  // recado deixado pelo roteador quando o link de recuperação falhou
  const [avisoDoLink, setAvisoDoLink] = useState<ErroDoLink | null>(null)
  useEffect(() => {
    setAvisoDoLink(lerAvisoDoLink())
  }, [])

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setErro(null)
    setEnviando(true)
    try {
      await d.recuperarSenha(email)
      limparAvisoDoLink()
      setAvisoDoLink(null)
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
          <Link href="/entrar" className="text-marinho underline-offset-2 hover:underline">
            Voltar para o login
          </Link>
        </p>
      }
    >
      {enviado ? (
        <Alerta tom="marinho" titulo="Link enviado">
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
          {avisoDoLink ? (
            <Alerta tom="vermelho" titulo="O link não funcionou">
              {avisoDoLink.mensagem}
            </Alerta>
          ) : null}
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
  const { d, perfil } = usarSessao()
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
        <Alerta tom="marinho" titulo="Senha alterada">
          Tudo certo. Estamos abrindo o aplicativo…
        </Alerta>
      </MolduraAuth>
    )
  }

  // Sem sessão não há o que salvar: o link já foi usado, expirou ou a pessoa
  // abriu /redefinir direto. Melhor dizer isso do que mostrar um formulário
  // que vai falhar em inglês.
  if (!perfil) {
    return (
      <MolduraAuth>
        <div className="space-y-4">
          <Alerta tom="vermelho" titulo="Abra o link do e-mail">
            Para definir uma nova senha, use o link que enviamos para o seu e-mail. Se ele expirou, peça outro.
          </Alerta>
          <Link href="/recuperar" className="block text-center text-[14px] text-marinho underline-offset-2 hover:underline">
            Pedir um link novo
          </Link>
        </div>
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
