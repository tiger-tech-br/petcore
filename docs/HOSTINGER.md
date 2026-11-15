# Hostinger — preparação do PetCore

## Atualização de 15/11/2026 — credencial exclusiva da homologação

A consulta autenticada pelo MCP da Hostinger confirmou a VPS **2162451** e os containers **app e proxy saudáveis**, com aproximadamente **15 horas** de execução no retrato observado. As ferramentas do conector estão disponíveis nesta sessão; a observação de indisponibilidade de ferramentas no registro de 14/11 abaixo é histórica. A homologação continua em `https://petcore.tigertech.dev.br`, com o ambiente principal preservado no Railway.

A aplicação da VPS agora usa a role exclusiva **`petcore_hostinger_runtime`**, com **senha nova própria**, no branch Neon de testes **`br-fragrant-frost-b6kr9it0`**, banco `neondb`. O ambiente efetivo do container não contém conexão de owner nem `DATABASE_DIRECT_URL`. O arquivo de migrations foi neutralizado até que uma conexão administrativa própria seja preparada; não reutilizar a conexão compartilhada anterior ou executar migrations com a role do aplicativo.

A verificação em container Linux conferiu **SELECT, INSERT, UPDATE e DELETE individualmente em conjunção**, acesso às sequências, **50 tabelas**, **18 migrations**, tabela de sessão, ausência de propriedade das tabelas, ausência dos privilégios administrativos examinados e de CREATE no schema público, além de **TLS com certificado autorizado**. Essa conferência não concede novos privilégios, não altera senha de outros branches e não comprova que os futuros ambientes de produção já tenham a mesma separação. Nenhuma credencial foi incluída neste documento.

**E-mail, armazenamento real e cron de manutenção/lembretes/backup do PetCore permanecem desligados na Hostinger.** O responsável escolheu manter o Resend e conferir os contratos primeiro. O [inventário dos fluxos e fornecedores](INVENTARIO-FORNECEDORES.md) diferencia Hostinger, Railway, Neon, Railway Buckets e demais serviços; as [consultas preparadas](CONSULTAS-FORNECEDORES.md) ainda não foram enviadas. Não foi contratado outro serviço, enviado e-mail ou alterada cobrança.

Também foi corrigida a autenticação de empresa inativa, com **12/12 testes locais**, compilação e TypeScript aprovados. A correção foi **publicada na Hostinger** na revisão **`4c7a65ba0ca97977de128c8f703417dcf3fbe4c9`**, branch `codex/hostinger-release-20261115`, após construção Linux aprovada, com imagem de runtime fixada e sem incluir a migration 016. Os arquivos operacionais do Compose permanecem na pasta da revisão anterior **`/opt/tigertech/petcore/releases/0a96d5f7455ec875ba879cd6c5e6f767b8b787d4`**; o nome dessa pasta não identifica mais sozinho a revisão da imagem em execução. Não houve execução de migration nesse rollout. O Railway principal continua na revisão `0a96d5f7455ec875ba879cd6c5e6f767b8b787d4`. O APK **1.0.2** tem preparação e evidências próprias em [ANDROID.md](ANDROID.md); este registro não comprova novo teste no aparelho.

O **ensaio autenticado real por HTTPS passou**, com `ok=true` e **11 verificações** no run **`e3757a31-e0c8-4147-b8fb-ffef3f6aa6d9`**: login/cookie seguro de três papéis, Free de 30 dias, restrições de origem/papel/troca de empresa, cadastros e isolamento, agenda com confirmação/conflito/reagendamento/histórico, estoque/caixa/venda/recebimento interno fictício idempotente/CSV, CRM, logout, aposentadoria das fixtures e invalidação da sessão do funcionário. Uma consulta SQL independente confirmou **duas empresas inativas**, **três contas sem acesso de plataforma**, vínculos inativos e **zero caixas abertos/atendimentos ativos** dessas fixtures. Não somar estas verificações a rodadas anteriores como uma nova suíte única. O ensaio não fez envio de e-mail, upload de foto, checkout ou cobrança externa. Roteiro, hash e limites em [QA-HOSTINGER.md](QA-HOSTINGER.md); registro da revisão em [REVISAO-20261115.md](REVISAO-20261115.md).

