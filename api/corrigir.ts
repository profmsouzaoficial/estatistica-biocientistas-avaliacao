import {
  ErroHttp,
  campoTexto,
  criarRota,
  exigirProfessor,
  ok,
  supabase,
  type Requisicao,
  type Resposta,
} from './_lib/http.js'
import { corrigirSubmissao } from './_lib/corrigirServico.js'

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use POST.')
  const { usuario, perfil } = await exigirProfessor(req)
  const submissaoId = campoTexto(req.corpo, 'submissao_id')

  const { correcao } = await corrigirSubmissao(submissaoId)

  await supabase('auditoria', {
    metodo: 'POST',
    corpo: {
      ator_id: usuario.id,
      acao: 'corrigir_ia',
      entidade: 'submissoes',
      entidade_id: submissaoId,
      detalhe: { modelo: correcao.modelo, nota_final: correcao.nota_final, professor: perfil.nome_completo },
    },
    prefer: 'return=minimal',
  }).catch(() => {
    /* auditoria é acessória: não derruba a correção */
  })

  return ok({ correcao })
}

export default criarRota(manipulador)
