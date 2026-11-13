# Avisos de suporte e pedidos de assinatura

O e-mail serve para avisar que existe uma solicitação no PetCore. **Receber ou abrir esse e-mail não aprova uma troca de plano, não cancela cobranças e não confirma um pagamento.** O chamado e as decisões ficam registrados no painel.

Este recurso é do próprio PetCore. Ele não muda os preços, o período Free, a validade já paga ou as regras de cobrança do PagBank.

## Onde atender o cliente

Entre com a **conta da plataforma da Tiger Tech**, usada para administrar os pet shops. O caminho é **Gestão da plataforma → Suporte**. O sino da plataforma oferece acesso aos pedidos pendentes. O contador corresponde aos chamados abertos ou em atendimento; ler um chamado não significa resolvê-lo.

Abra a solicitação para consultar o histórico e responder pelo painel. No atendimento, **Abrir assinatura do pet shop** leva à assinatura da empresa vinculada ao chamado. Confira a empresa e o pedido antes de registrar uma decisão.

O link do e-mail abre o PetCore e exige uma sessão autorizada. Os identificadores do chamado e da empresa não concedem acesso por conta própria. O cliente só consulta os chamados permitidos para sua conta; a plataforma atende as empresas vinculadas ao sistema.

## Troca de plano com a conta CPF atual

O fluxo atual usa links recorrentes do PagBank com conferência manual. O procedimento é:

1. O cliente registra o pedido de troca ou cancelamento no PetCore. O suporte recebe o aviso; o cliente recebe a confirmação de registro.
2. A Tiger Tech confere a assinatura e o pedido no painel. Se houver uma recorrência anterior, confere e cancela as próximas cobranças no **PagBank**.
3. Depois dessa conferência, registra no PetCore a confirmação do cancelamento no PagBank, com senha, referência e motivo solicitados. O período já pago permanece preservado.
4. O cliente pode abrir o checkout do novo plano quando o PetCore permitir. A seleção do plano e o retorno do navegador não liberam acesso pago.
5. A Tiger Tech confere o novo recebimento no PagBank e registra a conciliação no PetCore. A validade muda por essa confirmação, não pelo e-mail ou pela simples escolha do plano.

Uma tentativa de checkout abandonada também precisa ser conferida. Use o procedimento administrativo de **Conferir tentativa de assinatura / Liberar nova tentativa**, com reautenticação, referência e confirmação de ausência de recorrência ativa. Fechar a janela, aguardar alguns dias ou receber um e-mail não elimina essa pendência. Não limpe a trava por SQL nem reutilize a confirmação de outro ciclo.

Se não for possível confirmar a situação no PagBank, mantenha o bloqueio e explique a pendência no chamado. Consulte também [OPERACAO.md](OPERACAO.md).

## Quem recebe cada aviso

| Evento | Destinatário |
| --- | --- |
| Nova solicitação, inclusive troca/cancelamento | E-mail de suporte da plataforma e confirmação à conta que fez o pedido |
| Nova mensagem do cliente em um chamado | E-mail de suporte da plataforma |
| Resposta da Tiger Tech no chamado | Conta que criou o chamado, desde que continue com vínculo ativo com a empresa |

O endereço do suporte vem da configuração comercial da plataforma, atualmente destinado a **tigertechbr@outlook.com**. Os endereços dos usuários vêm das contas registradas no servidor. O navegador não escolhe destinatários arbitrários.

Esses avisos não são enviados aos tutores cadastrados na carteira do pet shop nem a toda a equipe. Não são campanhas de marketing ou lembretes de atendimento. As regras e autorizações dos lembretes continuam separadas.

Os e-mails são curtos: identificação da empresa, protocolo, orientação e link autenticado. O conteúdo livre da conversa não é copiado para o e-mail. Responda no painel para manter o histórico completo; responder à mensagem na caixa postal não registra automaticamente uma resposta no chamado.

Só mensagens novas, criadas pelos fluxos integrados após a atualização, geram avisos. **Não há envio retroativo de todos os chamados anteriores.** Repetir a mesma solicitação já registrada não deve duplicar seus avisos.

