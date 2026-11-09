# Publicar o PetCore no Railway

O ambiente de homologação está publicado em HTTPS, com dados de teste. A construção Docker e a implantação `1fa762ae-a491-443e-afa5-929d630afe61` terminaram com `SUCCESS` na revisão `1d953fbc`, em 09/11/2026, incluindo os ajustes web para o APK. A conferência após a publicação aprovou página/saúde/banco, sessão sem login com 401 e comparação SHA-256 dos dois assets com o build local (`index-aMF9JEKv.js` e `index-C7hMQ-l-.css`). O ensaio anterior de 12 verificações foi aprovado na revisão `434a341f`. Os serviços operacionais não tiveram sua fonte alterada nesta entrega Android. A consulta final retornou cinco serviços sem problemas ou falhas recentes e sem alterações pendentes. A abertura comercial ainda depende das pendências operacionais e jurídicas registradas no checklist.

| Recurso preparado | Identificação |
|---|---|
| Projeto Railway | `7f0acede-9807-4abf-bd96-121509afb59f` |
| Ambiente de homologação | `46f89744-dbb0-4ebf-8246-0b3a05064209` |
| Serviço da aplicação | `d1f49445-2cef-4d90-a087-a786207d545e` |
| Serviço de manutenção | `27c32234-98cf-40d1-b88e-5a85cd06bc86` |
| Serviço de backup | `33f68ea6-8cc6-4e19-9a14-9f21215b3742` |
| Aplicativo publicado | `https://petcore-homologacao.up.railway.app` |
| Branch separado no Neon | `petcore-homologacao-20261106` |
| Serviço de lembretes preparado | `d0f7834d-3b33-4898-8cf2-db1438b9bba8` |

Fotos e backups usam destinos separados. Upload real normalizado, recusa de leitura anônima, autorização entre empresas e exclusão de fotos foram conferidos. O ensaio removeu seus próprios registros e objetos fictícios. Manutenção, backup e restauração remotos também tiveram execução confirmada. Não altere outros projetos Railway. As bases de homologação e original estão nas migrations 001–013; o original foi confirmado como somente testes e atualizado após a cópia de preservação `br-quiet-mountain-b62dyl9j`.

## Estrutura da implantação

- A imagem é construída com Node.js 22 em Debian Bookworm. A compilação instala as dependências, gera API e interface e remove as dependências de desenvolvimento.
- O processo da aplicação roda como usuário `node`, sem privilégios de root. O servidor entrega a interface e `/api` no mesmo endereço.
- O cliente oficial PostgreSQL 18 é instalado pelo repositório PGDG, com chave `signed-by` e transporte HTTPS, para os comandos de backup e restauração.
- Esta implantação usa configurações diretamente no serviço Railway: Dockerfile, início, pré-deploy, saúde e recursos. Não depende de `railway.json` ou `railway.toml`; esses arquivos não devem ser usados como fonte de configuração deste fluxo.
- O banco continua no Neon. Não é necessário criar outro PostgreSQL no Railway para esta arquitetura.
- Fotos e backups usam armazenamento de objetos privado. Arquivos gravados no disco efêmero do contêiner não são um armazenamento permanente.
- O contexto Docker permite somente manifests, código e assets necessários. `.env`, Git, backups, chaves e arquivos locais não devem entrar na imagem.

