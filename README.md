# PetCore — gestão para pet shops

Sistema SaaS multiempresa da Tiger Tech, em português, com interface responsiva e operação interna do pet shop. A homologação está publicada em [petcore-homologacao.up.railway.app](https://petcore-homologacao.up.railway.app). A revisão final de 09/11/2026 foi publicada com SUCCESS às 21h22 de Brasília: commit `d463fa12253c83033b90445c900aaf1954a71bc2`, implantação `00a6dea0-7d32-4b9e-8ac0-7cac9276c9fc`. Página e saúde responderam 200, com `{ok:true,database:true}`; a sessão anônima retornou 401. Os assets `index-C_n1QduZ.js` e `index-DpZQfskv.css` responderam 200 e corresponderam byte a byte ao build local por SHA-256. A consulta final encontrou cinco serviços sem problemas, falhas recentes ou alterações pendentes. A rodada anterior de 12 verificações HTTPS permanece registrada para a revisão `434a341f`. Este registro não declara prontidão comercial; os pontos restantes estão no checklist de preparação.

O contexto para continuar no ChatGPT gratuito está em [PROMPT-CHATGPT-GRATUITO.md](PROMPT-CHATGPT-GRATUITO.md). O estado de entrega está em [COMMERCIAL-READINESS.md](docs/COMMERCIAL-READINESS.md).

## O que já existe

| Área | Comportamento implementado |
|---|---|
| Acesso e empresas | Login, sessão no PostgreSQL, senhas Argon2id, recuperação por provedor configurado, convites e permissões por empresa |
| Cadastros e agenda | Clientes/tutores, pets, serviços, profissionais, jornada, pausas, folgas, agenda, reagendamento, antecipação, faltas e histórico |
| Lista de espera | Registro, sugestões de vaga e encaixe transacional |
| CRM | Carteira dos tutores existentes, segmentos de inatividade, ficha, contatos manuais e tarefas de retorno |
| Produtos e estoque | Cadastro, preço/custo, mínimo, movimentos e histórico; controle de saldo e concorrência |
| Financeiro | Vendas/comandas internas de produtos e serviços, recebimentos parciais, despesas e caixa com fechamento |
| Relatórios | Indicadores, gráficos e exportação CSV a partir dos registros da empresa |
| Plano e assinatura | Free de 30 dias, Mensal de R$ 35 e Anual de R$ 350; validade, suspensão e conciliação manual |
| Suporte | Chamados e respostas entre o pet shop e a plataforma |
| Privacidade | Pedidos de titulares, verificação de identidade, exportação, anonimização e auditoria |
| Operação | Migrations controladas, manutenção, fotos em armazenamento privado e scripts de backup criptografado/restauração |

Produtos e estoque servem ao balcão e ao consumo interno. Não há loja virtual, compras públicas, táxi dog, entregas ou acompanhamento de pedidos de comércio eletrônico.

Uma venda aberta ou um serviço agendado não é dinheiro recebido. O Financeiro registra recebimentos informados pela equipe; não precisa acessar a conta bancária do pet shop. Não há integração bancária, emissão fiscal ou captura de cartão no PetCore.

## Primeiros passos e aparência

O responsável recebe um guia: cadastrar serviços; cadastrar o profissional e configurar sua jornada/serviços; cadastrar cliente e pet; agendar; registrar um recebimento. Quando falta um cadastro necessário, a interface explica a dependência e oferece um atalho a quem tem permissão. Funcionários sem essa permissão recebem orientação para procurar o responsável.

Preserve o visual oficial das referências `pet-core-login.png` e `painel-petcore.png`: azul-marinho, turquesa, fundos claros, marca com pata/coração e o mesmo cachorro em `web/public/images/petcore-dog.png`. No login móvel, ele deve aparecer inteiro, incluindo as patas, com conteúdo centralizado e espaçamento.

Os formulários usam `FormDialog`: tela inteira até 780 px e modal centralizado no computador, sem formulários escondidos abaixo das listas. Foco, fechamento e rolagem do fundo são controlados. **Os avisos gerais de sucesso e erro mantêm a posição e o comportamento originais**, conforme pedido do usuário.

As correções móveis desta revisão organizam as ações do atendimento em uma grade com botões de pelo menos 48 px, sem palavras partidas por letra. O guia inicial e os cartões de resumo usam corpo de 16 px e textos secundários de pelo menos 14 px. Os cadastros passam a ser cartões com rótulos no celular: nome, telefone, e-mail e ações ficam disponíveis, inclusive endereços longos, sem rolagem lateral nem conteúdo escondido. `web/src/styles/_mobile-usability.scss`, importado após os ajustes Android, aplica essas correções ao navegador móvel e ao APK. A explicação longa de funcionamento do PagBank foi retirada da página de assinatura.

## Aplicativo Android

Foi gerado o APK release assinado **PetCore 1.0.0**, em `releases/PetCore-1.0.0.apk`, para Android **8.0 ou superior**. Ele abre o mesmo sistema no endereço de homologação do Railway e precisa de internet. O modo Android tem textos maiores, áreas de toque ampliadas, espaçamento e formulários responsivos; preserva o cachorro inteiro no login e os avisos existentes. Fotos e exportações CSV/JSON usam os seletores do Android, e o botão Voltar fecha primeiro formulários e menus.

Na geração do APK, as políticas nativas passaram em 7 testes Java e a integração web em 8 testes unitários; build release e verificação de assinatura passaram, e `lintRelease` terminou sem erros, com avisos. O ensaio responsivo no navegador conferiu 320 × 568, 360 × 740 e 412 × 892, além de criar um agendamento fictício local. Depois, o usuário instalou o aplicativo e enviou capturas de uso; isso não equivale a um ensaio completo de teclado, seletores e navegação no aparelho. As correções web desta revisão passaram pela compilação de API/interface e pelos testes focalizados; a publicação final foi concluída e conferida no Railway. O APK continua em 1.0.0, com o mesmo hash; a camada nativa não mudou. A chave privada de atualização está em `.android-signing/`, fora do Git, e precisa ser preservada em cópia privada. Instruções e limites em [ANDROID.md](docs/ANDROID.md).

O portfólio planejado tem um SaaS por área: pet shop, barbearia, prontuário e salão de beleza. Melhorias futuras para pet shops pertencem ao mesmo PetCore; táxi dog segue fora do escopo implementado.

## Planos e cobrança

- **Plano Free:** experiência de 30 dias; não é gratuito permanente. Vem selecionado no modal do primeiro acesso do responsável. O relógio começa quando ele confirma o Free.
- **Plano Mensal:** R$ 35.
- **Plano Anual:** R$ 350.

É possível escolher um plano pago imediatamente, sem aguardar o teste. **Assinar agora** solicita autorização à API e abre o endereço de checkout retornado por ela; se a abertura for bloqueada, oferece um link para continuar. O pagamento acontece no PagBank. Escolher um plano ou voltar do checkout não comprova pagamento e não ativa acesso pago. A plataforma confere o recebimento no PagBank e registra a conciliação.

A conta atual é PagBank PF. Este fluxo usa links recorrentes hospedados e não precisa de token de produção da API de assinaturas. Os links atuais foram conferidos, sem compra: [PetCore Mensal — R$ 35](https://pag.ae/82jFKCTjo) e [PetCore Anual — R$ 350](https://pag.ae/82jFLbrjr). A revisão dos planos está aprovada no cadastro. Os links antigos de “sistema de demandas” não devem ser reutilizados. Por solicitação do usuário, a disponibilidade do checkout revisado não depende de `legal.published`; isso não publica documentos nem resolve a revisão jurídica pendente para a oferta comercial.

O botão vermelho **Cancelar assinatura** abre uma confirmação com a ação **Confirmar pedido**, que registra um pedido de suporte. Na conta PF atual, o vendedor precisa cancelar a recorrência real no painel do PagBank e depois confirmar esse fato na operação da plataforma, com senha, referência e motivo. A confirmação confere o período pago esperado para recusar um formulário antigo após um novo recebimento. Ela registra a data de cancelamento da renovação, resolve os pedidos de cancelamento anteriores daquele ciclo e preserva o acesso já pago. Só depois disso outro checkout pode ser liberado; o plano do período pago muda apenas quando o novo recebimento for conciliado. O PetCore não informa cancelamento automático que não tenha ocorrido no provedor.

O início de checkout fica registrado de forma persistente por empresa em `pending_checkout_at`, para impedir novas tentativas que possam criar recorrências paralelas. Fechar a janela ou recarregar a tela não libera outra assinatura. A recuperação manual de uma tentativa abandonada exige conferência no PagBank, reautenticação e registro da justificativa; não se deve remover a trava por suposição ou pelo tempo decorrido. O procedimento está em [OPERACAO.md](docs/OPERACAO.md).

O Free termina no vencimento, sem os dias de tolerância dos planos pagos. O vencimento bloqueia alterações, preservando consulta, assinatura, suporte e os canais próprios de privacidade. Documentos jurídicos publicados exigem aceite explícito da versão atual.

## Tecnologia e execução local

React 19, TypeScript, Vite e SCSS na interface; Node.js 22.12+, Express 5 e PostgreSQL na API. Sessões ficam no banco; os dados operacionais não ficam em `localStorage`. A imagem inclui clientes PostgreSQL 18 para backup e restauração.

1. Instale Node.js compatível e PostgreSQL local; `compose.yml` é uma alternativa com Docker.
2. Execute `npm ci` na raiz.
3. Copie `.env.example` para `.env` somente se ainda não existir. Defina conexão, senha e segredo de sessão privados.
4. Execute `npm run db:migrate`.
5. Somente em desenvolvimento, configure os valores `SEED_*` e execute `npm run db:seed` para criar a plataforma e empresas demonstrativas.
6. Execute `npm run dev` e abra `http://localhost:5173`.

Não execute seed em bases com clientes reais. Nunca envie `.env`, senhas, tokens ou conexões com senha ao repositório ou ao chat.

Para celular na mesma rede, mantenha `APP_ORIGIN=http://localhost:5173` e adicione o endereço Network real do Vite em `APP_ALLOWED_ORIGINS`. Reinicie a API após mudar as variáveis. Não use `*`; preserve o cabeçalho `X-PetCore-Request`.

## Testes e evidências locais

```powershell
npm run build
npm run test:unit -w api
npm run db:migrate -w api -- --test
npm run test:integration -w api
```

Integrações exigem `TEST_DATABASE_URL` de banco exclusivo terminado em `_test`, sem usar `DATABASE_URL` como alternativa. A suíte comercial altera configurações globais desse banco durante o teste e as restaura; não execute duas cópias dessa suíte no mesmo banco ao mesmo tempo.

Evidências registradas nesta preparação:

- Correções atuais: **25 testes comerciais de integração** aprovados em PostgreSQL isolado novo com migrations **001–014**, **13 testes unitários web** aprovados (ponte Android e checkout), compilação de API/interface aprovada.
- Ensaio atual com componentes reais e dados fictícios locais: ações de atendimento em 360 px organizadas em grade; clientes em 320/360 px sem excesso horizontal, com fonte de 16 px; guia/resumos com corpo de 16 px e secundários de 14 px. O checkout anual capturou o destino correto, sem abrir o provedor; pedido de cancelamento e confirmação fictícia do operador preservaram a data Pago até. Não houve cobrança nem cancelamento real no PagBank.
- Rodada completa anterior de 103 testes aprovada: 18 unitários e 85 de integração, incluindo comercial 19/19, autenticação 11/11, lembretes 8/8 e regressões de upload. Esses números não representam uma nova rodada das correções de checkout e interface descritas acima.
- Restauração local de backup criptografado conferiu 46 tabelas, contagens e proteções contra chave incorreta, destino ocupado e uso da origem. O ensaio não inclui as fotos.
- Compilação da revisão publicada aprovada. Cadastro de serviço, profissional/jornada, cliente, pet e agendamento percorridos com dados fictícios. Agenda com novos espaçamentos conferida em computador/celular; após agendar, a data resultante fica visível.
- Ensaio HTTPS anterior com 12 verificações aprovado na revisão `434a341f`: sessão segura, configuração de recuperação sem envio, Free, origens, isolamento, permissões mínimas, fotos privadas, substituição/exclusão, exportação e anonimização. Todos os registros e objetos fictícios desse ensaio foram removidos.
- Recuperação invalida também os links anteriores da mesma conta. Os lembretes preservam a autorização em edições parciais e usam ordem sequencial dos eventos de consentimento. Os testes usam provedor simulado, sem e-mails reais.

Construção Docker, HTTPS e controles remotos de fotos já tiveram conferência. Isso não comprova adequação jurídica nem entrega regular de e-mails na Caixa de Entrada.

## Fotos, e-mails e privacidade

Fotos dependem de `OBJECT_STORAGE_*`. A API normaliza a imagem, remove metadados e fornece leitura temporária autorizada. Upload real, recusa de leitura anônima e exclusão foram conferidos. A retenção de versões e a recuperação dos objetos continuam sendo procedimentos próprios do armazenamento.

Recuperação usa `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY` e `EMAIL_FROM`, aplicadas na revisão `434a341f` e conferidas sem mensagem real. Lembretes usam outro processo, `RESEND_*` e duas liberações explícitas. O serviço está ativo a cada cinco minutos, com até 20 mensagens por execução e 10s por envio. A primeira execução não encontrou lembretes autorizados devidos. Somente tutores com autorização registrada podem receber; contatos do CRM não disparam mensagens nem concedem consentimento.

Um único teste de e-mail foi aceito pelo Resend e o usuário confirmou o recebimento na pasta Spam. Isso comprova aquele recebimento, sem garantir entrega na Caixa de Entrada. O diagnóstico DNS e as verificações restantes estão em [EMAIL.md](docs/EMAIL.md).

Suporte e solicitações sobre dados pessoais: **tigertechbr@outlook.com**. O canal de contato não substitui um remetente validado no provedor de e-mail.

A identidade e o endereço foram informados: **José Andrey Pereira Lisboa**, pessoa física, marca **Tiger Tech — Sites, Sistemas e Soluções Digitais**, Rua Brasílio Machado, 404, Santo André/SP, CEP 09060-700. Domínio institucional e remetente: `tigertech.dev.br`. Não foi informado CNPJ. A implementação de privacidade não é certificação de conformidade: revisão/publicação jurídica, fornecedores, retenção e procedimentos operacionais ainda precisam de aprovação. Veja [PRIVACIDADE-LGPD.md](docs/PRIVACIDADE-LGPD.md) e [LEGAL-DRAFTS.md](docs/LEGAL-DRAFTS.md).

## Railway e recuperação

O ambiente de homologação usa o Neon e destinos privados separados para fotos e backups. Migrations **001–014** estão aplicadas na homologação e no banco original, confirmado como somente testes. A migration 014 foi aplicada pelo pré-deploy da implantação `2f176aca-c7b5-47a8-9ac1-8a95e9c445d4` e pelo comando de migration no original. A cópia de preservação anterior `br-quiet-mountain-b62dyl9j` permanece registrada. Não use seed ou testes destrutivos quando houver dados reais.

O serviço usa Dockerfile e configurações diretas no Railway para início, migrations e health check. Não depende de `railway.json` ou `railway.toml`. Não é necessário instalar outro PostgreSQL no Railway: o banco permanece no Neon.

A manutenção a cada 15 minutos e o backup diário às 03h de Brasília já tiveram execução confirmada. O backup cifra dump e manifesto com AES-256-GCM antes do envio a um bucket separado. Uma restauração remota conferiu 46 tabelas e registrou o backup de prefixo `ff3dc3a4` como `verified`. O dump não inclui fotos. Alertas, retenção, guarda externa da chave e recuperação dos objetos exigem acompanhamento próprio.

Procedimentos: [RAILWAY.md](docs/RAILWAY.md) e [OPERACAO.md](docs/OPERACAO.md).

## Principais arquivos

- `api/src/authRoutes.ts`, `dataRoutes.ts`, `calendarRoutes.ts`: acesso, cadastros e agenda.
- `api/src/crmRoutes.ts`, `businessRoutes.ts`, `privacyRoutes.ts`, `commercialRoutes.ts`: módulos de relacionamento, operação, privacidade e plataforma.
- `api/sql/`: migrations aditivas; não altere arquivos já aplicados.
- `api/scripts/migrate.mjs`, `backup.mjs`, `restore-check.mjs`: implantação e recuperação.
- `web/src/CrmPage.tsx`, `InventoryPage.tsx`, `FinancePage.tsx`, `ReportsPage.tsx`, `PrivacyPage.tsx`, `CommercialPages.tsx`: módulos da interface.
- `web/src/FirstSteps.tsx`, `FormDialog.tsx`, `DataPage.tsx`, `CalendarPage.tsx`: orientação e formulários responsivos.

O isolamento usa autorização na API, filtros por empresa, transações e FKs compostas. Não há RLS habilitado. Preservar essas garantias exige testar cada rota nova; uma compilação aprovada não substitui essa verificação.
