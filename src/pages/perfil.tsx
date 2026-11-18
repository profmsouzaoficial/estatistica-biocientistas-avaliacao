import { useState } from 'react'
import { LogOut, ShieldCheck } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { usarRota } from '../lib/router'
import { Alerta, AppBar, Botao, Campo, Cartao } from '../components/ui'

export function Perfil() {
  const { d, perfil, sair, recarregar } = usarSessao()
  const { navegar } = usarRota()

  const [nome, setNome] = useState(perfil?.nome_completo ?? '')
  const [curso, setCurso] = useState(perfil?.curso ?? '')
  const [telefone, setTelefone] = useState(perfil?.telefone ?? '')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'marinho' | 'vermelho'; texto: string } | null>(null)

  const [senhaAtual, setSenhaAtual] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [trocando, setTrocando] = useState(false)
  const [msgSenha, setMsgSenha] = useState<{ tom: 'marinho' | 'vermelho'; texto: string } | null>(null)

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setSalvando(true)
    setMsg(null)
    try {
      await d.atualizarPerfil({ nome_completo: nome.trim(), telefone: telefone.trim() || null, curso: curso.trim() })
      await recarregar()
      setMsg({ tom: 'marinho', texto: 'Dados atualizados.' })
    } catch (e) {
      setMsg({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Falha ao salvar.' })
    } finally {
      setSalvando(false)
    }
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setMsgSenha(null)
    if (!senhaAtual) return setMsgSenha({ tom: 'vermelho', texto: 'Informe a senha atual.' })
    if (senha.length < 8) return setMsgSenha({ tom: 'vermelho', texto: 'A senha precisa ter ao menos 8 caracteres.' })
    if (senha !== senha2) return setMsgSenha({ tom: 'vermelho', texto: 'As duas senhas não conferem.' })
    if (senha === senhaAtual)
      return setMsgSenha({ tom: 'vermelho', texto: 'A nova senha precisa ser diferente da atual.' })
    setTrocando(true)
    try {
      await d.alterarSenha(senha, senhaAtual)
      setSenhaAtual('')
      setSenha('')
      setSenha2('')
      setMsgSenha({ tom: 'marinho', texto: 'Senha alterada. Os outros aparelhos que estavam conectados saíram.' })
      await recarregar()
    } catch (e) {
      setMsgSenha({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Falha ao alterar a senha.' })
    } finally {
      setTrocando(false)
    }
  }

  if (!perfil) return null

  return (
    <>
      <AppBar titulo="Meus dados" subtitulo={perfil.papel === 'professor' ? 'Professor' : 'Estudante'} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-24">
        {perfil.precisa_trocar_senha ? (
          <Alerta tom="dourado" titulo="Sua senha ainda é a inicial">
            Ela é igual ao seu e-mail. Escolha uma senha nova no cartão “Alterar senha”, abaixo.
          </Alerta>
        ) : null}

        <Cartao>
          <form onSubmit={salvarDados} className="space-y-3.5">
            <Campo rotulo="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} required />
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Matrícula" value={perfil.matricula ?? '—'} disabled />
              <Campo rotulo="Curso" value={curso} onChange={(e) => setCurso(e.target.value)} />
            </div>
            <Campo rotulo="E-mail" value={perfil.email} disabled dica="Para trocar o e-mail, fale com o professor." />
            <Campo
              rotulo="Telefone (opcional)"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(33) 9 9999-9999"
            />
            {msg ? <Alerta tom={msg.tom}>{msg.texto}</Alerta> : null}
            <Botao type="submit" largo carregando={salvando}>
              Salvar alterações
            </Botao>
          </form>
        </Cartao>

        <Cartao>
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="size-4 text-tinta-suave" aria-hidden />
            <h2 className="text-[15px] font-medium text-tinta">Alterar senha</h2>
          </div>
          <form onSubmit={trocarSenha} className="space-y-3.5">
            <Campo
              rotulo="Senha atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
            />
            <Campo
              rotulo="Nova senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              dica="Mínimo de 8 caracteres."
            />
            <Campo
              rotulo="Repita a nova senha"
              type="password"
              autoComplete="new-password"
              value={senha2}
              onChange={(e) => setSenha2(e.target.value)}
            />
            {msgSenha ? <Alerta tom={msgSenha.tom}>{msgSenha.texto}</Alerta> : null}
            <Botao type="submit" variante="secundario" largo carregando={trocando}>
              Alterar senha
            </Botao>
          </form>
        </Cartao>

        <Botao
          variante="fantasma"
          largo
          icone={<LogOut className="size-4" />}
          onClick={async () => {
            await sair()
            navegar('/entrar')
          }}
        >
          Sair da conta
        </Botao>

        <p className="px-1 text-center text-[11.5px] leading-relaxed text-tinta-fraca">
          Seus dados são usados para identificar sua redação e lançar a nota no SIGA. A foto fica em armazenamento
          privado e é acessível apenas por você e pelo professor.
        </p>
      </main>
    </>
  )
}
