# Publicar o PetCore no Railway

Foi preparado um ambiente isolado de homologação, com dados de teste. O serviço, o domínio e os destinos de armazenamento existem; a construção Docker, a implantação e a conferência HTTPS ainda estavam pendentes neste registro de 06/11/2026. A abertura comercial depende da homologação e das configurações de operação abaixo.

| Recurso preparado | Identificação |
|---|---|
| Projeto Railway | `7f0acede-9807-4abf-bd96-121509afb59f` |
| Ambiente de homologação | `46f89744-dbb0-4ebf-8246-0b3a05064209` |
| Serviço da aplicação | `d1f49445-2cef-4d90-a087-a786207d545e` |
| Serviço de manutenção | `27c32234-98cf-40d1-b88e-5a85cd06bc86` |
| Serviço de backup | `33f68ea6-8cc6-4e19-9a14-9f21215b3742` |
| Domínio reservado | `https://petcore-homologacao.up.railway.app` |
| Branch separado no Neon | `petcore-homologacao-20261106` |

Buckets separados para fotos e backups e suas variáveis de referência foram preparados. Isso ainda não comprova suas permissões remotas, upload, exclusão, envio de backup, cron ou restauração. Não altere os outros projetos Railway nem o banco original para concluir esta homologação.

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

Esses valores preparados não são evidência de implantação bem-sucedida. Acompanhe a construção, o pré-deploy, a saúde e o uso de recursos do serviço real.

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

Confirme o caráter privado do bucket e teste upload, leitura autorizada e exclusão com dados fictícios. Configure a política de versões e retenção separadamente; uma exclusão no bucket ativo pode não apagar versões anteriores. Não configure o bucket como público para corrigir uma URL que falha.

O provedor de e-mail e o remetente precisam estar habilitados para os destinatários reais. Um envio de teste aceito pelo provedor não comprova a entrega de recuperação de senha e lembretes a todos os clientes. O domínio do aplicativo pode continuar sendo o do Railway, mas o remetente do provedor tem requisitos próprios de validação.

No painel da plataforma, preencha identificação e contatos reais da operação, documentos jurídicos, fornecedores/regiões e condições comerciais. Publique os documentos somente após revisão. Confira nome do produto, preço, periodicidade e cancelamento dos links do PagBank. O recebimento confirmado no provedor deve corresponder à conciliação que libera a assinatura; o retorno do navegador não é prova de pagamento.

Suporte e privacidade usam o contato público fornecido pelo responsável: **tigertechbr@outlook.com**. A migração de contatos preenche apenas campos ausentes; não publica os documentos nem substitui canais personalizados. Nome jurídico, endereço e fornecedores/regiões ainda precisam de definição e revisão.

Os planos confirmados são Free por 30 dias, Mensal R$ 35 e Anual R$ 350. No primeiro acesso, o Free vem selecionado e seu prazo começa ao confirmar. Também é possível assinar imediatamente no checkout externo. O Free expira sem tolerância adicional; os dias de regularização aplicam apenas a período pago. A conta PagBank PF usa links recorrentes com conciliação manual, sem tokens da API de assinaturas. Na última conferência, os links ainda tinham o nome de outro produto; continuam sem revisão aprovada.

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

Escolha cron ou processo contínuo de manutenção, sem duplicar desnecessariamente os dois. O intervalo do processo contínuo é `MAINTENANCE_INTERVAL_SECONDS`, com padrão de 60 segundos. A manutenção não envia e-mails e não apaga históricos de clientes ou financeiros. A entrega de lembretes possui seu próprio processo e exige configuração e validação específicas. Os agendamentos remotos e a entrega real ainda não foram homologados.

Dois serviços vazios foram criados e configurados neste ambiente. **Ainda não têm fonte conectada, implantação nem execução comprovada**:

| Serviço | Agendamento UTC | Comando |
|---|---|---|
| `petcore-maintenance` | `*/15 * * * *` — a cada 15 minutos | `node api/dist/maintenance.js --once` |
| `petcore-backup` | `0 6 * * *` — diariamente às 03h de Brasília | `node api/scripts/backup.mjs` |

Ambos usam Dockerfile, uma réplica em `us-east4-eqdc4a`, 1 vCPU, 0,5 GB e reinício `NEVER`. Não possuem domínio, proxy TCP, health check HTTP ou pré-deploy. Precisam receber a mesma revisão aprovada da aplicação antes da implantação. Não execute migrations ou seed nesses crons.

As conexões de ambos referenciam `petcore.DATABASE_DIRECT_URL`. A manutenção recebe referências ao segredo de sessão e às variáveis de fotos; o backup recebe referências à chave e ao destino de backup e aos identificadores do destino de fotos para conferir a separação. Os valores secretos não foram copiados para a documentação. As mudanças de variáveis foram feitas sem disparar deploy; nenhum e-mail ou pagamento foi habilitado.

Depois de conectar a fonte e implantar, acompanhe uma execução de cada serviço. Confirme saída bem-sucedida da manutenção e, no backup, objetos cifrados, registro `uploaded` e restauração isolada antes de marcar a recuperação como verificada. Um horário de cron configurado não comprova nenhuma dessas etapas.

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

O ensaio local registrado restaurou e conferiu 46 tabelas, além de recusar chave incorreta, destino ocupado e uso da origem. Os bancos e arquivos temporários foram removidos. Esse resultado não comprova backup remoto, cron nem recuperação das fotos; essas verificações continuam pendentes.

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