## Configuração de envio

No serviço da API, o envio exige as duas variáveis abaixo ao mesmo tempo:

```dotenv
SUPPORT_EMAILS_ENABLED=true
SUPPORT_EMAILS_CONFIRM_SEND=YES
```

Também utiliza a configuração de e-mail existente:

```dotenv
EMAIL_PROVIDER=resend
EMAIL_API_KEY=<segredo configurado no ambiente>
EMAIL_FROM=<remetente autorizado no domínio verificado>
APP_ORIGIN=https://<endereço público do PetCore>
```

Os valores entre sinais de menor/maior são explicações, não valores para copiar. Chaves reais ficam nas variáveis privadas do ambiente, nunca nos chamados, em capturas de tela, no repositório ou no chat. O remetente precisa ser aceito pelo provedor. `APP_ORIGIN` deve ser uma origem HTTPS, sem senha, caminho ou parâmetros.

Se uma das autorizações de envio estiver desativada, o worker não transmite e-mails. Os chamados e os avisos enfileirados continuam registrados. Antes de reativar o envio depois de uma pausa, confira a fila: mensagens novas que ficaram pendentes podem ser processadas; isso não é um backfill dos chamados antigos que nunca tiveram avisos enfileirados.

Em produção, destinatários fictícios de exemplo ou teste são bloqueados. Uma conta com endereço alterado ou sem o vínculo necessário não recebe automaticamente uma notificação destinada ao endereço anterior.

## Processamento e entrega

O worker da API verifica a fila a cada **30 segundos**, além da execução inicial ao iniciar o serviço. Cada envio tem prazo de **10 segundos**. O banco reserva as tarefas para impedir que processos concorrentes enviem a mesma notificação ao mesmo tempo.

O envio usa uma chave estável de idempotência por aviso e congela o conteúdo antes da primeira tentativa. Falhas temporárias podem ser repetidas com o mesmo conteúdo, com espera crescente, até **cinco tentativas** e dentro de **23 horas** da primeira tentativa. A margem evita ultrapassar a janela de 24 horas informada pelo Resend. Não altere o corpo de um aviso já tentado para reutilizar sua chave.

Uma falha do e-mail não deve apagar o chamado, criar outro checkout, confirmar pagamento ou alterar a validade da assinatura. O cliente e a Tiger Tech continuam podendo acompanhar o atendimento no painel.

**Aceito pelo provedor não significa entregue na caixa de entrada.** A mensagem ainda pode ir para spam ou sofrer outra falha de entrega. Validação do domínio, autenticação do remetente, reputação e situação no provedor precisam ser conferidas. Não considere uma pendência anterior de SPF encerrada sem uma verificação atual.

## Como interpretar os estados

| Estado | Significado operacional |
| --- | --- |
| `queued` | Aguarda processamento ou uma nova tentativa permitida |
| `sending` | Está reservado por um worker para envio |
| `sent` | O provedor retornou um identificador de aceite; não comprova leitura ou caixa de entrada |
| `failed` | Há uma configuração inválida ou recusa que exige atenção |
| `uncertain` | Não foi possível confirmar o resultado com segurança; não deve receber reenvio cego |
| `cancelled` | O envio deixou de ser permitido, por exemplo por mudança de destinatário, endereço inválido ou remoção dos dados após retenção |

Configurações ausentes detectadas antes da primeira tentativa ficam como `failed`, com zero tentativas, e são reavaliadas após cinco minutos. Recusas do provedor e outros erros têm códigos próprios. Consulte `error_code` e o painel do provedor; não publique o corpo do e-mail ou credenciais nos logs.

Para um resultado incerto, confira o provedor usando o identificador retornado, quando existir, e a chave `petcore-support/<id do aviso>`. Não coloque a tarefa em `queued`, não troque sua chave e não mande uma cópia manual antes de esclarecer se a mensagem já foi aceita. Se não houver comprovação suficiente, mantenha o estado incerto e atenda pelo painel.

## Consultas de diagnóstico somente para leitura

