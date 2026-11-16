import { carregarEnv, chaveServico, supabaseRest, urlSupabase } from './scripts/_env.mjs'

carregarEnv()
const base = urlSupabase()
const key = chaveServico()
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

// 1. professor logado (token real, como o navegador faria)
const login = await (
  await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marcio.souza@ufjf.br', password: process.env.SENHA_PROFESSOR }),
  })
).json()
if (!login.access_token) throw new Error('login falhou: ' + JSON.stringify(login).slice(0, 160))
const profId = login.user.id
console.log('professor:', profId)

// 2. turma descartável + avaliação + submissão com foto
const marca = String(Date.now()).slice(-6)
const turma = (await supabaseRest('turmas', { metodo: 'POST', corpo: { nome: `API foto ${marca}`, codigo_siga: `APIFOTO-${marca}`, periodo: '2026/3', curso: 'Ciências Biológicas', exige_email: false }, prefer: 'return=representation' }))[0]
const avaliacao = (await supabaseRest('avaliacoes', {
  metodo: 'POST',
  prefer: 'return=representation',
  corpo: {
    turma_id: turma.id,
    titulo: `Avaliação API ${marca}`,
    tema: 'Tema de teste.',
    instrucoes: 'Instruções de teste.',
    valor_total: 10,
    rubrica: [{ id: 'c1', nome: 'Critério único', descricao: 'Teste.', valor: 10 }],
    status: 'publicada',
    descricao_siga: `TVC 9 ${marca}`,
    peso_siga: 10,
    criado_por: profId,
  },
}))[0]

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const submissaoId = crypto.randomUUID()
const caminho = `${profId}/${submissaoId}.jpg`
const up = await fetch(`${base}/storage/v1/object/redacoes/${caminho}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'image/jpeg' }, body: png })
console.log('upload da foto:', up.status)

const submissao = (await supabaseRest('submissoes', {
  metodo: 'POST',
  prefer: 'return=representation',
  corpo: { id: submissaoId, avaliacao_id: avaliacao.id, aluno_id: profId, status: 'enviada', foto_path: caminho, enviado_em: new Date().toISOString() },
}))[0]
console.log('submissão:', submissao.id, '· foto em', submissao.foto_path)

// 3. chama a rota como o app chama
const resposta = await fetch('http://127.0.0.1:3101/api/turma-excluir', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.access_token}` },
  body: JSON.stringify({ turma_id: turma.id }),
})
const corpo = await resposta.text()
console.log('rota:', resposta.status, corpo.slice(0, 200))

// 4. a foto sumiu?
const lista = await (
  await fetch(`${base}/storage/v1/object/list/redacoes`, { method: 'POST', headers: h, body: JSON.stringify({ prefix: profId, limit: 20, offset: 0 }) })
).json()
const aindaLa = lista.some((o) => o.name === `${submissaoId}.jpg`)
console.log('foto ainda no bucket?', aindaLa)

// 5. limpeza (se a rota falhou, remove o resto)
const sobrou = await supabaseRest(`turmas?id=eq.${turma.id}&select=id`)
if (sobrou.length) {
  console.log('turma não foi apagada; limpando à mão')
  await supabaseRest(`turmas?id=eq.${turma.id}`, { metodo: 'DELETE' })
}
if (aindaLa) {
  await fetch(`${base}/storage/v1/object/redacoes`, { method: 'DELETE', headers: h, body: JSON.stringify({ prefixes: [caminho] }) })
}
