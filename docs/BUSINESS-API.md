# API comercial do PetCore

Contrato para a implementação em andamento. Router montado em `/api/business` antes dos routers genéricos. Todas as rotas exigem sessão/empresa; produtos e estoque usam `inventory`, vendas/financeiro/caixa/relatórios usam `finance`. Administradores têm acesso implícito. Valores inteiros em centavos, quantidades inteiras em unidades. Campos `id` são UUID. Datas operacionais de filtros são `YYYY-MM-DD` no fuso da empresa; limites de período: 366 dias. Paginação `{items,total,page,pageSize}`, `page_size` padrão 20 e máximo 100.

## Produtos e estoque

`GET /products?q=&page=1&page_size=20&low_stock=false&include_inactive=false` → paginação + `summary:{products,lowStock,units}`.

`Product = {id,name,sku,unit,price_cents,cost_cents,min_stock,stock_quantity,active,created_at,updated_at}`. `unit` texto (ex. `un.`); estoque e mínimo são inteiros >=0. SKU vazio permitido; SKU preenchido é único na empresa.

`POST /products` com `{name,sku:'',unit:'un.',price_cents,cost_cents,min_stock,initial_stock:0,idempotency_key:UUID}` → Product, HTTP201. `PATCH /products/:id` aceita os campos cadastrais parcialmente + `active`; estoque só muda por movimentação.

`GET /stock-movements?product_id=UUID&page=1&page_size=20` → paginação. `StockMovement = {id,product_id,product_name,quantity_delta,balance_after,reason,note,created_at,created_by_name}`. Motivos `initial|purchase|usage|adjustment|sale|sale_cancel`.

`POST /products/:id/movements` com `{quantity_delta:integer!=0,reason:'purchase'|'usage'|'adjustment',note,idempotency_key:UUID}` → StockMovement. Compra positiva, consumo negativo, ajuste nos dois sentidos. Bloqueia saldo negativo.

## Opções para comandas

`GET /options` (finance) → `{tutors:[{id,name}],services:[{id,name,price_cents}],products:[{id,name,sku,price_cents,stock_quantity}],appointments:[{id,starts_at,pet_name,tutor_name}],timezone}`. Opções limitadas a 1000 registros por tipo. Atendimentos concluídos e ainda sem comanda, últimos 366 dias.

## Vendas/comandas

`GET /sales?status=all|open|paid|cancelled&q=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&page_size=20` → paginação. Datas opcionais, padrão últimos30dias.

`Sale = {id,code,tutor_id,tutor_name,appointment_id,status,subtotal_cents,discount_cents,total_cents,paid_cents,balance_cents,due_date,notes,created_at,cancelled_at,cancellation_reason}`.

`GET /sales/:id` → `{sale:Sale,items:SaleItem[],payments:LedgerEntry[],timezone}`. `SaleItem = {id,kind:'product'|'service',product_id,service_id,description,quantity,unit_price_cents,total_cents}`. Descrições são snapshot do produto/serviço, sem duplicar dados pessoais do tutor.

`POST /sales` com `{tutor_id:null|UUID,appointment_id:null|UUID,items:[{kind:'product',product_id,quantity}|{kind:'service',service_id,quantity}],discount_cents:0,due_date:'YYYY-MM-DD',notes:'',idempotency_key:UUID}` → Sale. Preços vêm do servidor. Ao informar `appointment_id`, os serviços e o tutor são importados dos snapshots daquele atendimento concluído; `items` pode conter somente produtos adicionais. Sem atendimento, `items` precisa ter ao menos uma linha. Uma comanda por atendimento; não é permitido repetir produto/serviço em linhas diferentes. Produtos saem do estoque na criação da comanda; cancelar recompõe uma única vez.

`POST /sales/:id/payments` com `{amount_cents,payment_method:'pix'|'cash'|'credit_card'|'debit_card'|'other',idempotency_key:UUID}` → `{sale:Sale,payment:LedgerEntry}`. Aceita parcial, bloqueia valor maior que o saldo. São registros manuais de recebimentos; não captura nem cobra cartão. Dinheiro exige caixa aberto. Horário do registro é definido pelo servidor.

`POST /sales/:id/cancel` com `{reason,idempotency_key:UUID}` → Sale. Cria lançamentos compensatórios para os recebimentos existentes, preserva histórico e recompõe estoque; devolução em dinheiro exige caixa aberto. É registro de estorno operacional, não devolução automática por gateway.

