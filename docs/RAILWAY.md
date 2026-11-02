# Publicar o PetCore no Railway

O repositório contém uma receita de implantação; isso não significa que um serviço Railway tenha sido criado, que um bucket esteja configurado ou que a publicação já tenha sido validada. A primeira publicação deve usar o Neon de testes e dados fictícios. A abertura comercial depende dos testes e das configurações de operação abaixo.

## Estrutura da implantação

- A imagem é construída com Node.js 22 em Debian Bookworm. A compilação instala as dependências, gera API e interface e remove as dependências de desenvolvimento.
- O processo da aplicação roda como usuário `node`, sem privilégios de root. O servidor entrega a interface e `/api` no mesmo endereço.
- O cliente oficial PostgreSQL 18 é instalado pelo repositório PGDG, com chave `signed-by` e transporte HTTPS, para os comandos de backup e restauração.
- `railway.toml` escolhe o Dockerfile, executa `node api/scripts/migrate.mjs` antes da aplicação e verifica `/api/health`.
- O banco continua no Neon. Não é necessário criar outro PostgreSQL no Railway para esta arquitetura.
- Fotos e backups usam armazenamento de objetos privado. Arquivos gravados no disco efêmero do contêiner não são um armazenamento permanente.
- O contexto Docker permite somente manifests, código e assets necessários. `.env`, Git, backups, chaves e arquivos locais não devem entrar na imagem.

Fontes: [configuração por arquivo do Railway](https://docs.railway.com/config-as-code/reference), [comando anterior à implantação](https://docs.railway.com/deployments/pre-deploy-command), [repositório PostgreSQL para Debian](https://www.postgresql.org/download/linux/debian/).

## Preparação no computador

1. Confirme que os arquivos atuais estão salvos, sem credenciais no repositório.
2. Execute a compilação e os testes aprovados no roteiro da entrega, usando banco exclusivo de testes para integração.
3. Se Docker estiver instalado, construa a imagem a partir da raiz:

```powershell
docker build --tag petcore-local .
```

Não passe senhas como argumentos de construção. A ausência do Docker no computador não comprova que a imagem funciona: nesse caso, a construção no Railway ainda precisa ser acompanhada e validada antes da abertura comercial.

## Serviço da aplicação

1. Crie ou selecione o projeto e o ambiente de testes no Railway. Conecte o repositório ou envie a fonte pelo fluxo autorizado da plataforma.
2. Use a raiz do monorepositório como contexto, onde estão `package.json`, `package-lock.json`, `Dockerfile` e `railway.toml`.
3. Confirme a construção por Dockerfile. O comando de início é `npm run start --workspace api`.
4. Configure o comando de pré-implantação `node api/scripts/migrate.mjs`. Ele usa apenas dependências de execução e lê os arquivos SQL incluídos na imagem.
5. Defina um limite de tempo de pré-implantação compatível com as migrations. O Railway executa esse comando em um contêiner separado; ele não deve depender da aplicação estar iniciada ou de gravar em um volume. Se falhar, a aplicação nova não deve ser liberada. [Funcionamento do pré-deploy](https://docs.railway.com/deployments/pre-deploy-command).
6. Gere um domínio público do Railway e configure `APP_ORIGIN` com esse endereço completo em HTTPS, sem barra final. Se ainda não houver o endereço, gere-o nas configurações de rede e atualize a variável antes de testar o login.
7. O Railway fornece `PORT`. A aplicação deve utilizar esse valor; não fixe uma porta diferente nas configurações externas.

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
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | Provedor e remetente habilitados para recuperação e lembretes, conforme os recursos ativados |

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

Escolha cron ou processo contínuo de manutenção, sem duplicar desnecessariamente os dois. O intervalo do processo contínuo é `MAINTENANCE_INTERVAL_SECONDS`, com padrão de 60 segundos. A manutenção não envia e-mails e não apaga históricos de clientes ou financeiros. A entrega de lembretes possui seu próprio processo e exige configuração e validação específicas.

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

## Conferência antes de anunciar

- Construção da imagem e migrations concluídas sem erro.
- HTTPS, cookie de sessão, login, logout, recuperação e convites conferidos no endereço final.
- Isolamento entre duas empresas e permissões da equipe exercitados no ambiente publicado.
- Agenda concorrente, recebimentos, estornos registrados, estoque e fechamento de caixa conferidos.
- Fotos privadas e sua fila de exclusão operando; ciclo de versões documentado.
- E-mails de produção validados com destinatários de teste autorizados e procedimento para falhas.
- PagBank e condições de assinatura conferidos; conciliação e cancelamento testados sem cobranças indevidas.
- Identificação, canais de suporte/privacidade, textos e instrumentos jurídicos aprovados.
- Backup enviado, restauração isolada verificada e alertas acompanhados por um responsável.
- Plano de incidente, retenção, encerramento e entrega de dados aprovado e praticável.

Essas conferências são necessárias para distinguir código compilado de serviço pronto para operação comercial. Registre os resultados reais, sem marcar etapas externas como concluídas apenas porque seus campos ou scripts existem.
