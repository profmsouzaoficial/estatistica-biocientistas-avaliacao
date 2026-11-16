/**
 * Versão do build que está rodando no navegador.
 *
 * O valor vem do Vite (commit curto do Git) e aparece no rodapé da ajuda e no
 * painel do professor. Serve para uma coisa só: comparar o que está publicado
 * com o código do repositório — `pnpm versao` faz essa conta.
 */
export const VERSAO = __VERSAO__
export const COMPILADO_EM = __COMPILADO_EM__

/** "hoje às 18:40", "ontem às 09:12", "16/11 às 18:40" — para o rodapé. */
export function quandoFoiCompilado(iso: string, agora = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mesmoDia(d, agora)) return `hoje às ${hora}`
  const ontem = new Date(agora)
  ontem.setDate(ontem.getDate() - 1)
  if (mesmoDia(d, ontem)) return `ontem às ${hora}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${hora}`
}
