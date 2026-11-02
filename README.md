# PetCore SaaS — gestão operacional multiempresa

> **Projeto independente:** este repositório é o SaaS **PetCore**. O projeto anterior permanece intacto e separado. Os bancos, as contas de sessão, os nomes de pacotes e a documentação desta cópia usam o nome PetCore.


**Entrega: base executável da Etapa 1, não uma solução pronta para produção.**

Sistema web em português que abre **diretamente no login**. Sem landing page, loja virtual ou site institucional. Front-end React 19 + TypeScript + Vite 7 + Sass (SCSS); API Node.js + Express 5 + PostgreSQL 17; autenticação por sessões PostgreSQL, senhas Argon2id. Interface responsiva para PC, tablet e celular. Todos os cadastros e agendamentos persistem em PostgreSQL, não no navegador. Fotos de pets são enviadas a um bucket S3 compatível **apenas quando o armazenamento externo está configurado**.

## Layout PetCore

Login e painel seguem as referências `pet-core-login.png` e `painel-petcore.png`, com azul-marinho, turquesa, marca com pata e coração e o cachorro da referência em `web/public/images/petcore-dog.png`. No celular, o cachorro aparece inteiro acima do formulário. Logo, títulos, campos e links ficam centralizados, com espaço entre o cachorro inteiro, o título do cartão e os campos. O login adapta imagem e espaçamentos à altura disponível do navegador, com a tela inicial sem rolagem verificada em 1366×607 e 320×568 px. Ajuda expandida, mensagens e etapas extras de autenticação podem aumentar a altura para manter os controles acessíveis. O painel inclui agenda de hoje, filtro por profissional, confirmações pendentes, busca e navegação inferior no celular. Os indicadores vêm da API; os valores agendados não representam recebimentos. Os módulos ainda não implementados estão identificados como “Em breve”.

O contexto pronto para continuar no ChatGPT gratuito está em [PROMPT-CHATGPT-GRATUITO.md](PROMPT-CHATGPT-GRATUITO.md).

Formulários e detalhes abrem no `FormDialog` nativo, em tela inteira no celular (até 780 px) e centralizados no computador. Cabeçalho/fechar permanecem visíveis, com cancelar/salvar e validação local na janela; o fundo não rola e o foco é restaurado ao fechar. Por pedido do usuário, os avisos gerais preservam sua posição e seu comportamento originais na página. As páginas foram separadas de `main.tsx` em `CalendarPage`, `DataPage`, `WaitlistPage`, `TeamPage` e `PlatformPage`, com auxiliares em `ui.tsx` e estilos em `_dialog.scss`. Cadastros, jornadas/folgas, agenda, encaixes, convites e configurações seguem esse padrão: não acrescentar formulários escondidos abaixo das listas. A verificação local desta rodada não comprova operação completa em produção/Neon.

Validação dos modais: `npm run build` passou para API e interface. Fluxos de cadastro, agenda, encaixe, convites e configuração foram conferidos no navegador com dados fictícios, em telas de 320×568, 360×670 e 1280×800 px, incluindo erro, fechamento, teclado e retorno à lista. A página temporária de testes foi removida; não houve criação ou alteração de cadastros reais no Neon.

## Estado de implementação — não confundir com um sistema já publicado

| Recurso | Situação atual |
|---|---|
| Login, logout, sessão persistida no PostgreSQL, hash Argon2id | Implementado no código; integração ainda não executada |
| Recuperação de senha por e-mail com token de 30 min | Implementado; exige provedor Resend com credenciais |
| Duas áreas, criação de empresa e convites | Implementado; admin gera e compartilha link de convite manualmente |
| Isolamento por empresa, vínculos de usuário, permissões | Implementado na API e em FKs compostas no banco |
| Tutores, pets, profissionais, serviços, jornadas, pausas e folgas | CRUD básico, horários e vínculos de serviços; sem exclusão de cadastros |
| Agenda dia/semana/profissional, serviços múltiplos, estados | Implementado no código |
| Concorrência, reagendamento, antecipação, faltas, histórico | Implementado na API com transações e restrição EXCLUDE |
| Lista de espera, sugestões de vaga, registro de oferta e encaixe | Implementado; sem envio automático de oferta |
| Jobs de lembrete | Registros são atualizados/cancelados; **não existe worker de envio ainda** |
| Upload e URL privada de foto de pet | Implementado; depende de bucket S3 compatível configurado |
| Vendas, produtos, estoque, caixa, relatórios | **Não implementados** (Etapa 3) |
| Planos, assinaturas, pagamentos, cobranças, webhooks | **Não implementados** (Etapa 4) |
| Central de notificações, worker e-mail, suporte | **Não implementados** (Etapa 2/4) |
| Backups automáticos, PITR, hospedagem ativa | **Não provisionados**; instruções de implantação/recuperação abaixo |
| Testes de integração | Escritos, **não executados neste ambiente** |

