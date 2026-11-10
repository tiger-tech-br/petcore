# Operação, backup e recuperação do PetCore

Este roteiro é destinado à pessoa responsável pelo serviço. Comandos de restauração nunca apontam para o banco ativo. Não compartilhe `.env`, endereços com senha, chaves ou arquivos de backup em chats ou chamados.

## Ambientes e responsáveis

Mantenha desenvolvimento, testes e produção identificados e separados. Defina quem acompanha disponibilidade, suporte, cobrança, e-mails, backup, privacidade e incidentes, com um contato alternativo. A troca de administrador ou a venda do projeto precisa transferir os procedimentos e acessos autorizados, não apenas o código.

Na produção, mantenha usuários individuais, menor privilégio, segredos fora do repositório e cookies protegidos por HTTPS. Revogue vínculos e credenciais de pessoas ou serviços que deixarem de precisar de acesso. O papel da aplicação no banco não precisa ser um superusuário do servidor.

## Rotina de acompanhamento

| Frequência definida pela operação | Conferência |
|---|---|
| Em cada implantação | Construção, migrations, saúde, login e erro de aplicação |
| Durante o atendimento | Chamados, falhas de mensagens, filas de exclusão, confirmações de pagamento |
| Em cada backup agendado | Estado final, tamanho, checksum e ausência de falha |
| Periodicamente e após mudanças relevantes | Restauração isolada, acessos, fornecedores, retenção e capacidade |
| Em cada encerramento ou solicitação de dados | Exportação, resposta ao titular, conservação fundamentada e acompanhamento das cópias |

O retorno `/api/health` comprova uma resposta da aplicação e do banco naquele momento. Não comprova integridade de todas as rotas, entrega de e-mail, adequação jurídica nem recuperação dos backups.

## Assinaturas, cancelamento e troca de plano

A conta atual do PagBank é de pessoa física. O PetCore usa links recorrentes hospedados, sem capturar cartão nem usar a API de assinaturas para cancelar automaticamente. **Assinar agora** pede um checkout autorizado à API e abre o endereço devolvido. O retorno do navegador não confirma pagamento: a plataforma precisa conferir o recebimento no PagBank antes de registrá-lo no PetCore. Uma escolha de plano não deve substituir o plano do período já pago.

O cliente pode usar o botão vermelho **Cancelar assinatura** e depois **Confirmar pedido** no modal para criar um pedido de suporte. Essa solicitação não cancela a recorrência no provedor e não encurta o período de acesso pago. Para uma assinatura que já teve recebimento:

1. Localize a empresa e a assinatura real no painel de assinaturas do PagBank. Confira plano, titular da operação, referência e eventuais cobranças pendentes; não se baseie apenas no nome exibido no chamado.
2. O vendedor autorizado encerra a recorrência no próprio PagBank e confere o resultado. Se o estado estiver incerto, mantenha a solicitação em acompanhamento e não libere outra contratação.
3. Na operação da plataforma, abra a assinatura e use **Confirmar cancelamento no PagBank**. Informe a referência, o motivo e a senha da sua conta; marque a confirmação somente depois da conferência real. O pedido inclui `expected_paid_through`, para recusar uma confirmação antiga se um novo recebimento alterou o período pago. Nesse caso, atualize a tela e confira novamente a recorrência atual.
4. A conciliação registra a data de encerramento da renovação, preserva o período pago e resolve os pedidos de cancelamento antigos daquele ciclo. Ela não executa cancelamento externo nem estorno. Outro checkout só deve ser liberado depois dessa confirmação.
5. Após o novo pagamento, confira e registre o recebimento do plano contratado. Só então o plano pago é atualizado. Essa conciliação inicia um novo ciclo de recorrência: o encerramento de uma assinatura antiga não autoriza futuras trocas sem nova conferência.

O início de um checkout também mantém uma trava persistente por empresa, `pending_checkout_at`. Ela evita abrir novas tentativas que possam criar mais de uma cobrança recorrente. Fechar a janela, sair da conta, recarregar ou reiniciar o serviço não apaga a pendência. Não trate tempo decorrido ou ausência de recibo local como prova de que a contratação não aconteceu.

