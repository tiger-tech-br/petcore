# Prompt para continuar o PetCore no ChatGPT gratuito

Copie o texto abaixo para a conversa em que o projeto está sendo construído. Anexe os arquivos atuais solicitados; o chat não consegue ler caminhos locais sozinho.

---

Estou desenvolvendo o **PetCore**, SaaS de gestão interna de pet shops da **Tiger Tech**, na pasta `C:\Users\andre\Desktop\petcore-saas`. Continue a partir dos arquivos atuais, sem recriar o projeto e sem substituir alterações recentes por versões antigas.

## Estado atual

A interface usa React 19, TypeScript, Vite e SCSS; a API usa Node.js 22.12+, Express 5 e PostgreSQL. O banco está no Neon. Autenticação por sessão no servidor, senhas Argon2id, vínculos e permissões por empresa. A sessão usa cookie de oito horas renovável; não acrescente “Manter conectado” sem implementar o comportamento.

Já existem:

- Clientes/tutores, pets, serviços, profissionais, jornadas, pausas e folgas.
- Agenda, reagendamento, antecipação, faltas, histórico e lista de espera/encaixes.
- **CRM:** carteira dos tutores já cadastrados, pesquisa, segmentos sem visita/sem retorno há 30, 60 ou 90 dias, ficha com pets e atendimentos, contatos manuais e tarefas internas. Não duplique clientes. Contatos não enviam mensagens; tarefas não reservam agenda. Funcionário precisa da permissão `crm`. Cadastro anonimizado não recebe novos contatos nem reabertura de tarefas.
- **Produtos e estoque:** cadastro, custo/preço, estoque mínimo, movimentos e histórico.
- **Financeiro:** vendas/comandas internas de produtos e serviços, importação de atendimento concluído, recebimentos parciais, despesas e caixa com fechamento. Agendamento e venda aberta não são recebimentos. Registrar cartão significa informar como a equipe recebeu, sem capturar dados do cartão ou acessar banco do pet shop.
- **Relatórios:** indicadores, gráficos e CSV baseados nos registros da empresa.
- **Suporte:** chamados e respostas no painel.
- **Privacidade:** pedidos, verificação de identidade, exportação, anonimização e auditoria; documentos jurídicos em rascunho até revisão/publicação.
- Manutenção, fotos privadas e scripts de backup criptografado/restauração.

Produtos e estoque atendem ao balcão e à operação interna. **Não existem loja virtual, compras públicas, táxi dog, entregas ou status de pedidos de comércio eletrônico. Não adicione esses módulos sem solicitação minha.** Emissão fiscal e integração bancária também não foram implementadas.

Meu portfólio terá **um único SaaS por área**: pet shop, barbearia, prontuário e salão de beleza. Se eu pedir melhorias de pet shop no futuro, atualize o mesmo PetCore. Não crie outro SaaS para a mesma área. Táxi dog foi apenas uma dúvida e não está autorizado para implementação.

## Planos confirmados

Os preços finais são **R$ 35 mensais e R$ 350 anuais**. Desconsidere os valores antigos de R$ 40/R$ 400.

No primeiro acesso do responsável, abre um modal com **Plano Free, Plano Mensal e Plano Anual**. O **Free vem marcado**, dura 30 dias e começa quando confirmado. Não é um plano gratuito permanente. Ele termina no vencimento; a tolerância configurada para regularizar plano pago não estende o teste.

O cliente pode escolher um plano pago imediatamente, sem testar nem aguardar 30 dias. **Assinar agora** solicita autorização à API e abre o link de checkout retornado por ela; se o navegador bloquear a janela, mantém um link para continuar. Minha conta PagBank é PF; o fluxo atual usa links recorrentes e conciliação manual pela plataforma. Não precisa colocar tokens de produção no projeto para esse fluxo.

Selecionar plano ou voltar do checkout não ativa assinatura paga. A Tiger Tech confere o recebimento no PagBank e registra a conciliação. No vencimento, consultas, assinatura, suporte e os canais próprios de privacidade continuam disponíveis.

Links atuais conferidos sem compra: **PetCore Mensal, R$ 35 — https://pag.ae/82jFKCTjo** e **PetCore Anual, R$ 350 — https://pag.ae/82jFLbrjr**. A revisão está marcada como aprovada no cadastro dos planos. Não reutilize os links antigos com o nome “sistema de demandas”. Por minha solicitação, o checkout revisado não depende de `legal.published`. Isso não publica os documentos jurídicos, não libera comercialmente o produto e não permite marcar assinatura paga pela escolha ou pelo retorno do navegador. Não reintroduza o acoplamento entre checkout e publicação jurídica nem publique documentos para contornar indisponibilidade de plano.

