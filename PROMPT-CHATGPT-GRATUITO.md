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

## Planos confirmados

Os preços finais são **R$ 35 mensais e R$ 350 anuais**. Desconsidere os valores antigos de R$ 40/R$ 400.

No primeiro acesso do responsável, abre um modal com **Plano Free, Plano Mensal e Plano Anual**. O **Free vem marcado**, dura 30 dias e começa quando confirmado. Não é um plano gratuito permanente. Ele termina no vencimento; a tolerância configurada para regularizar plano pago não estende o teste.

O cliente pode escolher um plano pago imediatamente, sem testar nem aguardar 30 dias. Paga no checkout externo do PagBank. Minha conta PagBank é PF; o fluxo atual usa links recorrentes e conciliação manual pela plataforma. Não precisa colocar tokens de produção no projeto para esse fluxo.

Selecionar plano ou voltar do checkout não ativa assinatura paga. A Tiger Tech confere o recebimento no PagBank e registra a conciliação. No vencimento, consultas, assinatura, suporte e os canais próprios de privacidade continuam disponíveis.

Links atuais conferidos sem compra: **PetCore Mensal, R$ 35 — https://pag.ae/82jFKCTjo** e **PetCore Anual, R$ 350 — https://pag.ae/82jFLbrjr**. A revisão está marcada como aprovada no cadastro dos planos. Não reutilize os links antigos com o nome “sistema de demandas”. A publicação jurídica continua desativada e ainda condiciona a liberação do checkout no aplicativo. Não marque assinatura paga por escolha de plano nem por retorno do navegador.

## Visual e usabilidade que devem ser preservados

O visual oficial segue `painel-petcore.png` e `pet-core-login.png`: azul-marinho, turquesa, fundos claros, cartões e marca com pata/coração.

Preserve **o mesmo cachorro** de `web/public/images/petcore-dog.png`, com laço verde e gravata amarela do Brasil. No login responsivo, ele precisa aparecer inteiro, incluindo as patas. Mantenha logo, títulos, campos e links centralizados, com espaços adequados. A tela inicial adapta imagem e espaçamento à altura disponível; mensagens e etapas extras podem precisar de rolagem para manter controles acessíveis.

Formulários e detalhes abrem em `FormDialog` nativo: tela inteira no celular até 780 px, modal centralizado no computador, foco controlado e fundo sem rolagem. Não deixe formulários escondidos abaixo das listas nem empilhe janelas.

**Não mude a posição nem o comportamento dos avisos gerais de sucesso e erro.** A validação local do formulário pode aparecer também dentro do modal.

Há um guia de primeiros passos: serviços → profissional/jornada/serviços habilitados → cliente e pet → agendamento → recebimento. Quando falta pré-requisito, a tela explica o que fazer e oferece atalho somente a quem tem permissão. Preserve isso e as orientações para procurar o responsável quando faltar acesso.

## Arquivos principais

- `web/src/AuthScreen.tsx`, `AppShell.tsx`, `Overview.tsx`, `Brand.tsx` e `GlobalSearch.tsx`.
- `web/src/CalendarPage.tsx`, `DataPage.tsx`, `WaitlistPage.tsx`, `TeamPage.tsx` e `PlatformPage.tsx`.
- `web/src/CrmPage.tsx`, `InventoryPage.tsx`, `FinancePage.tsx`, `ReportsPage.tsx`, `PrivacyPage.tsx`, `LegalScreen.tsx` e `CommercialPages.tsx`.
- `web/src/FirstSteps.tsx`, `FormDialog.tsx`, `businessUi.tsx`, `api.ts` e `main.tsx`.
- `api/src/crmRoutes.ts`, `businessRoutes.ts`, `businessService.ts`, `privacyRoutes.ts`, `privacyService.ts`, `commercialRoutes.ts` e `commercialService.ts`.
- `api/src/core.ts`, `server.ts`, `originGuard.ts`, `fileRoutes.ts`, `petPhoto.ts`, `maintenance.ts` e processos de lembrete existentes.
- `api/sql/` e `api/scripts/migrate.mjs`, `backup.mjs`, `restore-check.mjs`.
- Estilos em `web/src/styles/`; preserve os módulos existentes.

Preserve a empresa autenticada em toda consulta, permissões próprias, valores em centavos, transações, idempotência, fuso da empresa e FKs compostas. Os seletores mínimos de tutores/serviços/contas não concedem acesso ao cadastro completo. Preserve o cabeçalho `X-PetCore-Request` e origens explícitas; nunca use `*` para resolver login pelo celular.