Fontes: [comando anterior à implantação](https://docs.railway.com/deployments/pre-deploy-command), [repositório PostgreSQL para Debian](https://www.postgresql.org/download/linux/debian/).

## Preparação no computador

1. Confirme que os arquivos atuais estão salvos, sem credenciais no repositório.
2. Execute a compilação e os testes aprovados no roteiro da entrega, usando banco exclusivo de testes para integração.
3. Se Docker estiver instalado, construa a imagem a partir da raiz:

```powershell
docker build --tag petcore-local .
```

Não passe senhas como argumentos de construção. A ausência do Docker no computador não comprova que a imagem funciona: nesse caso, a construção no Railway ainda precisa ser acompanhada e validada antes da abertura comercial.

## Serviço da aplicação

1. Selecione o serviço de homologação identificado acima. Conecte o repositório ou envie a fonte pelo fluxo autorizado, depois de conferir que os segredos não estão na fonte.
2. Use a raiz do monorepositório como contexto, onde estão `package.json`, `package-lock.json` e `Dockerfile`.
3. Confira as configurações diretas do serviço na tabela abaixo antes de iniciar a implantação.
4. O pré-deploy usa apenas dependências de execução e lê o SQL incluído na imagem. O Railway executa esse comando em contêiner separado: ele não deve depender da aplicação estar iniciada nem de escrever em um volume. Falha na migration não libera a aplicação nova. [Funcionamento do pré-deploy](https://docs.railway.com/deployments/pre-deploy-command).
5. Configure `APP_ORIGIN=https://petcore-homologacao.up.railway.app`. Produção exige uma origem HTTPS explícita antes de iniciar. Reserve ou atualize o domínio antes de testar o login.
6. O Railway fornece `PORT`. A aplicação utiliza esse valor; não fixe outra porta nas configurações externas.

| Configuração direta preparada | Valor |
|---|---|
| Construção | Dockerfile na raiz |
| Início | `npm run start --workspace api` |
| Pré-deploy | `node api/scripts/migrate.mjs` |
| Limite do pré-deploy | 600 segundos |
| Verificação de saúde | `/api/health`, limite de 300 segundos |
| Reinício | `ON_FAILURE`, até 5 tentativas |
| Encerramento no Railway | 25 segundos; aplicação limita a drenagem a 20 segundos |
| Sobreposição de implantação | 10 segundos |
| Região e réplica | `us-east4-eqdc4a`, 1 réplica |
| Recursos configurados | 1 GB de memória, 1 vCPU |

Esses valores foram usados na implantação conferida. Continue acompanhando construção, pré-deploy, saúde e recursos em cada revisão nova.

Um endereço `*.up.railway.app` permite começar sem comprar outro domínio. Futuramente, um subdomínio da Tiger Tech pode apontar para esse serviço, preservando o site principal. Confira os registros DNS pedidos pelo Railway e atualize `APP_ORIGIN` ao trocar o endereço. É preferível abrir o PetCore em seu próprio subdomínio a colocá-lo em um iframe do site institucional. [Domínios no Railway](https://docs.railway.com/networking/domains/working-with-domains).

## Variáveis da aplicação

Preencha os valores na área de variáveis do serviço, nunca no código ou no chat:

| Variável | Uso |
|---|---|
| `NODE_ENV=production` | Cookies seguros e configuração de produção |
| `APP_ORIGIN` | Endereço HTTPS público exato do PetCore |
| `APP_ALLOWED_ORIGINS` | Somente origens adicionais que realmente precisarão acessar a API; normalmente vazio no Railway |
| `DATABASE_URL` | Conexão da aplicação com o banco correto no Neon |
| `DATABASE_DIRECT_URL` | Conexão direta ao mesmo banco para migrations e backups |
| `DATABASE_SSL=true` | Verificação TLS da conexão PostgreSQL |
| `SESSION_SECRET` | Segredo longo e aleatório, exclusivo desse ambiente |
| `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET` | Armazenamento privado de fotos |
| `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY` | Credenciais limitadas ao armazenamento de fotos |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | Provedor e remetente habilitados para recuperação de senha |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Credenciais e remetente do processo separado de lembretes |
| `REMINDER_EMAILS_ENABLED`, `REMINDER_EMAILS_CONFIRM_SEND` | Lembretes só enviam com `true` e `YES`; manter desabilitados até homologar remetente, consentimento e destinatário |

Não reutilize senhas ou segredos de demonstração. Não use `*` nas origens para fazer o login funcionar. Ao sair do endereço local, retire origens de rede doméstica que não sejam necessárias. A interface e a API são entregues no mesmo domínio; isso evita uma configuração aberta de CORS.

Use contas e segredos distintos para teste e produção. Não execute `db:seed` em um banco com clientes reais. A conexão direta e a conexão da aplicação devem apontar para o mesmo banco e ambiente; não misture um banco de teste com um de produção por engano.

## Migrations

O script de execução `api/scripts/migrate.mjs`:

- Prefere `DATABASE_DIRECT_URL`; na ausência, usa `DATABASE_URL`. Para endereços Neon com pooler, resolve o endereço direto correspondente.
- Verifica TLS para conexões seguras, usa trava de implantação e não executa duas migrations simultâneas.
- Executa cada arquivo ainda não aplicado em uma transação.
- Guarda checksum e recusa mudanças posteriores em arquivos já registrados com checksum.
- Para registros antigos sem checksum, registra uma referência da versão atual, sem reexecutar SQL. Isso não prova qual era o conteúdo aplicado no passado.
- Em `--test`, exige somente `TEST_DATABASE_URL` com banco terminado em `_test`; nunca usa o banco comum como alternativa.
- Em erros, informa códigos operacionais sem imprimir endereço de conexão, senha ou conteúdo dos dados.

Antes de alterar uma base de produção, valide as migrations em ambiente isolado e mantenha um backup recuperável. Nunca edite uma migration já aplicada para corrigir produção; crie outra migration. A volta para uma versão anterior da aplicação precisa considerar compatibilidade de esquema, sem apagar tabelas para desfazer uma mudança.

## Fotos, mensagens e configurações comerciais

O ensaio hospedado aprovou fotos privadas, leitura autorizada e exclusão com dados fictícios. Configure e acompanhe versões e retenção separadamente; excluir o objeto ativo não comprova apagar versões anteriores ou backups. Não torne o bucket público para corrigir uma URL.

Um teste de e-mail foi aceito pelo Resend e confirmado pelo usuário na pasta Spam. As variáveis de recuperação foram aplicadas na revisão 434a341f e conferidas sem mensagem real. Isso não comprova entrega regular na Caixa de Entrada nem a conclusão da recuperação pelo aplicativo publicado. O diagnóstico e as verificações de remetente estão em [EMAIL.md](EMAIL.md).

No painel da plataforma, preencha identificação e contatos reais da operação, documentos jurídicos, fornecedores/regiões e condições comerciais. Publique os documentos somente após revisão. Confira nome do produto, preço, periodicidade e cancelamento dos links do PagBank. O recebimento confirmado no provedor deve corresponder à conciliação que libera a assinatura; o retorno do navegador não é prova de pagamento.

Operador informado: **José Andrey Pereira Lisboa**, pessoa física, marca **Tiger Tech — Sites, Sistemas e Soluções Digitais**. Endereço: Rua Brasílio Machado, 404, Santo André/SP, CEP 09060-700. Suporte/privacidade: **tigertechbr@outlook.com**. Domínio institucional/remetente: **tigertech.dev.br**. A identidade já foi preenchida; documentos, fornecedores/regiões e procedimentos ainda exigem revisão e aprovação. A publicação jurídica permanece desativada.

Os planos são Free por 30 dias, Mensal R$ 35 e Anual R$ 350. O Free começa quando confirmado e não recebe tolerância adicional. O pago pode ser escolhido imediatamente, com checkout externo e conciliação manual PagBank PF. Foram conferidos, sem compra, [PetCore Mensal](https://pag.ae/82jFKCTjo) e [PetCore Anual](https://pag.ae/82jFLbrjr); a revisão dos planos está aprovada. Os links antigos de outro produto foram substituídos. A publicação jurídica ainda condiciona sua liberação no aplicativo.

## Serviços e agendamentos de operação

Use a mesma imagem para os comandos de operação, em serviços ou tarefas separados conforme a necessidade. Não copie o pré-deploy da aplicação para um cron de backup ou para um worker: configure o comando específico e remova o health check HTTP nesses serviços.

| Tarefa | Comando |
|---|---|
| Aplicação HTTP | `npm run start --workspace api` |
| Manutenção periódica, uma execução | `node api/dist/maintenance.js --once` |
| Manutenção em processo contínuo | `node api/dist/maintenance.js --loop` |
| Somente limpeza de sessões/tokens expirados | `node api/dist/maintenance.js --prune-only` |
| Somente fila de exclusão de fotos | `node api/dist/maintenance.js --files-only` |
| Backup cifrado para bucket privado | `node api/scripts/backup.mjs` |

Nesta implantação a manutenção usa cron, sem processo contínuo duplicado. Ela não envia e-mails nem apaga históricos de clientes ou financeiros. A entrega de lembretes é outro processo e depende de consentimento, configuração e validação próprias.

Serviços de operação e estado observado:

| Serviço | Agendamento UTC | Estado |
|---|---|---|
| `petcore-maintenance` | `*/15 * * * *` — a cada 15 minutos | Execução confirmada; `node api/dist/maintenance.js --once` |
| `petcore-backup` | `0 6 * * *` — diariamente às 03h de Brasília | Execução confirmada; `node api/scripts/backup.mjs` |
| Lembretes | `*/5 * * * *` — a cada cinco minutos | Ativo na revisão 434a341f; até 20 por execução e 10s por envio. Primeira execução sem lembretes autorizados devidos, zero mensagens |

Manutenção e backup usam Dockerfile, uma réplica em `us-east4-eqdc4a`, 1 vCPU, 0,5 GB e reinício `NEVER`. Não possuem domínio, proxy TCP, health check HTTP ou pré-deploy. Mantenha cada serviço na revisão aprovada para seu comando. Não execute migrations ou seed nesses crons.

As conexões de manutenção/backup referenciam `petcore.DATABASE_DIRECT_URL`. A manutenção usa referências ao segredo de sessão e às variáveis de fotos; o backup usa referências à chave/destino de backup e aos identificadores do destino de fotos. Segredos não constam desta documentação. As variáveis de e-mail foram aplicadas na revisão 434a341f. O usuário autorizou lembretes somente com opt-in registrado; não declare o serviço ativo antes de confirmar sua revisão e execução.

A manutenção e o backup já tiveram execução acompanhada. A restauração remota conferiu 46 tabelas e registrou `verified` no backup com prefixo `ff3dc3a4`. Continue verificando resultados de cada ciclo e falhas; uma execução aprovada não comprova que todos os ciclos futuros ocorrerão.

O cron de backup deve terminar ao concluir e precisa das credenciais de banco e backup, mas não das credenciais de cobrança. Reserve recursos e espaço temporário para o dump, para sua versão cifrada e para o teste de restauração. Monitore término com falha; apenas cadastrar um horário não comprova que o backup está sendo feito.

## Backups

Use um bucket privado separado do bucket de fotos, com chaves e política de retenção próprias:

| Variável | Uso |
|---|---|
| `BACKUP_ENCRYPTION_KEY` | Chave aleatória de 32 bytes representada por 64 caracteres hexadecimais |
| `BACKUP_KEY_ID` | Identificação não secreta da chave utilizada, para controle de rotação |
| `BACKUP_STORAGE_ENDPOINT`, `BACKUP_STORAGE_REGION`, `BACKUP_STORAGE_BUCKET` | Destino privado dos arquivos cifrados |
| `BACKUP_STORAGE_ACCESS_KEY`, `BACKUP_STORAGE_SECRET_KEY` | Credenciais limitadas à gravação e leitura dos backups necessários |
| `BACKUP_STORAGE_PREFIX` | Prefixo de objetos; padrão `petcore` |
| `PG_DUMP_PATH`, `PG_RESTORE_PATH` | Caminho do cliente PostgreSQL 18; já definido na imagem |

O backup gera um dump e um manifesto de contagens obtidos de um mesmo snapshot. Ambos são cifrados com AES-256-GCM antes do envio. A chave não vai no arquivo nem no manifesto. Sem ela, não será possível restaurar; guarde uma cópia protegida e mantenha as chaves antigas necessárias às cópias ainda retidas.

`backup_runs` distingue backup criado/enviado de restauração verificada. Um upload concluído ainda precisa de ensaio de restauração. Configure também a recuperação pontual e os backups do provedor quando aplicáveis. O dump não inclui os objetos de fotos nem as credenciais do ambiente.

Os ensaios local e remoto conferiram 46 tabelas. O local também recusou chave incorreta, destino ocupado e uso da origem, removendo seus bancos/arquivos temporários. O remoto confirmou a recuperação do dump cifrado, sem incluir fotos. Retenção, alertas, guarda da chave e recuperação dos objetos continuam exigindo procedimentos próprios.

## Conferência antes de anunciar

- Construção da imagem e migrations concluídas sem erro.
- HTTPS, cookie de sessão, login, logout, recuperação e convites conferidos no endereço final.
- Isolamento entre duas empresas e permissões da equipe exercitados no ambiente publicado.
- Agenda concorrente, recebimentos, cancelamentos/compensações, estoque e fechamento de caixa conferidos.
- Fotos privadas e sua fila de exclusão operando; ciclo de versões documentado.
- E-mails de produção validados com destinatários de teste autorizados e procedimento para falhas.
- PagBank e condições de assinatura conferidos; conciliação e cancelamento testados sem cobranças indevidas.
- Identificação, canais de suporte/privacidade, textos e instrumentos jurídicos aprovados.
- Backup enviado, restauração isolada verificada e alertas acompanhados por um responsável.
- Plano de incidente, retenção, encerramento e entrega de dados aprovado e praticável.

Essas conferências são necessárias para distinguir código compilado de serviço pronto para operação comercial. Registre os resultados reais, sem marcar etapas externas como concluídas apenas porque seus campos ou scripts existem.
