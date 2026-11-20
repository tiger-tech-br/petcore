# Guarda das chaves do PetCore

Preparado em 15/11 e concluído em **19/11/2026**, com **Bitwarden gratuito, servidor Europa**. O responsável importou cinco notas próprias e exportou o conjunto do cofre EU. A recuperação a partir dessa exportação conferiu assinatura Android com bytes idênticos, senha funcionando, certificado esperado e chave/identificador de backup iguais à configuração ativa. **Guarda externa verificada**, conforme [recibo público sem segredos](evidence/RECOVERY-CUSTODY-20261119.json): `externalCustodyVerified=true`. Não houve restauração de banco nesse teste (`backupDataRestoredInThisCheck=false`).

A limpeza foi concluída: 13 arquivos temporários, incluindo a exportação de Downloads, e dois diretórios restaurados vazios foram removidos. Originais e cofre preservados; `temporaryCleanup=completed`. O guia abaixo serve para futuras versões das chaves. A preparação inicial de 15/11 não havia exportado material real; a transferência e a conferência efetivas ocorreram em 19/11.

## 1. Cofre privado

Use [vault.bitwarden.eu](https://vault.bitwarden.eu/). O cadastro, a senha mestra, a verificação do e-mail e os termos são concluídos diretamente pelo responsável. As contas dos servidores `.eu` e `.com` são separadas: se já tiver uma conta, confira o servidor antes de criar outra. Se ativar autenticação adicional, guarde o código de recuperação por meio independente do próprio cofre; esta rodada não verificou essa configuração. [Regiões oficiais](https://bitwarden.com/help/server-geographies/).

O Free permite notas seguras, mas anexos são recurso pago. Este procedimento guarda o pequeno arquivo de assinatura em partes Base64 dentro de notas, junto da senha/alias e checksums. Base64 **não é criptografia**. [Plano Free](https://bitwarden.com/help/password-manager-plans/), [anexos](https://bitwarden.com/help/attachments/).

## 2. Preparar localmente, somente após revisão

O helper lê `.android-signing/config.json` e `petcore-release.p12`. Não gera outra chave, muda assinatura, abre conta ou envia dados. A saída é **JSON em claro extremamente sensível** dentro de `deploy/private`, pasta ignorada pelo Git; `mode 600/700` em Linux não substitui conferir as permissões Windows. Não abrir no chat, e-mail, site público ou pasta compartilhada.

Na pasta do PetCore, após autorização para ler/exportar o material real:

```powershell
node scripts/recovery-notes.mjs create --output deploy/private/petcore-bitwarden-import.json --confirm-sensitive-export
```

Esse comando guarda **somente a assinatura Android** e informa `backupIncluded:false`. Não conclui a proteção das cópias do banco/fotos. Para incluí-la, a operação deve preparar privadamente um arquivo explícito dentro de `deploy/private` contendo os valores reais de `BACKUP_KEY_ID` e `BACKUP_ENCRYPTION_KEY`. Não colar os valores no comando ou nesta conversa. Use um nome novo para não sobrescrever:

```powershell
node scripts/recovery-notes.mjs create --backup-env deploy/private/CHAVES-BACKUP.env --output deploy/private/petcore-bitwarden-completo.json --confirm-sensitive-export
```

Confira **`backupIncluded:true`**. Conserve cada versão de chave enquanto houver cópia que dependa dela; a chave atual não substitui versões antigas. Outros valores do arquivo env não entram no pacote. S3, banco e tokens não são necessários para este kit.

## 3. Importar no Bitwarden

Entre no seu **cofre pessoal `.eu`**, abra a importação de dados, escolha **Bitwarden (json)** e selecione o arquivo criado. Não usar organização, compartilhamento ou Send. Cada conjunto tem um identificador no nome das notas; importe uma vez para evitar duplicatas. A criação/importação pelo helper não é automática. [Importação oficial](https://bitwarden.com/help/import-data/), [formato JSON de notas](https://bitwarden.com/help/condition-bitwarden-import/).

As notas são pequenas: partes Base64 de 3.500 caracteres, cada nota até 5.000. Há no máximo 32 notas por conjunto e arquivo de assinatura até 64 KiB. O limite documentado de Notes é de 10.000 caracteres **após** a cifragem, que aumenta o texto; a margem não substitui conferir a importação. [Limites de importação](https://bitwarden.com/help/import-data/).

## 4. Comprovar recuperação

No Bitwarden, abra somente as notas desse conjunto PetCore. Copie o conteúdo de cada nota para um arquivo privado `deploy/private/notas-do-cofre.ndjson`, uma nota por linha. Não exporte o cofre inteiro, não misture conjuntos e não envie esse arquivo ao chat.

```powershell
node scripts/recovery-notes.mjs restore --input deploy/private/notas-do-cofre.ndjson --output-dir deploy/private/chaves-recuperadas --confirm-private-restore
```

A pasta de saída precisa ser nova. O helper confere partes/checksums e reconstrói `petcore-release.p12`, `config.json` e, quando incluída, `backup-key.env`. Não instala por cima dos originais. A conferência da guarda valida os bytes, a senha e o certificado Android esperado e compara a chave/identificador de backup com a configuração ativa, sem trocar o ambiente. Restaurar uma cópia do banco/fotos é um ensaio próprio e deve ser registrado separadamente.

Somente depois de recuperar a partir do cofre e conferir, registrar a guarda externa como validada. Remover as cópias de transferência em claro por procedimento controlado, preservando originais e cofre; exclusão comum em SSD não garante apagamento físico. O helper não apaga arquivos, nem conclui essa etapa por conta própria. Uma segunda cópia offline protegida em pendrive pode complementar o cofre, com sua proteção e forma de desbloqueio guardadas separadamente.

## Verificação do helper

```powershell
node --test scripts/recovery-notes.test.mjs
```

Os **10 testes** usam arquivos fictícios privados: reconstrução, checksums, partes ausentes/corrompidas, permissões de caminho, symlinks/junctions, hardlinks, sobrescrita, limites e saída sem segredos. Arquivos de entrada com mais de um vínculo são recusados. Testes e revisão independente passaram em 19/11; isoladamente, não comprovam importação real ou recuperação das chaves existentes. Essas etapas reais foram verificadas separadamente, conforme o recibo acima.
