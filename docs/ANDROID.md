# PetCore para Android

O aplicativo acessa o mesmo PetCore publicado em `https://petcore-homologacao.up.railway.app`, usando um WebView Android. Login, empresas, permissões e dados continuam no serviço, com conexão à internet. Não há uma base de clientes separada nem operação offline. O endereço atual é de homologação; as pendências comerciais do projeto continuam no [checklist de preparação](COMMERCIAL-READINESS.md).

A revisão publicada de 11/11/2026 acrescenta o [Táxi Dog opcional](TAXI-DOG.md) pela interface/API remotas. A fonte maior para desktop tem um escopo separado e preserva os ajustes do aplicativo. Essas mudanças não alteram o pacote Android nem exigem gerar outro APK; não acrescentam GPS ou permissões de localização ao aparelho.

## Revisão anterior — legibilidade e datas (10/11/2026)

O ajuste exclusivo do APK usa corpo de pelo menos 16 px e secundários de pelo menos 14 px, preservando os textos comerciais de 18 px, títulos e preços maiores. Os gráficos adaptam o `viewBox` à tela para manter letras com 14 px reais; cabeçalhos e abas de relatórios podem quebrar em linhas. A mesma navegação inferior continua fixa, sem rodapé adicional. Os avisos gerais mantêm posição e comportamento, e o login conserva o cachorro inteiro.

Novos agendamentos, verificações de disponibilidade, reagendamentos, antecipações e encaixes efetivos da lista de espera exigem um instante futuro, calculado com o fuso da empresa e o relógio do servidor. Agenda passada, histórico e atualização de situação dos atendimentos existentes permanecem disponíveis. Sugestões usam o dia atual ou o dia futuro escolhido; exemplos e testes evitam datas fixas que se tornem passadas.

Passaram nesta rodada 20 testes unitários e 94 de integração da API, 13 testes unitários web da ponte Android/checkout e 5 testes unitários de datas. O ensaio local de 16 telas com dados fictícios em 320/360 px, incluindo ficha do CRM, conversa de suporte e formulário, não encontrou texto renderizado menor que 14 px nem excesso horizontal em 320 px. O gráfico conferido tinha largura e `viewBox` de 239, com rótulos de 14 px; a agenda rejeitou uma data passada e aceitou o dia seguinte. A publicação desta revisão está pendente e não houve validação em aparelho. São mudanças remotas de interface/API para o APK 1.0.1 já instalado após a publicação; não exigem gerar outro APK. Os metadados e as evidências anteriores abaixo permanecem históricos.

## APK gerado

A versão **1.0.1**, código **2**, está em `releases/PetCore-1.0.1.apk`: pacote `br.dev.tigertech.petcore`, Android **8.0 ou superior** (`minSdk 26`, `targetSdk 36`), 1.756.814 bytes. É uma versão release assinada, sem depuração habilitada. A assinatura foi conferida com `apksigner`, com esquemas v2 e v3 válidos.

SHA-256 do APK:

```text
e3e26ee49df729278a9623d8adf5310d3570fbcfe603148fad5a0fe0c299d947
```

Os metadados públicos e a soma estão em `releases/PetCore-1.0.1.apk.json` e `releases/PetCore-1.0.1.apk.sha256`. A assinatura usa o mesmo certificado da 1.0.0, SHA-256 `740981c64caecfdf13e9add38633c4828334137d15f0a4581c5879077dcb19c1`. O APK 1.0.0 e seus metadados foram preservados. O APK, os intermediários de compilação e a chave privada são ignorados pelo Git. Gerar o arquivo não publica o aplicativo na Play Store.

**Instale a versão 1.0.1 por cima da anterior para receber a correção nativa.** O contêiner Android mantém a proteção das barras do sistema, recortes e teclado e informa ao WebView que esses espaços já foram tratados. Isso evita descontar a mesma área novamente abaixo de Hoje/Agenda/Clientes/Mais. A correção inclui compatibilidade com recortes no Android 9/10 (API 28–29); uma atualização apenas da interface no servidor não altera o APK instalado.

## Aparência e uso

A versão Android usa a identidade azul-marinho e turquesa, o mesmo cachorro inteiro no login, conteúdo centralizado e cartões espaçados. O modo Android amplia textos e áreas de toque. Com o teclado aberto, formulários podem rolar para manter os campos e as ações acessíveis.

As correções móveis preservam os botões de atendimento em grade e os cadastros como cartões completos, sem rolagem lateral. A revisão de 10/11/2026 amplia Próximo passo para 18 px e mantém os rótulos dos indicadores de Hoje em 16 px, com quebra de linha normal. Na assinatura, os textos principais passam a 18 px e os secundários a 16 px. Hoje/Agenda/Clientes/Mais permanecem fixos junto à borda inferior, inclusive no modo Android em paisagem. As regras de `web/src/styles/_mobile-usability.scss` também atendem ao navegador móvel e preservam os avisos existentes.