A estrutura está na migration [017_support_email_notifications.sql](../api/sql/017_support_email_notifications.sql). Não edite migrations já aplicadas. Estas consultas não executam envios nem alteram a fila:

```sql
SELECT state, count(*) AS quantity
FROM support_email_notifications
GROUP BY state
ORDER BY state;

SELECT id, tenant_id, ticket_id, event_kind, recipient_kind,
       state, error_code, attempt_count, first_attempt_at,
       last_attempt_at, next_attempt_at, provider_message_id
FROM support_email_notifications
WHERE state IN ('failed', 'uncertain')
ORDER BY updated_at DESC
LIMIT 50;
```

Compare os totais com os indicadores do painel. Não é necessário consultar `recipient_email` ou `payload_json` para uma primeira triagem. Uma fila crescendo, muitos erros ou registros presos em envio exigem investigação do worker e da configuração.

## Retenção, testes e limites

Quando habilitado, o worker limpa o payload e os dados de destinatário dos registros finalizados após **30 dias**. Os metadados do aviso e o histórico do chamado permanecem; essa limpeza não apaga pedidos ou documentos financeiros. Retenção e atendimento a direitos de titulares precisam ser considerados nos documentos e procedimentos reais da operação.

Os testes usam banco isolado e provedor simulado. Eles devem conferir concorrência, idempotência, rollback, destinatários, falhas, janela de repetição e preservação da assinatura. Os testes de serviço podem ser executados com:

```text
node --import tsx --test api/tests/supportEmail.unit.test.ts
node --import tsx --test api/tests/supportAlerts.integration.test.ts
```

O teste de integração exige `TEST_DATABASE_URL` exclusivo terminado em `_test` e a estrutura preparada. Não use o banco de clientes. Um teste com provedor simulado não comprova entrega em caixa postal; testes reais precisam de destinatário e autorização definidos.

Este recurso não certifica conformidade com a LGPD e não publica os documentos jurídicos. Atualize as informações sobre comunicações transacionais e fornecedores e conclua a revisão da operação antes de afirmar prontidão comercial.

Referência do provedor: [Idempotency Keys — Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Evidência de publicação em 12/11/2026

Versão `5f46abfd2b400f69e27ef0c7a9f88a8ba483cf11`, implantação `7a3cd43d-cdbb-4744-974d-51a3693d2ec2`, SUCCESS às 20h59 de Brasília. Flags ativas somente no serviço principal escolhido. Página/saúde 200, banco OK, endpoints privados anônimos 401 e assets idênticos ao build local por SHA-256. Migration 017 conferida na homologação e no banco original de testes; a 016 separada não foi incluída. Passaram 168 verificações únicas: 23 unitárias API, 127 integrações API e 18 web.

Um único teste real autorizado foi aceito pelo Resend às 21h00, em uma tentativa, para o endereço do operador. O worker usou um banco local isolado, com assunto e texto de teste sem cliente real, e os registros fictícios foram removidos após o aceite. O usuário informou que a mensagem ainda não chegou. Não há confirmação de entrega; a chave disponível é restrita a envio e não permite consultar o evento pela API. A conferência depende do painel do provedor. Não repetir o teste nem afirmar entrega sem nova evidência.

### Diagnóstico do teste no painel

O usuário autenticou a sessão de consulta e o registro exato foi localizado na conta correta. O teste recebeu Sent às 21h00 e Delivery Delayed às 21h10: Recipient Server Error, resposta SMTP `451 4.7.0 Temporary server error` do Outlook/Office. O Resend informou que tentará entregar a mesma mensagem novamente. A entrega ainda não foi confirmada e nenhum outro teste foi enviado. O registro pode ser acompanhado pelo identificador guardado no comprovante privado local.

DKIM e os registros TXT/MX do SPF aparecem Verified. A configuração opcional Forge tem um CNAME pendente; o painel informa que continua usando o envio anterior até completar a validação. Esse estado não foi identificado como a causa do erro temporário do destinatário. Nenhuma configuração DNS, compra ou alteração de credencial foi realizada nesta conferência.
