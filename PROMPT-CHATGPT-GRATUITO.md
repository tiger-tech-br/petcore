# Prompt para continuar o PetCore no ChatGPT gratuito

Copie o texto abaixo para uma nova conversa. Se quiser discutir a aparência, anexe também as imagens de referência.

---

Estou desenvolvendo o **PetCore**, um sistema de gestão para pet shops. Quero que você continue me ajudando a partir do estado atual descrito aqui, sem recriar o projeto do zero.

## Projeto e referências

O projeto está no meu computador, em `C:\Users\andre\Desktop\petcore-saas`. O frontend usa React 19, TypeScript, Vite e Sass/SCSS. A API usa Node.js, Express e PostgreSQL, com autenticação por sessão no servidor.

O layout já foi alterado com base nas imagens `painel-petcore.png` e `pet-core-login.png`. A identidade visual oficial combina azul-marinho, turquesa, fundos claros, cartões brancos e a marca PetCore com uma pata e coração. Quero manter o cachorro da referência: pequeno, peludo, marrom/preto, sentado, com laço verde e gravata amarela do Brasil. Ele aparece no login e no cartão de lembrete do painel.

No login responsivo, preserve o cachorro inteiro — cabeça, corpo e patas — sem cortar nem encobrir as patas com o formulário. Mantenha logo, títulos, campos e links centralizados, com espaço entre o cachorro inteiro, o título do cartão e os campos. O login adapta a imagem e os espaçamentos à altura útil do navegador, incluindo notebooks; a tela inicial foi verificada sem rolagem em 1366×607 e 320×568 px. Ajuda expandida, mensagens de erro e etapas extras de autenticação podem aumentar a altura para manter os controles acessíveis.

## Arquivos da interface

- `web/src/AuthScreen.tsx`: login, convite, recuperação e redefinição de senha; composição para computador e celular.
- `web/src/AppShell.tsx`: menu lateral, empresa selecionada, perfil, busca e navegação inferior no celular.
- `web/src/Overview.tsx`: visão geral, indicadores, agenda de hoje, pendências e resumos.
- `web/src/Brand.tsx`: marca reutilizável do sistema.
- `web/src/GlobalSearch.tsx`: busca de clientes, pets e atendimentos de hoje, respeitando permissões.
- `web/src/main.tsx`: sessão, navegação e importação das páginas separadas; `ui.tsx` reúne cabeçalho, estado vazio e situação.
- `web/src/CalendarPage.tsx`: agenda, novo atendimento, detalhes, reagendamento, antecipação e histórico.
- `web/src/DataPage.tsx`: cadastros e editor de jornada, serviços e folgas dos profissionais.
- `web/src/WaitlistPage.tsx`, `TeamPage.tsx` e `PlatformPage.tsx`: lista de espera/encaixes, equipe/configurações e empresas/convites.
- `web/src/FormDialog.tsx` e `web/src/styles/_dialog.scss`: janela nativa compartilhada e estilos dos formulários.
- `web/src/styles/_auth.scss`, `_tokens.scss`, `_petcore.scss`, `_search.scss` e `main.scss`: identidade visual, login, painel, busca e responsividade. Também existem os estilos anteriores `_base.scss`, `_app.scss` e `_responsive.scss`.
- `web/public/favicon.svg`: ícone da aplicação.
- `web/public/images/petcore-dog.png`: cachorro preparado a partir da referência. A origem e preparação estão documentadas em `petcore-dog-provenance.md`, na mesma pasta.

## Comportamento que deve ser preservado

Os formulários agora abrem em `FormDialog`, usando `<dialog>` nativo: tela inteira até 780 px e janela centralizada no computador. Cabeçalho e botão de fechar ficam visíveis; cancelar/salvar e mensagens locais de erro/sucesso pertencem à janela. A página de fundo fica bloqueada para rolagem, o foco retorna ao acionador ao fechar e mudanças de etapa/título retornam ao início do conteúdo.

