# E-mail do PetCore: estado e diagnóstico

## O que foi observado

- Remetente configurado: `lembretes@tigertech.dev.br`; contato público de suporte/privacidade: `tigertechbr@outlook.com`.
- Um único teste de entrega foi aceito pela API do Resend. O usuário confirmou o recebimento na pasta Spam. Não foram enviados novos e-mails neste diagnóstico.
- A imagem do painel enviada pelo usuário confirmou `tigertech.dev.br` como **Verified** no Resend. A leitura automatizada dos detalhes foi interrompida porque o navegador não pôde confirmar o endereço da janela; nenhum DNS foi alterado. Ainda faltam os detalhes de SPF/DKIM e os cabeçalhos da mensagem para determinar sua autenticação efetiva.
- Aceitação pelo provedor e recebimento no Spam não comprovam entrega regular na Caixa de Entrada nem a conclusão da recuperação no aplicativo publicado.
- Variáveis de recuperação foram configuradas sem disparar deploy e aguardam a revisão final. O serviço de lembretes foi criado/configurado para cada cinco minutos, mas sua ativação e execução ainda precisam ser confirmadas após concluir código de lote e testes. O usuário autorizou lembretes apenas a tutores com opt-in registrado.

## DNS público consultado

Consulta pelo resolvedor do Windows; requisições diretas UDP aos resolvedores públicos 1.1.1.1/8.8.8.8 deram timeout. A tabela registra a resposta obtida, sem afirmar validação global ou do e-mail recebido.

| Nome | Tipo | Resposta observada |
|---|---|---|
| `tigertech.dev.br` | TXT | Sem TXT; resposta SOA de `e.sec.dns.br` |
| `send.tigertech.dev.br` | TXT | Sem TXT; resposta SOA de `e.sec.dns.br` |
| `send.tigertech.dev.br` | MX | `feedback-smtp.sa-east-1.amazonses.com`, prioridade 10 |
| `resend._domainkey.tigertech.dev.br` | TXT | Chave pública DKIM presente |
| `_dmarc.tigertech.dev.br` | TXT | `v=DMARC1; p=none;` |
| `tigertech.dev.br` | NS | `e.sec.dns.br` e `f.sec.dns.br` |

O Resend usa `send` como Return-Path padrão, mas permite um prefixo personalizado. Portanto, ausência de SPF na raiz não comprova falha do envio; é necessário conferir o Return-Path real. [Configuração oficial do Return-Path](https://resend.com/docs/dashboard/domains/custom-return-path).

Se o painel confirmar a configuração clássica com Return-Path `send.tigertech.dev.br`, falta conferir o TXT SPF correspondente. O exemplo oficial é **TXT `send` → `v=spf1 include:amazonses.com ~all`**. Não foi criado ou alterado nenhum registro. [Exemplo oficial do Resend](https://resend.com/changelog/new-domain-webhooks).

Copie sempre o registro exato da aba Records do domínio. Domínios mais novos podem usar CNAMEs em vez do par TXT/MX; não acrescente TXT ou MX ao mesmo nome de um CNAME. Não substitua políticas de outros serviços por um exemplo genérico. [Registros e verificação de domínios](https://resend.com/docs/dashboard/domains/manage-domains).

## Autenticação e classificação são verificações diferentes

Ter registros DNS não prova que a mensagem recebida passou nas verificações. Nos cabeçalhos do e-mail já recebido, conferir `Authentication-Results`, os domínios de SPF/Return-Path e DKIM (`d=`/`s=`) e o resultado DMARC. DMARC considera alinhamento com o domínio visível em From; reputação e outros sinais também participam da filtragem da Microsoft. Sem esses cabeçalhos, não foi determinada a causa do Spam. [Microsoft: autenticação de e-mail](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about).

`p=none` é uma política válida de monitoramento. Não a altere diretamente para `reject` apenas para tentar sair do Spam: primeiro confirme todas as fontes legítimas e os resultados de autenticação. Relatórios agregados podem ajudar quando houver um destino de relatórios definido. [Resend: implementação gradual de DMARC](https://resend.com/docs/dashboard/domains/dmarc).

No Outlook, conferir também SCL/BCL/CAT nos cabeçalhos. As orientações oficiais incluem conteúdo simples, nome de remetente reconhecível, revisão de links/tracking e acompanhamento da reputação e da reação dos destinatários. Não produza volume artificial de testes; autorizações, recusas e falhas devem ser respeitadas. Adicionar o remetente aos contatos ou mover uma mensagem legítima do Spam ajuda aquele relacionamento, sem garantir a entrega de todos os clientes. [Resend: entrega no Outlook](https://resend.com/guides/email/deliverability/avoid-outlook-spam-folder).

Não compartilhe links de recuperação, tokens ou o corpo completo de uma mensagem com credenciais ao investigar. Para diagnóstico, bastam os campos de autenticação/classificação necessários, com dados particulares removidos.

## Operação e controles

- Recuperação: `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, `EMAIL_FROM`. A revisão em preparação possui prazo máximo de envio, respostas sem detalhes internos e testes com provedor simulado; a publicação final precisa levar esses ajustes ao endereço público.
- Lembretes: processo separado com `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `REMINDER_EMAILS_ENABLED=true` e `REMINDER_EMAILS_CONFIRM_SEND=YES`. Cron ou variáveis preparados não provam ativação/execução.
- A chave atual permite envio e respondeu `restricted_api_key` à consulta de domínios; esse resultado não demonstra chave inválida para enviar nem domínio não verificado. Confira os registros/status no painel autorizado, sem ampliar permissões só para esta consulta.
- Preserve opt-in, revogação, elegibilidade, idempotência e tratamento de tentativas incertas. Não ative destinatários fictícios, não use contatos do CRM como autorização e não envie novos testes sem autorização.
- Acompanhe rejeições, reclamações, falhas e limites do provedor. Senhas e chaves ficam somente no ambiente privado; nunca nos documentos, na interface ou no repositório.
