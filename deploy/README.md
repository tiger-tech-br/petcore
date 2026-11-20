# Implantação portátil do PetCore

**Estado conferido em 19/11:** app Hostinger na revisão `acde9dded16f71403d2a152284144d3019b10d10`, construída e saudável, com `/api/live` sem consulta ao banco e `/api/health` com banco disponível. A pasta operacional continua na revisão 0a96; a seleção da imagem está em `PETCORE_RELEASE`. Runtime usa role exclusiva, sem conexão administrativa; `migration.env` está neutralizado. E-mail, fotos e jobs continuam desligados. O roteiro para administrar esse ambiente e planejar o corte está em [CORTE-PRODUCAO.md](CORTE-PRODUCAO.md); [evidências atuais](../docs/REVISAO-20261119.md). Não substituir o projeto existente pelos comandos genéricos de primeira implantação abaixo.

**Homologação ativa na Hostinger; transferência principal pendente:** em 14/11/2026, o PetCore foi construído e iniciado na KVM 1, em [petcore.tigertech.dev.br](https://petcore.tigertech.dev.br), usando o branch Neon separado autorizado para testes. O ambiente principal do Railway foi preservado. O APK 1.0.2/código 3 já usa a Hostinger e teve instalação, login, agendamento e exportação confirmados pelo responsável no celular em 15/11. A proposta Google Cloud/Scaleway foi descartada pelo custo; a Hostinger já contratada é o destino preparado. Consulte evidências, limites e pendências em [HOSTINGER.md](../docs/HOSTINGER.md).

Na implantação inicial de 14/11, o código da imagem veio do commit limpo `0a96d5f7455ec875ba879cd6c5e6f767b8b787d4`, sem a migration 016. Aquele commit não continha `deploy/`: os arquivos operacionais revisados foram copiados separadamente e conferidos por hash. A homologação usa o projeto `petcore-validation`, `deploy/.env.validation` e o override `deploy/compose.proxy-pinned.yml`, criado no servidor com o RepoDigest do Caddy 2.11.9 e montagem de `Caddyfile.preview`. Preserve esses parâmetros ao administrar o teste; os comandos genéricos abaixo são para uma futura implantação principal planejada. Recursos adicionais pagos continuam dependendo de aprovação, e a hospedagem não comprova os instrumentos de proteção de dados dos fornecedores.

Na homologação, o usuário criou o registro A no Registro.br e autorizou expressamente os termos Let's Encrypt e a renovação do certificado. `Caddyfile.preview` limita a emissão a essa certificadora e aplica `noindex, nofollow`. E-mail real, armazenamento de fotos e rotinas recorrentes do PetCore permanecem desligados nesse destino; somente a migration foi executada uma vez. A configuração de produção abaixo não é autorização para ligar jobs em paralelo ao Railway.

## Preparação privada

Use um servidor Linux contratado com Docker Engine e Docker Compose **2.30.0 ou posterior** instalados a partir da documentação oficial, acesso administrativo individual e atualizações. Essa versão mínima permite ler os arquivos privados como valores literais, sem interpolar `$` de senhas ou tokens. Exponha somente 80/443; restrinja SSH às pessoas/endereço de administração autorizados. O PostgreSQL continua privado no Neon, por TLS. Fotos e backups precisam de buckets privados distintos no destino aprovado.

Para uma primeira implantação em outro ambiente, copie `deploy/.env.example` para `deploy/.env` e informe a revisão exata aprovada. O subdomínio `petcore.tigertech.dev.br` já está criado e com HTTPS na homologação existente, que utiliza `deploy/.env.validation` e o override fixado. Preserve essa configuração. Prepare uma pasta `private/`, restrita ao administrador, com os arquivos abaixo. Esses arquivos são ignorados pelo Git e não entram na imagem.

Os cinco arquivos de `private/` usam `format: raw`: escreva uma linha `NOME=valor` por variável, sem aspas externas, `export`, expansão de outras variáveis ou comentário no fim da linha. Aspas e `$` são parte literal do valor. Comentários devem ocupar linhas próprias. O `.env` de seleção da implantação continua no formato normal do Compose e contém somente revisão, host e contato do certificado. Use um hostname sem `https://`, porta ou caminho em `PETCORE_HOST`.

| Arquivo | Configuração necessária |
|---|---|
| `app.env` | `APP_ORIGIN`, `DATABASE_URL` de role limitada, `DATABASE_SSL=true`, `SESSION_SECRET`, `OBJECT_STORAGE_*`, e-mail transacional e flags do suporte; `DATABASE_DIRECT_URL` é opcional e, se utilizado, precisa alcançar o mesmo banco com a mesma role limitada |
| `migration.env` | `DATABASE_DIRECT_URL` ao mesmo banco e `DATABASE_SSL=true`, somente para a implantação |
| `maintenance.env` | `DATABASE_URL`, `DATABASE_DIRECT_URL` ao mesmo banco/usuário, `DATABASE_SSL=true`, `SESSION_SECRET` de pelo menos 40 caracteres e `OBJECT_STORAGE_*` para a fila de exclusão |
| `reminders.env` | `DATABASE_URL`, `DATABASE_SSL=true`, `SESSION_SECRET` de pelo menos 40 caracteres e `RESEND_API_KEY`/`RESEND_FROM_EMAIL` do provedor homologado; manter `REMINDER_EMAILS_ENABLED=false` e `REMINDER_EMAILS_CONFIRM_SEND=NO` até conferir remetente, autorizações e destino |
| `backup.env` | Conexões diretas, TLS, fotos, bucket separado de backups, chave de cifra e liberações de retenção de 30 dias |

Utilize o `.env.example` da raiz como catálogo de nomes, sem copiar credenciais de teste ou de outro projeto. O provedor de e-mail efetivamente suportado e escolhido deve ser homologado antes da troca. Uma chave de assinatura Android e a chave dos backups precisam de guarda privada recuperável fora do servidor.

`maintenance` e `reminders` também precisam de `SESSION_SECRET`, pois carregam a configuração comum da aplicação; sem ela, não iniciam. As conexões diretas devem alcançar o mesmo banco e endpoint usados pela aplicação. Não copie caminhos Windows de `PG_DUMP_PATH`/`PG_RESTORE_PATH` para esses arquivos: a imagem Linux já fornece os clientes PostgreSQL 18 e seus caminhos.

Guarde `BACKUP_ENCRYPTION_KEY` e cada versão antiga ainda necessária em um gerenciador de senhas/segredos independente do servidor e do bucket, associadas ao respectivo `BACKUP_KEY_ID`. Preserve também uma cópia offline protegida e o material de recuperação da conta, com acesso restrito e autenticação adicional. A chave Android deve ter guarda separada equivalente. Confira a recuperação dessas cópias antes de depender delas; os arquivos cifrados sozinhos não recuperam as chaves. Nenhum token ou chave precisa ser enviado ao chat ou ao repositório para preparar este pacote.

## Implantação da revisão aprovada

Prepare um checkout limpo do commit aprovado e execute a partir da raiz desse checkout. Confira a identificação da revisão, o contexto permitido pelo Docker e as migrations presentes antes da construção. A migration 016 separada não integra a entrega atual; a pasta local de desenvolvimento contém trabalho ainda não publicado, por isso a fonte de implantação deve vir do commit de release.

```text
docker compose --env-file deploy/.env -f deploy/compose.production.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.production.yml run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file deploy/.env -f deploy/compose.production.yml build app
docker compose --env-file deploy/.env -f deploy/compose.production.yml --profile jobs run --rm migrate
docker compose --env-file deploy/.env -f deploy/compose.production.yml up -d app proxy
```

Não inicie a aplicação nova se a migration falhar. `APP_ORIGIN` deve ser exatamente a origem HTTPS configurada no proxy, sem caminhos ou curingas. Antes de trocar DNS, valide o destino e a configuração de acesso. A aplicação não expõe a porta 4000 no host. O proxy fornece HTTPS; os cookies seguros e as permissões continuam na aplicação.

Fixe e registre também o digest da imagem do proxy escolhido na implantação; `caddy:2-alpine` é a referência de preparação, não uma imagem já validada no novo servidor. O pacote usa a imagem da própria revisão do PetCore e não inclui segredos. O temporário do contêiner é limitado; volumes de exportação/backup maiores exigem capacidade previamente dimensionada, sem usar o disco efêmero como armazenamento final.

Na homologação Hostinger, passaram `docker compose config --quiet`, construção Linux da imagem, conferência das 18 migrations, inicialização do app, validação do Caddy fixado e emissão do certificado. A conexão Node→Neon foi medida como TLSv1.3 com certificado autorizado. O teste público confirmou página/saúde 200, banco disponível, sessão anônima 401 e HTTP 308 para HTTPS; JS/CSS corresponderam aos hashes do Railway. O usuário relatou login, mas os fluxos autenticados não foram verificados automaticamente pelo agente. Não houve teste de renovação futura, fotos, recuperação de senha, entrega de e-mail ou rotinas recorrentes na VPS. Isso valida o ensaio descrito, não a migração principal nem a liberação comercial.

## Rotinas

Os [modelos systemd](systemd/README.md) preparados em 20/11 descrevem o ambiente operacional existente e permanecem inativos. Não foram instalados ou ativados; a transição deve seguir [CORTE-PRODUCAO.md](CORTE-PRODUCAO.md), com destinos conferidos e um único responsável pelas rotinas.

Prepare agendamento no servidor para executar `maintenance` a cada 15 minutos, `reminders` a cada 5 minutos e `backup` diariamente. Os comandos são serviços de execução única no perfil `jobs`, por exemplo:

```text
docker compose --env-file deploy/.env -f deploy/compose.production.yml --profile jobs run --rm maintenance
docker compose --env-file deploy/.env -f deploy/compose.production.yml --profile jobs run --rm reminders
docker compose --env-file deploy/.env -f deploy/compose.production.yml --profile jobs run --rm backup
```

Configure o fuso e o horário desejado no agendador, monitore o resultado e registre falhas. As travas do banco impedem operações incompatíveis, mas não substituem monitoramento. Não configure uma segunda agenda sobre o mesmo ambiente enquanto os jobs equivalentes do Railway ainda estiverem ativos. Não execute as duas aplicações em gravação durante a migração de fotos ou a troca de banco.

## Conferência e Android

Antes de mudar o tráfego: ensaie a restauração do banco e das fotos em destinos novos, confira contagens/checksums, acessos por empresa, login, agendamento, exportação privada e e-mail autorizado. Faça uma troca controlada com possibilidade de voltar ao destino anterior, sem perder gravações ou duplicar cobranças/lembretes.

O APK 1.0.2 já confia na origem HTTPS da Hostinger e passou pelos passos confirmados no celular em 15/11. A atualização remota de 19/11 não exigiu outro APK. Uma futura mudança de endereço exige revisar a origem nativa, aumentar o código da versão, gerar com o mesmo certificado e validar no aparelho. O site da Tiger Tech pode continuar no domínio principal.

Referências de configuração: [Docker Compose e `env_file` literal](https://docs.docker.com/reference/compose-file/services/#format), [proxy HTTPS Caddy](https://caddyserver.com/docs/quick-starts/https), [instruções de configuração do projeto](../docs/RAILWAY.md) e [recuperação de fotos](../docs/PHOTO-RECOVERY.md).