Estas mudanças reduzem as pendências técnicas, mas **não concluem o corte para produção ou a liberação comercial**. A jornada autenticada pela API passou; continuam necessárias as evidências específicas de fotos/recuperação, recuperação de senha, guarda das chaves, procedimentos de cobrança/cancelamento, aplicativo final e revisão/publicação dos documentos com os contratos efetivos. Os registros datados abaixo foram preservados como histórico.

## Estado conferido em 14/11/2026 — horário de Brasília

O responsável contratou a **KVM 1**. O painel `/vps/2162451/overview` confirmou a VM `2162451` **Em Atividade**, com **Ubuntu 24.04 with Docker** instalado, em **Brazil - Campinas**, IPv4 **187.53.115.106**. Recursos exibidos: **1 vCPU, 4 GB de RAM, 50 GB de disco e 4 TB de transferência**. O hostname administrativo é `srv2162451.hstgr.cloud`; ele não é o domínio HTTPS da aplicação. A leitura inicial da API havia mostrado `initial`, sem sistema operacional ou IP; esse estado foi superado pela conclusão observada no painel.

O assistente genérico anterior chegou a `/purchase-new-vps/plans`, com seleção de planos KVM e preços. Esse fluxo de **nova compra foi abandonado**, sem selecionar novo plano, realizar pagamento ou provisionar servidor. As seleções feitas nele não foram aplicadas à VM existente.

Depois, a página inicial mostrou a tarefa exata **“A configuração do seu plano KVM 1 - srv2162451.hstgr.cloud ainda não foi concluída”**. Seu botão **Configurar** abriu `/purchase-new-vps/start` com `subscription_id` correspondente à assinatura existente validada. Nesse fluxo vinculado à **KVM 1 já contratada**, foram selecionados **Brasil**, com latência estimada de **9 ms**, e **Aplicativos → Docker**, imagem **Ubuntu 24.04 with Docker**. O responsável preencheu a senha root privadamente e confirmou; o provisionamento começou em `/purchase-new-vps/setting-up` e terminou com o painel no estado descrito acima. Não registrar senha, chave ou token no chat, nos documentos ou no repositório.

O detector de malware aparece **Ativo**; os backups estão **Semanalmente**, com **0 snapshots/backups** exibidos na conferência inicial. O firewall **`401472` — TigerTech-Web** está **ATIVO**, conforme as regras descritas abaixo. Não foram ativados adicionais pagos. O painel mostrava renovação automática ativada e validade em **14/12/2026**.

Após atualização e reinicialização, uma **nova Web Console autenticou como root automaticamente**. O sistema confirmou **Ubuntu 24.04.5**, kernel **6.8.0-149-generic**, **Docker Engine servidor 29.9.3** e **Docker Compose 5.7.1**; as versões iniciais 29.9.1/5.6.0 foram superadas. Na conferência anterior ao ensaio da aplicação, Docker informou **0 containers, 0 em execução**. `ssh.socket`, `ssh.service`, Docker, Fail2ban e unattended-upgrades estavam ativos, com o socket SSH habilitado e **0 unidades com falha**. Não foi realizado upgrade para Ubuntu 26.

O disco informou **48G totais, 2.3G usados e 46G livres (5% usado)**; a memória informou **3915 MiB totais, 446 MiB usados e 3468 MiB disponíveis**, sem swap. É uma medição do servidor vazio, não garantia de capacidade para qualquer número de sites. A atualização dos pacotes terminou; **cloud-init permaneceu marcado como retido**, sem forçar sua atualização. O log das atualizações automáticas registrou conclusão e a retenção; não afirmar que não há pacote retido.

O ambiente principal do PetCore continua publicado no **Railway**, com seu PostgreSQL no **Neon** preservado. A Hostinger passou do ensaio interno à **homologação pública isolada em `https://petcore.tigertech.dev.br`**, descrita abaixo; isso não conclui a migração do ambiente principal nem a liberação comercial. A proposta anterior **Google Cloud/Scaleway** foi rejeitada pelo custo; essa decisão não cancela a Hostinger já contratada. Não houve novo envio de e-mail, operação PagBank ou alteração do APK. As pendências comerciais e de fornecedores permanecem.

