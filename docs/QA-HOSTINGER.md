# Ensaio autenticado da homologação Hostinger

## Execução real em 15/11/2026

O arquivo `api/scripts/hostinger-e2e.mjs` foi revisto independentemente, copiado com conferência de hash e executado em container Linux na VPS contra o destino de homologação autorizado. A rodada **`e3757a31-e0c8-4147-b8fb-ffef3f6aa6d9`** terminou com **`ok=true`, 11 verificações**, fixtures aposentadas e invalidação da sessão do funcionário comprovada. SHA-256 do runner: **`0e40656c5bea85a90d2639586570fb1efed6b1f227c00d54b0a9e7242169ba98`**.

A aplicação alvo já usava a revisão **`4c7a65ba0ca97977de128c8f703417dcf3fbe4c9`** na Hostinger, com imagem fixada e correção de autenticação de empresa inativa. A rodada conferiu login HTTPS/cookie seguro/três papéis, Free por 30 dias, restrições de origem/papel/troca de empresa, tutor/pet/serviço/profissional e isolamento, agenda com confirmação/conflito/reagendamento/histórico, estoque/caixa/venda/recebimento interno fictício idempotente e CSV, contato/tarefa CRM, logout, aposentadoria e invalidação da sessão do funcionário. **Não somar estas 11 verificações a rodadas anteriores como uma suíte única.** Os testes `--self-test`, por sua vez, são somente locais.

Uma consulta SQL independente confirmou **duas empresas inativas**, **três contas sem privilégio de plataforma**, vínculos inativos e **zero caixas abertos/atendimentos ativos** das fixtures dessa execução. Os registros fictícios foram preservados para auditoria, sem DELETE. Não houve execução de migration, inclusão da 016, envio de e-mail, upload de foto, visita ao checkout ou pagamento externo. E-mail, storage real e jobs continuam desligados na Hostinger; o Railway principal não foi alterado. Ver [REVISAO-20261115.md](REVISAO-20261115.md).

## Limites de destino

Destino exclusivo: `https://petcore.tigertech.dev.br`, branch Neon `br-fragrant-frost-b6kr9it0`, banco `neondb`, endpoint `ep-damp-tree-b6h5kkhc`. O script recusa outro endpoint, origem, banco, lista de migrations diferente ou checksum divergente das migrations 018/019, além de configuração local com e-mail/storage ativos. Ele lê somente o arquivo privado indicado; não importa a aplicação nem carrega `.env`/`.env.homologacao` como alternativa.

## O que confere

- Login HTTPS real de duas contas responsáveis e um funcionário, cookie Secure/HttpOnly/SameSite, identidade da sessão e saída.
- Free de 30 dias, sem selecionar plano pago ou visitar o PagBank.
- Cliente, pet, serviço, profissional, jornada, agendamento futuro, confirmação, conflito, reagendamento e histórico.
- Estoque, venda fictícia no balcão, abertura de caixa, recebimento **interno fictício em dinheiro**, conferência/fechamento, repetição sem duplicar produto/caixa/pagamento e relatório CSV.
- Contato e tarefa manuais do CRM; isolamento entre **duas empresas criadas pelo próprio ensaio**, permissões do funcionário e recusa de outra origem.
- Aposentadoria das fixtures: fecha somente o caixa fictício desse ensaio se ainda aberto, desativa empresas/acessos, invalida sessões e cancela seus agendamentos/lembretes pendentes, preservando os registros para conferência. Não executa SQL DELETE, DROP ou anonimização de dados alheios.

São verificações funcionais pela API publicada, não automação visual de cliques. Layout, teclado e navegação do APK, fotos/storage, recuperação por e-mail, rotinas agendadas, cancelamento real no PagBank e documentos jurídicos precisam de suas próprias evidências. O script não substitui esses itens nem libera comercialização.

## Como executar depois de conferir os arquivos

Na pasta do projeto, com Node 22.12+ e as dependências já instaladas:

```powershell
node api/scripts/hostinger-e2e.mjs --self-test
node api/scripts/hostinger-e2e.mjs prepare --confirm-test-only
```

`prepare` cria exclusivamente duas empresas e três usuários fictícios `@example.test`, sem acesso de plataforma. O resultado informa `stateFile`, por exemplo `deploy/private/hostinger-e2e/<run-id>.json`. Substitua o caminho abaixo pelo resultado real:

