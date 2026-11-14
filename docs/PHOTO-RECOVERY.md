# Fotos, cópias de segurança e recuperação

## Escopo implementado

O backup remoto passa a reunir o dump PostgreSQL e as fotos referenciadas pelo mesmo snapshot SQL. Cada foto e os dois manifestos são cifrados com AES-256-GCM, com checksums dos bytes cifrados e restaurados. A chave continua no ambiente privado; nunca deve ser copiada para chamados ou para este documento.

As fotos usam nomes imutáveis por UUID. Backup e exportação assistida mantêm o advisory lock compartilhado `719381011` desde antes do snapshot até terminar as leituras. O worker de exclusão usa o mesmo lock de modo exclusivo e adia o lote quando uma cópia está lendo. A perda da conexão de guarda aborta as operações de armazenamento. O lock de schema existente também é preservado.

O manifesto principal conserva o formato `petcore.backup.v1`, acrescentando `objectsIncluded`, `scope` e a referência ao manifesto cifrado `petcore.photos.v1`. Cópias antigas `database-only` continuam restauráveis. Uma cópia antiga sem fotos não passa a contê-las por uma atualização do código.

## Implantação e rotina diária

1. Aplique a migration **018**, sem incluir a migration 016 separada. A 018 distingue `expiring`/`expired` e registra os dados necessários à retomada da exclusão.
2. Publique a aplicação e a manutenção na versão com o lock de fotos **antes** de ativar o novo backup remoto. Isso cobre tanto a execução agendada quanto a retomada manual da fila.
3. No serviço de backup, disponibilize por referências privadas as variáveis existentes `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY` e `OBJECT_STORAGE_SECRET_KEY`, além de `DATABASE_*`, `BACKUP_STORAGE_*`, `BACKUP_ENCRYPTION_KEY` e `BACKUP_KEY_ID` já usados. O destino das cópias deve ser diferente do bucket de fotos.
4. Use `node api/scripts/backup-cycle.mjs` como comando da rotina diária. O ciclo termina com erro quando backup ou conferência de retenção exigir atenção.
5. A retenção aplica a política de **30 dias**, aprovada em 13/11/2026. A exclusão exige as duas liberações `BACKUP_RETENTION_ENABLED=true` e `BACKUP_RETENTION_CONFIRM_DELETE=YES`. Sem ambas, o ciclo executa apenas a conferência de retenção, sem apagar cópias.

Não basta incluir nomes de variáveis: conferência remota deve mostrar `objectsIncluded:true`, contagem de fotos e uma execução de recuperação aprovada. Configuração parcial de fotos causa erro explícito, sem classificar a cópia como completa.

## Ensaio remoto isolado

No serviço operacional de testes, com as referências privadas dos dois buckets e a mesma versão compilada:

```text
node api/scripts/photo-recovery-smoke.mjs --confirm-isolated-test
```

O ensaio gera uma imagem fictícia pequena e UUIDs novos, sem consultar registros de clientes. Ele grava a imagem, cria sua cópia cifrada, comprova a rejeição de chave errada e restaura em `recovery-tests/<UUID>`. Compara os bytes restaurados, confere que uma segunda gravação não sobrescreve o objeto e remove somente seus próprios objetos, identificados por chave e metadados do ensaio.

O resultado precisa ter `ok:true`, `photosVerified:1`, `wrongKeyRejected:true`, `overwriteRejected:true` e `cleanupComplete:true`. Uma tentativa não concluída deve continuar registrada como pendente. Não repetir com objetos de clientes nem chamar sucesso apenas porque a API aceitou um upload.

## Verificar uma cópia completa

O comando existente continua recusando um banco ocupado, a origem como destino e bancos sem o sufixo `_restore_test`:

```text
node api/scripts/restore-check.mjs --object-key <chave.dump.enc> --record
```

Quando a cópia contém fotos, o comando também autentica os manifestos, decifra as fotos e compara seus checksums. Ele não escreve no namespace ativo. O resultado separa `tablesVerified`, `photosVerified`, `photosRestoredToActiveStorage:false` e `applicationReady:false`. Um banco restaurado com fotos conferidas ainda exige a reconciliação de exclusões e revogações antes da reabertura.

Durante a leitura remota, a recuperação mantém o lock compartilhado `719381012` na origem para impedir a expiração concorrente. Se a origem estiver indisponível em um desastre, o operador deve primeiro interromper a rotina de retenção e registrar essa decisão. Só nessa situação pode usar `RESTORE_RETENTION_PAUSED=YES` no ambiente isolado de recuperação. Isso é uma confirmação operacional, não uma forma de ignorar indiscriminadamente falhas de conexão.

Para a retomada real, use banco e armazenamento de destino separados, aplique as exclusões e revogações posteriores à cópia, confira cadastros/fotos por empresa e só depois altere as referências da aplicação. O ensaio não promove objetos automaticamente nem faz essa troca de destino.

### Recuperação das fotos em bucket novo

Após a revisão de privacidade e das exclusões/revogações posteriores à cópia, prepare um bucket **novo e vazio**, distinto do bucket ativo, daquele identificado como origem no manifesto e do destino de backups. Não reutilize um bucket antigo apenas porque seus objetos atuais não aparecem na listagem.

Configure separadamente `RESTORE_OBJECT_STORAGE_ENDPOINT`, `RESTORE_OBJECT_STORAGE_REGION`, `RESTORE_OBJECT_STORAGE_BUCKET`, `RESTORE_OBJECT_STORAGE_ACCESS_KEY` e `RESTORE_OBJECT_STORAGE_SECRET_KEY`. Essas variáveis nunca assumem silenciosamente os valores de `OBJECT_STORAGE_*`. Preserve também endpoint/nome do bucket ativo para o bloqueio de destino, referências de backup, chave de cifra e coordenação da retenção.

