# PetCore para Android

O aplicativo acessa o mesmo PetCore publicado em `https://petcore-homologacao.up.railway.app`, usando um WebView Android. Login, empresas, permissões e dados continuam no serviço, com conexão à internet. Não há uma base de clientes separada nem operação offline. O endereço atual é de homologação; as pendências comerciais do projeto continuam no [checklist de preparação](COMMERCIAL-READINESS.md).

## APK gerado

A versão **1.0.0**, código **1**, está em `releases/PetCore-1.0.0.apk`: pacote `br.dev.tigertech.petcore`, Android **8.0 ou superior** (`minSdk 26`, `targetSdk 36`), 1.756.814 bytes. É uma versão release assinada, sem depuração habilitada. A assinatura foi conferida com `apksigner`, com esquemas v2 e v3 válidos.

SHA-256 do APK:

```text
c80931dbe37cbdad9cd48c4343ec7fa21b4ec6e1cebe3332cd78dd6498dcc962
```

Os metadados públicos e a soma estão em `releases/PetCore-1.0.0.apk.json` e `releases/PetCore-1.0.0.apk.sha256`. O APK, os intermediários de compilação e a chave privada são ignorados pelo Git. Gerar o arquivo não publica o aplicativo na Play Store.

## Aparência e uso

A versão Android usa a identidade azul-marinho e turquesa, o mesmo cachorro inteiro no login, conteúdo centralizado e cartões espaçados. O modo Android amplia textos e áreas de toque. Com o teclado aberto, formulários podem rolar para manter os campos e as ações acessíveis.

Após as capturas de uso enviadas pelo usuário em 09/11/2026, esta revisão corrige a grade dos botões de atendimento, usa textos principais de 16 px e secundários de pelo menos 14 px no guia e nos resumos e apresenta os cadastros como cartões completos no celular. E-mails longos podem quebrar de linha; nenhuma ação deve depender de rolagem lateral. As regras de `web/src/styles/_mobile-usability.scss` também atendem ao navegador móvel e preservam os avisos existentes.

Na assinatura, **Assinar agora** abre o checkout devolvido pela API, com link de continuação se a janela não abrir. A explicação longa do PagBank foi retirada. Cancelar uma assinatura já paga abre um pedido de suporte; a confirmação do cancelamento real continua sendo uma tarefa do vendedor no PagBank, sem encurtar o período já pago. O controle persistente de checkout pendente evita liberar recorrências paralelas. A camada Android não mudou: o APK permanece **1.0.0**, com a soma SHA-256 acima. Essas correções chegam ao aplicativo pela atualização da interface no servidor, após compilação e publicação.

Fotos são escolhidas pelo seletor do Android, sem permissão ampla sobre os arquivos. Nas exportações CSV e JSON, o sistema abre o seletor para a pessoa escolher onde salvar. O conteúdo exportado e a mensagem da ponte têm limite de 16 MiB; exportações maiores precisam de um período menor ou do navegador. Links de pagamento e de contato abrem o aplicativo apropriado. O botão Voltar fecha primeiro o formulário ou menu e depois percorre a navegação do PetCore. Os avisos gerais de sucesso e erro conservam a posição e o comportamento existentes.

`web/src/nativeAndroid.ts` identifica `PetCoreAndroid/` no User-Agent e ativa `data-petcore-native="android"`. Os ajustes em `web/src/styles/_native-android.scss` se aplicam somente nesse modo. A ponte de exportação é restrita à origem HTTPS do PetCore e ao frame principal; ela não substitui a autenticação, as permissões da API ou as validações dos arquivos.

## Gerar o APK

Requisitos: Node.js compatível com o projeto, JDK17+ compatível com Gradle8.14.3, Android SDK36 e ferramentas de build. No computador desta entrega, o JBR do Android Studio e o SDK já estavam instalados. Em outra máquina, configure `JAVA_HOME` e `ANDROID_HOME`.

Na raiz do projeto:

```powershell
npm run android:apk
```

Quando todas as dependências já estiverem no cache:

```powershell
npm run android:apk -- --offline
```

O comando compila a versão release, assina o arquivo e verifica sua assinatura. O resultado fica em `releases/PetCore-VERSAO.apk`, acompanhado de SHA-256 e metadados públicos. A validação da assinatura e a compilação não substituem o teste dos fluxos no aparelho.

## Chave de atualização