O MCP nativo da Hostinger foi adicionado e autenticado na configuração global, mas suas ferramentas não estão expostas neste chat. A leitura via Codex CLI/MCP funcionou usando o fluxo normal de aprovação, sem desativar proteções. A conferência administrativa e o ensaio Linux foram feitos separadamente pela Web Console; não houve autenticação SSH externa.

## Homologação isolada e HTTPS de teste

O repositório público GitHub foi clonado em `/opt/tigertech/petcore/releases/0a96d5f7455ec875ba879cd6c5e6f767b8b787d4`. A revisão exata **`0a96d5f7455ec875ba879cd6c5e6f767b8b787d4`** e a ausência da migration **016** foram conferidas. A pasta de desenvolvimento não foi usada como fonte da imagem. O commit aprovado não continha `deploy/`; o Compose e o Caddyfile locais revisados, sem segredos, foram copiados separadamente e tiveram seus hashes conferidos. A construção Docker Linux terminou com sucesso em **70,5 segundos**.

O responsável autorizou transferir a conexão somente para o branch Neon isolado **`br-fragrant-frost-b6kr9it0`**, banco **`neondb`**, com **50 tabelas e 18 migrations**. Não foi usada a conexão do ambiente ativo do Railway. O arquivo privado `app.env` ficou com permissão **600**, proprietário root, configuração TLS `verify-full`, segredo de sessão novo e `APP_ORIGIN=https://petcore.tigertech.dev.br`; sua integridade foi conferida sem imprimir credenciais. Não copiar essas variáveis para documentos ou repositório.

O probe do **TLSSocket do Node confirmou `tlsEncrypted=true`, `certificateAuthorized=true` e `protocol=TLSv1.3`** no transporte VPS → Neon. A consulta separada `pg_stat_ssl=false` foi uma observação do backend, não uma falha do socket cliente medido; nenhuma alteração na aplicação foi necessária por causa dessa consulta.

`docker compose config --quiet` passou. A execução única de migrations retornou **`migrations_ready`**, com as 18 já aplicadas. Na primeira fase interna, somente **`petcore-validation-app-1`** ficou em execução como serviço da aplicação, sem proxy público; migrations e validação do Caddy usaram containers temporários. O serviço ficou **healthy**, com **`PortBindings={}`** — a aplicação não publica sua própria porta —, sistema de arquivos raiz somente leitura, usuário **`node`**, **`no-new-privileges`** e **`CapDrop=ALL`**. O ensaio interno confirmou:

- saúde **200** com `database=true` e página **200**;
- `/api/auth/me` anônimo **401**;
- `Cache-Control: no-store` nas respostas da API e `X-Content-Type-Options: nosniff`;
- JavaScript com **530.609 bytes** e CSS com **223.506 bytes**, com os mesmos nomes e **SHA-256 idênticos** aos assets já conferidos no Railway.

A imagem **Caddy 2.11.9** foi baixada e fixada no servidor pelo seu **RepoDigest efetivo**, em `deploy/compose.proxy-pinned.yml`. O override passou a montar **`deploy/Caddyfile.preview`**, com somente o emissor Let's Encrypt e `X-Robots-Tag: noindex, nofollow`. Configuração, hashes e validação passaram para `PETCORE_HOST=petcore.tigertech.dev.br`; a aplicação foi recriada com `APP_ORIGIN=https://petcore.tigertech.dev.br`. O responsável **aprovou expressamente o acordo de assinante Let's Encrypt v1.8 e renovações automáticas**, usando o contato de suporte.

O responsável salvou manualmente o registro **A `petcore.tigertech.dev.br` → `187.53.115.106`** no Registro.br. A resolução foi conferida por `getent` na VPS e `Resolve-DnsName` no Windows. Em seguida, o proxy **`petcore-validation-proxy-1`** foi iniciado, com a aplicação healthy. Os logs do Caddy registraram **certificado obtido com sucesso** de `acme-v02.api.letsencrypt.org`.

