# PetCore — preparação comercial

## Atualização de 27/11 — GPS preparado localmente

O acompanhamento de motoristas para Táxi Dog e entregas está implementado localmente, com mapas OpenStreetMap, rotas abertas no Google Maps, área do motorista e link/QR temporários para o cliente. Não foi publicado na Hostinger; a migration 025 permanece apenas no banco isolado de testes. O APK 1.0.3/código 4 foi gerado e assinado com a mesma chave; precisa de teste físico de GPS. Passaram 278 integrações, 40 testes web e 12 Java; a prévia visual foi bloqueada pelo canal nativo indisponível. Consulte [o guia de acompanhamento](TRACKING.md) e as evidências recentes. A última publicação comprovada continua sendo b6ababb505caf8af76592a0a5127c8d58ae4cbe3.


## Atualização de 22/11 — entregas e catálogo publicados

A revisão `b6ababb505caf8af76592a0a5127c8d58ae4cbe3` foi publicada em https://petcore.tigertech.dev.br. Entregas opcionais recebem pedidos internos de WhatsApp/telefone e solicitações do catálogo público com link e QR próprios. O cliente escolhe produtos marcados para o catálogo; confirmar o pedido cria uma única comanda e baixa de estoque. As etapas são Preparando, Saiu para entrega, Entregue e Cancelado. Taxa fixa ou a combinar; recebimento registrado no Financeiro, sem cobrança on-line automática. Não há GPS/rotas nesta revisão; a ampliação para produtos e Táxi Dog está no prompt específico.

Passaram 45 testes da API, 24 do web e 247 integrações em banco isolado. Um ensaio pelo HTTPS publicado passou em 12 verificações, preservou a repetição sem duplicações e removeu os dados temporários; sem e-mail ou pagamento real. O banco tem 58 tabelas e 23 migrations, com 023/024 e sem 016. Aplicação e agendadores usam a nova versão; Beauty Barber preservado. APK 1.0.2 recebe a interface remota ao reabrir; não houve novo teste físico destas entregas. Os documentos jurídicos continuam rascunhos. Resultados detalhados em `docs/evidence/DELIVERY-RELEASE-20261122.json`.


## Atualização de 21/11 — uso simplificado e agendamento público preparado

A revisão `7b9a9990d617c788ee7cf7869cecfd306664e936` está publicada em <https://petcore.tigertech.dev.br>, com aplicação e agendadores atualizados. O banco tem **53 tabelas e 21 migrations**, incluindo 021/022 e excluindo a 016. Foram adicionados cadastro conjunto de cliente/pets, perfil “Só banho e tosa”, participação dos donos nos atendimentos, escolha automática de quem atende e link/QR com pedidos sujeitos à confirmação do pet shop. Os pedidos ficam em painel recolhível na Agenda. Veja o [guia rápido](GUIA-RAPIDO-PETSHOP.md) e a [evidência](evidence/SIMPLIFICACAO-AGENDAMENTO-20261121.json).

Passaram 45 testes da API, 22 do web e **197 integrações** (195 em banco separado da VPS e dois casos com exigência de loopback em PostgreSQL temporário). O teste pelo endereço publicado comprovou os novos fluxos e removeu os cadastros temporários. Antes da migration, foi criado backup cifrado e guardada cópia privada fora da VPS. Manutenção e lembretes terminaram com código zero após a atualização; a próxima cópia diária permanece às 03h de Brasília. O Beauty Barber foi preservado.

**Continuação de 21/11:** a revisão `bc1b48dc59c01d221b87b68a03ce969ea9549564` corrigiu encaixes e ativou o link público normal na empresa Demonstração 1, por solicitação do responsável. A ativação depende de empresa ativa, assinatura válida e preferências do pet shop. Os documentos permanecem `published=false`; isso não bloqueia a funcionalidade nem significa aprovação jurídica. Passaram 61 integrações e 24 testes web nesta correção. QR em canvas compatível com APK 1.0.2. Evidência: `docs/evidence/ENCAIXE-AGENDAMENTO-PUBLICO-20261121.json`.

Os estados abaixo são históricos quando divergirem desta atualização.


Registro de evidências e pendências da preparação comercial. A homologação e as correções móveis/de cobrança estão publicadas; a aprovação operacional/jurídica ainda precisa de conclusão. Não é uma certificação de conformidade.

## Continuação de 20/11 — recuperação de senha concluída

Os itens da Hostinger marcados como interrompidos incluem tarefas pontuais de instalação, migração e verificação já concluídas. Aplicação, PostgreSQL, armazenamento e três agendadores foram encontrados em execução; não houve reinício ou exclusão em massa. O [guia dos projetos](HOSTINGER-PROJECTS.md) distingue os serviços permanentes dessas tarefas.