A primeira geração cria material privado em `.android-signing/`, ignorado pelo Git. Os arquivos dessa pasta precisam de uma cópia de segurança privada: a mesma chave é necessária para assinar atualizações do aplicativo. Não publique essa pasta, não a envie no chat e não a inclua na imagem de hospedagem. O script recusa criar outra chave silenciosamente se detectar que a chave de uma configuração já concluída desapareceu.

O número de versão e o código de atualização ficam em `android/app/build.gradle`. Antes de distribuir uma atualização, aumente o código de versão e conserve a chave. Mudanças futuras de domínio precisam atualizar a origem permitida no aplicativo e preservar a mesma política de navegação segura.

## Conferência da entrega

Evidências desta geração:

- `testDebugUnitTest`: **7 testes Java aprovados**, cobrindo as políticas de navegação e de exportação.
- Na geração inicial, **8 testes** conferiram identificação do modo Android, validação da exportação e respostas da ponte. A rodada web atual de `npm run test:native -w web` aprovou **13 testes**, incluindo os testes do checkout.
- `lintRelease`: **zero erros**, com avisos de lint remanescentes; isso não é uma declaração de ausência de falhas.
- `assembleRelease`: compilação aprovada; APK assinado, metadados e assinatura conferidos.

O ensaio visual em navegador usou `web/native-qa.html` e componentes reais da aplicação, com dados fictícios locais, sem pagamentos ou mensagens. Foram conferidos:

- **320 × 568:** formulário sem excesso horizontal; botões Cancelar/Agendar com 48 px de altura.
- **360 × 740:** login sem rolagem, com cachorro inteiro usando `object-fit: contain`.
- **412 × 892:** ações do diálogo dentro da área visível.
- Fluxo local de cliente, pet, profissional e serviço Banho → Agendar: o modal fechou e o cartão fictício apareceu na agenda.

Essas evidências são do navegador com o modo Android ativado pelo ensaio, separadas da validação nativa.

Após as capturas do usuário, o ensaio atual em navegador conferiu a grade dos botões de atendimento em 360 px, os cartões de clientes em 320/360 px sem excesso horizontal e com fonte de 16 px e o guia/resumos com corpo de 16 px e secundários de 14 px. O checkout anual capturou a URL correta em ambiente local sem abrir o PagBank; o pedido de cancelamento e a confirmação fictícia do operador mantiveram Pago até. O cartão usa o botão vermelho Cancelar assinatura e o modal usa Confirmar pedido. Além dos 13 testes web, passaram 25 testes comerciais em PostgreSQL isolado novo com migrations 001–014 e a compilação de API/interface. Não houve cobrança nem cancelamento real no provedor.

Na geração inicial, o agente não realizou instalação ou uso em aparelho/emulador. Posteriormente, o usuário instalou o APK e enviou capturas de telas reais, que motivaram as correções acima. Isso não comprova uma verificação completa: teclado, insets do sistema, seletor de fotos, cancelamento/salvamento de arquivo e navegação Voltar ainda precisam de conferência específica no Android. Não marque esses fluxos como testados somente porque o APK compilou ou uma captura foi enviada.

A revisão final de 09/11/2026 foi publicada com SUCCESS às 21h22 de Brasília: commit `d463fa12253c83033b90445c900aaf1954a71bc2`, implantação `00a6dea0-7d32-4b9e-8ac0-7cac9276c9fc`. Página e saúde responderam 200, com `{ok:true,database:true}`; a sessão anônima retornou 401. Os assets `index-C_n1QduZ.js` e `index-DpZQfskv.css` responderam 200 e corresponderam byte a byte ao build local por SHA-256. A consulta final encontrou cinco serviços sem problemas, falhas recentes ou alterações pendentes. As correções chegam ao mesmo APK 1.0.0 pela interface remota; a camada nativa e seu SHA-256 não mudaram. SPF e procedimentos jurídicos/operacionais continuam pendentes no checklist comercial.

Os 25 testes comerciais e 13 testes web atuais e os ensaios locais acima pertencem a esta revisão. Os sete testes Java e a assinatura são evidências da geração original do APK. A rodada anterior de 103 testes e o ensaio de 12 verificações HTTPS não foram repetidos como uma nova suíte completa.

Referências: [WebView no Android](https://developer.android.com/develop/ui/views/layout/webapps/webview), [assinatura de aplicativos](https://developer.android.com/studio/publish/app-signing), [apksigner](https://developer.android.com/tools/apksigner), [segurança de arquivos em WebView](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion).
