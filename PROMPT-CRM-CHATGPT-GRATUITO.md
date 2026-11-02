# Prompt de continuidade — CRM do PetCore

Copie o texto abaixo para o ChatGPT gratuito. Ele informa o estado do código; não dá acesso aos arquivos do computador.

---

Estou construindo com você o **PetCore**, meu SaaS de gestão para pet shops. **O projeto agora possui um módulo de CRM implementado no código.** Continue a partir deste estado e não recrie o módulo nem o sistema do zero.

O projeto está em `C:\Users\andre\Desktop\petcore-saas`, com React 19, TypeScript, Vite, Sass/SCSS, API Node.js/Express e PostgreSQL no Neon. Preserve a identidade PetCore azul-marinho e turquesa, o cachorro original inteiro no login responsivo, as telas existentes, as notificações já presentes no `AppShell.tsx`, o consentimento de lembretes por e-mail e o trabalho existente em `reminderWorker.ts`.

## O que o CRM faz

- Existe um item **CRM** no menu, também acessível pelo menu **Mais** no celular.
- O CRM reutiliza os **tutores/clientes já cadastrados**. Não cria outra base de clientes nem exige cadastrar o tutor novamente.
- Exibe indicadores de clientes, clientes sem atendimento concluído, clientes sem retorno no período selecionado, tarefas pendentes e tarefas atrasadas.
- Permite pesquisar nome, telefone e e-mail, filtrar clientes e navegar por páginas.
- O filtro **sem atendimento** representa clientes sem visita concluída no passado. O filtro **sem retorno** representa clientes cuja última visita concluída ocorreu há mais de **30, 60 ou 90 dias**. Um atendimento cancelado, uma falta ou um atendimento futuro marcado como concluído não contam como visita realizada.
- A ficha do cliente reúne contato, observações existentes, pets, resumo de visitas, próximo agendamento, histórico de contatos e tarefas de retorno.
- A equipe registra manualmente contatos por WhatsApp, telefone, e-mail, presencial ou outro canal, com data e descrição. Registrar um contato **não envia uma mensagem** e **não altera autorização para lembretes por e-mail**.
- É possível criar uma tarefa de retorno com título, observações e vencimento; concluir, cancelar e reabrir tarefas; consultar pendentes, atrasadas, concluídas, canceladas ou todas.
- Uma tarefa é um compromisso **interno da equipe**. Ela não reserva horário na agenda, não cria agendamento, não dispara lembrete ao tutor e não representa pagamento recebido.
- Datas de entrada e exibição usam o fuso da empresa retornado pela API.
- A ficha mostra até **10 atendimentos**, **50 contatos** e **50 tarefas**, com pendentes primeiro. As listas principais têm paginação.

## Permissões e dados

Os administradores da empresa têm acesso ao CRM. Funcionários precisam receber explicitamente a permissão **`crm`**, em **Configurações > Editar permissões**. A permissão não é concedida automaticamente e não é substituída pelas permissões de clientes, pets ou agenda. O acesso ao CRM permite consultar os dados de relacionamento da empresa, inclusive o resumo de atendimentos apresentado pela ficha.

Todas as consultas e alterações usam a empresa da sessão autenticada. Os novos registros têm vínculos compostos por empresa com o tutor e com o usuário criador. Nunca use um `tenant_id` enviado pelo navegador para autorizar operações e nunca exponha dados de outro pet shop.

## Arquivos implementados ou integrados

- `web/src/CrmPage.tsx`: listas, filtros, indicadores, ficha, contatos e tarefas.
- `web/src/styles/_crm.scss`, importado em `styles/main.scss`: visual responsivo do CRM.
- `web/src/AppShell.tsx` e `web/src/main.tsx`: navegação e montagem da tela.
- `web/src/TeamPage.tsx` e `api/src/dataRoutes.ts`: opção e validação da permissão `crm`.
- `api/src/crmRoutes.ts`: API de relacionamento, validações e isolamento por empresa.
- `api/src/server.ts`: monta o router em `/api/crm` antes dos routers genéricos de `/api`, para não exigir acidentalmente a permissão de fotos/pets.
- `api/sql/005_crm.sql`: migration **aditiva**, com tabelas `crm_contacts` e `crm_tasks`, FKs compostas e índices. Não modifica as migrations `001` a `004`, os clientes existentes nem os consentimentos.
- `api/tests/crm.integration.test.ts`: testes específicos de acesso, isolamento, métricas, filtros, contatos, tarefas, validação e vínculos no PostgreSQL.