Para recuperar uma tentativa abandonada, a operação precisa primeiro conferir no PagBank se ela criou cobrança ou assinatura. Se houver uma recorrência, trate o pagamento ou o cancelamento antes de liberar outra. Na operação da plataforma, **Revisar tentativa de assinatura** permite registrar a referência, o motivo, a senha e a confirmação de que a tentativa não deixou recorrência ativa; só então use **Liberar nova tentativa**. Não remova os campos diretamente por SQL nem reutilize uma confirmação de outro ciclo. Se não for possível confirmar o estado no provedor, mantenha o bloqueio e acompanhe o pedido de suporte.

O contrato administrativo é `POST /api/commercial/platform/subscriptions/:id/clear-checkout`, restrito à plataforma. Ele exige `password`, `provider_reference` de 3 a 160 caracteres, `reason` de 5 a 500, `confirmed_no_active_recurrence: true`, `expected_paid_through` e `expected_pending_checkout_at`. Os dois valores esperados vêm da assinatura atual; se o período pago ou a tentativa mudarem, atualize a tela e confira novamente antes de confirmar. A liberação é auditada e não cancela nem cobra no PagBank. Não copie senhas ou tokens para chamados ou documentação.

Nesta revisão, passaram 25 testes comerciais de integração em PostgreSQL isolado com migrations 001–014, 13 testes unitários web e a compilação de API/interface. O ensaio local com componentes reais conferiu o pedido de cancelamento e a confirmação fictícia do operador, preservando Pago até, sem efetuar operações no provedor. A publicação final foi concluída e conferida no Railway; esses resultados não comprovam um cancelamento real no PagBank.

Os links revisados podem ser disponibilizados independentemente de `legal.published`, por solicitação do usuário. Isso não publica os documentos jurídicos nem conclui a preparação para oferta comercial. A revisão/aprovação dos termos e dos procedimentos, assim como o SPF pendente, continuam no [checklist comercial](COMMERCIAL-READINESS.md).

A revisão final de 09/11/2026 foi publicada com SUCCESS às 21h22 de Brasília: commit `d463fa12253c83033b90445c900aaf1954a71bc2`, implantação `00a6dea0-7d32-4b9e-8ac0-7cac9276c9fc`. Página e saúde responderam 200, com `{ok:true,database:true}`; a sessão anônima retornou 401. Os assets `index-C_n1QduZ.js` e `index-DpZQfskv.css` responderam 200 e corresponderam byte a byte ao build local por SHA-256. A consulta final encontrou cinco serviços sem problemas, falhas recentes ou alterações pendentes.

## Criptografia dos backups

O formato `petcore.backup.v1` contém dois arquivos: `*.dump.enc` e `*.manifest.enc`. O primeiro guarda o dump custom do PostgreSQL; o segundo contém origem identificada por fingerprint, versão, hashes e contagens de tabelas. Ambos usam AES-256-GCM, nonce aleatório por arquivo e autenticação do cabeçalho. Um conteúdo, nonce ou tag alterado, chave errada ou envelope truncado deve falhar antes de qualquer restauração.

`BACKUP_ENCRYPTION_KEY` precisa ter 64 caracteres hexadecimais aleatórios. Gere e armazene a chave em um gerenciador de segredos e mantenha uma cópia protegida para desastre. A chave não deve ficar junto dos arquivos cifrados. Rotacionar a chave exige manter as antigas para os backups ainda válidos ou recifrar e verificar as cópias; apagar a única chave equivale a perder a capacidade de recuperação.

A implementação usa streams, para não carregar um dump inteiro em memória. Arquivos temporários em claro ficam em diretório privado e são removidos ao final normal ou com erro tratado. Um encerramento abrupto da máquina pode interromper a limpeza; controle o acesso ao disco e o ciclo do ambiente temporário. A imagem usa usuário sem privilégios de root.