Esse padrão cobre cadastros, jornada/folgas, agendamento/detalhes/reagendamento/antecipação/histórico, pedidos e encaixes da lista de espera, convites, permissões, configurações e criação de empresas. Por pedido do usuário, **os avisos gerais mantêm sua posição e seu comportamento originais na página**; esta mudança se limita aos formulários e detalhes. A validação local aparece também na janela para que o erro seja visível durante o preenchimento. **Não volte a acrescentar formulários ou detalhes invisíveis no fim da página.** Preserve APIs, permissões por empresa, fuso horário, valores em centavos e fotos no armazenamento do servidor.

Os fluxos de autenticação existentes foram mantidos. Não existe suporte a uma opção personalizada “Manter conectado”: a sessão usa um cookie com duração de oito horas, renovável pelo servidor. Não acrescente um checkbox sem implementar corretamente o comportamento necessário. A ajuda de acesso é exibida na própria interface; não existe um provedor real de suporte integrado.

O acesso pelo celular na rede local usa `APP_ALLOWED_ORIGINS`, uma lista explícita de endereços adicionais separada por vírgulas; `APP_ORIGIN` continua sendo o endereço principal. A validação está em `api/src/originGuard.ts`, com testes HTTP sem banco. Preserve a lista de origens e o cabeçalho obrigatório `X-PetCore-Request`; não libere todas as origens para corrigir problemas de acesso.

O painel consulta a API e mostra dados reais da empresa autorizada: atendimentos de hoje, em andamento, aguardando confirmação e pets cadastrados. A agenda permite filtrar por profissional. Há busca global, menu adaptado para celular e acesso ao novo agendamento.

O resumo de valores corresponde aos serviços agendados; **não representa caixa nem recebimentos**. Estoque, vendas, caixa, relatórios, planos e assinaturas ainda são módulos futuros, identificados como “Em breve”. Não invente movimentações financeiras, estoque baixo, notificações ou registros para copiar os números fictícios das imagens.

Na API, `api/src/fileRoutes.ts` recebeu uma correção de tipos: os IDs das duas rotas de foto são validados com `z.uuid().parse(req.params.id)`. Preserve o isolamento entre empresas, as permissões, os vínculos e a persistência no PostgreSQL.

## Como continuar me ajudando

Você não consegue ler os caminhos `C:\...` do meu computador por conta própria. Quando precisar analisar código, peça somente os arquivos ou trechos relevantes, para eu colar ou anexar. Nunca solicite o conteúdo do `.env`, senhas, tokens ou chaves privadas.

O comando `npm run build` passou para API e frontend após as alterações. O login foi conferido no navegador em desktop e em telas de 320 e 390 px; o cachorro aparece inteiro. Busca, filtro por profissional e abertura de agendamento foram verificados com dados temporários de teste, removidos antes da entrega. As verificações de compilação e interface não comprovam publicação nem testes completos em produção. Não afirme que o sistema foi publicado ou está pronto para produção sem evidências. Explique as mudanças propostas, preserve as funções existentes e indique a validação necessária para cada alteração.

Nesta rodada, `npm run build` passou para API e interface. Os modais foram verificados no navegador em 320×568, 360×670 e 1280×800 px com dados fictícios temporários: criação/edição de cliente, novo agendamento, erro com preenchimento preservado, salvamento, reagendamento, histórico, jornada/folgas, encaixe, convites, permissões e configurações. Também foram conferidos foco por teclado, Escape, restauração da posição da lista e avisos gerais na posição original. A página temporária de testes foi removida. Nenhum cadastro real foi criado ou alterado no Neon; estes testes não comprovam operação completa em produção.

## Atualização: CRM de relacionamento implementado

O projeto agora inclui **CRM**, integrado ao menu, à navegação e às permissões. O módulo reaproveita os tutores já cadastrados; não recrie uma tabela de clientes nem duplique seus cadastros.

`web/src/CrmPage.tsx` e `web/src/styles/_crm.scss` implementam pesquisa por nome/telefone/e-mail, paginação, indicadores, filtros de clientes e tarefas, ficha do cliente e registro manual de contatos. A ficha reúne pets, dados existentes do tutor, visitas, próximo agendamento, contatos e tarefas de retorno. Ela mostra até 10 atendimentos, 50 contatos e 50 tarefas, com pendentes primeiro; as listas principais são paginadas. Datas usam o fuso da empresa retornado pela API.