## Rotas da API

Todas exigem sessão autenticada, empresa selecionada e acesso ao CRM:

- `GET /api/crm/clients?q=&segment=all|inactive|without_visits&inactive_days=30|60|90&page=1&page_size=12`
- `GET /api/crm/clients/:id`
- `POST /api/crm/clients/:id/contacts` com `channel`, `summary` e `occurred_at`.
- `POST /api/crm/clients/:id/tasks` com `title`, `notes` e `due_at`.
- `GET /api/crm/tasks?filter=open|overdue|done|cancelled|all&page=1&page_size=20`
- `PATCH /api/crm/tasks/:id` com `status` igual a `open`, `done` ou `cancelled`.

Os horários enviados à API têm ISO com fuso/offset. A lista de clientes retorna itens, total, paginação, indicadores e `timezone`; os indicadores abrangem a empresa inteira, independentemente da pesquisa e do segmento selecionado. As tarefas concluídas registram `completed_at`; reabrir ou cancelar limpa esse campo. O criador original não é substituído.

## Preservar a interface e os avisos

As fichas e os formulários usam o `FormDialog` existente: modal centralizado no computador e tela inteira no celular até 780 px, com rolagem interna, foco acessível e retorno ao acionador ao fechar. Não acrescente formulários escondidos no fim da página nem crie diálogos sobrepostos desnecessariamente.

**Os avisos gerais de sucesso e erro devem continuar exatamente na posição e com o comportamento atuais.** A validação do preenchimento também pode aparecer dentro do modal para permanecer visível. Abrir uma ficha ou um formulário não deve limpar os avisos gerais existentes.

Preserve autenticação por sessão, `X-PetCore-Request`, origens permitidas, separação entre empresas, armazenamento de fotos e permissões. CRM não implementa Financeiro, estoque, relatórios financeiros, cobrança de assinaturas ou envio automático de campanhas.

## Banco e validação

A migration `005_crm.sql` precisa estar aplicada no banco do ambiente para as rotas funcionarem. Ela deve ser testada em banco exclusivo de testes antes de ser aplicada ao ambiente usado pelo sistema. Use o fluxo de migrations existente; não cole SQL destrutivo nem execute seed em banco com clientes reais. Testes de integração usam somente `TEST_DATABASE_URL` de banco exclusivo terminado em `_test`.

**Validação específica do CRM em 02/11/2026:** `npm run build` passou para API e interface; os 10 testes unitários e os 19 testes de integração passaram em PostgreSQL local exclusivo, incluindo 12 testes específicos do CRM. A interface foi conferida com dados fictícios em 1280×800, 360×670 e 320×568: cadastro de contato, criação/conclusão/reabertura/cancelamento de retorno, filtros, busca, paginação, Escape, modal único e avisos gerais na posição original. A migration `005_crm.sql` foi aplicada e verificada no Neon que confirmei ser de testes; não foram criados clientes, contatos ou tarefas fictícios nesse Neon. A conferência visual utilizou um banco temporário separado. Não houve publicação, ativação de campanhas nem validação completa em produção.

## Como continuar

Você não consegue ler os caminhos do meu computador. Antes de propor mudanças, peça os arquivos atuais relevantes para eu anexar ou colar, incluindo `CrmPage.tsx`, `crmRoutes.ts` ou outros arquivos envolvidos. Não substitua arquivos completos usando versões antigas da conversa e não remova alterações feitas depois deste prompt. Nunca peça `.env`, senhas, tokens, chaves privadas ou endereços de conexão com credenciais.

Reconheça que o CRM já existe, explique eventuais limites e aguarde minha próxima solicitação antes de alterar funcionalidades.