## Despesas

`Expense = {id,title,category,amount_cents,due_date,status:'open'|'paid'|'cancelled',notes,created_at,paid_at,payment_method,cancelled_at,cancellation_reason}`. Categorias `supplies|rent|payroll|utilities|other`.

`GET /expenses?status=all|open|paid|cancelled&from=&to=&page=1&page_size=20` → paginação; filtro de datas usa vencimento.

`POST /expenses` com `{title,category,amount_cents,due_date,notes:'',idempotency_key:UUID}` → Expense. `POST /expenses/:id/pay` com `{payment_method,idempotency_key}` → Expense. `POST /expenses/:id/cancel` com `{reason,idempotency_key}` → Expense; se paga, gera compensação da saída preservando o histórico. Pagamento ou compensação em dinheiro exige caixa aberto.

## Caixa

`CashSession = {id,opened_at,closed_at,opening_cents,counted_cents,expected_cents,difference_cents,notes,closing_notes,opened_by_name,closed_by_name}`.

`GET /cash` → `{current:CashSession|null,recent:CashSession[],timezone}`; até20caixas recentes. `expected_cents` do caixa aberto é calculado dos lançamentos efetivos vinculados.

`POST /cash/open` com `{opening_cents,notes:'',idempotency_key}` → CashSession. Só um caixa aberto por empresa. `POST /cash/:id/close` com `{counted_cents,notes:'',idempotency_key}` → CashSession. Reentradas idempotentes não duplicam operações. Saldo inicial não é receita.

## Financeiro e relatórios

`GET /summary?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{from,to,timezone,totals:{receipts_cents,refunds_cents,expenses_cents,expense_refunds_cents,net_cents,receivables_cents,payables_cents},daily:[{date,receipts_cents,refunds_cents,expenses_cents,expense_refunds_cents,net_cents}],paymentMethods:[{payment_method,receipts_cents,refunds_cents}],cash:CashSession|null}`. Recebíveis/pagáveis pendentes da empresa inteira; demais métricas consideram período por data do movimento. Receita registrada não é valor meramente agendado; saldo registrado não representa lucro contábil.

`GET /reports?from=&to=` → `{from,to,timezone,sales:{count,total_cents,discount_cents},services:[{name,quantity,total_cents}],products:[{name,quantity,total_cents}],professionals:[{id,name,completed,cancelled,no_show,service_value_cents}],appointments:[{status,count}],lowStock:Product[],financial:SummaryTotals}`. Serviços/produtos vêm de comandas não canceladas por data da venda; produção de profissionais usa atendimentos no período e valores de serviços concluídos, sem afirmar recebimentos nem comissões.

`GET /reports/export?kind=ledger|sales|stock&from=&to=` → CSV UTF-8 com BOM, campos escapados e proteção contra fórmulas; máximo10000linhas, sem dados bancários/cartões. Ledger pode conter nome do tutor somente em consulta via FK no momento da exportação. Cancelamento, motivo e autor ficam no histórico operacional.

`LedgerEntry = {id,sale_id,expense_id,kind:'sale_payment'|'sale_refund'|'expense_payment'|'expense_refund',amount_cents,payment_method,cash_session_id,created_at,created_by_name}`. Valores positivos; `kind` determina sinal. Lançamentos são anexados, nunca editados ou apagados pela API.

## Privacidade e consistência

Tabelas prefixadas `business_`; referências ao tutor são por FK e nenhum nome/e-mail/telefone é copiado para vendas. Campos livres `business_sales.notes`, `business_expenses.notes/title` e `business_stock_movements.note` podem conter dados pessoais digitados: orientar uso mínimo. A anonimização de tutor deve limpar `business_sales.notes` para suas vendas; descrições de itens referem-se exclusivamente aos serviços/produtos. Valores e documentos operacionais têm retenção conforme política do controlador; exportação não revela registros de outra empresa.

Todos os comandos com `idempotency_key` guardam impressão do payload e somente os identificadores do resultado, sem nomes ou textos pessoais; repetir a operação consulta o estado atual do mesmo recurso. Reutilizar chave com conteúdo diferente retorna409. Concorrência de estoque, pagamento, cancelamento e caixa é serializada por transação/locks; pagamentos/estornos em dinheiro tomam lock no caixa antes de efetivar o movimento. Exportações ficam registradas na auditoria.