```powershell
node api/scripts/hostinger-e2e.mjs run --confirm-test-only --state deploy/private/hostinger-e2e/<run-id>.json
```

O estado privado contém somente identificadores, datas e chaves de idempotência; senhas são aleatórias e ficam apenas na memória, assim como os cookies. Não envie os arquivos privados ao Git, ao chat ou ao cliente. A pasta já está ignorada pelo Git; no Windows, confira também as permissões de acesso da pasta. `mode 600/700` protege o arquivo em Linux, mas não substitui ACL no Windows. Repetir um ensaio concluído retorna `reusedRecordedResult=true`: é um registro anterior, não nova evidência da implantação atual.

`run` aposenta suas fixtures ao terminar, inclusive quando uma verificação dentro da jornada falha. Só registra `completed=true` depois de concluir a jornada, aposentar as fixtures e comprovar que a sessão do funcionário foi invalidada. `retired=true` sozinho não significa que o ensaio passou. Repetir um `run` aprovado retorna o resultado registrado, sem repetir operações; uma execução reprovada não pode ganhar aprovação pela repetição. Se o processo for interrompido antes do bloco de finalização, execute:

```powershell
node api/scripts/hostinger-e2e.mjs retire --confirm-test-only --state deploy/private/hostinger-e2e/<run-id>.json
```

`retire` valida novamente os nomes, usuários, ausência de acesso de plataforma e todas as vinculações das fixtures antes dos UPDATEs. Repeti-lo não afeta outras empresas. Funciona mesmo se a API estiver fora do ar ou os documentos tiverem sido publicados, pois dispensa o preflight HTTP; mantém as verificações do arquivo privado, origem/endpoint, banco, migrations/checksums, lock e propriedade dos registros. Um arquivo `.lock` de processo interrompido pode exigir conferência de que nenhum ensaio continua em execução antes de sua remoção manual. Não apague a base ou a empresa para resolver essa situação.

Em erro HTTP, o diagnóstico mostra somente o caminho com IDs ocultados e os status esperado/recebido, sem conteúdo da resposta, cookies ou credenciais. Depois de uma reprovação com fixtures já aposentadas, prepare outro ensaio; não reative empresas manualmente para obter aprovação.

O arquivo de configuração padrão é `deploy/private/hostinger-staging-20261114/app.env`. Pode ser informado outro arquivo **dentro de `deploy/private`**, usando `--env`; os mesmos limites de origem/endpoint e provedores continuam obrigatórios. Esse arquivo local não prova que o servidor ainda está com as mesmas flags: confira a configuração efetiva antes do ensaio. O fluxo não cria tickets de suporte, não dá opt-in ao tutor e não chama endpoints de envio, foto ou cobrança.

Execute `run` até o dia seguinte ao `prepare`; o horário reservado fica dois dias à frente, às 12h de São Paulo, e o script recusa horário antigo ou relógio divergente. Não rode várias vezes seguidas: o limite real de login é preservado, sem falsificar IP ou cabeçalhos de proxy. Se houver 429, espere a janela de 15 minutos e crie outra fixture após aposentar a anterior.

## Credencial exclusiva da Hostinger

A inspeção inicial de 15/11 encontrou `neondb_owner` com senha compartilhada entre conexões locais; nenhum valor foi exibido. A revisão principal substituiu a conexão efetiva da VPS pela role **`petcore_hostinger_runtime`**, com senha exclusiva. Foram conferidos no Linux: ausência de `neon_superuser`/superuser, criação de banco/role, bypass RLS e CREATE no schema public; nenhuma tabela própria; permissões SELECT/INSERT/UPDATE/DELETE verificadas separadamente, sequências, 50 tabelas/18 migrations e socket TLS com certificado autorizado. Isso limita os privilégios administrativos da credencial; **o isolamento por empresa continua sendo aplicado pela API**, não por uma política RLS criada por esta mudança.

`DATABASE_DIRECT_URL` foi removida do runtime; `migration.env` ficou neutralizado e a busca nos arquivos `.env` do servidor não encontrou `neondb_owner`. A cópia privada local do `app.env` foi sincronizada. Futuras migrations exigem conexão administrativa própria e controlada; não reutilizar a senha de owner compartilhada. Este ensaio não cria roles nem troca credenciais na nuvem.
