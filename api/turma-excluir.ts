/**
 * Apaga uma turma, com tudo que pertence a ela, e as fotos das redações.
 *
 * A decisão de permitir ou não fica no banco (`apagar_turma`), que recusa quando
 * já existe nota lançada no SIGA. Aqui só fazemos o que o SQL não alcança:
 * apagar os arquivos do bucket privado `redacoes` — sem isso, foto de redação
 * continuaria guardada depois que a submissão deixou de existir.
 */
import {
  apagarObjetos,
  criarRota,
  ErroHttp,
  exigirProfessor,
  ok,
  rpcComoUsuario,
  selecionar,
  campoTexto,
  type Requisicao,
  type Resposta,
} from './_lib/http.js'

interface TurmaServidor {
  id: string
  nome: string
  codigo_siga: string
}

interface SubmissaoServidor {
  id: string
  avaliacao_id: string
  foto_path: string | null
}

type RespostaApagar =
  | { ok: true; codigo: string; alunos: number; avaliacoes: number }
  | { ok: false; motivo: 'sem_permissao' | 'nao_encontrada' | 'tem_lancamentos'; lancadas?: number }

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use POST.')
  await exigirProfessor(req)

  const turmaId = campoTexto(req.corpo, 'turma_id')
  const turma = (
    await selecionar<TurmaServidor>('turmas', `id=eq.${encodeURIComponent(turmaId)}&select=id,nome,codigo_siga`)
  )[0]
  if (!turma) throw new ErroHttp(404, 'TURMA', 'Turma não encontrada.')

  // Guarda os caminhos antes do delete: depois do cascade as linhas somem.
  const avaliacoes = await selecionar<{ id: string }>(
    'avaliacoes',
    `turma_id=eq.${encodeURIComponent(turmaId)}&select=id`,
  )
  const ids = avaliacoes.map((a) => a.id)
  const fotos: string[] = []
  if (ids.length > 0) {
    const submissoes = await selecionar<SubmissaoServidor>(
      'submissoes',
      `avaliacao_id=in.(${ids.map((id) => `"${id}"`).join(',')})&select=id,avaliacao_id,foto_path`,
    )
    for (const s of submissoes) if (s.foto_path) fotos.push(s.foto_path)
  }

  const resultado = await rpcComoUsuario<RespostaApagar>(req, 'apagar_turma', { p_turma: turmaId })
  if (!resultado?.ok) return ok(resultado)

  // A turma já não existe: se o Storage falhar, o professor não deve ver erro —
  // a limpeza das fotos pode ser refeita por `pnpm fotos:limpar`.
  let fotosApagadas = 0
  try {
    fotosApagadas = await apagarObjetos('redacoes', fotos)
  } catch {
    fotosApagadas = 0
  }

  return ok({ ...resultado, fotos_apagadas: fotosApagadas })
}

export default criarRota(manipulador)
