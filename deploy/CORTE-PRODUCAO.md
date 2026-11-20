# PetCore — corte para Hostinger e retorno seguro

Pacote preparado em 15/11 e estado atualizado em **19/11/2026**. Este roteiro não transfere credenciais, instala rotinas, envia mensagens, cria recursos ou gera gastos. O destino público atual ainda é homologação. A revisão de contratos/documentos e as permissões de usar os provedores com dados reais continuam sendo tratadas separadamente.

## Estado de partida

| Parte | Estado conferido |
|---|---|
| Hostinger | VPS 2162451, `petcore-validation`, `https://petcore.tigertech.dev.br` |
| Aplicação | Imagem `petcore-runtime:acde9dded16f71403d2a152284144d3019b10d10`, healthy em 19/11; Caddy preservado e fixado por digest |
| Pasta operacional | `/opt/tigertech/petcore/releases/0a96d5f7455ec875ba879cd6c5e6f767b8b787d4` |
| Banco da Hostinger | Branch de testes isolado; role runtime limitada; `migration.env` neutralizado |
| Provedores na Hostinger | E-mail, fotos reais e jobs desligados |
| Railway | Ambiente principal de testes preservado; APK atual 1.0.2/código 3 já aponta para Hostinger |

O domínio novo e o APK não copiam os dados entre esses bancos. Antes do corte, registrar se o destino comercial será uma base limpa ou uma migração dos registros autorizados. Não apagar demonstrações ou reaproveitar a conexão compartilhada de owner para improvisar produção. O nome de um arquivo `.env` não comprova que o banco está autorizado para dados reais.

A imagem atual foi construída de contexto remoto fixado no SHA acima; os arquivos operacionais continuam na pasta `0a96`, com seleção por `PETCORE_RELEASE`. A imagem anterior `4c7a65ba` e a seleção anterior foram preservadas para retorno. Rollout sem migration, troca de dados ou ativação de provedores/jobs. `/api/live` verifica o processo sem sessão/SQL; `/api/health` mantém a conferência do banco. O worker de suporte habilitado ainda consulta o banco a cada 30 segundos. Ver [recibo da implantação](../docs/evidence/DEPLOY-HOSTINGER-20261119.json).

## Etapas com resultado verificável

1. **Fixar o plano real.** Registrar revisão da imagem, host/banco de destino, buckets de fotos/backups e qual ambiente será o único responsável pelas rotinas. Identificar a última cópia recuperável e preservar a configuração anterior. Esse registro contém metadados, sem senhas.
2. **Preparar os arquivos privados após autorizar os destinos.** `app.env`, `migration.env`, `maintenance.env`, `reminders.env` e `backup.env`, fora do Git/imagem e com acesso restrito. Aplicação com role limitada; migrations com credencial própria. Fotos, manutenção e backup devem alcançar o mesmo destino de fotos; backup usa outro destino para as cópias. Não trazer `.env` inteiro do Railway, tokens de PagBank desnecessários ou caminhos Windows para a imagem Linux.
3. **Conferir o pacote local.** Executar o preflight abaixo com o host aprovado. Ele não conecta nem ativa nada. Um resultado positivo exige depois a comprovação real de permissões, buckets privados, certificados, entrega/recuperação e proprietário único das rotinas. Em Windows, ele não certifica ACL; em Linux recusa arquivos com leitura por grupo/outros.
4. **Validar o destino sem duplicar produção.** Nenhum agendador novo ligado ainda. Conferir imagem/digest, 18 migrations existentes e ausência da 016 separada; não rodar migration com o arquivo neutralizado. Testar login, autorização/isolamento e operações próprias fictícias, com recuperação de senha usando somente o destinatário de teste autorizado. O ensaio de 11 verificações de 15/11 permanece evidência da API e não cobre fotos/e-mail.
5. **Validar fotos e recuperação na configuração final.** Depois de autorizar as credenciais e o teste: `node api/scripts/photo-recovery-smoke.mjs --confirm-isolated-test` deve informar foto conferida, chave errada/sobrescrita recusadas e limpeza completa. Executar uma cópia completa e restauração em banco novo/vazio, sem restaurar sobre o ativo; conferir dados e fotos. Os comandos/limites estão em `docs/PHOTO-RECOVERY.md`. A guarda externa das chaves já foi verificada em 19/11 pelo Bitwarden EU; isso não substitui restaurar banco/fotos na configuração final.
6. **Fazer uma janela de corte curta.** Impedir novas gravações no ambiente anterior e aguardar seus jobs terminarem. Desabilitar e reler os cron/agendamentos antigos antes de ligar os novos. Fazer a cópia final ou confirmar a base limpa aprovada; comparar registros/fotos pertinentes. Não manter duas aplicações gravando em bases diferentes como se fossem uma só.
7. **Ativar e conferir uma rotina de cada vez.** Manutenção a cada 15 minutos, lembretes a cada 5 minutos e backup diário às 03h de Brasília. `maintenance`, `reminders` e `backup` do perfil `jobs` são processos de execução única; um `up` permanente não cria o agendamento. Conferir execução/resultado, não apenas a existência do timer. Lembretes somente com opt-in, sem usar o CRM como autorização; suporte é um worker da aplicação e deve ter um único ambiente ativo. Retenção aplica os 30 dias somente com as liberações e acompanhamento já aprovados.
8. **Concluir os clientes de acesso.** O APK 1.0.2/código 3 já usa Hostinger e teve instalação, abertura, login, abertura/fechamento de agendamento e exportação confirmados pelo responsável em 15/11. A revisão remota de 19/11 não gerou outro APK. Informar novo login e a transição, sem deixar o endpoint anterior aceitar gravações concorrentes. No site final conferir recuperação de senha, fotos privadas, exportação e rotinas; publicar documentos somente após a aprovação real. Futuras mudanças de origem exigem revisar o APK, conservar o certificado e aumentar o código.
9. **Acompanhar e preservar a volta.** Guardar resultado dos ensaios, revisão, cópia final, configuração anterior e responsável pelas rotinas. Não excluir imediatamente Railway, branch, fotos ou backups anteriores. Eliminação segue a política, a verificação de necessidade e o procedimento próprio.