**Cancelar assinatura** registra um chamado de suporte com confirmação explícita do cliente. Não afirma que a recorrência já terminou. O vendedor cancela a cobrança real no painel PagBank e, na plataforma, registra senha, referência, motivo e confirmação de que conferiu o cancelamento. O campo `expected_paid_through` protege contra um formulário antigo confirmado depois de um novo recebimento. A conciliação registra a data, resolve pedidos anteriores daquele ciclo e preserva o período pago. Após a confirmação, outro checkout pode ser permitido, mas o plano do período já pago só muda após conciliar o novo recebimento. Um novo pagamento inicia outro ciclo de recorrência; uma confirmação antiga não pode autorizar novos checkouts indefinidamente. Não prometa cancelamento automático pela API ou pelos links da conta PF.

A proteção contra assinatura duplicada também mantém `pending_checkout_at` persistido por empresa. Fechar a janela, voltar ou recarregar não libera outra recorrência. Uma tentativa abandonada exige conferência no provedor e liberação administrativa com reautenticação e justificativa; não apague a trava automaticamente por tempo decorrido. Preserve as transações, auditoria e verificações de ciclo/concorrência. Consulte o procedimento em `docs/OPERACAO.md`.

## Visual e usabilidade que devem ser preservados

O visual oficial segue `painel-petcore.png` e `pet-core-login.png`: azul-marinho, turquesa, fundos claros, cartões e marca com pata/coração.

Preserve **o mesmo cachorro** de `web/public/images/petcore-dog.png`, com laço verde e gravata amarela do Brasil. No login responsivo, ele precisa aparecer inteiro, incluindo as patas. Mantenha logo, títulos, campos e links centralizados, com espaços adequados. A tela inicial adapta imagem e espaçamento à altura disponível; mensagens e etapas extras podem precisar de rolagem para manter controles acessíveis.

Formulários e detalhes abrem em `FormDialog` nativo: tela inteira no celular até 780 px, modal centralizado no computador, foco controlado e fundo sem rolagem. Não deixe formulários escondidos abaixo das listas nem empilhe janelas.

**Não mude a posição nem o comportamento dos avisos gerais de sucesso e erro.** A validação local do formulário pode aparecer também dentro do modal.

Há um guia de primeiros passos: serviços → profissional/jornada/serviços habilitados → cliente e pet → agendamento → recebimento. Quando falta pré-requisito, a tela explica o que fazer e oferece atalho somente a quem tem permissão. Preserve isso e as orientações para procurar o responsável quando faltar acesso.

As correções após as capturas do APK organizam os botões de detalhes de atendimento em grade móvel, com altura mínima de 48 px, sem quebrar palavras por letra. Guia inicial e resumos usam corpo de 16 px e secundários de pelo menos 14 px. Cadastros viram cartões com nome, telefone, e-mail e ações no celular; os e-mails longos quebram em linhas, sem rolagem lateral nem esconder dados. O arquivo `web/src/styles/_mobile-usability.scss` é importado depois dos ajustes Android e também atende ao navegador móvel. A explicação longa sobre o PagBank foi retirada da tela de assinatura. Não a recoloque nem substitua a solução responsiva por `overflow:hidden` que esconda conteúdo.

## Aplicativo Android adicionado

Agora existe um projeto Android em `android/` e o comando `npm run android:apk`, implementado em `scripts/build-android.mjs`. Foi gerado o release assinado **PetCore 1.0.0**, código 1, pacote `br.dev.tigertech.petcore`, Android 8.0+ (`minSdk 26`, `targetSdk 36`), em `releases/PetCore-1.0.0.apk`. SHA-256: `c80931dbe37cbdad9cd48c4343ec7fa21b4ec6e1cebe3332cd78dd6498dcc962`. Os metadados públicos ficam ao lado do APK.

É um WebView que acessa **o mesmo endereço HTTPS do Railway**, com internet; não há base de clientes separada nem operação offline. Preserve cookies, origem exata, proteção de sessão, permissões por empresa e bloqueio de conteúdo inseguro. Não use `*` para permitir navegação ou a ponte nativa. Links externos abrem os aplicativos apropriados; fotos usam o seletor do Android, sem permissão ampla sobre arquivos.

`web/src/nativeAndroid.ts` reconhece `PetCoreAndroid/` no User-Agent e ativa `data-petcore-native="android"`; `web/src/styles/_native-android.scss` amplia textos e toques, centraliza o conteúdo e melhora os espaços somente nesse modo. Depois dele, `_mobile-usability.scss` corrige as telas móveis do APK e do navegador. O login mantém o mesmo cachorro inteiro. Preserve o comportamento dos formulários em tela inteira no celular e **não mova os avisos gerais de sucesso/erro**.