O probe externo pelo cliente HTTP no Windows confirmou **página 200, saúde 200 com `database=true`, `/api/auth/me` anônimo 401, HTTP 308 para HTTPS e `X-Robots-Tag: noindex, nofollow`**. O navegador interno abriu a página de login com HTTPS válido. Essas evidências comprovam acesso público à homologação, não migração final nem execução autenticada das funções.

O responsável **relatou login e acesso ao painel bem-sucedidos**. O relato foi registrado separadamente: as sessões de navegador observadas pelo agente ainda mostravam login, sem prova automatizada de sessão autenticada ou dos fluxos completos de cadastro, agenda, fotos e relatórios nesse destino.

A homologação mantém **somente o branch Neon isolado autorizado**, `EMAIL_PROVIDER=none`, nenhuma credencial real de e-mail ou armazenamento, flags de suporte/lembretes `false`/`NO` e **nenhum cron de manutenção, lembretes ou backup do PetCore ativo**. A renovação automática do certificado pelo Caddy foi autorizada separadamente. Fotos, recuperação de senha, fluxos autenticados completos, revisão de privacidade/fornecedores e guarda recuperável das chaves permanecem pendentes. O Railway e o APK 1.0.1 continuam inalterados; não ativar jobs em duplicidade nem anunciar liberação comercial.

## Antes da transferência final

1. Usar a **VM existente `2162451`** já provisionada, conferindo a identificação antes de qualquer alteração. Não retomar o fluxo genérico de nova compra. A Web Console administrativa funcionou após reiniciar e o container de validação está isolado do ambiente ativo.
2. Docker Engine e Compose foram conferidos após a atualização. **Compose 5.7.1 atende ao mínimo 2.30.0** necessário aos arquivos privados com `format: raw` descritos em [deploy/README.md](../deploy/README.md). Preservar essa compatibilidade ao implantar.
3. Dimensionar aplicação, outros sites e temporários com base nos recursos livres medidos, acompanhando seu consumo. Docker instalado não comprova Node 22 nem PostgreSQL instalados no host. A preparação do projeto prevê Node na imagem da aplicação e PostgreSQL privado no Neon, com TLS.
4. Antes da transferência final, concluir a conferência dos fluxos autenticados completos, fotos, recuperação de senha, fornecedores de backup/e-mail, documentação comercial e plano de retorno. DNS, emissão do certificado e probes públicos da homologação já passaram; isso não comprova renovação futura, rotinas, recuperação ou acesso a fotos. Preservar o pin do Caddy e registrar a imagem local da aplicação vinculada à revisão conferida.

O catálogo também oferece **Docker and Traefik**, com proxy e SSL. A imagem instalada confirmada no painel é **Ubuntu 24.04 with Docker**; não houve confirmação de Traefik instalado. Para vários sites, definir um único proxy nas portas 80/443 e roteamento por domínio. A preparação atual usa Caddy; não iniciar Caddy e Traefik disputando as mesmas portas.

## Segurança

O perfil ativo **TigerTech-Web (`401472`)** permite **SSH TCP 22, HTTP TCP 80, HTTPS TCP 443, ICMP e ICMPv6 de qualquer origem**, descartando o restante. A porta SSH **ainda está aberta a qualquer origem**; restrição por IP/chave é trabalho futuro. O teste externo `Test-NetConnection` confirmou TCP 22 antes e depois da ativação e da reinicialização: ele comprova conectividade TCP, **não autenticação SSH externa**. A nova Web Console autenticou após reiniciar. Antes de iniciar o proxy, a inspeção das portas mostrou somente SSH 22 público em IPv4/IPv6, com DNS e Monarx em loopback; a homologação agora publica HTTP/HTTPS pelo Caddy.

O **Fail2ban** foi instalado com `/etc/fail2ban/jail.d/zz-tigertech-sshd.local`: jail `sshd`, `backend=systemd`, **5 falhas em 10 minutos, bloqueio de 1 hora**. O teste de configuração e `status sshd` passaram; o filtro do journal era `_SYSTEMD_UNIT=sshd.service + _COMM=sshd`, com **0 falhas e 0 bloqueios** na conferência. Não foram provocadas falhas deliberadas; configuração válida e serviço ativo não equivalem a ensaio de bloqueio.