Não registre clientes verdadeiros nem inicie cobrança até concluir os testes, segurança e publicação de produção.

## 1. Entenda o que será instalado

- **Node.js** executa o back-end e as ferramentas de desenvolvimento. Use Node.js **22.12+** (preferencialmente uma versão LTS atual compatível).
- **npm** é o gerenciador de pacotes que vem com Node.js.
- **React** cria os componentes da interface, **TypeScript** ajuda a detectar erros no código, **Vite** inicia o servidor de desenvolvimento e constrói os arquivos para publicação.
- **Sass/SCSS** é um pré-processador que permite variáveis, organização e estilos mais fáceis de manter. O arquivo `web/src/styles/main.scss` (que importa os módulos `_base.scss`, `_app.scss`, `_auth.scss` e `_responsive.scss`) é convertido automaticamente em CSS pelo Vite. A dependência Sass deve estar instalada no projeto: `npm install --save-dev sass -w web`. A instalação do projeto com `npm install` já a inclui. Não é necessário adicionar um `<link>` manual no HTML porque `main.tsx` importa o SCSS e o Vite inclui o CSS compilado. Para experimentar compilação manual: `npx sass --watch web/src/styles/main.scss:web/public/preview.css` (pasta `web/public` deve existir; esse arquivo de prévia **não** é usado no app).
- **Express** disponibiliza a API, **PostgreSQL** guarda os dados, **Docker Desktop** é uma opção para rodar somente um PostgreSQL **local para desenvolvimento**.
- **Argon2id** guarda um hash irreversível das senhas. **Sessões** são armazenadas no PostgreSQL, com cookie HTTP-only.

