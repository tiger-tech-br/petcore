# Rastreamento de transportes — fundação em desenvolvimento

Base: revisão publicada b6ababb505caf8af76592a0a5127c8d58ae4cbe3 (22/11/2026).
Esta ramificação não foi publicada. Nenhuma coordenada é coletada nesta etapa.

## Alterações
- Migration 025: vínculo opcional entre taxi_drivers e memberships da mesma empresa; conta única por motorista cadastrado na empresa; entregas de produtos podem referenciar o mesmo cadastro de motorista. A flag transport_tracking_enabled começa falsa em todas as empresas.
- GET /api/transport-drivers/options: consulta administrativa dos motoristas e membros ativos da empresa, sem e-mail.
- PATCH /api/transport-drivers/:id/account: responsável vincula user_id ou envia null para desvincular. API confere assinatura nas escritas, empresa, membro ativo, duplicidade e transporte ativo; registra auditoria sem coordenadas.
- Ainda não existe interface para estas rotas nem atribuição de motorista aos pedidos pela API. Os fluxos de entrega e Táxi Dog permanecem como antes.

## Validação pendente
Executar apenas em ambiente isolado com dependências instaladas e banco de testes dedicado terminado em _test. A migration 025 precisa estar presente junto às migrations autorizadas 001–015 e 017–024.
ATENÇÃO: o migrador atual percorre todos os arquivos SQL encontrados. Não executar a migration 016 (trabalho separado). Conferir o conjunto de migrations antes de qualquer execução; não executar o comando de migração genérico em produção.
Com o banco de testes preparado:

```sh
npm run build -w api
node --import tsx --test api/tests/trackingPolicy.unit.test.ts
node --import tsx --test api/tests/transportDriverIdentity.integration.test.ts
```

Os testes foram escritos, mas não executados nesta ramificação pelo chat. O teste de banco usa transação com rollback e não envia dados a provedores. Ainda é necessário testar as rotas HTTP (401/403, assinatura, membro inativo, empresa distinta, concorrência e transporte ativo).

## Próximo incremento
- Cadastro compartilhado acessível também a pet shops que só usam delivery de produtos; atribuição transacional de motorista à entrega, sem tocar na venda, pagamento ou estoque.
- Controle comum de viagens ativas entre módulos e revogação imediata quando associação, conta ou viagem mudar. A FK não substitui autorização.
- Área autenticada do motorista, sem permissões administrativas ou financeiras implícitas.
- Antes de coletar localização: sessões com validade, política de retenção e descarte, exportação/privacidade, endpoints e testes de autorização concorrente. Links públicos limitados e expirantes só após essas proteções.
- Não contratar serviço de mapas, não publicar e não alterar APK nesta etapa.