## Conferência local sem revelar valores

Os [modelos inativos de serviços e timers](systemd/README.md), preparados em 20/11, correspondem ao projeto e à pasta operacional acima. Sua presença no repositório não instala agendamentos. Antes de criar o marker e habilitar qualquer timer, validar a configuração final, conferir a recuperação e o e-mail e desativar/confirmar as rotinas equivalentes do Railway. O marker é uma liberação operacional local, não uma prova dessas verificações.

Da raiz do projeto, para a homologação preparada neste computador:

```powershell
node deploy/production-preflight.mjs --mode preview --directory deploy/private/hostinger-staging-20261114
```

Para um futuro pacote completo, substituir `HOST_NEON_APROVADO` pelo endpoint real **sem senha**, e apontar a pasta privada que contém os cinco arquivos. Escolher `none`, `railway` ou `hostinger` conforme a etapa; isso é uma declaração a conferir, não prova que o agendador antigo parou.

```text
node deploy/production-preflight.mjs --mode production --directory deploy/private/production --expected-db-host HOST_NEON_APROVADO --jobs-owner none
```

`configurationPassed=true` significa coerência dos arquivos lidos. `networkVerified=false` e `activated=false` continuam explícitos. O campo `knownPreviewDatabase=true` identifica o branch de testes conhecido e exige confirmar dados e destino antes da transição. Não interpretar o preflight como aprovação jurídica, autorização para usar dados reais ou teste de guarda de chaves.

Proteções offline do próprio preflight:

```text
node deploy/production-preflight.mjs --self-test
```

## Quando voltar

Antes da primeira gravação no novo destino, uma falha de saúde, login, isolamento, storage ou rotina mantém o corte suspenso: interromper a aplicação/jobs novos antes de reativar o ambiente anterior e conferir que há apenas um escritor/agendador.

Depois que houver novas gravações, **não apontar automaticamente para uma cópia antiga do banco**. Preservar a cópia do estado novo e reconciliar a fonte correta antes de voltar. Se somente a imagem mudou e o mesmo banco/esquema é compatível, a volta da imagem pode ser suficiente; conferir antes. Restaurar backup global sobre a base ativa pode perder registros ou reativar autorizações revogadas.

O HTTPS já está autorizado para este subdomínio. Esse plano não altera DNS nem justifica instalar outro proxy nas portas 80/443, parar a VPS ou ampliar o acesso administrativo.

## Limite do conector e opção para construir versões

Na pesquisa do MCP de 15/11, `vps_docker_create` aceita Compose e variáveis, mas **substitui um projeto de mesmo nome**. `vps_docker_get` mostrou o Compose base, sem refletir o override/pin efetivo; não é um pacote completo para sobrescrever o projeto atual. Não foi encontrada execução arbitrária de shell. Scripts post-install são para instalação, não para administrar a VPS pronta. Não usar container privilegiado ou montagem de `docker.sock` como substituto de acesso administrativo recusado.

Uma opção legítima para futura construção é um **novo projeto temporário sem portas, segredos ou volumes de host**, com `build.context` Git remoto fixado no SHA completo, tag de imagem própria, `pull_policy: build`, comando de saída zero e healthcheck desativado. Docker/Compose documentam esse contexto; o comportamento concreto de build/exit0 do Docker Manager ainda precisa de ensaio isolado. Isso só construiria a imagem; não atualiza a aplicação existente nem migra dados. [Contexto Git Docker](https://docs.docker.com/build/concepts/context/), [Compose Build](https://docs.docker.com/reference/compose-file/build/).
