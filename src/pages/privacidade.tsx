import { ArrowLeft, Database, FileLock2, Share2, Trash2, UserCheck } from 'lucide-react'
import { Link } from '../lib/router'
import { AppBar, Cartao } from '../components/ui'

/**
 * Aviso de privacidade em linguagem direta.
 * Regra desta página: só afirmar o que o código realmente faz. Onde o dado sai do
 * Brasil (Supabase em us-west-2 e o OCR de nuvem), isso está escrito com todas as
 * letras — é o ponto que a LGPD (arts. 33–36) exige deixar claro.
 */
export function Privacidade() {
  return (
    <>
      <AppBar titulo="Privacidade e dados" subtitulo="O que o app guarda, por quê e por quanto tempo" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-16">
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-tinta-suave hover:text-verde">
          <ArrowLeft className="size-3.5" aria-hidden /> Voltar
        </Link>

        <Cartao className="space-y-2">
          <h2 className="font-serif text-[19px] text-tinta">Para que serve este app</h2>
          <p className="texto-corrido">
            Ele recebe as redações manuscritas da disciplina <em>Análise de Dados para Biocientistas</em>, ajuda o
            professor a corrigi-las com base em uma rubrica e devolve a nota com pontos fortes e pontos a
            desenvolver. A nota final é lançada no sistema acadêmico (SIGA) da UFJF.
          </p>
          <p className="texto-corrido">
            O tratamento serve a esse procedimento de avaliação e ao registro acadêmico — não há uso publicitário,
            perfilamento comercial nem venda de dados.
          </p>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[17px] text-tinta">
            <Database className="size-4 text-verde" aria-hidden /> O que é guardado
          </h2>
          <ul className="space-y-2 text-[14px] leading-relaxed text-tinta-suave">
            <li>
              <strong className="font-medium text-tinta">Identificação:</strong> nome completo, matrícula, e-mail,
              curso e turma.
            </li>
            <li>
              <strong className="font-medium text-tinta">Redação:</strong> a foto da folha manuscrita, o texto
              transcrito e a versão final que você confirmou.
            </li>
            <li>
              <strong className="font-medium text-tinta">Avaliação:</strong> notas por critério, nota final, pontos
              fortes, pontos a desenvolver e a decisão do professor.
            </li>
            <li>
              <strong className="font-medium text-tinta">Registro técnico:</strong> data e hora do envio, do
              lançamento no SIGA e das ações administrativas (quem corrigiu, quem liberou, quando).
            </li>
            <li>
              <strong className="font-medium text-tinta">Senha:</strong> guardada apenas como hash pelo serviço de
              autenticação — ninguém, nem o professor, consegue lê-la.
            </li>
          </ul>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[17px] text-tinta">
            <Share2 className="size-4 text-verde" aria-hidden /> Quem vê e para onde vai
          </h2>
          <ul className="space-y-2 text-[14px] leading-relaxed text-tinta-suave">
            <li>
              <strong className="font-medium text-tinta">Você</strong> vê as próprias redações e devolutivas.{' '}
              <strong className="font-medium text-tinta">O professor da turma</strong> vê as redações da turma dele;
              nenhum colega vê a sua.
            </li>
            <li>
              <strong className="font-medium text-tinta">SIGA:</strong> vão apenas matrícula e nota (com o período e
              a descrição da avaliação). O texto da redação nunca é enviado ao SIGA.
            </li>
            <li>
              <strong className="font-medium text-tinta">Leitura da foto (OCR):</strong> quando a correção automática
              está ligada, a imagem é processada por um serviço de OCR contratado para essa função. Sem esse
              serviço, o próprio aluno digita o texto e a foto fica só como comprovante.
            </li>
            <li>
              <strong className="font-medium text-tinta">Modelo de correção:</strong> é um Llama hospedado em
              servidor do próprio professor, e recebe o texto da redação sem o seu nome, a matrícula ou o e-mail.
            </li>
          </ul>
        </Cartao>

        <Cartao className="space-y-2">
          <h2 className="flex items-center gap-1.5 font-serif text-[17px] text-tinta">
            <FileLock2 className="size-4 text-verde" aria-hidden /> Onde fica e por quanto tempo
          </h2>
          <p className="texto-corrido">
            Os dados ficam no Supabase (banco PostgreSQL gerenciado), na região <strong>us-west-2 (Oregon,
            Estados Unidos)</strong> — portanto, há transferência internacional de dados. O acesso é protegido por
            login e por regras de banco que restringem cada linha ao dono e ao professor responsável. As fotos
            ficam em um bucket privado, acessível apenas por links temporários.
          </p>
          <p className="texto-corrido">
            O material é mantido durante a disciplina e o período necessário ao registro acadêmico e a eventuais
            revisões de nota. Depois disso, pode ser apagado a pedido — a nota já lançada no SIGA segue as regras
            de guarda documental da UFJF.
          </p>
        </Cartao>

        <Cartao className="space-y-2">
          <h2 className="flex items-center gap-1.5 font-serif text-[17px] text-tinta">
            <UserCheck className="size-4 text-verde" aria-hidden /> Seus direitos
          </h2>
          <ul className="space-y-1.5 text-[14px] leading-relaxed text-tinta-suave">
            <li>Ver e corrigir seus dados em <strong className="font-medium text-tinta">Perfil</strong>.</li>
            <li>Ver a devolutiva e o critério usado na correção, na própria avaliação.</li>
            <li>Pedir cópia, correção ou exclusão do que não for de guarda obrigatória.</li>
            <li>Saber que houve correção automática — ela é sempre indicada na devolutiva, e a nota final é do professor.</li>
            <li>Recusar o tratamento: nesse caso, combine com o professor uma forma alternativa de fazer a avaliação.</li>
          </ul>
          <p className="texto-corrido">
            Contato do responsável: professor <strong>Márcio Luís Moreira de Souza</strong> —{' '}
            <a className="text-verde underline-offset-2 hover:underline" href="mailto:marcio.souza@ufjf.br">
              marcio.souza@ufjf.br
            </a>
            .
          </p>
        </Cartao>

        <Cartao className="space-y-2">
          <h2 className="flex items-center gap-1.5 font-serif text-[17px] text-tinta">
            <Trash2 className="size-4 text-verde" aria-hidden /> Cookies e rastreadores
          </h2>
          <p className="texto-corrido">
            Não há cookies de publicidade, nem Google Analytics, nem rastreadores de terceiros. O navegador guarda
            apenas a sessão de login (para você não digitar a senha a cada tela) e, no modo demonstração, dados de
            exemplo no próprio aparelho.
          </p>
        </Cartao>

        <p className="px-1 text-[12.5px] leading-snug text-tinta-fraca">
          Última revisão: 16/11/2026. Este aviso descreve o funcionamento atual do app; se algo mudar — outro
          provedor de OCR, outro servidor de banco —, esta página é atualizada na mesma data.
        </p>
      </main>
    </>
  )
}