Documentação oficial: [Vite](https://vite.dev/guide/), [React](https://react.dev/learn), [TypeScript](https://www.typescriptlang.org/docs/), [Sass](https://sass-lang.com/install/), [Express](https://expressjs.com/en/starter/installing.html), [PostgreSQL](https://www.postgresql.org/docs/17/index.html), [node-postgres transactions](https://node-postgres.com/features/transactions).

## 2. Primeira execução no Windows e VS Code

1. Instale Node.js 22.12+ e, para usar o banco de testes local, Docker Desktop com engine iniciada. Instale o VS Code.
2. Extraia a pasta `petcore-saas`, abra-a no VS Code (`Arquivo > Abrir Pasta`) e abra `Terminal > Novo Terminal`, escolhendo **PowerShell**.
3. Confira as ferramentas:

```powershell
node -v
npm -v
docker --version
```

4. Execute na **raiz** do projeto:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
```

5. Defina no `.env` uma senha forte e igual em `POSTGRES_LOCAL_PASSWORD` e no campo da senha de `DATABASE_URL`. Gere `SESSION_SECRET` aleatório com este comando **PowerShell**:

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

6. Configure `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (12+ caracteres) e `SEED_DEMO_OWNER_PASSWORD` (12+ caracteres). São segredos **locais**, nunca os envie para o repositório.
7. Crie a instância local de desenvolvimento e aplique as migrations:

```powershell
docker compose --env-file .env up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

8. Entre em `http://localhost:5173`. Primeiro login: `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD`. Na área da plataforma, cadastre empresas e gere convites. O seed também gera **duas empresas demonstrativas isoladas**. Seus responsáveis usam `demo1@petcore.example` e `demo2@petcore.example` e a senha definida em `SEED_DEMO_OWNER_PASSWORD`.

Para entrar pelo celular na mesma rede Wi-Fi, use o endereço `Network` exibido pelo Vite (por exemplo, `http://192.168.0.9:5173`). Mantenha `APP_ORIGIN=http://localhost:5173` e defina `APP_ALLOWED_ORIGINS=http://192.168.0.9:5173` no `.env`, usando o endereço real do seu computador. Reinicie `npm run dev` depois de alterar o `.env`. Se o IP mudar, atualize a configuração. A API aceita apenas as origens explicitamente configuradas e continua exigindo o cabeçalho de segurança; não use `*`.

Para encerrar: `Ctrl+C` no terminal do Vite e `docker compose stop db` no terminal de banco. **Não use `docker compose down -v`** sem querer apagar o volume com os dados locais.

Se escolher um **PostgreSQL em nuvem** desde o começo, não execute o Docker; configure `DATABASE_URL` com a conexão real, `DATABASE_SSL=true` conforme as exigências do provedor, execute migrations/seed apenas no ambiente destinado a desenvolvimento e inicie com `npm run dev`. Para dados reais, não execute `db:seed`.

## 3. Testes unitários e de integração

Os testes de horário (timezone, contiguidade e virada do dia) e da validação de origem podem ser executados sem PostgreSQL:

```powershell
npm run test:unit -w api
```

**Verificação nesta entrega:** os 10 testes unitários passaram, incluindo os horários e pedidos HTTP que verificam origens permitidas, endereços rejeitados e o cabeçalho obrigatório.

Para testes de integração, use um segundo banco denominado `petcore_test`, separado do banco de desenvolvimento. Com Docker:

```powershell
docker compose exec db psql -U petcore -d postgres -c "CREATE DATABASE petcore_test;"
npm run db:migrate -w api -- --test
npm run test:integration -w api
```

`TEST_DATABASE_URL` deve apontar para esse banco, com nome terminado exatamente em `_test`. Os testes são executados sobre registros reais no PostgreSQL, criam tutores/pets/profissionais/usuários temporários de teste e podem acumular dados de teste. **Nunca use produção para testes.**

O conjunto verifica: dois tenants isolados; alterações forjadas de identificadores; impedimento de FKs cruzadas; permissões e agenda restrita do funcionário; duas reservas simultâneas, com uma rejeitada; reagendamento recusado sem perder horário original; antecipação com consentimento, histórico e job de lembrete; falta preservando o histórico; confirmação única da lista de espera; e leitura persistente por sessão nova.

## 4. Como são separadas as empresas

- Cada empresa possui `tenants.id` (UUID). `users` é global, e `memberships` define em quais empresas um usuário pode trabalhar.
- O servidor busca o `tenantId` na **sessão autenticada e na tabela de permissões** antes de consultar dados; nunca aceita um `tenant_id` enviado pelo formulário como autorização.
- Tutores, pets, profissionais, serviços, agendamentos, lista de espera e jobs são relacionados por FKs compostas `(tenant_id, id)`, evitando referências a cadastros de outro pet shop.
- Mudanças de horário ocorrem em **uma transação**. A agenda tem exclusão `EXCLUDE USING gist` para que duas reservas do mesmo profissional não ocupem intervalos sobrepostos, mesmo quando feitas simultaneamente.
- Os dados não são replicados em `localStorage`. A interface faz consultas à API após login.
- Não há isolamento por RLS nesta versão: a aplicação depende das consultas/autorizações de todas as rotas e FKs. Antes de produção, adote defesa adicional com testes, auditoria e/ou Row-Level Security cuidadosamente projetado.

## 5. Fotos e arquivos na nuvem

Use um bucket privado S3 compatível (AWS S3, Cloudflare R2 ou outro). Defina no `.env` `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY` e `OBJECT_STORAGE_SECRET_KEY`. A API envia a foto validada do pet diretamente ao bucket, usa chaves com prefixos por empresa e retorna URL de leitura **assinada por 15 minutos** para usuários autorizados. O banco armazena a `photo_key`, não o arquivo. **Não configure bucket público.** O gerenciamento genérico de outros documentos/arquivos e a varredura antivírus ainda não estão disponíveis; só fotos de pets estão cobertas.

## 6. Preparar publicação em nuvem

1. Contrate um banco PostgreSQL gerenciado, com TLS e **backup automático e recuperação pontual (PITR)** quando disponíveis. Configure permissão mínima para o usuário do banco, acesso restrito à API e política de retenção definida.
2. Crie um bucket privado com acesso por chave limitada às operações necessárias. Versionamento/lifecycle do bucket e backups dos objetos devem ser configurados no provedor.
3. Hospede o Node/Express em serviço que suporte processos longos, HTTPS, variáveis de ambiente e conexão segura com o banco. Utilize Node.js >=22.12, instale dependências e compile:

```powershell
npm install
npm run build
npm run db:migrate
npm run start -w api
```

4. No servidor configure `NODE_ENV=production`, `APP_ORIGIN=https://seu-dominio`, `SESSION_SECRET` forte, `DATABASE_URL`, `DATABASE_SSL` e credenciais do bucket. O Express entrega a interface compilada em `web/dist` pelo mesmo domínio, sem necessidade de CORS aberto. Certifique-se de configurar o proxy com HTTPS e cabeçalhos corretos.
5. Configure a plataforma de hospedagem para iniciar a aplicação com `npm run start -w api`, health check `/api/health`, TLS, monitoração de erros, reinício do processo e gestão de segredos. **Não rode migrations automaticamente em todas as réplicas simultaneamente**.
6. Publique primeiro em ambiente de homologação e execute os testes antes da abertura a clientes. Configure domínio e verifique login, convite, operações simultâneas, upload, certificado e restauração de backup.

**Importante:** este projeto não contém infraestrutura provisionada nem servidor remoto publicado; apenas a configuração de preparação. O registro real fica 100% em nuvem **quando você o conecta ao PostgreSQL gerenciado e ao bucket de objetos**. O Docker desta documentação é somente alternativa local para testar.

## 7. Backups e restauração (PostgreSQL)

Contrate snapshots/PITR no provedor para recuperação de desastre e teste uma restauração periódica. Como backup lógico complementar, instale `pg_dump` e `pg_restore` compatíveis com a versão do banco e rode, com uma conta de backup autorizada:

```powershell
# Conexão de origem: não compartilhe o endereço com senha.
pg_dump --dbname "$env:DATABASE_URL" --format=custom --file "petcore-backup.dump"
# Restaure em um banco NOVO e VAZIO, NUNCA direto em produção:
pg_restore --dbname "$env:RESTORE_DATABASE_URL" --no-owner --no-acl --exit-on-error "petcore-backup.dump"
```

Verifique se o arquivo foi gerado, mantenha cópia **criptografada fora do servidor** e pratique a restauração com conferência de tabelas, acessos e quantidade de registros. `pg_dump` **não inclui** o conteúdo do bucket: mantenha backup/versionamento dos objetos, chaves/segredos protegidos e plano de restauração consistente entre banco e arquivos. No PowerShell, instale também os aplicativos cliente do PostgreSQL para ter `pg_dump`/`pg_restore` disponíveis.

## 8. Ordem das próximas etapas

- **Etapa 1 (base entregue para validação):** autenticação, gestão de empresas e convites, permissões, cadastros, fotos, jornada e agenda com movimentações/histórico, encaixe e espera. Faltam testes executados e ajustes identificados pela homologação.
- **Etapa 2:** servidor de jobs (worker independente), notificações lidas/não lidas, deduplicação, e-mails antes dos agendamentos, alterações/cancelamentos, links de confirmação e suporte a falhas/retries. A tabela `reminder_jobs` já registra a intenção e reage a alterações, mas **não envia e-mails**.
- **Etapa 3:** produtos, movimentos de estoque, vendas, caixa, despesas, conciliação, relatórios e testes transacionais.
- **Etapa 4:** planos, assinaturas, cobranças em sandbox, webhooks com validação e idempotência, suspensão de acesso configurável, suporte, auditoria e integração fiscal separada. **Não existe cobrança real nesta entrega**.

## 9. Estrutura dos arquivos

```text
petcore-saas/
├── api/
│   ├── sql/001_core.sql         # Estrutura do banco e exclusão de horários
│   ├── scripts/migrate.ts       # Executa migrations uma vez cada
│   ├── scripts/seed.ts          # Duas empresas demo e plataforma
│   ├── src/core.ts              # PostgreSQL, sessões autorizadas, validação
│   ├── src/authRoutes.ts        # Login, senha, convites, empresas
│   ├── src/dataRoutes.ts        # Cadastros, jornada, equipe, configurações
│   ├── src/calendarRoutes.ts    # Agenda, movimentações e lista de espera
│   ├── src/fileRoutes.ts        # Fotos privadas de pets em S3
│   ├── src/server.ts            # HTTP, segurança e entrega da interface
│   └── tests/                   # Testes integrados com PostgreSQL
├── web/
│   ├── src/api.ts               # Fetch autenticado e datas
│   ├── src/main.tsx             # Login e painéis do sistema
│   └── src/styles/            # SCSS separado em tokens, base, app, login e responsividade
├── .env.example                # Variáveis de exemplo sem chaves reais
├── compose.yml                 # Banco local de desenvolvimento
└── README.md
```

**Limitações conhecidas:** sem exclusão de cadastros; sem envio de convites automático; sem worker; sem edição de todos os tipos de registros pela interface; sem renderização da foto na ficha além de link privado; sem cobrança/painel financeiro; não há exportação fiscal; sem integração automática de backup com provedor; o schema ainda não contém Row-Level Security; no protótipo, o fuso operacional está padronizado para `America/Sao_Paulo` na interface. Falta validar tipos completos, executar o build com as dependências instaladas e rodar a suíte integrada em PostgreSQL. Os testes unitários de horário passaram localmente.
