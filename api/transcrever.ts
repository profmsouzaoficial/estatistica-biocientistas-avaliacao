import {
  ErroHttp,
  atualizar,
  campoTexto,
  criarRota,
  exigirPerfil,
  ok,
  selecionarUm,
  baixarObjeto,
  type Requisicao,
  type Resposta,
} from './_lib/http.js'
import { transcreverImagem } from './_lib/transcrever.js'

interface SubmissaoServidor {
  id: string
  aluno_id: string
  foto_path: string | null
  transcrito: string | null
}

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use POST.')
  const { usuario } = await exigirPerfil(req)
  const submissaoId = campoTexto(req.corpo, 'submissao_id')

  const submissao = await selecionarUm<SubmissaoServidor>(
    'submissoes',
    `id=eq.${encodeURIComponent(submissaoId)}&select=id,aluno_id,foto_path,transcrito`,
  )
  if (!submissao) throw new ErroHttp(404, 'NAO_ENCONTRADA', 'Submissão não encontrada.')
  if (submissao.aluno_id !== usuario.id) {
    throw new ErroHttp(403, 'NAO_E_SUA', 'Esta submissão não pertence a você.')
  }
  if (!submissao.foto_path) throw new ErroHttp(400, 'SEM_FOTO', 'Envie a foto antes de transcrever.')

  const { bytes, tipo } = await baixarObjeto('redacoes', submissao.foto_path)
  const resultado = await transcreverImagem(bytes, tipo)

  const atualizada = await atualizar<SubmissaoServidor>(
    'submissoes',
    `id=eq.${encodeURIComponent(submissaoId)}`,
    {
      transcrito: resultado.texto,
      transcrito_modelo: resultado.modelo,
      transcrito_em: new Date().toISOString(),
    },
  )

  return ok({ submissao: atualizada, modelo: resultado.modelo })
}

export default criarRota(manipulador)