As exportações de relatórios e privacidade usam `saveTextFile`: no Android, a ponte `PetCoreNative` abre o seletor de destino para CSV/JSON; no navegador, continua a exportação por Blob. A ponte só aceita origem HTTPS autorizada e frame principal, formato/nome válido e tamanho limitado a 16 MiB, com respostas de sucesso, cancelamento e erro. O botão Voltar fecha primeiro modal/menu; depois volta na navegação. Preserve essas integrações em `AppShell.tsx`, `AuthScreen.tsx`, `main.tsx`, `businessUi.tsx` e `PrivacyPage.tsx`.

Na geração inicial passaram **7 testes Java**, **8 testes unitários de nativeAndroid**, build release e verificação da assinatura v2/v3. `lintRelease` terminou com zero erros e avisos remanescentes. O ensaio visual local em `web/native-qa.html` usou componentes reais e dados fictícios. No navegador: formulário em 320 × 568 sem excesso horizontal, Cancelar/Agendar com 48 px; login em 360 × 740 sem rolagem e cachorro inteiro; ações do diálogo em 412 × 892 dentro da área visível. Criar um agendamento fictício local fechou o modal e exibiu o cartão na agenda. Depois, instalei o APK e enviei capturas do aparelho, que motivaram as correções atuais. Isso não equivale a uma verificação completa de teclado, seletores ou Voltar. A camada nativa não mudou: continua o APK 1.0.0 com o mesmo SHA-256, e as correções chegam pela interface remota após a nova publicação.

A camada web com os ajustes Android já foi publicada no Railway em 09/11/2026, na revisão `1d953fbc`, implantação `1fa762ae-a491-443e-afa5-929d630afe61` com `SUCCESS`. Os dois assets publicados corresponderam byte a byte ao build local. Mudanças só na web são publicadas no servidor; alterações na camada Android exigem novo APK e incremento do código de versão. A chave de assinatura em `.android-signing/` é privada, ignorada pelo Git e precisa ser preservada para futuras atualizações. Não peça essa chave, não recrie outra silenciosamente e não a publique. Consulte `docs/ANDROID.md`.

APK gerado não significa produto comercialmente liberado: SPF pendente e pontos jurídicos/operacionais continuam no checklist. Não desative esses controles para aparentar conclusão.

A compilação final, os testes conclusivos da trava persistente de checkout e a publicação desta revisão posterior às capturas ainda precisam de registro. Não atribua esses resultados à implantação anterior nem copie os totais antigos como se fossem uma nova rodada completa.

## Arquivos principais

- `web/src/AuthScreen.tsx`, `AppShell.tsx`, `Overview.tsx`, `Brand.tsx` e `GlobalSearch.tsx`.
- `web/src/CalendarPage.tsx`, `DataPage.tsx`, `WaitlistPage.tsx`, `TeamPage.tsx` e `PlatformPage.tsx`.
- `web/src/CrmPage.tsx`, `InventoryPage.tsx`, `FinancePage.tsx`, `ReportsPage.tsx`, `PrivacyPage.tsx`, `LegalScreen.tsx` e `CommercialPages.tsx`.
- `web/src/FirstSteps.tsx`, `FormDialog.tsx`, `businessUi.tsx`, `api.ts` e `main.tsx`.
- `web/src/nativeAndroid.ts`, `web/src/checkout.ts`, `web/src/styles/_native-android.scss`, `web/src/styles/_mobile-usability.scss`, `web/tests/nativeAndroid.unit.test.ts`, `web/native-qa.html` e `web/tests/native-qa.tsx`.
- `android/`, `scripts/build-android.mjs` e `docs/ANDROID.md`; preserve a chave privada fora do Git.
- `api/src/crmRoutes.ts`, `businessRoutes.ts`, `businessService.ts`, `privacyRoutes.ts`, `privacyService.ts`, `commercialRoutes.ts` e `commercialService.ts`.
- `api/src/core.ts`, `server.ts`, `originGuard.ts`, `fileRoutes.ts`, `petPhoto.ts`, `maintenance.ts` e processos de lembrete existentes.
- `api/sql/` e `api/scripts/migrate.mjs`, `backup.mjs`, `restore-check.mjs`.
- Estilos em `web/src/styles/`; preserve os módulos existentes.

Preserve a empresa autenticada em toda consulta, permissões próprias, valores em centavos, transações, idempotência, fuso da empresa e FKs compostas. Os seletores mínimos de tutores/serviços/contas não concedem acesso ao cadastro completo. Preserve o cabeçalho `X-PetCore-Request` e origens explícitas; nunca use `*` para resolver login pelo celular.

## Contato, privacidade e serviços externos

