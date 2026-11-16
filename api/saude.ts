/**
 * Diagnóstico de configuração — só booleans, nenhum segredo.
 * Serve para o professor conferir se OCR, corretor e SIGA estão ligados.
 */
import { criarRota, exigirPerfil, ok, type Requisicao, type Resposta } from './_lib/http'
import { ocrConfigurado, provedorDeVisao } from './_lib/transcrever'
import { llmConfigurado } from './_lib/rubrica'
import { sigaConfigurado } from './_lib/siga'
import { envOpcional } from './_lib/http'

async function manipulador(req: Requisicao): Promise<Resposta> {
  const { perfil } = await exigirPerfil(req)
  return ok({
    papel: perfil.papel,
    ocr: { configurado: ocrConfigurado(), provedor: provedorDeVisao(), modelo: envOpcional('VISION_MODEL') ?? null },
    corretor: { configurado: llmConfigurado(), modelo: envOpcional('LLM_MODEL') ?? null },
    siga: { configurado: sigaConfigurado() },
    supabase: { configurado: Boolean(envOpcional('SUPABASE_SERVICE_ROLE_KEY')) },
  })
}

export default criarRota(manipulador)