Os segmentos diferenciam **sem atendimento concluído** de **sem retorno há 30, 60 ou 90 dias**. Visita conta apenas atendimento `done` com início no passado; faltas, cancelamentos e registros futuros não contam como visitas realizadas. Os indicadores representam a empresa inteira, mesmo com pesquisa ou segmento ativos.

Contatos são registros manuais por WhatsApp, telefone, e-mail, presencial ou outro canal. Eles não enviam mensagens e não alteram o consentimento do tutor para lembretes. Tarefas têm título, observações, vencimento e estados `open`, `done` e `cancelled`; podem ser concluídas, canceladas ou reabertas. São tarefas internas, não reservas da agenda nem lembretes automáticos ao tutor. Não representam recebimentos financeiros.

A API está em `api/src/crmRoutes.ts`, montada em `/api/crm` em `server.ts` antes dos routers genéricos. As rotas são:

- `GET /clients` com `q`, `segment=all|inactive|without_visits`, `inactive_days=30|60|90`, `page` e `page_size`.
- `GET /clients/:id`.
- `POST /clients/:id/contacts` com `channel`, `summary` e `occurred_at`.
- `POST /clients/:id/tasks` com `title`, `notes` e `due_at`.
- `GET /tasks` com `filter=open|overdue|done|cancelled|all`, `page` e `page_size`.
- `PATCH /tasks/:id` com `status`.

Todos os caminhos acima têm prefixo `/api/crm`, exigem autenticação e isolamento por empresa. Administradores têm acesso; funcionários precisam receber a nova permissão **`crm`** explicitamente em Configurações. Ela foi adicionada à interface `TeamPage.tsx` e à validação de `dataRoutes.ts`; nenhuma conta de funcionário recebe CRM automaticamente. Conceder CRM permite consultar os dados de relacionamento da empresa e os resumos de atendimentos da ficha.

A migration **aditiva** `api/sql/005_crm.sql` cria `crm_contacts` e `crm_tasks`, com FKs compostas empresa/tutor e empresa/usuário criador, validações e índices. Não modifica as migrations anteriores nem consentimentos. Precisa ser aplicada ao banco do ambiente pelo fluxo de migrations existente, após validação em banco de testes. `api/tests/crm.integration.test.ts` contém testes de permissões, isolamento, métricas, filtros, contatos, tarefas e validação; usa exclusivamente um `TEST_DATABASE_URL` terminado em `_test`.

Preserve as alterações posteriores já existentes: central de notificações no `AppShell.tsx`, migrations `002` a `004`, campos e histórico de autorização de lembretes nos tutores, e o código atual de `api/src/reminderWorker.ts`. A existência desse arquivo não comprova um disparador automático de produção; o CRM não ativa nem altera envio de e-mail.

O CRM usa o `FormDialog` compartilhado, em tela inteira no celular e centralizado no computador. **Não mude a posição nem o comportamento dos avisos gerais de sucesso e erro.** Não limpe avisos ao abrir fichas; não coloque formulários escondidos abaixo das listas. Antes de mudar código, peça os arquivos atuais e preserve alterações posteriores, em vez de substituir versões completas antigas.

**Validação específica do CRM em 02/11/2026:** build completo aprovado, 10 testes unitários e 19 de integração aprovados em PostgreSQL local exclusivo (12 específicos do CRM). Interface conferida com dados fictícios em 1280×800, 360×670 e 320×568, incluindo contatos, ciclo de tarefas, filtros, busca, paginação, Escape e modais; os avisos gerais continuam na posição original. A migration `005_crm.sql` foi aplicada e verificada no Neon atual, confirmado por mim como ambiente de testes. Os registros fictícios da conferência ficaram em um banco temporário local, sem criar clientes, contatos ou tarefas nesse Neon. Não houve publicação nem validação completa em produção. O prompt específico está em `PROMPT-CRM-CHATGPT-GRATUITO.md`.

**Considere este o visual oficial do PetCore e aguarde minha próxima solicitação.**
