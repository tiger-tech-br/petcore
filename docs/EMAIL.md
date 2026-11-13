# E-mail do PetCore: estado e diagnóstico

## Estado conferido em 13/11/2026

- Remetente configurado: `lembretes@tigertech.dev.br`; contato público de suporte/privacidade: `tigertechbr@outlook.com`.
- Na consulta autenticada ao Resend em 12/11, DKIM e os registros SPF TXT/MX de `send.tigertech.dev.br` estavam **Verified**. O estado anterior **Pending**, descrito no histórico abaixo, foi superado por essa observação. Não foi necessário alterar DNS nesta conferência.
- O domínio tinha configuração opcional Resend Forge com CNAME pendente. O painel informou que o envio anterior continua até essa validação; a pendência opcional não foi identificada como causa de falha de entrega.
- O teste de avisos de assinatura de 12/11 foi aceito às 21h00 de Brasília. O Resend registrou adiamentos desde 21h10, com resposta do Outlook/Office `451 4.7.0 Temporary server error` e tipo **Recipient Server Error**. Em 13/11, o painel passou a mostrar **Delivered**, com horário exibido de 10h30, e resposta SMTP de sucesso. Isso comprova o aceite pelo servidor destinatário, não a pasta escolhida nem leitura.
- A pedido do usuário, foi enviado um único novo teste em 13/11, com assunto **PetCore — novo teste de e-mail — 13/11**. O Resend aceitou a requisição e o usuário confirmou o recebimento por volta de 18h35 de Brasília. Não foi informada a pasta; não registrar esse teste como Caixa de Entrada ou Spam.
- O erro anterior é compatível com indisponibilidade temporária do destino. Não foi comprovado isoladamente que a pane global da Microsoft tenha sido a causa. O recebimento de hoje confirma aquele envio, sem garantir entrega futura a todos os usuários.
- O teste inicial mais antigo foi confirmado na pasta Spam. A causa dessa classificação continua indeterminada sem os cabeçalhos de autenticação/classificação da mensagem.
- As variáveis de recuperação foram introduzidas na revisão histórica `434a341f`; a configuração foi exercitada pelo endereço público com conta inexistente, sem enviar e-mail. O serviço de lembretes está ativado a cada cinco minutos, limitado a 20 por execução e 10s por envio. A primeira execução confirmada não encontrou lembretes autorizados devidos e não enviou mensagens. O usuário autorizou somente tutores com opt-in registrado.

As variáveis de recuperação introduzidas na revisão histórica acima foram preservadas na publicação de suporte `5f46abfd2b400f69e27ef0c7a9f88a8ba483cf11`, implantação `7a3cd43d-cdbb-4744-974d-51a3693d2ec2`, SUCCESS em 12/11 às 20h59 de Brasília. Os avisos de suporte estão habilitados no serviço principal; ver [SUPPORT-EMAILS.md](SUPPORT-EMAILS.md). Os testes reais autorizados não envolveram clientes, cobrança ou troca de assinatura. A recuperação de senha pelo aplicativo publicado continua exigindo sua própria conferência de ponta a ponta; um teste de entrega não a substitui.

## Histórico das consultas DNS anteriores à verificação de 12/11

Consulta anterior pelo resolvedor do Windows; requisições diretas UDP aos resolvedores públicos 1.1.1.1/8.8.8.8 deram timeout. A tabela preserva a resposta daquela ocasião, não o estado DNS atual. Uma consulta autoritativa anterior também não encontrou o TXT de `send`. Em 12/11, a observação autenticada no Resend confirmou SPF TXT/MX e DKIM como Verified; novas consultas DNS públicas falharam, sem resultado atual confiável. A verificação do provedor não substitui os cabeçalhos do e-mail recebido.

| Nome | Tipo | Resposta observada |
|---|---|---|
| `tigertech.dev.br` | TXT | Sem TXT; resposta SOA de `e.sec.dns.br` |
| `send.tigertech.dev.br` | TXT | Sem TXT; resposta SOA de `e.sec.dns.br` |
| `send.tigertech.dev.br` | MX | `feedback-smtp.sa-east-1.amazonses.com`, prioridade 10 |
| `resend._domainkey.tigertech.dev.br` | TXT | Chave pública DKIM presente |
| `_dmarc.tigertech.dev.br` | TXT | `v=DMARC1; p=none;` |
| `tigertech.dev.br` | NS | `e.sec.dns.br` e `f.sec.dns.br` |