Após autorização de um único e-mail para o responsável, a recuperação foi solicitada pela API pública em uma conta temporária isolada. O responsável confirmou recebimento, alteração da senha pelo link e login. A conferência do banco encontrou token consumido e avanço da versão da senha; a sessão desse login já não estava presente na leitura final, portanto a evidência de login é o relato do responsável. Conta, empresa, links e sessões temporários foram removidos, sem alterar outras contas. Não registrar senha ou link no chat. Essa pendência funcional está concluída; não presumir pasta da entrega ou resultados dos cabeçalhos SPF/DKIM/DMARC.

Rascunhos da política, acordo e modelos da aplicação passaram a descrever Hostinger/PostgreSQL/Versity, cópia cifrada no computador e Resend. A aplicação usa a revisão `34eb0847`, em volume somente de leitura sobre a imagem base já existente; os jobs mantêm `b89691af`. Compilação e cinco testes dos modelos passaram. O texto salvo foi atualizado apenas após conferir correspondência com o padrão antigo não publicado, preservando termos, identidade, preços e prazos, com auditoria. Saúde pública respondeu 200 com banco OK; os documentos continuam `published=false`.

A conferência oficial dos fornecedores não valida, por si, o mecanismo brasileiro das transferências internacionais. O DPA Hostinger cobre VPS e menciona LGPD; o Resend informa armazenamento nos EUA e recusa anexos contratuais brasileiros em seus planos. A publicação jurídica permanece pendente dessa definição e da aprovação do conteúdo. As consultas já enviadas não foram reenviadas, não houve nova contratação e Railway/Neon não são tratados como fornecedores ativos. Fontes: [Hostinger DPA](https://www.hostinger.com/legal/dpa), [FAQ Resend](https://resend.com/security). [Evidência desta continuação](evidence/HOSTINGER-CONTINUATION-20261120.json).

## Estado atual — migração técnica concluída em 20/11/2026

Esta atualização substitui os estados operacionais históricos abaixo. O PetCore usa **aplicação, PostgreSQL 18.7 e armazenamento Versity na Hostinger**, mantendo `https://petcore.tigertech.dev.br` e o APK **1.0.2/código 3**. A API **`b89691af`** foi preparada às 19h41min45s UTC e aplicada ao app/agendadores às 19h43 UTC, em volume somente de leitura sobre a imagem base `acde9dde`. O banco usa TLS e papel restrito, com **50 tabelas e 19 migrations**, sem a migration 016 separada. O responsável aceitou a cópia de 19/11 às 03h02 por conter dados de teste; a possível defasagem foi informada.

O ensaio HTTPS autenticado confirmou login, cadastros, permissões, URLs pré-assinadas, bloqueio anônimo e logout, com limpeza dos registros fictícios. A recuperação de **uma foto fictícia** passou em 20/11 às **19h43min51s UTC**, rejeitando chave incorreta e sobrescrita, com limpeza completa. O backup novo **`3f45b670-ace7-48f6-9da5-2ee6d1004e80`**, criado às **19h43min52s UTC**, foi restaurado de fato em banco isolado: **50 tabelas conferidas e registro `verified`**. O snapshot tinha zero fotos; o ensaio de uma foto é evidência separada. Os arquivos e manifestos da cópia nova também foram autenticados no computador, com **50 tabelas e 180 linhas**.

Manutenção a cada 15 minutos, lembretes a cada 5 minutos e backup diário às 03h de Brasília usam três contêineres próprios na VPS. A retenção ativa é de 30 dias e exclui os **15 registros legados**; os modelos systemd não foram instalados como timers. A configuração Resend foi preservada e os avisos de suporte foram habilitados após conferir fila vazia. Sucesso dos jobs não comprova entrega de mensagens nem substitui a validação de recuperação de senha ponta a ponta.

Os **cinco serviços e dois buckets do PetCore foram removidos do Railway**, com leitura de zero serviços, buckets e volumes; a exclusão do projeto foi aceita, ainda aguardando a conferência final da lista de projetos neste checkpoint. Os outros sete projetos da conta não foram alterados. Não declarar assinatura da conta cancelada ou fatura total zerada. O Neon foi preservado, sem conexão ativa da aplicação. Antes da remoção da origem, os 36 objetos antigos foram comparados com o destino. A cópia externa no computador passou a conter **40 objetos/2.859.617 bytes**: 39 de backup e uma imagem fictícia de QA de 128 bytes, sem dados pessoais. Sua continuidade é manual, por `scripts/archive-hostinger-storage.mjs`; backups apenas no disco da VPS não protegem a perda do servidor.

**Isso conclui a migração técnica, sem liberar a comercialização por este registro.** Documentos continuam **`legal.published=false`**; revisão/publicação jurídica, contratos e procedimentos efetivos de privacidade e atendimento seguem pendentes. As quatro consultas contratuais de 19/11 já foram enviadas e não foram reenviadas. Não reabrir o APK e a guarda externa de chaves já comprovados. PagBank CPF mantém operação assistida; não criar cobrança ou cancelamento artificial para satisfazer checklist. Detalhes em [MIGRACAO-HOSTINGER-20261120.md](MIGRACAO-HOSTINGER-20261120.md) e na [evidência pública](evidence/HOSTINGER-DATA-STAGING-20261120.json).

## Histórico anterior à conclusão da migração de 20/11

## Preparação de 20/11/2026

O responsável informou que ainda não recebeu respostas às quatro consultas contratuais. Os envios anteriores permanecem registrados; nenhum reenvio foi feito.

Foram preparados [modelos inativos de serviços e timers](../deploy/systemd/README.md) para manutenção, lembretes e backup na VPS. Os arquivos não foram instalados nem ativados. A ativação exige a configuração final conferida, recuperação/e-mail testados e um único ambiente responsável pelas rotinas; o arquivo marcador não substitui essas verificações. A última implantação comprovada permanece `acde9dde`, de 19/11.

A operação de cobrança continua assistida com PagBank CPF. O roteiro está definido e os controles do software têm testes registrados. A primeira operação financeira real deve ser documentada quando houver um caso legítimo; não é necessário produzir cobrança ou cancelamento artificial para anunciar. Isso não elimina a necessidade de executar corretamente pedidos reais e preservar o período pago.

## Continuação de 19/11/2026

O APK **1.0.2/código 3** foi gerado e assinado em 15/11; o responsável confirmou no celular instalação, abertura, login, abertura/fechamento de agendamento e exportação de relatório. A geração passou em 7 testes Java, lint com zero erros e 9 avisos, build release e verificação de assinatura. Evidência física relatada pelo usuário, sem execução do agente; detalhes em [ANDROID.md](ANDROID.md).

**Guarda externa concluída e verificada em 19/11:** o responsável importou cinco notas próprias no Bitwarden EU e exportou o conjunto. A reconstrução a partir dessa exportação conferiu bytes da assinatura Android, senha/certificado e correspondência da chave de backup à configuração ativa. Dez testes locais e revisão independente do preparador passaram. Treze arquivos temporários e dois diretórios restaurados vazios foram removidos, preservando originais e cofre. Recibo: [RECOVERY-CUSTODY-20261119.json](evidence/RECOVERY-CUSTODY-20261119.json), `externalCustodyVerified=true`, `temporaryCleanup=completed`. **Banco não restaurado neste teste.**

A correção de `restore-check.mjs` passou em **9 testes locais com servidor simulado** e **40 testes unitários da API** em 15/11, no commit `8ab69fbeb6d47f765e050a357ccaccfe349bfc1e`. Foi incorporada à revisão **`acde9dded16f71403d2a152284144d3019b10d10`**, construída e **implantada na Hostinger em 19/11**, com arquivo da correção conferido na imagem.

Hostinger e Railway responderam por HTTPS com página/saúde 200 e `ok=true,database=true` em 19/11, com validação normal do certificado. Após o rollout, a leitura interna confirmou **`acde9dde` ativa e saudável**, role exclusiva, origem preservada e ausência de conexão direta no runtime. E-mail, avisos, lembretes, credenciais de storage e timers PetCore continuam desligados/ausentes; sem migration ou troca de dados. A revisão passou em **41 testes unitários API**, build e TypeScript. Seu probe Docker usa `/api/live` sem sessão/SQL, também conferido por HTTPS; `/api/health` mantém a verificação do banco. O worker de suporte, quando habilitado, ainda consulta o banco a cada 30 segundos. Pasta operacional `0a96` e proxy preservados; imagem `4c7a65ba` mantida para retorno.

Na consulta aos registros Neon dos últimos sete dias, havia sete `uploaded`, o mais recente concluído em 19/11 às 03h02min29s de Brasília, e um `verified`, referente ao ensaio histórico de 14/11. Documentos continuam **`published=false`**, fornecedores em revisão e comercialização pendente. Veja [o registro de continuação](REVISAO-20261119.md) e [recibo da implantação](evidence/DEPLOY-HOSTINGER-20261119.json).

Após autorização do responsável, foram enviadas em **19/11 quatro consultas contratuais** pelo Resend a Hostinger, Neon, Railway e Resend. Todas retornaram HTTP 200 com identificador aceito: **quatro aceitas para envio, entrega não confirmada**, respostas aguardadas em `tigertechbr@outlook.com`. O envio não aprova fornecedores ou conformidade/LGPD e não ativa e-mail na VPS. Recibo: [PROVIDER-QUERIES-20261119.json](evidence/PROVIDER-QUERIES-20261119.json).

## Evidências de 15/11/2026

A consulta autenticada pelo MCP confirmou a VPS Hostinger **2162451** com **app e proxy saudáveis**, aproximadamente **15 horas** de execução no retrato observado. A homologação pública mantém o branch Neon de testes separado; o ambiente principal no Railway não foi transferido ou interrompido.

A credencial da aplicação na VPS foi separada: role **`petcore_hostinger_runtime`**, senha exclusiva nova, sem conexão de owner ou `DATABASE_DIRECT_URL` no ambiente efetivo do container. A conexão de migrations foi neutralizada até a preparação de credencial administrativa própria. A verificação Linux conferiu os **quatro privilégios CRUD separadamente em conjunção**, sequências, **50 tabelas e 18 migrations**, tabela de sessão, ausência de propriedade das tabelas e de privilégios administrativos/CREATE examinados, e **TLS com certificado autorizado**. Não houve alteração de senha nos demais branches. Detalhes em [HOSTINGER.md](HOSTINGER.md).

**E-mail, armazenamento real e jobs continuam desligados na Hostinger.** O responsável decidiu **manter o Resend e conferir os contratos primeiro**. Foram preparados o [inventário de fornecedores e fluxos](INVENTARIO-FORNECEDORES.md) e as [consultas aos fornecedores](CONSULTAS-FORNECEDORES.md), sem enviá-las e sem nova contratação. O armazenamento atual das fotos e backups é **Railway Storage Buckets**, em destinos privados separados; compatibilidade S3 não prova contratação direta de Cloudflare ou Amazon S3.

A autenticação de empresa inativa recebeu correção aprovada em **12/12 testes locais**, compilação e TypeScript, e foi **publicada na Hostinger** na revisão **`4c7a65ba0ca97977de128c8f703417dcf3fbe4c9`**, branch `codex/hostinger-release-20261115`, com construção Linux aprovada e imagem de runtime fixada. O Compose operacional permanece na pasta da revisão `0a96d5f7455ec875ba879cd6c5e6f767b8b787d4`; não inferir a imagem ativa somente pelo diretório. Não houve migration nesse rollout nem inclusão da 016. O Railway principal permanece em `0a96d5f7455ec875ba879cd6c5e6f767b8b787d4`. A geração e a confirmação de uso do APK **1.0.2** pelo responsável em 15/11 estão em [ANDROID.md](ANDROID.md).

O ensaio funcional autenticado real da Hostinger terminou com **`ok=true`, 11 verificações**, run **`e3757a31-e0c8-4147-b8fb-ffef3f6aa6d9`**: login HTTPS/cookie seguro/três papéis, Free de 30 dias, origem/permissões/troca de empresa, cadastros/isolamento, agenda completa, estoque/caixa/venda/recebimento interno fictício idempotente/CSV, CRM, logout, aposentadoria e invalidação da sessão do funcionário. Uma consulta independente confirmou duas empresas inativas, três contas sem plataforma, vínculos inativos e zero caixas abertos/atendimentos ativos das fixtures. Nenhum e-mail, foto, checkout ou pagamento externo foi executado pelo ensaio; não somar a contagem a testes anteriores. Evidências e limites em [QA-HOSTINGER.md](QA-HOSTINGER.md) e [REVISAO-20261115.md](REVISAO-20261115.md).

**A comercialização ainda não está liberada por esta atualização.** Permanecem revisão/publicação dos documentos e contratos efetivos, validação das fotos e recuperação no destino final, recuperação de senha ponta a ponta, conferência operacional da cobrança/cancelamento e transferência coordenada das rotinas. O APK 1.0.2 já foi gerado e teve os passos relatados acima confirmados pelo usuário; a guarda externa foi concluída em 19/11. Nenhuma evidência histórica abaixo foi substituída por uma afirmação de teste novo.

## Atualização de 14/11/2026

Aplicação `0a96d5f7455ec875ba879cd6c5e6f767b8b787d4` publicada e conferida por HTTPS; 216 verificações únicas aprovadas, builds e TypeScript completos. Inclui exportação completa assistida por empresa com dados/fotos, snapshots de fotos criptografados, retenção controlada de 30 dias e recuperação para bucket novo. Migrations 018/019 na homologação, sem a 016 separada. O ensaio real com uma foto fictícia passou com limpeza completa e nenhum objeto de cliente alterado. Evidências e limites em [REVISAO-20261114.md](REVISAO-20261114.md).

O responsável aprovou atendimento em até um dia útil de segunda a sexta, devolução proporcional e janela de 30 dias para exportação após encerramento formal. Rascunhos e [procedimentos](OPERACAO-COMERCIAL.md) refletem essas decisões; não há publicação jurídica automática. O APK 1.0.1 teve os cinco testes confirmados pelo usuário. A alternativa **Google Cloud/Scaleway** foi descartada por custo; a **Hostinger KVM 1 já contratada** agora executa **homologação pública isolada em [petcore.tigertech.dev.br](https://petcore.tigertech.dev.br)**, com a revisão aprovada e sem a migration 016. Construção Linux, Compose, migrations existentes, TLSv1.3 com certificado do servidor autorizado, restrições do container e assets passaram. O registro A foi salvo pelo responsável e conferido; após aprovação expressa do acordo Let's Encrypt v1.8 e renovações, o Caddy fixado por digest obteve certificado. O probe externo passou: página/saúde 200, banco verdadeiro, sessão anônima 401, HTTP 308→HTTPS e noindex,nofollow; o navegador abriu o login em HTTPS válido. **Login/painel bem-sucedidos foram relatados pelo usuário**, sem prova automatizada de sessão autenticada ou dos fluxos completos. A homologação usa somente o branch Neon isolado autorizado, sem credenciais reais de e-mail/storage nem cron de manutenção, lembretes ou backup do PetCore; Railway/Neon principal e APK continuam inalterados. A ausência do TXT/SPF de send.tigertech.dev.br era anterior à mudança do A; o responsável restaurou manualmente o registro e o probe DNS da VPS encontrou exatamente um SPF esperado, valid=true. Isso não comprova Verified atual no Resend ou entrega na caixa de entrada; nenhum novo teste real de e-mail foi autorizado ou enviado, e a homologação mantém e-mail desligado. Não é transferência final ou liberação comercial: permanecem revisão de documentos/fornecedores, fotos e recuperação, guarda das chaves, recuperação de senha, fluxos autenticados completos, cancelamento real PagBank e futura troca do APK/rotinas. Ver [HOSTINGER.md](HOSTINGER.md).

Nova cópia `6874bd7f-f058-4255-9e29-7c6b7f158aaf`, 184.266 bytes, com fotos incluídas no escopo e inventário vazio, restaurada em banco isolado: **50 tabelas e contagens conferidas**, estado `verified` em 14/11 às 19h46min36s. A foto fictícia recuperada foi um ensaio separado; não afirmar que a cópia completa continha fotos existentes. Retenção apply conferida sem falhas e sem cópias vencidas/removidas; backup diário e manutenção atualizados. Resta conferir a guarda recuperável das chaves fora do ambiente ativo e acompanhar os jobs. A [proposta de infraestrutura/e-mail](PLANO-INFRAESTRUTURA-LGPD.md) é histórica e está inativa por decisão do responsável.

## Histórico — revisão de 13/11/2026

O código `640a96bd7dfabad6e2dde3eb3fa9147201046198` foi validado com 169 verificações únicas (23 unitárias API, 128 integrações API e 18 web), builds e TypeScript completos. Trata o erro de conexão ociosa PostgreSQL sem encerrar o processo nem expor credenciais e acrescenta **Atualizar conversa** no suporte, preservando rascunho, situação e histórico em caso de erro. Cliente/plataforma conferidos localmente em 320/1280 px, sem excesso horizontal, mantendo as fontes móveis.

Implantação `f37f6790-5d72-43a5-b067-9090e62fe66f` **SUCCESS às 18h56min39s de Brasília**. Às 18h56min58s, página/saúde 200 com banco OK, rotas privadas anônimas 401 e assets idênticos ao build local. A consulta final mostrou cinco serviços saudáveis e sem alterações pendentes; a nova API foi aplicada somente no serviço principal. Não há nova migration, e-mail ou cobrança; a 016 permanece excluída. Evidências, hashes e pendências em [REVISAO-20261113.md](REVISAO-20261113.md). As pendências comerciais não foram encerradas por esse rollout.

## Histórico de 12/11 e evidências operacionais de 13/11/2026

- Publicação anterior conferida: `5f46abfd2b400f69e27ef0c7a9f88a8ba483cf11`; implantação `7a3cd43d-cdbb-4744-974d-51a3693d2ec2`, SUCCESS em 12/11 às 20h59 de Brasília. Avisos de suporte estão ativos no serviço principal. Migrations **001–015 e 017** conferidas na homologação e no banco original de testes; **016 não incluída**, por pertencer a trabalho separado.
- O teste de 12/11 foi adiado por SMTP `451 4.7.0` do Outlook/Office e depois constou como Delivered no Resend em 13/11, com horário exibido de 10h30. O novo teste autorizado de 13/11 foi recebido, conforme confirmação do usuário por volta de 18h35, sem indicação de pasta. SPF TXT/MX e DKIM estavam Verified na consulta de 12/11. Forge opcional pendente não foi identificado como causa. Não houve alteração DNS nem envio além dos testes autorizados.
- Backup de 13/11 concluído às 03h05 de Brasília: registro `c1a1abe7-6f14-4548-9dc5-53c33d1639b6`, armazenamento privado, 186.193 bytes. A restauração dessa cópia não foi verificada (`restorationVerified:false`); nenhum novo ensaio foi realizado.
- O retrato do rollout anterior mostrou cinco serviços saudáveis. A inspeção de 13/11 encontrou encerramento da aplicação às 13h46 por erro em conexão ociosa do pool PostgreSQL sem tratamento. A correção foi validada e publicada na revisão de 13/11 acima. SUCCESS e saúde instantânea não significam ausência de todas as falhas futuras.

As evidências datadas abaixo são históricas. Não substituem a conferência da revisão mais recente nem as aprovações de operação e documentos ainda pendentes.

## Código implementado

- [x] Clientes/tutores, pets, profissionais, serviços, jornadas, agenda e lista de espera.
- [x] Táxi Dog opcional: motoristas, buscas/entregas ligadas ao atendimento, agenda separada, taxa na comanda, cancelamento e proteções de retorno/privacidade. Sem GPS. Evidências locais da revisão de 11/11/2026: 152 testes aprovados, compilação e conferência de fontes desktop/móvel; publicação remota conferida em [TAXI-DOG.md](TAXI-DOG.md).
- [x] CRM com carteira, segmentos, contatos manuais e tarefas de retorno.
- [x] Produtos, movimentos de estoque, concorrência e histórico.
- [x] Vendas/comandas internas, recebimentos parciais, despesas e caixa.
- [x] Relatórios, gráficos e CSV a partir dos registros da empresa.
- [x] Planos R$ 35/mês e R$ 350/ano; Free de teste por 30 dias.
- [x] Modal inicial com Free selecionado; pago pode ser escolhido imediatamente.
- [x] Validade e conciliação manual: escolher plano/retornar do checkout não comprova pagamento.
- [x] Free sem tolerância extra; tolerância somente para período pago.
- [x] Chamados de suporte e respostas da plataforma.
- [x] Avisos de chamados/troca/cancelamento por e-mail, com fila transacional, destinatários autorizados, deduplicação e limites; sino da plataforma e links autenticados. O e-mail não aprova troca, cancela recorrência ou confirma pagamento.
- [x] Solicitações de privacidade, verificação, exportação, anonimização e auditoria.
- [x] Canais de suporte/privacidade: tigertechbr@outlook.com; documentos continuam em rascunho.
- [x] Identidade informada: José Andrey Pereira Lisboa, pessoa física; marca Tiger Tech — Sites, Sistemas e Soluções Digitais.
- [x] Endereço informado: Rua Brasílio Machado, 404, Santo André/SP, CEP 09060-700. Domínio institucional/remetente: tigertech.dev.br. Sem CNPJ informado.
- [x] Guia de primeiros passos, explicação de pré-requisitos e atalhos conforme permissão.
- [x] Modais responsivos; identidade visual, cachorro inteiro e posição dos avisos preservados.
- [x] Correções móveis implementadas após capturas do APK: ações do atendimento em grade com botões de 48 px; guia/resumos com corpo de 16 px e secundários de pelo menos 14 px; cadastros em cartões com rótulos e e-mails longos sem rolagem lateral.
- [x] Página de assinatura sem a explicação longa do PagBank; Assinar agora solicita o checkout autorizado à API e mantém continuação por link se a janela não abrir.
- [x] Migrations controladas, manutenção e scripts de backup criptografado/restauração.
- [x] Código de lembretes com consentimento e controles de envio; isso não significa envio ativado.

## Evidências locais registradas

- [x] Rodada completa anterior: 103 testes aprovados, sendo 18 unitários e 85 de integração, incluindo comercial 19/19, autenticação 11/11, lembretes 8/8 e regressões de upload. As integrações são executadas em série no banco exclusivo para evitar sobreposição das configurações globais usadas pela suíte comercial.
- [x] Autenticação: 11 testes aprovados; lembretes: 8 testes aprovados. Incluídos nos 103 da rodada completa, sem duplicar a contagem.
- [x] Correções atuais: 25 testes comerciais de integração aprovados em PostgreSQL isolado novo com migrations 001–014; 13 testes unitários web aprovados para a ponte Android/checkout. API e interface compilaram. Não somar essa rodada aos 103 anteriores como uma nova suíte completa.
- [x] Ensaio local de interface: botões de atendimento em 360 px; clientes em 320/360 px sem excesso horizontal e com fonte de 16 px; guia/resumos com corpo de 16 px e secundários de 14 px. Checkout anual capturou o endereço correto sem abrir o provedor; cancelamento solicitado e confirmado ficticiamente pelo operador preservou Pago até.
- [x] Backup local AES-256-GCM e restauração em banco isolado: 46 tabelas e contagens conferidas; chave errada, destino ocupado e origem recusados. Não inclui fotos.
- [x] Verificações locais anteriores de login, CRM e modais em computador/celular com dados fictícios.
- [x] Compilação final de API/interface aprovada; TypeScript e Sass conferidos após a reorganização da agenda.
- [x] Jornada fictícia pela interface: serviço, profissional/jornada, cliente, pet e agendamento no celular. Novo atendimento passa a mostrar sua data automaticamente; filtros antigos não o escondem.
- [x] Agenda conferida em 360×740 e 1366×850; login com cachorro inteiro em 320×568 e 360×740. Posição dos avisos mantida.
- [x] Revisão estática concluída; limite de campos multipart do envio de foto corrigido, com reprodução controlada anterior, regressões e revisão independente. Relatório original preserva a versão anterior e não certifica a versão publicada.
- [x] Rodada de suporte de 12/11: 168 verificações únicas aprovadas — 23 unitárias API, 127 integrações API e 18 web — e compilação. Provedor simulado nas suítes; ensaio local em 1366/320 px e links por papel. Não somar com as rodadas anteriores como uma suíte única.

Não somar execuções sobrepostas. Resultados locais não comprovam entrega de e-mail, permissões remotas, construção Docker ou operação jurídica.

## Evidências da homologação externa

- [x] Publicação conferida em 11/11/2026 às 19h41 de Brasília: commit `dd90bd405d67fb353704189bed2d27d8282eb67e`, implantação `2753295b-8d14-4883-910a-c09fc784f329` com SUCCESS. Página e saúde responderam 200, com `{ok:true,database:true}`; sessão e opções de transporte anônimas retornaram 401. Os assets `index-BoZ2FMKK.js` e `index-DyZcqTWU.css` corresponderam ao build local por SHA-256. Os cinco serviços estavam sem problemas, falhas recentes ou alterações pendentes. Migrations 001–015 foram conferidas na homologação e no banco original; o recurso permaneceu desativado e sem reservas fictícias em ambos.

- [x] Revisão histórica `d463fa12`, implantação `00a6dea0-7d32-4b9e-8ac0-7cac9276c9fc`, SUCCESS em 09/11/2026 às 21h22 de Brasília. Página/saúde 200, banco OK, sessão anônima 401 e assets `index-C_n1QduZ.js`/`index-DpZQfskv.css` idênticos ao build local por SHA-256; cinco serviços sem problemas, falhas recentes ou alterações pendentes.
- [x] Branch Neon de homologação separado: `petcore-homologacao-20261106`.
- [x] Destinos separados para fotos e backups criados; variáveis de referência configuradas.
- [x] Configurações diretas do serviço definidas para Dockerfile, início, pré-deploy e saúde.
- [x] Ensaio HTTPS anterior de 12 verificações na revisão `434a341f`: saúde/banco, contato público, cookie seguro, configuração de recuperação sem envio, Free, origens, isolamento/permissões, fotos privadas normalizadas, substituição/exclusão, exportação e anonimização.
- [x] Todos os registros e objetos fictícios desse ensaio foram removidos; nenhuma cobrança ou mensagem foi enviada por ele.
- [x] Migrations 001–014 presentes na homologação e no banco original, confirmado como somente testes. A 014 foi aplicada pelo pré-deploy `2f176aca-c7b5-47a8-9ac1-8a95e9c445d4` e pelo comando de migration no original. A cópia anterior `br-quiet-mountain-b62dyl9j` permanece registrada.
- [x] Manutenção a cada 15 minutos e backup diário às 03h de Brasília executados com confirmação.
- [x] Backup remoto e restauração isolada conferiram 46 tabelas; registro do backup com prefixo `ff3dc3a4` ficou `verified`. O dump não inclui fotos.
- [x] Um teste de e-mail aceito pelo Resend; usuário confirmou recebimento na pasta Spam.
- [x] Variáveis de recuperação aplicadas na revisão publicada; configuração conferida sem enviar mensagem real.
- [x] Serviço de lembretes criado/configurado para cada cinco minutos; autorização do usuário limitada a tutores com opt-in.
- [x] Registro histórico da revisão `434a341f` na aplicação, manutenção e lembretes, com 12 verificações HTTPS aprovadas. A aplicação atual usa a revisão final acima; esse ensaio anterior não foi repetido integralmente nesta entrega.
- [x] Lembretes ativados por autorização expressa, cron de cinco minutos, até 20 por execução e prazo de 10s por envio. Execução em 06/11/2026 às 22h55 de Brasília: nenhum lembrete autorizado devido, zero mensagens enviadas.
- [x] Confirmar registros no painel Resend: SPF TXT/MX e DKIM Verified em 12/11. Em 13/11, teste anterior Delivered no painel e novo recebimento confirmado pelo usuário. Ver [EMAIL.md](EMAIL.md).
- [ ] Conferir resultados SPF/DKIM/DMARC nos cabeçalhos recebidos e acompanhar classificação/entrega, sem presumir Caixa de Entrada.
- [ ] Conferir retenção, alertas e recuperação dos objetos de fotos. A guarda externa das chaves foi verificada em 19/11; isso não restaura os objetos.

Aplicativo HTTPS: [petcore-homologacao.up.railway.app](https://petcore-homologacao.up.railway.app). Esse endereço e a revisão acima já foram conferidos; não comprovam automaticamente a publicação de revisões posteriores.

As capturas do APK enviadas pelo usuário comprovam instalação e uso de algumas telas. As correções posteriores dessas telas e do fluxo de assinatura já passaram pelos testes e compilação locais acima; a publicação final foi concluída e conferida no Railway. Não representam nova versão nativa do APK nem nova execução dos ensaios HTTPS anteriores.

## Pendências para comercialização

- [x] Corrigir e validar o tratamento de erros de conexões ociosas PostgreSQL encontrado em 13/11 e conferir a publicação resultante; ver [REVISAO-20261113.md](REVISAO-20261113.md). Manter o acompanhamento operacional.
- [ ] Revisão e aprovação dos termos, aviso de privacidade, contrato de operação e fornecedores/regiões efetivos.
- [ ] Retenção, incidentes, resposta a titulares, encerramento e transferência de administração praticáveis e aprovados.
- [x] Novos links conferidos sem compra: [PetCore Mensal — R$ 35](https://pag.ae/82jFKCTjo) e [PetCore Anual — R$ 350](https://pag.ae/82jFLbrjr); revisão aprovada no cadastro dos planos. Links antigos substituídos.
- [ ] Publicação jurídica final: permanece desativada e continua sendo uma pendência para a oferta comercial. Por solicitação do usuário, o checkout revisado não depende de `legal.published`; isso não aprova nem publica os documentos.
- [x] Definir a operação assistida de cancelamento e recuperação de checkout: pedido do cliente, conferência no PagBank, referência/reautenticação/período esperado, preservação do período pago e liberação posterior. O [procedimento comercial](OPERACAO-COMERCIAL.md) está preparado; os controles do software têm testes registrados. A primeira execução financeira real será documentada quando houver pedido legítimo ou assinatura de teste autorizada. Não criar cobrança artificial como requisito de lançamento; isso não declara que uma recorrência externa já foi cancelada.
- [x] Guarda externa das chaves Android/backup e recuperação a partir do Bitwarden EU verificadas em 19/11; temporários removidos e originais preservados. Recibo público acima. Não equivale a restaurar banco/fotos no destino final.
- [ ] Homologação completa antes de receber clientes reais e anunciar.
- [x] APK 1.0.1: responsável confirmou em 13/11 os cinco testes no celular, incluindo teclado/Voltar, seleção de foto, exportação Cancelar/Salvar e navegação inferior fixa. Integridade e assinatura reconferidas; ver [ANDROID.md](ANDROID.md).
- [x] APK 1.0.2: gerado em 15/11; o responsável confirmou instalação, abertura, login na Hostinger, abertura/fechamento de agendamento e exportação de relatório no celular. Não comprova e-mail/fotos/jobs no novo destino.
- [x] Recuperação de senha na Hostinger concluída em 20/11: e-mail único autorizado recebido, consumo do link e login com nova senha confirmados pelo responsável; token consumido e versão avançada conferidos no banco, com remoção do cadastro temporário. Evidência e limites na continuação acima.

A conta PagBank atual é PF: checkout externo por links recorrentes e conciliação manual. Não há captura de cartão, integração bancária ou token da API de assinaturas necessário a esse fluxo.

Não há cancelamento automático da recorrência pelos links PF. O botão do cliente registra um pedido de suporte; o operador cancela no provedor e concilia a confirmação, sem reduzir o período pago. O novo plano passa a valer após o novo recebimento. Checkout pendente é persistido por empresa para bloquear assinaturas paralelas e só pode ser liberado manualmente após conferência, reautenticação e justificativa. A confirmação do encerramento resolve os pedidos anteriores daquele ciclo; um novo pagamento exige novo controle de recorrência. O roteiro está em [OPERACAO.md](OPERACAO.md).

## Limites do escopo

O sistema gerencia o pet shop internamente, incluindo vendas no balcão e o Táxi Dog opcional vinculado ao atendimento. Não inclui loja virtual, entrega de produtos, status de pedidos de comércio eletrônico ou emissão fiscal. O transporte usa etapas manuais, sem GPS. Recursos de privacidade não são uma certificação de conformidade. O guia e as evidências de entrega do transporte ficam em [TAXI-DOG.md](TAXI-DOG.md).

A homologação Hostinger já usa [petcore.tigertech.dev.br](https://petcore.tigertech.dev.br); o ambiente principal no Railway foi preservado. A transferência final da operação continua pendente.

## Referências

- [Guia de publicação](RAILWAY.md) e [operação/recuperação](OPERACAO.md).
- [Privacidade e procedimentos](PRIVACIDADE-LGPD.md).
- [PagBank: recorrência](https://developer.pagbank.com.br/docs/pagamentos-recorrentes).
- [ANPD: direitos e agentes de tratamento](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).
