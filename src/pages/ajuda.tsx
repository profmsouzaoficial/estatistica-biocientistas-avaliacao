import { ArrowLeft, Brain, Camera, CheckCircle2, Clock, HelpCircle, Keyboard, Send, UserPlus, UserRound } from 'lucide-react'
import { Link } from '../lib/router'
import { AppBar, Cartao } from '../components/ui'
import { COMPILADO_EM, VERSAO, quandoFoiCompilado } from '../lib/versao'

/**
 * Instruções para o aluno, dentro do próprio app.
 *
 * Existe porque a dúvida chega na hora do envio, não no e-mail do professor:
 * "a foto ficou escura", "posso corrigir a transcrição?", "quando vejo a nota?".
 * A página é pública — quem ainda não criou a conta também pode ler.
 */
export function Ajuda() {
  return (
    <>
      <AppBar titulo="Como enviar sua redação" subtitulo="Passo a passo, do cadastro à devolutiva" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-16">
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-tinta-suave hover:text-marinho">
          <ArrowLeft className="size-3.5" aria-hidden /> Voltar
        </Link>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[18px] text-tinta">
            <UserPlus className="size-4 text-marinho" aria-hidden /> 1. Criar a conta
          </h2>
          <p className="texto-corrido">
            Use o <strong>e-mail</strong> e a <strong>matrícula</strong> que estão na lista da turma. Se a
            matrícula não constar, ou o e-mail for diferente do cadastrado, o app avisa na hora — nesse caso,
            fale com o professor em vez de criar outra conta.
          </p>
          <p className="texto-corrido">
            A senha precisa ter ao menos 8 caracteres. Esqueceu? Use <strong>Esqueci minha senha</strong> na
            tela de entrada: o link chega no e-mail e abre a tela de definir a nova senha.
          </p>
          <p className="text-[13px] leading-snug text-tinta-suave">
            Se o texto estiver pequeno, amplie com dois dedos: o app não bloqueia o zoom do celular.
          </p>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[18px] text-tinta">
            <Camera className="size-4 text-marinho" aria-hidden /> 2. Fotografar a folha
          </h2>
          <ul className="space-y-2 text-[14px] leading-relaxed text-tinta-suave">
            <li>
              <strong className="font-medium text-tinta">A folha inteira</strong>, de cima a baixo, sem cortar
              margens. Se a redação passa de uma folha, fotografe todas e envie o texto completo em uma única
              submissão.
            </li>
            <li>
              <strong className="font-medium text-tinta">Luz de cima</strong>, sem sombra da mão. Luz do teto
              costuma dar resultado melhor que a lanterna do celular.
            </li>
            <li>
              <strong className="font-medium text-tinta">Folha apoiada</strong> numa mesa plana; celular paralelo
              ao papel, não inclinado.
            </li>
            <li>
              Confira na prévia se a letra está nítida. Se não estiver, toque em <em>Trocar foto</em> e, depois,
              em <em>Usar esta foto</em>.
            </li>
          </ul>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[18px] text-tinta">
            <Keyboard className="size-4 text-marinho" aria-hidden /> 3. Conferir a transcrição
          </h2>
          <p className="texto-corrido">
            O app lê a letra e mostra o texto. A correção usa <strong>esse texto</strong>, não a foto — então
            corrija qualquer palavra que tenha sido lida errado, inclusive nomes e números. É permitido ajustar
            a transcrição; não é permitido mudar o conteúdo da redação.
          </p>
          <p className="texto-corrido">
            Se a leitura automática não estiver disponível, digite o texto no campo indicado. A foto continua
            guardada como comprovante do que você escreveu.
          </p>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[18px] text-tinta">
            <Send className="size-4 text-marinho" aria-hidden /> 4. Enviar
          </h2>
          <p className="texto-corrido">
            Marque a caixa de confirmação e toque em <strong>Enviar redação</strong>. Depois do envio, o texto
            fica travado: se precisar mudar algo, peça ao professor para devolver a redação.
          </p>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[18px] text-tinta">
            <Clock className="size-4 text-marinho" aria-hidden /> 5. Data de referência e devolutiva
          </h2>
          <p className="texto-corrido">
            A data de referência aparece na tela da avaliação. Ela serve para marcar se a entrega está fora
            do prazo; <strong>não fecha o envio</strong>. Quem decide se ainda recebe é o professor: quando
            ele encerra, o cartão mostra <strong>Entregas encerradas</strong>. Depois que ele revisar e
            liberar, a devolutiva fica disponível na sua lista de avaliações com:
          </p>
          <ul className="space-y-1.5 text-[14px] leading-relaxed text-tinta-suave">
            <li>
              <CheckCircle2 className="mr-1 inline size-3.5 text-marinho" aria-hidden /> a nota por critério e a
              nota final;
            </li>
            <li>os pontos fortes do seu texto;</li>
            <li>os pontos a desenvolver — o que estudar antes da próxima.</li>
          </ul>
          <p className="texto-corrido">
            A nota final também é lançada no SIGA. Se houver diferença entre o app e o SIGA, vale o que está no
            SIGA — e o professor consegue conferir os dois lado a lado.
          </p>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[18px] text-tinta">
            <UserRound className="size-4 text-marinho" aria-hidden /> 6. Seu perfil: foto e personalidade
          </h2>
          <p className="texto-corrido">
            Em <strong>Perfil</strong> você pode colocar uma <strong>foto</strong>. Ela fica em armazenamento
            privado e aparece para você e para o professor — inclusive na chamada, para ele reconhecer quem
            está presente. A imagem é recortada em quadrado e reduzida antes de subir; o arquivo original não
            é guardado. Use JPG, PNG ou WEBP.
          </p>
          <p className="texto-corrido">
            No mesmo lugar há o <strong>teste de personalidade</strong>: 30 afirmações rápidas, sem resposta
            certa, que geram um resultado inspirado nos 16 tipos. O cartão mostra a categoria (grupo), a
            subcategoria (estratégia e identidade), o tipo, uma descrição curta e os percentuais de cada eixo.
            Você pode refazer o teste quando quiser; o perfil guarda o último resultado e a data.
          </p>
          <p className="texto-corrido">
            O teste é <strong>educativo e não oficial</strong>: não é diagnóstico psicológico, não vale nota e
            não substitui uma avaliação profissional. O site original é o{' '}
            <a
              href="https://www.16personalities.com/br"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-marinho underline underline-offset-2"
            >
              16Personalities
            </a>
            .
          </p>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[18px] text-tinta">
            <Brain className="size-4 text-marinho" aria-hidden /> 7. Frequência
          </h2>
          <p className="texto-corrido">
            A frequência é registrada pelo professor, aula a aula, no painel dele. O app não altera sozinho a
            frequência oficial do SIGA; se houver diferença, vale o que estiver no SIGA. Sua foto e seu
            resultado de personalidade ajudam o professor a identificar a turma na chamada, mas não são usados
            para calcular presença.
          </p>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-serif text-[18px] text-tinta">
            <HelpCircle className="size-4 text-marinho" aria-hidden /> Problemas comuns
          </h2>
          <dl className="space-y-3 text-[14px] leading-relaxed">
            <div>
              <dt className="font-medium text-tinta">“Minha matrícula não está na lista”</dt>
              <dd className="text-tinta-suave">
                A lista vem do SIGA. Confira se digitou no formato da UFJF (por exemplo, 202506013GV). Se estiver
                igual e ainda assim não entrar, avise o professor.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-tinta">“Meu e-mail não confere”</dt>
              <dd className="text-tinta-suave">
                O e-mail precisa ser o mesmo que está na lista da turma. Se você usa outro, o professor pode
                atualizar o cadastro na tela de alunos.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-tinta">“A foto não carrega”</dt>
              <dd className="text-tinta-suave">
                O app reduz a imagem antes de enviar. Conexão fraca ainda pode falhar: tente de novo em um
                lugar com Wi-Fi. A foto só sobe quando você toca em <em>Usar esta foto</em>; se desistir antes
                disso, nada é enviado.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-tinta">“Minha foto do perfil não sobe”</dt>
              <dd className="text-tinta-suave">
                Confira se o arquivo é JPG, PNG ou WEBP. Se vier do iPhone em HEIC, escolha outra foto ou use a
                câmera; o app recorta e reduz a imagem antes de enviar. Conexão fraca também pode interromper:
                tente de novo com Wi-Fi.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-tinta">“Preciso fazer o teste de personalidade?”</dt>
              <dd className="text-tinta-suave">
                É opcional. Sem o teste, seu perfil e a chamada mostram “Teste não feito”; nada muda na sua
                nota ou na sua frequência. Você pode fazer depois, quantas vezes quiser.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-tinta">“Passei da data e o envio continua aberto”</dt>
              <dd className="text-tinta-suave">
                A data não fecha o envio: sua entrega só fica marcada como fora do prazo. Se o botão
                ainda aparece, você pode enviar.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-tinta">“Entregas encerradas”</dt>
              <dd className="text-tinta-suave">
                O professor fechou o recebimento desta avaliação. Se você ainda precisa entregar, fale
                com ele para reabrir; quando ele reabrir, o botão volta sozinho.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-tinta">“Enviei e a nota não aparece”</dt>
              <dd className="text-tinta-suave">
                A nota aparece quando o professor revisa e libera. Antes disso, o status fica em “enviada”.
              </dd>
            </div>
          </dl>
        </Cartao>

        <p className="px-1 text-center text-[12.5px] text-tinta-fraca">
          Dúvidas sobre o conteúdo da disciplina são com o professor. Dúvidas sobre o app:{' '}
          <Link href="/privacidade" className="underline underline-offset-2">
            privacidade e dados
          </Link>
          .
        </p>

        <p className="px-1 text-center text-[11.5px] text-tinta-fraca">
          Versão {VERSAO} · compilada {quandoFoiCompilado(COMPILADO_EM)}
        </p>
      </main>
    </>
  )
}