O Resend usa `send` como Return-Path padrão, mas permite um prefixo personalizado. Portanto, ausência de SPF na raiz não comprova falha do envio; é necessário conferir o Return-Path real. [Configuração oficial do Return-Path](https://resend.com/docs/dashboard/domains/custom-return-path).

Na configuração clássica confirmada no painel em 12/11, o TXT `send` aparece como `v=spf1 include:amazonses.com ~all` e o MX como `feedback-smtp.sa-east-1.amazonses.com`, prioridade 10, ambos Verified. Não foi criado ou alterado nenhum registro nesta conferência. [Exemplo oficial do Resend](https://resend.com/changelog/new-domain-webhooks).

Copie sempre o registro exato da aba Records do domínio. Domínios mais novos podem usar CNAMEs em vez do par TXT/MX; não acrescente TXT ou MX ao mesmo nome de um CNAME. Não substitua políticas de outros serviços por um exemplo genérico. [Registros e verificação de domínios](https://resend.com/docs/dashboard/domains/manage-domains).

## Autenticação e classificação são verificações diferentes

Ter registros DNS não prova que a mensagem recebida passou nas verificações. Nos cabeçalhos do e-mail já recebido, conferir `Authentication-Results`, os domínios de SPF/Return-Path e DKIM (`d=`/`s=`) e o resultado DMARC. DMARC considera alinhamento com o domínio visível em From; reputação e outros sinais também participam da filtragem da Microsoft. Sem esses cabeçalhos, não foi determinada a causa do Spam. [Microsoft: autenticação de e-mail](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about).

`p=none` é uma política válida de monitoramento. Não a altere diretamente para `reject` apenas para tentar sair do Spam: primeiro confirme todas as fontes legítimas e os resultados de autenticação. Relatórios agregados podem ajudar quando houver um destino de relatórios definido. [Resend: implementação gradual de DMARC](https://resend.com/docs/dashboard/domains/dmarc).

No Outlook, conferir também SCL/BCL/CAT nos cabeçalhos. As orientações oficiais incluem conteúdo simples, nome de remetente reconhecível, revisão de links/tracking e acompanhamento da reputação e da reação dos destinatários. Não produza volume artificial de testes; autorizações, recusas e falhas devem ser respeitadas. Adicionar o remetente aos contatos ou mover uma mensagem legítima do Spam ajuda aquele relacionamento, sem garantir a entrega de todos os clientes. [Resend: entrega no Outlook](https://resend.com/guides/email/deliverability/avoid-outlook-spam-folder).

Não compartilhe links de recuperação, tokens ou o corpo completo de uma mensagem com credenciais ao investigar. Para diagnóstico, bastam os campos de autenticação/classificação necessários, com dados particulares removidos.

## Operação e controles

- Recuperação: `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, `EMAIL_FROM`. A revisão publicada possui prazo máximo de envio, respostas sem detalhes internos e testes com provedor simulado. A configuração foi exercitada no endereço público sem mensagem real; o fluxo de e-mail de ponta a ponta continua dependente da entrega do provedor.
- Lembretes: processo separado com `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `REMINDER_EMAILS_ENABLED=true` e `REMINDER_EMAILS_CONFIRM_SEND=YES`. Cron ou variáveis preparados não provam ativação/execução.
- A chave atual permite envio e respondeu `restricted_api_key` à consulta de domínios; esse resultado não demonstra chave inválida para enviar nem domínio não verificado. Confira os registros/status no painel autorizado, sem ampliar permissões só para esta consulta.
- Preserve opt-in, revogação, elegibilidade, idempotência e tratamento de tentativas incertas. Não ative destinatários fictícios, não use contatos do CRM como autorização e não envie novos testes sem autorização.
- Acompanhe rejeições, reclamações, falhas e limites do provedor. Senhas e chaves ficam somente no ambiente privado; nunca nos documentos, na interface ou no repositório.

Esta atualização apenas registra as evidências de recebimento e a consulta autorizada. Não amplia permissões da chave, não compra Forge, não altera DNS e não autoriza testes extras.