## Executar backup

Na imagem já compilada e com `DATABASE_DIRECT_URL` ou `DATABASE_URL`, chave e `BACKUP_STORAGE_*` configurados:

```text
node api/scripts/backup.mjs
```

O comando exige cliente `pg_dump` 18, impede duas execuções simultâneas e não começa um dump durante uma migration com a mesma trava. Usa um snapshot consistente para o dump e as contagens. As credenciais são fornecidas ao programa PostgreSQL por ambiente; a senha não vai na linha de comando.

O envio inclui dump e manifesto cifrados em um bucket privado. Configure o bucket separado das fotos e limite as credenciais à finalidade de backup. Monitore objetos incompletos de execuções que falharam e aplique lifecycle aprovado para versões e expiração. O script não define por conta própria uma retenção jurídica nem apaga cópias antigas de clientes.

O registro em `backup_runs` usa:

- `started`: execução iniciada; não representa cópia concluída.
- `uploaded`: os arquivos foram criados/enviados; restauração ainda não verificada.
- `verified`: o ensaio de restauração e as contagens passaram e foram registrados na origem.
- `failed`: a execução falhou; o código indica a etapa sem expor credenciais.

O dump lógico cobre o banco, não os arquivos do bucket, papéis globais do servidor, DNS, variáveis ou chaves. Complemente com política de recuperação pontual do provedor, cópias dos objetos e registro protegido da configuração necessária. [Escopo e consistência do pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [sincronização de snapshots](https://www.postgresql.org/docs/18/functions-admin.html).

## Ensaio local sem armazenamento em nuvem

Somente em banco de testes cujo nome termine em `_test`, configure as variáveis no terminal e execute:

```text
node api/scripts/backup.mjs --local --output <pasta-absoluta-exclusiva-de-teste>
```

Esse modo exige o destino explícito e não envia arquivos ao bucket. A pasta recebe apenas dump e manifesto cifrados. Não use essa opção para fazer cópias de clientes reais em pastas compartilhadas. Nunca execute o comando apontando para a base de produção por conveniência.

No Windows, se os clientes PostgreSQL não estiverem no PATH, configure `PG_DUMP_PATH` e `PG_RESTORE_PATH` com os caminhos dos executáveis oficiais instalados. Não use comandos obtidos de fonte desconhecida. Na imagem, ambos já apontam para os executáveis PGDG 18.

## Verificar restauração em banco novo e vazio

1. Crie manualmente um banco isolado, vazio e com nome terminado em `_restore_test`, usando credenciais destinadas ao ensaio. Não copie a conexão de produção para o destino.
2. Defina `RESTORE_DATABASE_URL` com esse banco. Ele precisa ser diferente da origem identificada no manifesto.
3. Disponibilize a chave correspondente à cópia e os dois arquivos cifrados; ou configure acesso de leitura ao bucket privado.
4. Execute uma das opções:

```text
node api/scripts/restore-check.mjs --file <arquivo.dump.enc> --manifest <arquivo.manifest.enc>
```

```text
node api/scripts/restore-check.mjs --object-key <prefixo/arquivo.dump.enc>
```

O manifesto pode ser inferido quando os nomes terminam em `.dump.enc` e `.manifest.enc` com o mesmo prefixo. O modo de bucket só aceita a chave dentro do prefixo de backups configurado.

O comando recusa destino com tabelas, sequências, visões ou funções de usuário; não usa `DROP`, `--clean` ou sobrescrita. Confere os hashes, autentica os dois arquivos, usa `pg_restore` 18 em uma transação e compara o inventário e as contagens das tabelas. Falhas não autorizam tentar novamente contra o banco ativo. Se a restauração foi executada e uma conferência posterior falhou, analise o banco isolado; ele não é apagado automaticamente.

Para registrar a verificação em `backup_runs` na origem, use também `--record`, com a conexão da origem configurada. O fingerprint e o checksum precisam coincidir com o manifesto e o registro existente. Isso altera somente o estado do backup na origem; não restaura dados nela.

```text
node api/scripts/restore-check.mjs --file <arquivo.dump.enc> --record
```

Contagens iguais não substituem a conferência funcional: teste autenticação, permissões por empresa, amostras de cadastros, agenda, estoque e saldos. Mantenha o ambiente restaurado sem exposição pública e sem envios de e-mail ou cobranças. Se a cópia tiver dados reais, a proteção e os acessos desse ambiente também precisam atender à política de privacidade.

## Retomar serviço após um desastre

Um ensaio aprovado não troca automaticamente o banco da aplicação. A pessoa autorizada precisa coordenar a recuperação:

1. Contenha o incidente e preserve evidências necessárias, com canais e responsáveis definidos.
2. Escolha uma cópia e o ponto de recuperação conforme a avaliação operacional. Confira perdas e mudanças posteriores à cópia.
3. Restaure em destino separado e valide dados e aplicação.
4. Recupere as fotos e outras dependências pela política de objetos. Uma referência no banco não repõe o arquivo ausente.
5. Reaplique exclusões, desidentificações e revogações já atendidas após a data da cópia. Não reative consentimentos antigos ao restaurar.
6. Invalide sessões antigas e rotacione os segredos envolvidos quando pertinente. Reavalie credenciais que possam ter sido comprometidas.
7. Confira conciliações do provedor para evitar duplicar pagamentos, estornos ou lembretes. Um banco restaurado não cancela uma cobrança que já aconteceu fora dele. Confira também as recorrências, os cancelamentos confirmados e os checkouts pendentes ocorridos depois do backup; não libere novas assinaturas com base somente no estado restaurado.
8. Só altere a conexão da aplicação e reabra o acesso após aprovação da validação. Registre decisões, responsáveis e comunicações aplicáveis.

Não há neste roteiro um comando genérico para apagar e substituir produção. Uma mudança desse porte deve ser avaliada no contexto do incidente, com destino e impacto concretos.

## Manutenção

O comando `node api/dist/maintenance.js --once` executa um ciclo. `--loop` mantém o processo ativo com intervalo configurável. `--prune-only` limita a limpeza e `--files-only` limita a fila de fotos. Configure uma tarefa separada no Railway, sem exigir health check HTTP e sem fazer seed ou migration a cada ciclo.

A limpeza alcança apenas sessões expiradas, contadores antigos de tentativas, tokens de redefinição usados/expirados e convites expirados. Não elimina auditoria, pedidos de titulares, dados operacionais ou documentos financeiros por um prazo inventado. A fila de fotos utiliza lotes, travas e tentativas idempotentes; falhas precisam de acompanhamento. Sem armazenamento configurado, a rotina informa que essa parte não está habilitada.

## Limites e pendências externas

- O operador precisa confirmar privacidade do bucket, permissões, região, lifecycle e credenciais. A existência de variáveis no servidor não comprova a configuração correta do provedor.
- Recovery/PITR e backups do banco no provedor dependem do serviço contratado. A chave de cifra e os objetos precisam de proteção separada.
- O fluxo de e-mail de produção exige remetente habilitado, entrega conferida e tratamento de falhas.
- Dados jurídicos, contatos e procedimentos da Tiger Tech precisam ser reais e aprovados antes da oferta comercial.
- Os links e o procedimento de cobrança do PagBank devem ser conferidos no próprio provedor; o registro do sistema não substitui essa conciliação.
- Uma imagem ainda não construída em Docker/Railway e uma restauração ainda não executada devem continuar registradas como pendentes.

Referências técnicas: [TLS e validação de certificado no PostgreSQL](https://www.postgresql.org/docs/18/libpq-ssl.html), [cripto autenticada no Node.js 22](https://nodejs.org/download/release/v22.15.1/docs/api/crypto.html), [configuração e implantação no Railway](https://docs.railway.com/config-as-code/reference). A análise de incidentes, retenção e direitos dos titulares está em [PRIVACIDADE-LGPD.md](PRIVACIDADE-LGPD.md).