O responsável escolheu **“Manter apenas acesso atual por enquanto”** e adiou o cadastro de chave SSH. **Nenhuma chave pública foi adicionada ao servidor**. A chave temporária gerada somente no computador foi removida com conferência de identificação, sem ter sido usada para acesso externo. A senha root foi preservada: não desativar acesso por senha/root sem chave previamente validada. Guardar credenciais fora do repositório e testar acesso alternativo antes de qualquer restrição futura.

Não contratar licenças de painel ou extras pagos sem solicitação. O scanner Monarx gratuito está ativo; isso não representa contratação da remoção automática paga.

## Backups

O painel confirmou agendamento **semanal** e **0 snapshots/backups** naquele momento; ainda não há evidência de uma cópia efetivamente criada. O backup semanal da VPS e o adicional diário da Hostinger não substituem o backup cifrado do PetCore, a guarda independente das chaves e o ensaio de restauração. Não marcar backup diário pago sem solicitação. Conferir retenção, destino privado e recuperação em ambiente isolado antes da troca; consultar [PHOTO-RECOVERY.md](PHOTO-RECOVERY.md) e [deploy/README.md](../deploy/README.md).

## Fotos

Confirmar armazenamento privado, autorizações por empresa e bucket de backup separado. Não mover fotos para disco público nem presumir que snapshots da VPS abrangem objetos externos. Ensaiar a recuperação em destino novo e vazio e planejar a janela de troca para evitar gravações concorrentes. Manter os fornecedores atuais até a transição validada.

## E-mail — SPF restaurado no DNS público

A consulta pública anterior à restauração de **`send.tigertech.dev.br`** mostrou **MX presente, mas nenhum TXT/SPF**; os TXT de **`resend._domainkey.tigertech.dev.br`** e **`_dmarc.tigertech.dev.br`** estavam presentes naquela consulta. A ausência do TXT em `send` já havia sido observada **antes de atualizar o registro A do PetCore**: não atribuí-la à configuração desse subdomínio.

O responsável **salvou manualmente** o TXT **`send` → `v=spf1 include:amazonses.com ~all`** no Registro.br. Um probe Node `dns.resolveTxt` executado na VPS encontrou **exatamente um SPF com esse valor, `valid=true`**. Isso comprova a resposta DNS observada, não o estado atual **Verified** do Resend nem entrega na caixa de entrada. Nenhum novo teste real de e-mail foi enviado ou autorizado. A configuração do Railway permanece inalterada e o e-mail da homologação Hostinger continua desligado; não houve transferência do provedor de e-mail ou aprovação jurídica dos fornecedores. Ver também [EMAIL.md](EMAIL.md).

## Rotinas e troca de tráfego

Planejar separadamente manutenção, lembretes e backup diário conforme [deploy/README.md](../deploy/README.md). Conferir fuso, execução única, logs e monitoramento; não manter agendas equivalentes ativas no Railway e na VPS sobre o mesmo ambiente. O registro do subdomínio de teste autorizado pode anteceder a emissão do certificado; isso não troca o endereço atual do Railway nem a origem do APK. Transferir o uso efetivo e divulgar a nova origem somente depois de testar HTTPS, sessão, permissões, banco, fotos, exportação e rotinas, com retorno preparado. A mudança da origem do APK exige atualização e teste próprios; não é consequência automática da implantação web.

## Referências oficiais

- [Template Docker: Ubuntu 24.04, Docker e Compose](https://www.hostinger.com/support/8306612-how-to-use-the-docker-vps-template-at-hostinger/)
- [Painel VPS e informações de acesso](https://www.hostinger.com/support/5726606-how-to-use-the-vps-dashboard-in-hostinger/)
- [Vários projetos com Traefik](https://www.hostinger.com/support/connecting-multiple-docker-compose-projects-using-traefik-in-hostinger-docker-manager/)
- [Backups e snapshots da VPS](https://www.hostinger.com/support/1583232-how-to-back-up-or-restore-a-vps-at-hostinger/)