```text
node api/scripts/restore-photos.mjs --object-key <chave.dump.enc> --confirm-new-empty-bucket YES --confirm-privacy-reviewed YES
```

A rotina autentica o manifesto, exige que o novo bucket esteja vazio e grava cada foto com seu caminho original `tenants/...`, usando `If-None-Match:*`. Assim os vínculos do banco restaurado permanecem utilizáveis depois da decisão de reabrir o serviço. Compara novamente os bytes gravados e não altera as referências da aplicação. Bucket ativo, bucket de backup, destino ocupado ou confirmação ausente são recusados.

Uma interrupção pode deixar esse destino novo parcialmente preenchido; a rotina não o apaga nem o sobrescreve automaticamente. Analise os registros e prepare outro destino vazio ou uma retomada assistida. A troca final de banco/bucket da aplicação é uma ação separada do operador, depois da conferência por empresa. As confirmações da CLI registram a decisão operacional; não substituem a análise real de privacidade.

## Expiração controlada

Conferência sem exclusão:

```text
node api/scripts/prune-backups.mjs
```

Aplicação explícita da política aprovada:

```text
node api/scripts/prune-backups.mjs --apply --confirm-delete YES
```

São elegíveis cópias `uploaded`/`verified` concluídas há mais de 30 dias e exclusões anteriores em `expiring`. Antes de começar, a rotina autentica o manifesto principal, confere a origem, o identificador e o checksum do dump e, quando houver fotos, autentica também seu manifesto. Não varre o bucket apagando qualquer objeto por idade.

A lista exata de objetos autorizados e o fingerprint do bucket são persistidos antes do primeiro `DeleteObject`. Após interrupção, a rotina retoma essa lista validada de modo idempotente. Não aceita chaves de fotos ativas, outro prefixo ou outro bucket. `expired` e `expired_at` só são gravados após todas as remoções. O estado histórico de verificação de uma cópia não deve ser confundido com disponibilidade depois de expirar.

Cada ciclo valida até 20 cópias e percorre páginas por data/UUID; manifestos inválidos são relatados e preservados, sem consumir esse limite nem bloquear as cópias válidas seguintes. A varredura examina no máximo 5.000 registros. Se ainda houver registros depois desse teto, informa `BACKUP_RETENTION_SCAN_LIMIT_REACHED` e termina com erro, exigindo acompanhamento. Uma interrupção informa `BACKUP_RETENTION_ABORTED`.

Falhas ficam em `expiring`, com código de erro e plano preservado para nova tentativa. Uma criação de backup que falha tenta limpar seus próprios uploads: fotos exigem manifesto autenticado e nonce exclusivo da tentativa; os objetos principais exigem metadados do backup. A limpeza tem prazo limitado. Se não concluir, informa `BACKUP_PARTIAL_CLEANUP_REQUIRED` ou `PHOTO_BACKUP_PARTIAL_CLEANUP_REQUIRED`, sem apagar uma cópia anterior por uma tentativa de sobrescrita.

Registros `failed`, cópias locais ou tentativas interrompidas abruptamente sem manifesto autenticável exigem triagem e destinação assistida; não são apagados por suposição. A operação deve acompanhar essas falhas e cumprir a política de 30 dias também para resíduos de tentativas interrompidas.

Se a conexão cair ao registrar a publicação, `BACKUP_PUBLICATION_UNCERTAIN` informa o UUID da tentativa e preserva todos os artefatos: a atualização pode já ter sido confirmada no PostgreSQL. O script não apaga esses objetos nem substitui um estado `uploaded` por `failed`. Reconcilie o UUID, o estado e os checksums antes de classificar a tentativa ou destinar resíduos.

## Evidências e limites

Em 14/11/2026, o ensaio remoto de uma foto fictícia passou no fornecedor atual: criação/cifra, bytes recuperados, chave errada e sobrescrita recusadas e limpeza completa dos objetos do próprio teste; nenhum objeto de cliente alterado. A nova cópia `6874bd7f-f058-4255-9e29-7c6b7f158aaf` foi depois restaurada em banco isolado com 50 tabelas e contagens conferidas. Ela tinha escopo de fotos habilitado, mas inventário de fotos vazio. Retenção apply conferida com zero vencidas/removidas e sem falhas. Não confundir os dois ensaios nem declarar recuperação de fotografias existentes nessa cópia. Identificações, horários e limites em [REVISAO-20261114.md](REVISAO-20261114.md).

Foram adicionados testes locais para cifra/recuperação, chave incorreta, conteúdo alterado, recusa de sobrescrita, validação de prefixo/bucket, expiração parcial retomável e preservação de cópias recentes. O teste do lock usa PostgreSQL isolado e nenhum acesso real ao armazenamento. O guard do worker usa conexão PostgreSQL direta dedicada, não o pooler transacional do Neon; valida que a conexão direta corresponde ao banco/usuário da aplicação. Nos testes, uma URL de produção herdada é recusada antes de conectar.

Os resultados do ensaio remoto devem ser registrados pela entrega que efetivamente o executar. Testes com S3 simulado não comprovam funcionamento no fornecedor real. O limite atual é de 10.000 fotos por snapshot, 8 MiB por foto e 5 MiB de manifesto; excesso causa erro explícito e exige operação assistida, sem truncamento silencioso.
