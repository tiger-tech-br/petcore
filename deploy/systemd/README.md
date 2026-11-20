# Rotinas da Hostinger — pacote inativo

Preparado em 20/11/2026. Estes seis arquivos locais não foram instalados nem ativados na VPS. Não criam o marcador de aprovação, credenciais ou recursos.

| Rotina | Horário em `America/Sao_Paulo` | Limite por execução |
|---|---|---|
| Manutenção | Minutos 00, 15, 30 e 45 de cada hora | 10 minutos |
| Lembretes autorizados | A cada 5 minutos | 10 minutos |
| Backup e conferência de retenção | Diariamente às 03h | 30 minutos |

Os serviços executam um único job do Compose `petcore-validation`, com a seleção `deploy/.env.validation` e os arquivos `compose.production.yml` e `compose.proxy-pinned.yml`. A pasta operacional permanece em `/opt/tigertech/petcore/releases/0a96d5f7455ec875ba879cd6c5e6f767b8b787d4`; seu nome não identifica a imagem selecionada. Não executam `up`, não recriam app/proxy, não publicam portas nem solicitam build/pull. Exigem a imagem aprovada já disponível na VPS.

## Antes de qualquer ativação

1. Concluir e registrar o [roteiro de corte](../CORTE-PRODUCAO.md): destino autorizado, preflight, permissões reais, fotos/recuperação, e-mail e última cópia recuperável. Os arquivos de configuração privados são os já previstos no Compose; nenhuma variável ou confirmação é substituída nestas unidades.
2. Conferir e interromper os cron/agendamentos correspondentes no Railway, aguardar as execuções em andamento e verificar que só a Hostinger será responsável por essas rotinas. O worker de avisos de suporte da aplicação também deve ter um único ambiente ativo. A presença de um timer não prova essa exclusividade.
3. Revisar os seis arquivos e validá-los na versão de systemd/Docker efetiva da VPS. Os serviços usam o acesso root/Docker já existente, sem criar usuário, chave ou exposição do socket. Manter arquivos, pasta operacional e configurações sob administração restrita.
4. Somente depois da decisão de corte, o administrador poderá instalar as unidades e preparar `/etc/petcore/hostinger-jobs-approved` como marcador de propriedade root. **Este pacote não cria esse arquivo e não contém comandos de instalação/ativação.** A ausência do marcador impede iniciar timers e serviços; uma condição não satisfeita significa execução ignorada, não job concluído. O marcador sozinho não comprova aprovação contratual, preflight, configuração ou parada dos cron antigos.
5. Ligar uma rotina por vez na etapa autorizada e conferir seu resultado real e registros. Lembretes continuam exigindo opt-in e confirmações do ambiente; exclusão de backups continua exigindo as duas liberações de retenção. Não alterar essas liberações apenas para o serviço terminar sem erro.

Os timers de manutenção/lembretes aguardam o próximo horário e não recuperam disparos perdidos. O backup usa `Persistent=true`: após período inativo, pode executar imediatamente ao reativar para recuperar um horário perdido. Não reativar sem conferir a última execução e o destino. O systemd não inicia outra instância da mesma unidade enquanto ela está ativa; uma execução longa pode fazer perder um disparo intermediário.

Cada job usa um nome fixo de contêiner. Se o cliente Compose atingir o tempo limite ou perder conexão, não presumir que o contêiner terminou: ele pode continuar no Docker. Antes de retomar, conferir `docker ps -a --filter name=petcore-hostinger-`, estado do job, locks e resultado. Um contêiner remanescente impede reutilizar seu nome, evitando iniciar silenciosamente outra execução; não removê-lo à força para ignorar um job ainda ativo.

## Conferências sem ativar

Na VPS, a partir da raiz operacional e antes de instalar/ativar, estes comandos apenas analisam os arquivos e os calendários:

```text
systemd-analyze verify deploy/systemd/petcore-maintenance.service deploy/systemd/petcore-maintenance.timer deploy/systemd/petcore-reminders.service deploy/systemd/petcore-reminders.timer deploy/systemd/petcore-backup.service deploy/systemd/petcore-backup.timer
systemd-analyze calendar '*-*-* *:0/15:00 America/Sao_Paulo'
systemd-analyze calendar '*-*-* *:0/5:00 America/Sao_Paulo'
systemd-analyze calendar '*-*-* 03:00:00 America/Sao_Paulo'
```

Depois de uma instalação autorizada, conferir `systemctl list-timers --all 'petcore-*'`, `systemctl status petcore-backup.service` e `journalctl -u petcore-backup.service`. Usar os nomes correspondentes para manutenção/lembretes. O resultado do processo e os registros da aplicação devem comprovar a operação; `active` no timer não comprova backup, entrega de lembretes ou recuperação.

Calendários, condições e persistência foram preparados conforme as referências oficiais de [systemd.time](https://www.freedesktop.org/software/systemd/man/latest/systemd.time.html), [systemd.timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html), [systemd.unit](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html) e [docker compose run](https://docs.docker.com/reference/cli/docker/compose/run/). Conferência local de texto não substitui `systemd-analyze` e o ensaio real na VPS; nenhuma execução remota foi realizada nesta preparação.