Identidade informada: **José Andrey Pereira Lisboa**, pessoa física, marca **Tiger Tech — Sites, Sistemas e Soluções Digitais**. Endereço: **Rua Brasílio Machado, 404, Santo André/SP, CEP 09060-700**. Suporte e privacidade: **tigertechbr@outlook.com**. Domínio institucional/remetente: **tigertech.dev.br**; o aplicativo continua no endereço do Railway. Não invente CNPJ, fornecedores ou outros dados. A identidade já foi fornecida; não trate isso como uma pendência em branco. Os documentos continuam sem publicação e ainda precisam de revisão/aprovação, fornecedores/regiões e procedimentos de retenção, incidentes e atendimento. Recursos de privacidade não são certificação de conformidade.

Recuperação usa `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`; essas variáveis estão configuradas na revisão publicada 434a341f. Lembretes usam `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e duas liberações explícitas. O serviço está ativado a cada cinco minutos, com até 20 mensagens por execução e prazo de 10s por envio. A primeira execução confirmada não encontrou lembrete autorizado devido e não enviou mensagens. Falha incerta não provoca reenvio automático. O usuário autorizou lembretes somente para tutores com opt-in registrado. Contatos do CRM não concedem esse consentimento.

Um único teste de e-mail foi aceito pelo Resend e confirmado pelo usuário na pasta Spam. Não prometa Caixa de Entrada nem trate aceitação da API como prova de entrega regular. O remetente é `lembretes@tigertech.dev.br`. A consulta DNS encontrou DKIM e DMARC `p=none`, mas não retornou TXT SPF no Return-Path padrão `send`; o usuário confirmou que SPF está Pending, e uma consulta ao servidor autoritativo também não encontrou o TXT de send. Falta copiar/publicar o registro exato do painel e aguardar Verified, além de conferir os resultados nos cabeçalhos recebidos. Não altere DNS, endureça DMARC ou dispare testes extras sem autorização. Consulte `docs/EMAIL.md`.

O PetCore está publicado em **https://petcore-homologacao.up.railway.app**, com implantação `1fa762ae-a491-443e-afa5-929d630afe61` concluída com sucesso na revisão `1d953fbc`. Usa configurações diretas do Railway e Dockerfile, sem depender de `railway.json`/`railway.toml`. Essa revisão foi conferida após a publicação: página/saúde/banco OK, sessão sem login com 401 e assets idênticos ao build local. Os 12 testes remotos anteriores referem-se à revisão `434a341f`; não os apresente como uma nova rodada completa nesta entrega Android. Os documentos jurídicos permanecem sem publicação.

O ensaio HTTPS atual com **12 verificações** aprovou sessão segura, Free, origens, isolamento entre empresas, permissões mínimas, fotos privadas normalizadas, substituição/exclusão, exportação e anonimização. Todos os registros e objetos fictícios desse ensaio foram removidos. Manutenção a cada 15 minutos e backup diário às 03h de Brasília tiveram execução confirmada. A restauração remota conferiu **46 tabelas**, com registro `verified` do backup de prefixo `ff3dc3a4`; o dump não inclui fotos. Migrations **001–013** foram aplicadas na homologação e no banco original, que continua sendo somente de testes, após a cópia de preservação `br-quiet-mountain-b62dyl9j`.

A rodada completa anterior passou **103 testes locais: 18 unitários e 85 de integração**, incluindo comercial **19/19**, autenticação **11/11**, lembretes **8/8** e regressões de upload. O build e o TypeScript dessa rodada passaram; esses totais não são evidência dos ajustes posteriores de cobrança. Provedores de e-mail foram simulados nesses testes, sem mensagens reais. A recuperação consome os outros links pendentes da mesma conta. Edições parciais preservam a autorização de lembretes, e a migration 013 garante a ordem dos eventos. A suíte de integração executa arquivos em série porque testes comerciais alteram configurações globais do banco isolado. Não some rodadas sobrepostas. A jornada de cadastros até o agendamento foi percorrida na interface. A agenda tem filtros com rótulos separados e cartões com horário, situação, pet, cliente, serviços e profissional em linhas distintas. Ao criar, reagendar ou antecipar, mostra a data resultante e limpa buscas que esconderiam o atendimento. Preserve o espaçamento em computador, tablet e celular.

## Como continuar

Antes de alterar código, peça somente os arquivos atuais relevantes. Não peça `.env`, senhas, tokens, chaves ou conexões com senha. Não consegue acessar minha pasta por conta própria.

O objetivo é concluir um sistema simples para clientes sem conhecimento técnico e prepará-lo para comercialização. Explique o impacto da mudança e como validar. Preserve as evidências já obtidas sem refazer a arquitetura. Não declare publicação de revisão posterior, ativação de lembretes, entrega na Caixa de Entrada ou aprovação jurídica sem evidência. Consulte `README.md`, `docs/COMMERCIAL-READINESS.md`, `docs/RAILWAY.md`, `docs/OPERACAO.md` e `docs/EMAIL.md` atualizados.