## Contato, privacidade e serviços externos

Identidade informada: **José Andrey Pereira Lisboa**, pessoa física, marca **Tiger Tech — Sites, Sistemas e Soluções Digitais**. Endereço: **Rua Brasílio Machado, 404, Santo André/SP, CEP 09060-700**. Suporte e privacidade: **tigertechbr@outlook.com**. Domínio institucional/remetente: **tigertech.dev.br**; o aplicativo continua no endereço do Railway. Não invente CNPJ, fornecedores ou outros dados. A identidade já foi fornecida; não trate isso como uma pendência em branco. Os documentos continuam sem publicação e ainda precisam de revisão/aprovação, fornecedores/regiões e procedimentos de retenção, incidentes e atendimento. Recursos de privacidade não são certificação de conformidade.

Recuperação usa `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`; essas variáveis foram configuradas sem deploy e aguardam a publicação final. Lembretes usam `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e duas liberações explícitas. Há um serviço preparado para executar a cada cinco minutos; código de lote e testes estavam em conclusão neste registro, portanto não afirme que já está ativo. O usuário autorizou lembretes somente para tutores com opt-in registrado. Contatos do CRM não concedem esse consentimento.

Um único teste de e-mail foi aceito pelo Resend e confirmado pelo usuário na pasta Spam. Não prometa Caixa de Entrada nem trate aceitação da API como prova de entrega regular. O remetente é `lembretes@tigertech.dev.br`. A consulta DNS encontrou DKIM e DMARC `p=none`, mas não retornou TXT SPF no Return-Path padrão `send`; falta confirmar a configuração exata no painel Resend e os resultados nos cabeçalhos recebidos. Não altere DNS, endureça DMARC ou dispare testes extras sem autorização. Consulte `docs/EMAIL.md`.

O PetCore está publicado em **https://petcore-homologacao.up.railway.app**, com implantação `b23f40a5-9c42-4710-9c2a-cb0668a7d04e` concluída com sucesso na revisão `4d5ffe41`. Usa configurações diretas do Railway e Dockerfile, sem depender de `railway.json`/`railway.toml`. Ajustes posteriores àquela revisão ainda precisam da publicação e validação final.

Um ensaio HTTPS com **11 verificações** aprovou sessão segura, Free, origens, isolamento entre empresas, permissões mínimas, fotos privadas normalizadas, substituição/exclusão, exportação e anonimização. Todos os registros e objetos fictícios desse ensaio foram removidos. Manutenção a cada 15 minutos e backup diário às 03h de Brasília tiveram execução confirmada. A restauração remota conferiu **46 tabelas**, com registro `verified` do backup de prefixo `ff3dc3a4`; o dump não inclui fotos. Migrations **001–013** foram aplicadas na homologação e no banco original, que continua sendo somente de testes, após a cópia de preservação `br-quiet-mountain-b62dyl9j`.

A rodada completa atual passou **103 testes locais: 18 unitários e 85 de integração**, incluindo comercial **19/19**, autenticação **11/11**, lembretes **8/8** e regressões de upload. Build e TypeScript passaram. Provedores de e-mail foram simulados nesses testes, sem mensagens reais. A recuperação consome os outros links pendentes da mesma conta. Edições parciais preservam a autorização de lembretes, e a migration 013 garante a ordem dos eventos. A suíte de integração executa arquivos em série porque testes comerciais alteram configurações globais do banco isolado. Não some rodadas sobrepostas. A jornada de cadastros até o agendamento foi percorrida na interface. A agenda tem filtros com rótulos separados e cartões com horário, situação, pet, cliente, serviços e profissional em linhas distintas. Ao criar, reagendar ou antecipar, mostra a data resultante e limpa buscas que esconderiam o atendimento. Preserve o espaçamento em computador, tablet e celular.

## Como continuar

Antes de alterar código, peça somente os arquivos atuais relevantes. Não peça `.env`, senhas, tokens, chaves ou conexões com senha. Não consegue acessar minha pasta por conta própria.

O objetivo é concluir um sistema simples para clientes sem conhecimento técnico e prepará-lo para comercialização. Explique o impacto da mudança e como validar. Preserve as evidências já obtidas sem refazer a arquitetura. Não declare publicação de revisão posterior, ativação de lembretes, entrega na Caixa de Entrada ou aprovação jurídica sem evidência. Consulte `README.md`, `docs/COMMERCIAL-READINESS.md`, `docs/RAILWAY.md`, `docs/OPERACAO.md` e `docs/EMAIL.md` atualizados.