Na assinatura, **Assinar agora** abre o checkout devolvido pela API, com link de continuação se a janela não abrir. A explicação longa do PagBank foi retirada. Cancelar uma assinatura já paga abre um pedido de suporte; a confirmação do cancelamento real continua sendo uma tarefa do vendedor no PagBank, sem encurtar o período já pago. O controle persistente de checkout pendente evita liberar recorrências paralelas. Os ajustes de fonte e layout chegam pela interface no servidor após publicação; a correção dos espaços nativos exige o APK 1.0.1.

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

Evidências da geração 1.0.1 em 10/11/2026:

- `testDebugUnitTest`: **7 testes Java aprovados**, cobrindo as políticas de navegação e de exportação.
- `lintRelease`: **zero erros e 9 avisos**; isso não é uma declaração de ausência de falhas.
- `assembleRelease`: compilação offline aprovada; APK assinado com a chave existente, metadados, soma e assinatura v2/v3 conferidos.

O ensaio atual no navegador, com componentes reais e dados fictícios locais, conferiu Hoje em **320 × 568** e **360 × 800**, sem excesso horizontal na página nem nos indicadores; Próximo passo em 18 px e rótulos dos indicadores em 16 px. Na assinatura em 320 px, os parágrafos principais, benefícios do plano e estado vazio têm 18 px; histórico e valor equivalente têm 16 px. A barra de navegação inferior fixa tem 76 px e permanece na borda inferior no topo e no fim da rolagem; em modo Android **844 × 390**, continua visível e fixa na paisagem. Essas capturas e medições locais não são um novo teste em aparelho.

O ensaio visual anterior em navegador usou `web/native-qa.html` e componentes reais da aplicação, com dados fictícios locais, sem pagamentos ou mensagens. Foram conferidos:

- **320 × 568:** formulário sem excesso horizontal; botões Cancelar/Agendar com 48 px de altura.
- **360 × 740:** login sem rolagem, com cachorro inteiro usando `object-fit: contain`.
- **412 × 892:** ações do diálogo dentro da área visível.
- Fluxo local de cliente, pet, profissional e serviço Banho → Agendar: o modal fechou e o cartão fictício apareceu na agenda.

Essas evidências são do navegador com o modo Android ativado pelo ensaio, separadas da validação nativa.

Na revisão anterior, o ensaio em navegador conferiu a grade dos botões de atendimento em 360 px, os cartões de clientes em 320/360 px sem excesso horizontal e com fonte de 16 px e o guia/resumos com corpo de 16 px e secundários de 14 px. O checkout anual capturou a URL correta em ambiente local sem abrir o PagBank; o pedido de cancelamento e a confirmação fictícia do operador mantiveram Pago até. O cartão usa o botão vermelho Cancelar assinatura e o modal usa Confirmar pedido. Passaram 13 testes web e 25 testes comerciais em PostgreSQL isolado novo com migrations 001–014 e a compilação de API/interface. Não houve cobrança nem cancelamento real no provedor.

Na geração inicial, o agente não realizou instalação ou uso em aparelho/emulador. Posteriormente, o usuário instalou o APK 1.0.0 e enviou capturas de telas reais, que motivaram as correções. A versão 1.0.1 ainda não foi instalada ou testada em aparelho/emulador pelo agente: teclado, insets do sistema, seletor de fotos, cancelamento/salvamento de arquivo e navegação Voltar ainda precisam de conferência específica no Android. Não marque esses fluxos como testados somente porque o APK compilou ou uma captura foi enviada.

O registro histórico da revisão web de 10/11/2026 terminou com SUCCESS às 19h46 de Brasília: commit `4203d45d83111d911d9d48fd2644d05e0c61df50`, implantação `074c8588-8da6-4fe7-b91e-cb4a69d4a00c`. Página e saúde responderam 200, com `{ok:true,database:true}`; a sessão anônima retornou 401. Os assets `index-B-Yo4f02.js` e `index-BboF3XDV.css` responderam 200 e corresponderam ao build local por SHA-256. A consulta final encontrou cinco serviços sem problemas, falhas recentes ou alterações pendentes. Os ajustes de fonte e da barra de navegação inferior fixa estão publicados; o ajuste nativo exige instalar o APK 1.0.1. SPF e procedimentos jurídicos/operacionais continuam pendentes no checklist comercial.

Os 25 testes comerciais, 13 testes web e ensaios anteriores são registros históricos; não foram somados à geração 1.0.1. Os sete testes Java, lint, build e assinatura foram repetidos no APK atual. A rodada anterior de 103 testes e o ensaio de 12 verificações HTTPS não foram repetidos como uma nova suíte completa.

Referências: [WebView no Android](https://developer.android.com/develop/ui/views/layout/webapps/webview), [assinatura de aplicativos](https://developer.android.com/studio/publish/app-signing), [apksigner](https://developer.android.com/tools/apksigner), [segurança de arquivos em WebView](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion).
