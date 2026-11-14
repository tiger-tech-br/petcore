-- Refresh only the exact unpublished default drafts observed before launch.
-- Custom text, published versions, acceptances, prices and checkout flags are preserved.
WITH changed AS (
 UPDATE commercial_settings SET
 privacy_text=CASE WHEN md5(privacy_text)='1db1df4f0a4b898b23523a0cf680dcdb' THEN 'POLÍTICA DE PRIVACIDADE DO PETCORE — RASCUNHO PARA REVISÃO

1. Responsável e contato

O PetCore é oferecido por José Andrey Pereira Lisboa, pessoa física, sob a marca Tiger Tech — Sites, Sistemas e Soluções Digitais. Endereço: Rua Brasílio Machado, 404, Santo André, São Paulo, CEP 09060-700. Suporte: tigertechbr@outlook.com. Privacidade: tigertechbr@outlook.com.

A Tiger Tech decide as finalidades dos dados necessários às contas, contratos, assinaturas, segurança e suporte próprios. Cada pet shop decide as finalidades dos registros de seus tutores, equipe e atendimentos; nessas operações, o PetCore realiza o tratamento conforme instruções legítimas do estabelecimento e o acordo de tratamento de dados. O pet shop precisa informar sua identidade e seu canal aos titulares.

2. Dados e finalidades

- Uso: Dados necessários
- Acesso e equipe: Nome, e-mail, vínculos, permissões, hash de senha e sessão
- Gestão do pet shop: Contatos dos tutores; informações e fotos dos pets; profissionais, serviços, horários, atendimentos, observações e registros de relacionamento
- Táxi Dog opcional: Endereço, complemento, orientações, motorista e etapas manuais de busca/entrega. A versão atual não coleta GPS ou localização contínua
- Financeiro e assinatura: Vendas, despesas e recebimentos registrados pela equipe; contratante, plano, referências de pagamento e períodos confirmados
- Atendimento: Solicitações, autoria, verificação proporcional de identidade e providências
- Segurança: Identificadores técnicos, tentativas de acesso e operações relevantes

Os dados vêm dos usuários autorizados, dos atendimentos e da utilização técnica do serviço. Evite inserir documentos pessoais, informações de saúde de pessoas ou de crianças, senhas e cartão completo em campos livres. Uma foto ou informação do pet pode identificar seu tutor.

As finalidades são prestar e administrar o serviço, autenticar acessos, conferir assinaturas, responder pedidos e proteger a operação. Os fundamentos são avaliados por finalidade, incluindo execução contratual, obrigações e exercício de direitos. O pet shop faz a avaliação correspondente sobre os dados que controla. Aceitar os termos não constitui autorização geral para outros usos.

3. E-mails

Lembretes de agendamento exigem a autorização específica registrada no cadastro do tutor, que pode ser revogada. Contatos manuais do CRM não autorizam lembretes ou campanhas.

O serviço também envia recuperação de acesso e avisos transacionais de suporte. O provedor recebe o destinatário e o conteúdo necessário: lembretes incluem tutor, pet, estabelecimento e horário; avisos de suporte usam empresa, protocolo e link autenticado, sem copiar o texto livre do chamado. Recuperações contêm link temporário, que não deve ser compartilhado. Um aviso de suporte não aprova pagamento, troca de plano ou cancelamento.

4. Pagamentos

O Free oferece 30 dias a partir da confirmação, sem cartão e sem cobrança automática ao terminar. Os planos pagos são R$ 35,00 mensais e R$ 350,00 por 12 meses. O cartão é informado no checkout externo do PagBank; o PetCore não coleta o número completo nem o código de segurança.

A conta atual usa links recorrentes PagBank de pessoa física e conferência manual em até um dia útil, de segunda a sexta-feira. Cancelar renovação, encerrar uso, pedir reembolso e solicitar eliminação de dados são providências diferentes, detalhadas nos Termos. Registrar cartão ou Pix no Financeiro do pet shop não dá acesso à conta bancária do estabelecimento.

5. Compartilhamento e exterior

O acesso é limitado à equipe autorizada de cada pet shop e às atividades necessárias de prestação, segurança e suporte. Os registros dos estabelecimentos não são vendidos nem usados para campanhas próprias incompatíveis com a contratação.

- Fornecedor: Finalidade e localização conhecida
- Neon: Banco PostgreSQL configurado em São Paulo, Brasil, AWS sa-east-1. Contas, suporte e subprocessadores podem envolver outros fluxos
- Railway: Aplicação em us-east4-eqdc4a e armazenamento privado separado de fotos e backups em IAD, Estados Unidos
- Resend: Recuperação, lembretes autorizados e suporte. O domínio envia por São Paulo; o fornecedor informa armazenamento nos Estados Unidos
- PagBank: Checkout, recorrência e dados necessários à conciliação; cartão tratado diretamente no provedor
- Microsoft Outlook: Caixa tigertechbr@outlook.com. Não há região exclusiva dessa caixa comprovada nesta preparação

O processamento no exterior atende à hospedagem, armazenamento e comunicações enquanto necessários, com os ciclos de conservação abaixo. Servidor em determinada região não limita automaticamente suporte, metadados ou transferências posteriores dos fornecedores.

Antes da publicação, o responsável deve registrar o mecanismo aplicável a cada transferência e seus instrumentos ou fundamentos. Este texto não afirma cláusulas ANPD assinadas, equivalência automática de cláusulas europeias ou autorização genérica pelo aceite. O inventário e os caminhos de regularização estão em OPERACAO-COMERCIAL.md. [MECANISMO_TRANSFERENCIAS_VALIDADO]

6. Conservação e encerramento

Os dados operacionais permanecem durante a prestação. Após o encerramento formal, a janela para exportação assistida é de 30 dias corridos. Ao final, executa-se a destinação dos dados ativos e das fotos, conforme instruções legítimas do controlador, eliminando ou desidentificando o que não precisa ser conservado. Exceções precisam de finalidade, fundamento, prazo de revisão e acesso restrito documentados.

A política operacional aprovada para backups é de 30 dias, com exclusão controlada das cópias vencidas. Esse prazo não substitui obrigações legais ou conservação específica justificada. Excluir no ambiente ativo não apaga instantaneamente versões e cópias dos fornecedores. Antes de reabrir um ambiente restaurado, são reaplicados os pedidos já atendidos e as autorizações revogadas.

Sessões vencem e são limpas pela manutenção. Links de recuperação expiram em 30 minutos; tokens usados ou vencidos são removidos. O worker limpa destinatário e conteúdo de avisos de suporte finalizados após 30 dias; histórico e metadados seguem avaliação separada. Registros financeiros, contratuais, de direitos e de incidentes não são apagados indiscriminadamente por um prazo único.

7. Direitos e atendimento

Sobre cadastros e atendimentos, procure o pet shop responsável. Sobre conta, assinatura e dados administrados pela Tiger Tech, use tigertechbr@outlook.com. Se não souber a quem dirigir o pedido, o mesmo canal auxilia no encaminhamento. O exercício de direitos não é cobrado e pode exigir confirmação proporcional de identidade.

Podem ser solicitados acesso, informações, correção e demais providências cabíveis, inclusive revogação, bloqueio, eliminação ou desidentificação. A confirmação ou acesso simplificados são providenciados imediatamente quando possível; a declaração completa observa o prazo legal de até 15 dias. Outros pedidos recebem análise conforme a regra aplicável. A janela comercial de exportação não reduz esses direitos. O titular também pode procurar a ANPD e os órgãos competentes.

8. Segurança, incidentes e cookies

O serviço utiliza autenticação, permissões por empresa, HTTPS, proteção de credenciais e arquivos privados. Os backups do banco são cifrados antes do envio. Isso reduz riscos e não representa segurança absoluta ou certificação pela ANPD.

Se um incidente afetar dados de um estabelecimento, a Tiger Tech aciona o contato do controlador e coopera na avaliação, contenção e recuperação. O controlador avalia as comunicações legais; para suas próprias finalidades, o responsável do PetCore conduz essa avaliação. Relatos podem ser enviados ao canal de privacidade, sem senhas ou chaves.

O cookie de sessão é necessário ao acesso. Ele não constitui autorização para publicidade. Novos rastreadores opcionais exigem avaliação própria antes da ativação. A versão e a vigência ficam no sistema, com informação adequada sobre alterações relevantes. A venda do projeto ou mudança de administrador exige transição segura e preservação de direitos.

As condições comerciais foram aprovadas pelo responsável em 13/11/2026. A publicação depende da conferência das rotinas, do mecanismo aplicável às transferências e da aprovação do texto completo. [APROVACAO_JURIDICA_E_OPERACIONAL]' ELSE privacy_text END,
 terms_text=CASE WHEN md5(terms_text)='b7b703a86065a8e30ce63d78eae43dda' THEN 'TERMOS DE USO DO PETCORE — RASCUNHO PARA REVISÃO

1. Prestador

O PetCore é prestado por José Andrey Pereira Lisboa, pessoa física, sob a marca Tiger Tech — Sites, Sistemas e Soluções Digitais, na Rua Brasílio Machado, 404, Santo André, São Paulo, CEP 09060-700. Atendimento: tigertechbr@outlook.com.

Quem contrata ou administra uma conta deve ter poderes para representar o pet shop. A oferta precisa apresentar a identificação exigível do fornecedor e as condições completas antes da contratação. Estes termos preservam direitos legais obrigatórios.

2. Serviço

O sistema reúne clientes e pets, agenda, lista de espera, profissionais e jornadas, serviços, equipe e permissões, CRM, estoque, vendas e recebimentos registrados, despesas, caixa, relatórios, suporte e controles de privacidade.

O Táxi Dog é opcional: registra endereço, motorista e etapas manuais de busca/entrega ligadas ao atendimento, com taxa na comanda. Não oferece GPS ou localização contínua. O estabelecimento responde pela execução do transporte e dos serviços aos seus clientes.

O Financeiro reflete os registros da equipe; não consulta bancos nem comprova sozinho o pagamento no provedor. O serviço não inclui loja virtual, entrega de produtos ao público ou emissão fiscal e não substitui obrigações contábeis e jurídicas. O APK acessa o mesmo serviço pela internet; não mantém operação independente offline.

Cada pessoa deve usar conta individual. O administrador concede e revoga permissões. São proibidos acessos a outras empresas, tentativas de contornar a segurança e utilização ilícita. Não envie senhas, cartão completo ou dados pessoais excessivos pelos campos livres e chamados.

3. Planos e pagamento

- Plano: Valor e período
- Free: Teste de 30 dias corridos iniciado na confirmação; sem cartão ou cobrança automática ao terminar
- Mensal: R$ 35,00 por um mês, com recorrência mensal autorizada no PagBank
- Anual: R$ 350,00 por 12 meses, cobrados em cada contratação anual, com recorrência autorizada no PagBank

O Free vem selecionado no primeiro acesso. É possível contratar um plano pago imediatamente ou durante o teste. Selecionar um plano não cobra sozinho o cartão: o administrador segue ao checkout do PagBank, confere e autoriza.

A conta atual utiliza links recorrentes de pessoa física. A Tiger Tech confere o recebimento e registra referência e período em até um dia útil, de segunda a sexta-feira, contado do pedido ou da identificação do pagamento. Feriados não contam como dias úteis. O retorno do checkout e o comprovante não substituem essa conferência; impedimentos serão informados, preservadas as obrigações legais.

O período confirmado aparece em Plano e assinatura. Renovações conferidas acrescentam o período ao fim do acesso já pago; sem período válido, o início ocorre na conferência. O Free não recebe tolerância extra. A tolerância operacional configurada para regularizar o vencimento de um período pago é de 3 dia(s), conforme exibido em Plano e assinatura. Ela não prolonga o teste Free nem autoriza cobranças. Depois, cadastros e alterações são limitados, preservados os meios de consulta, assinatura, suporte e direitos enquanto a conta estiver ativa.

4. Cancelar renovação e trocar de plano

O botão vermelho Cancelar assinatura abre um pedido de suporte, confirmado pelo cliente. O pedido também pode ser enviado a tigertechbr@outlook.com, com pet shop, e-mail da conta e referência da assinatura, se disponível. Não envie senha nem cartão completo.

A Tiger Tech confere e executa o cancelamento no painel PagBank em até um dia útil, de segunda a sexta-feira, confirmando a providência ao solicitante. Cobrança próxima exige prioridade; eventual cobrança indevida posterior será apurada e corrigida. O pedido no PetCore não executa uma ordem automática no provedor.

Cancelar somente a renovação preserva o período pago. Trocar de plano exige conferir e encerrar a recorrência anterior antes de outra contratação. O novo plano é ativado após o novo recebimento confirmado. Fechar a janela de checkout não prova que a recorrência deixou de existir; tentativas pendentes exigem conferência.

Deixar de usar o serviço, desinstalar o APK ou suspender um acesso não cancela automaticamente a cobrança. Avisos por e-mail informam o atendimento, mas não substituem a confirmação registrada no chamado.

5. Encerramento e reembolso

Para encerrar o uso antes do fim do período pago, o cliente pode solicitar reembolso voluntário proporcional ao período não utilizado, sem multa de cancelamento. Isso é diferente de cancelar apenas futuras renovações. A Tiger Tech informa a data de encerramento, o cálculo, o valor e a referência da providência no PagBank.

O cálculo usa o valor realmente pago e a proporção de tempo restante entre o encerramento solicitado e o fim do período correspondente, com resultado em reais e centavos. No Anual, usa-se o período anual pago, sem recalcular retroativamente pelo preço Mensal. Valores já restituídos não são reembolsados outra vez.

A análise e as providências devidas são iniciadas em até um dia útil, de segunda a sexta-feira. O crédito na fatura depende do provedor e da administradora; o prazo obtido na confirmação será informado. Registro interno no PetCore não executa estorno.

Quando aplicável relação de consumo, o arrependimento e outros direitos obrigatórios prevalecem sobre a regra proporcional. Nas hipóteses do art. 49 do CDC, o prazo legal de sete dias e a restituição cabível não são reduzidos pelo Free ou pelo uso parcial. O mesmo canal recebe o pedido, confirma o recebimento e aciona imediatamente o meio de pagamento quando exigido, sem aguardar o prazo comercial.

6. Privacidade e entrega dos dados

O pet shop decide as finalidades dos dados operacionais; a Tiger Tech realiza o tratamento conforme instruções legítimas, acordo de tratamento e Política de Privacidade. Para conta, assinatura, segurança e suporte próprios, o responsável do PetCore conduz as finalidades correspondentes. A contratação não transfere liberdade irrestrita sobre dados pessoais.

O pet shop informa seus titulares e registra autorizações quando cabíveis. Lembretes não autorizam campanhas. Os fornecedores e os países de processamento estão identificados na Política de Privacidade.

Após o encerramento formal, há 30 dias corridos para exportação assistida dos dados da empresa. O pedido parte de administrador verificado e a entrega usa canal privado, registros estruturados JSON/CSV e fotos incluídas no escopo confirmado, sem dados de outras empresas. Lotes e eventuais limitações são identificados no chamado. Um relatório ou exportação de um titular não equivale automaticamente à entrega completa.

Ao fim dessa janela, executa-se a eliminação ou desidentificação dos dados ativos sem hipótese de conservação. Backups têm ciclo operacional de 30 dias, com exclusão controlada; obrigações legais e conservação específica justificada ficam separadas, restritas e documentadas. A janela não reduz direitos dos titulares e não autoriza restaurar consentimentos revogados.

7. Suporte e continuidade

O atendimento ocorre pelo painel e por tigertechbr@outlook.com. Demandas comerciais são conferidas de segunda a sexta-feira, em até um dia útil; isso não é garantia de resolução de qualquer falha técnica nesse período. Identifique situações urgentes e suspeitas de incidente no assunto para avaliação de gravidade.

O serviço mantém controles de acesso, arquivos privados, HTTPS, atualizações e rotinas de continuidade. Falhas ou manutenções relevantes são informadas quando cabível; não há garantia de disponibilidade absoluta. O contratante confere seus registros e guarda suas exportações necessárias, sem afastar as obrigações do prestador.

8. Marca, transferência e condições finais

A assinatura concede uso do serviço, sem transferir código ou marca, salvo contrato específico. A venda do projeto ou mudança do administrador exige transição segura, preservação dos contratos e informação quando cabível; não permite uso indiscriminado dos dados.

São preservadas as responsabilidades legais e os direitos de terceiros. Não há escolha de foro que afaste aquele assegurado por lei. A versão apresentada, o usuário e a data de aceite ficam registrados.

As condições comerciais foram aprovadas pelo responsável em 13/11/2026. A publicação depende da conferência das rotinas, do mecanismo aplicável às transferências e da aprovação do texto completo. [APROVACAO_JURIDICA_E_OPERACIONAL]' ELSE terms_text END,
 updated_at=now(),updated_by=NULL
 WHERE singleton=true AND published=false
 AND legal_name='José Andrey Pereira Lisboa' AND brand='Tiger Tech'
 AND support_email='tigertechbr@outlook.com' AND privacy_email='tigertechbr@outlook.com'
 AND trial_days=30 AND grace_days=3
 AND EXISTS(SELECT 1 FROM subscription_plans WHERE id='monthly' AND amount_cents=3500 AND interval_months=1)
 AND EXISTS(SELECT 1 FROM subscription_plans WHERE id='yearly' AND amount_cents=35000 AND interval_months=12)
 AND (md5(privacy_text)='1db1df4f0a4b898b23523a0cf680dcdb' OR md5(terms_text)='b7b703a86065a8e30ce63d78eae43dda')
 RETURNING singleton
)
INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,metadata)
SELECT NULL,NULL,'platform.launch_drafts_prepared','platform','{"commercial_conditions_confirmed":true,"published":false,"review_date":"2026-11-13"}'::jsonb FROM changed;
