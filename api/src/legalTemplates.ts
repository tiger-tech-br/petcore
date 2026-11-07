// Rascunhos para o administrador revisar e completar. Nunca são publicados por importação.
export const operatorIdentityDefaults={legal_name:'José Andrey Pereira Lisboa',brand:'Tiger Tech',support_email:'tigertechbr@outlook.com',privacy_email:'tigertechbr@outlook.com',address:'Rua Brasílio Machado, 404, Santo André, São Paulo, CEP 09060-700'} as const;
export type LegalTemplateIdentity={legal_name?:string|null;brand?:string|null;support_email?:string|null;privacy_email?:string|null;address?:string|null;trial_days?:number;grace_days?:number;plans?:{id:string;amount_cents:number;interval_months:number}[]};

const privacyDraft=`POLÍTICA DE PRIVACIDADE DO PETCORE — RASCUNHO PARA REVISÃO

1. Quem responde pelo tratamento
O PetCore é um sistema de gestão para pet shops oferecido por [NOME_LEGAL], [NATUREZA_DO_PRESTADOR], sob a marca [MARCA]. A apresentação institucional da marca é: [APRESENTACAO_MARCA].
O canal de suporte é [EMAIL_SUPORTE] e o canal para solicitações sobre dados pessoais é [EMAIL_PRIVACIDADE]. Endereço para contato e identificação da oferta: [ENDERECO].

[NOME_LEGAL] atua como controlador dos dados necessários à administração das contas de acesso à plataforma, da relação contratual, das assinaturas, da segurança e do suporte do PetCore. Cada pet shop é responsável pelas decisões sobre os dados de seus tutores, clientes, profissionais e atendimentos. Para prestar essas funcionalidades, o responsável pelo PetCore atua como operador, segundo instruções legítimas do pet shop e o instrumento de tratamento de dados. Essas funções decorrem das atividades efetivas e não apenas do nome usado no contrato. O pet shop deve informar aos titulares sua identidade, finalidades e canal de atendimento.

2. Dados tratados e finalidades
Contas de acesso: nome, e-mail, vínculo com empresas, permissões, hash de senha e sessões, para autenticação, administração e segurança.
Operação do pet shop: identificação e contato dos tutores, informações e fotos dos pets, observações necessárias ao serviço, agendamentos, contatos de relacionamento, produtos, vendas, pagamentos registrados e despesas. A finalidade é prestar as funcionalidades contratadas pelo pet shop.
Relacionamento comercial do PetCore: identificação do contratante, plano, vencimentos e referências de pagamento, para administrar o contrato e a cobrança.
Suporte e direitos: informações fornecidas em solicitações, verificações proporcionais de identidade e registros das providências adotadas.
Evite inserir documentos pessoais, informações de saúde de pessoas, dados de crianças, senhas ou números completos de cartão em campos livres. As informações sobre pets não autorizam coletar dados excessivos de pessoas.

3. Fundamentos para tratamento
Cada finalidade deve ter uma hipótese legal apropriada, documentada pelo responsável. A execução do contrato e os procedimentos solicitados pelo titular podem fundamentar dados necessários à prestação do serviço; obrigações legais ou regulatórias podem exigir conservação específica. Segurança e prevenção a fraudes devem ter necessidade e proporcionalidade avaliadas. Consentimento, quando aplicável, deve ser específico, informado e revogável. O aceite dos termos do serviço não constitui uma autorização geral para todos os tratamentos.
Os lembretes por e-mail dependem da autorização específica registrada pelo pet shop. Um registro manual de conversa no CRM não concede essa autorização. O uso para publicidade ou campanhas exige avaliação e informação próprias; o PetCore não transforma uma autorização de lembrete em autorização de marketing.

4. Pagamentos
Os planos preparados para a oferta são: Plano Free por [DIAS_FREE] dias, Plano Mensal por [PRECO_MENSAL] a cada mês e Plano Anual por [PRECO_ANUAL] a cada período de 12 meses. O teste começa na confirmação do Plano Free, sem cadastro de cartão e sem cobrança automática ao terminar. É possível escolher um plano pago no primeiro acesso, com pagamento imediato no checkout, ou contratar durante o teste.
O fluxo preparado para as assinaturas utiliza links externos do PagBank. Quando o checkout estiver habilitado, os dados completos do cartão serão informados diretamente naquele ambiente, sujeito ao aviso de privacidade e às condições do provedor. O PetCore não coleta nem armazena número completo do cartão ou código de segurança. A liberação da assinatura depende da conferência manual do recebimento pelo responsável, com registro da referência e do período de acesso; o retorno do navegador não confirma o pagamento.
Dados do contratante, plano, valor, referência da transação e período confirmado são usados para administrar a assinatura, atender solicitações e documentar a conferência. O contratante pode solicitar cancelamento da renovação, encerramento ou esclarecimentos em [EMAIL_SUPORTE] ou pela área Suporte. O cancelamento da recorrência é realizado no painel do PagBank; não há comando automático entre uma alteração de acesso no PetCore e a cobrança do provedor. Pedidos de eliminação de dados e pedidos relativos à assinatura são analisados segundo suas finalidades e obrigações próprias.
Um lançamento manual de Pix ou cartão no Financeiro do pet shop é uma informação registrada pela equipe e não representa acesso à conta bancária. A função não solicita credenciais bancárias.

5. Compartilhamento e fornecedores
O acesso é limitado às pessoas autorizadas do pet shop e às atividades necessárias à prestação, ao suporte e à segurança. O responsável não recebe autorização para vender registros dos pet shops ou usá-los em finalidade incompatível com o contrato. O ambiente de homologação preparado para o lançamento possui os seguintes fornecedores e usos:
- Neon: banco PostgreSQL configurado na região AWS São Paulo, Brasil (sa-east-1).
- Railway: hospedagem da aplicação nos Estados Unidos (us-east4-eqdc4a) e armazenamento separado de fotos e backups na região IAD, Estados Unidos. As fotos usam armazenamento privado e os backups do banco são cifrados antes do envio.
- PagBank: checkout externo das assinaturas e informações necessárias à conferência dos recebimentos. Os links PetCore Mensal, de [PRECO_MENSAL], e PetCore Anual, de [PRECO_ANUAL], tiveram nome, preço e periodicidade conferidos. A abertura comercial continua condicionada à aprovação dos documentos e das condições da operação.
- Microsoft Outlook: caixa de suporte e privacidade [EMAIL_PRIVACIDADE], que recebe as mensagens enviadas voluntariamente pelos usuários e titulares. Não foi estabelecida nesta preparação uma região exclusiva para o processamento dessa caixa.
- Resend: provedor configurado para e-mails de recuperação de acesso e lembretes. O envio de lembretes foi autorizado somente para tutores com a autorização específica registrada, e a validação operacional está em andamento. A configuração precisa respeitar remetente, destinatários autorizados e os controles de envio. A região de tratamento, os contratos e os subprocessadores devem ser conferidos para a versão final.
Esta lista descreve a configuração conhecida na preparação. As localizações informadas não demonstram que todos os dados, metadados, acessos administrativos ou subfornecedores de cada provedor fiquem nessas regiões. A lista final precisa coincidir com o ambiente utilizado pelos clientes e com os contratos aplicáveis. [REVISAO_FORNECEDORES_E_TRANSFERENCIAS]
Se houver tratamento no exterior, o responsável deve identificar os países ou regiões envolvidos, avaliar a transferência internacional e adotar o mecanismo legal aplicável, inclusive cláusulas contratuais adequadas quando cabíveis. A escolha de uma região de hospedagem, isoladamente, não comprova regularidade de todas as transferências.

6. Conservação e encerramento
Os dados operacionais são mantidos durante a prestação do serviço segundo as instruções do pet shop e os critérios de necessidade. No encerramento, o controlador deve definir e comunicar a entrega, eliminação ou desidentificação dos registros, ressalvadas as hipóteses legítimas de conservação. Documentos financeiros, evidências de exercício de direitos e registros de segurança devem ter finalidade, acesso e duração de conservação documentados na tabela de retenção aplicável.
Os prazos e critérios de retenção por categoria de dado e o ciclo de expiração das cópias de segurança ainda precisam ser definidos, documentados e informados na versão final. [RETENCAO_E_CICLO_DE_BACKUPS]
A remoção no banco ativo não significa remoção instantânea em backups ou em fornecedores externos. Uma restauração deve reaplicar as solicitações de exclusão e revogação antes de reabrir o acesso. Não se deve conservar dados indefinidamente por mera conveniência.

7. Direitos e atendimento
O titular pode solicitar confirmação do tratamento, acesso, correção, informação sobre compartilhamentos, revogação de consentimento e demais direitos aplicáveis, incluindo portabilidade, bloqueio, anonimização ou eliminação nas hipóteses legais. Encaminhe a solicitação ao pet shop responsável pelos seus atendimentos; para dados administrados diretamente pelo responsável do PetCore, use [EMAIL_PRIVACIDADE]. Se não souber a quem se dirigir, o mesmo canal pode auxiliar no encaminhamento ao responsável correto. Não há cobrança pelo exercício dos direitos.
Pode ser necessária uma verificação proporcional de identidade para evitar entregar ou alterar dados de outra pessoa. Não envie documentos ou informações sensíveis sem necessidade e orientação do responsável. O pedido será analisado, com resposta sobre as providências ou as razões de eventual impossibilidade, observando os prazos legais aplicáveis. Os direitos relativos a registros necessários a obrigações legais devem ser analisados conforme o caso. O titular também pode recorrer à ANPD e aos demais órgãos competentes.

8. Segurança e incidentes
O serviço utiliza controles de autenticação, autorização por empresa e transmissão protegida quando publicado por HTTPS. O responsável operacional deve manter backups, gestão de acessos, atualização e resposta a incidentes. Não existe segurança absoluta. Incidentes com risco ou dano relevante devem ser avaliados e comunicados pelo controlador conforme a legislação e regulamentação aplicáveis; a operadora deve colaborar e fornecer informações necessárias.

9. Cookies e alterações
O acesso utiliza cookies necessários à sessão. Ferramentas opcionais de publicidade, rastreamento ou análise devem ser avaliadas separadamente antes de serem adicionadas. A versão e a data de vigência desta política são apresentadas na página. Alterações relevantes devem ser comunicadas de forma adequada aos afetados.

Este texto é um rascunho. A publicação depende da conferência dos dados reais, das operações, dos fornecedores, da retenção e dos instrumentos contratuais pelo responsável e por sua assessoria jurídica. Não representa certificação de conformidade. [APROVACAO_JURIDICA_E_OPERACIONAL]`;

const termsDraft=`TERMOS DE USO DO PETCORE — RASCUNHO PARA REVISÃO

1. Prestador e contratação
O PetCore é prestado por [NOME_LEGAL], [NATUREZA_DO_PRESTADOR], sob a marca [MARCA], com a apresentação institucional [APRESENTACAO_MARCA], no endereço [ENDERECO], com atendimento em [EMAIL_SUPORTE]. Estes termos disciplinam o uso das funcionalidades contratadas pelo pet shop. A pessoa que contrata ou administra a conta deve possuir poderes para representar o estabelecimento. O endereço, a identificação contratual aplicável e os canais de contato devem estar completos antes da oferta comercial.

2. Serviço e limites da oferta
O PetCore oferece ferramentas para a administração interna do pet shop: cadastros de clientes e pets, agenda e lista de espera, serviços e jornadas dos profissionais, equipe e permissões, CRM com contatos e tarefas, produtos e movimentos de estoque, vendas, recebimentos registrados, despesas, caixa e relatórios. O acesso depende das permissões atribuídas à pessoa usuária e da situação da assinatura.
Os relatórios refletem as informações inseridas pelo estabelecimento. A equipe precisa registrar o recebimento de uma venda para que ele apareça nos controles de recebimentos. O Financeiro não consulta contas bancárias nem processa as compras dos clientes do pet shop. O serviço não substitui assessoria contábil, fiscal ou jurídica e não emite documentos fiscais sem integração específica.
Recursos disponíveis, preço, período, condições de renovação e eventuais limitações devem coincidir no painel, na oferta e no checkout antes da contratação. Nenhuma condição destes termos afasta direitos legais obrigatórios.

3. Contas e responsabilidades de acesso
Cada usuário deve usar uma conta individual, manter suas credenciais protegidas e informar ao administrador acessos suspeitos. O administrador do pet shop é responsável por conceder e revogar permissões de sua equipe e pela legitimidade dos registros inseridos. É proibido tentar acessar dados de outra empresa, contornar controles de segurança, introduzir conteúdo malicioso ou utilizar o serviço para atos ilícitos.

4. Preços, cobrança e cancelamento
4.1. Planos e primeiro acesso
Plano Free: teste gratuito por [DIAS_FREE] dias corridos, iniciado quando o administrador confirma essa escolha no primeiro acesso. O Free vem selecionado inicialmente. Não exige cartão, não se renova como outro teste e não gera cobrança automática ao terminar.
Plano Mensal: [PRECO_MENSAL] por período de um mês, com recorrência mensal autorizada no PagBank.
Plano Anual: [PRECO_ANUAL] por período de 12 meses, com recorrência anual autorizada no PagBank. O valor anual é cobrado na contratação de cada período.
O administrador pode escolher Mensal ou Anual imediatamente, sem iniciar o teste, ou contratar durante o período Free. Nessa escolha, o pagamento acontece no checkout do PagBank. Selecionar um plano no PetCore, por si só, não envia uma cobrança ao cartão.

4.2. Pagamento, recorrência e conferência
A operação preparada utiliza conta de pessoa física no PagBank e links externos de pagamento recorrente por cartão de crédito. Os links PetCore Mensal e PetCore Anual tiveram nome, preço e periodicidade conferidos. O pagador informa o cartão e autoriza a recorrência no ambiente do provedor, após conferir as condições apresentadas. As cobranças seguintes seguem a autorização concedida naquele ambiente. A habilitação da oferta permanece condicionada à aprovação dos documentos e das condições operacionais.
O responsável pelo PetCore confere manualmente o recebimento no PagBank e registra a referência da transação e o período de acesso. A liberação não é instantânea por retorno do checkout ou envio de comprovante. O início e o fim do período confirmado aparecem em Plano e assinatura. Quando ainda existe um período pago válido, uma renovação conferida acrescenta o período contratado ao seu término; caso contrário, o período começa na conferência. [PRAZOS_OPERACIONAIS_DE_CONCILIACAO_E_CANCELAMENTO]
Os lançamentos e a validade no PetCore precisam corresponder ao recebimento efetivamente confirmado. Invalidar um lançamento no PetCore não executa estorno no cartão; o prestador deve tratar o reembolso cabível no PagBank e ajustar os registros correspondentes.

4.3. Vencimento e regularização
Ao acabar o teste sem contratação, ou quando não houver período pago ou tolerância vigente, o sistema limita novos cadastros e alterações. Consultas, assinatura, suporte e os meios previstos para solicitações de privacidade continuam disponíveis enquanto o acesso à conta estiver ativo. [REGRA_TOLERANCIA]
A confirmação de um recebimento regulariza o acesso conforme o período registrado. Medidas de segurança ou restrições justificadas devem ser comunicadas quando cabível e preservar os meios necessários ao exercício de direitos. Mudanças de preço e de condições exigem informação adequada antes de nova contratação ou renovação, observando os requisitos legais.

4.4. Como pedir cancelamento ou encerramento
O administrador pode abrir um pedido na área Suporte ou enviar e-mail para [EMAIL_SUPORTE], informando o nome do pet shop, o e-mail da conta e, se disponível, a referência da assinatura. Informe se deseja cancelar futuras renovações, encerrar o uso ou solicitar reembolso. Não envie senha, número completo do cartão ou código de segurança. Guarde uma cópia do pedido e da resposta.
O prestador deve localizar a assinatura, realizar o cancelamento da recorrência no painel do PagBank e confirmar ao solicitante as providências e o período de acesso remanescente. Desativar um usuário, suspender alterações ou deixar de acessar o PetCore não envia automaticamente uma ordem de cancelamento ao PagBank. O pedido de encerramento deve tratar também da entrega e da conservação dos dados, conforme a seção 7.
Quando for aplicável uma relação de consumo, serão respeitados o direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor, inclusive o prazo de sete dias nas hipóteses legais, e os demais direitos obrigatórios. O teste gratuito não substitui esses direitos. Os mesmos canais recebem pedidos de desistência e reembolso. Os valores devidos ao solicitante serão tratados pelo provedor de pagamento, com confirmação da providência. As condições de cancelamento e reembolso fora das hipóteses legais obrigatórias ainda precisam de definição expressa antes da oferta comercial. [REGRAS_DE_REEMBOLSO_E_ENCERRAMENTO]

5. Dados e confidencialidade
[NOME_LEGAL] atua como controlador dos dados usados nas finalidades próprias da plataforma, como relacionamento contratual, cobrança, contas, segurança e suporte. O pet shop decide as finalidades e a base legal dos dados de seus clientes, tutores e equipe. Na prestação dessas funcionalidades, o responsável pelo PetCore atua como operador e deve seguir as instruções legítimas do pet shop, a confidencialidade e o instrumento de tratamento de dados. Nenhuma das partes adquire propriedade sobre os dados pessoais a ponto de poder usá-los livremente ou em finalidade incompatível.
O pet shop deve coletar apenas dados necessários, atender seus titulares e registrar autorizações específicas quando cabíveis. Lembretes não autorizam campanhas por si só. A Política de Privacidade integra as informações sobre o tratamento e os fornecedores. As responsabilidades por instruções, suboperadores, incidentes, transferências, conservação e devolução dos dados devem constar do contrato de tratamento de dados.

6. Suporte, segurança e continuidade
O canal de suporte é [EMAIL_SUPORTE]. A equipe deve avaliar falhas e registrar providências. A operação deve manter atualizações, controles de acesso e backups testados. Limitações ou manutenções relevantes devem ser comunicadas quando cabível. Prazos e níveis de serviço somente podem ser anunciados se puderem ser cumpridos e constarem da oferta ou do contrato.
O contratante deve conferir seus registros, acompanhar conciliações e exportar as informações necessárias à sua própria continuidade. Isso não afasta as obrigações do prestador sobre segurança e conservação conforme o contrato e a lei.

7. Encerramento e transferência de administração
Solicite a entrega dos dados pelos canais de Suporte ou [EMAIL_SUPORTE]. O responsável deve verificar a autorização do solicitante, combinar um meio seguro de entrega e informar o que foi disponibilizado ou exige outra providência. O sistema possui exportações para finalidades específicas; o encerramento pode exigir organizar também fotos e outros registros da empresa. Não se deve confundir a exportação dos dados de um titular com uma cópia completa de todos os dados do pet shop.
A janela de acesso para entrega, o formato completo da migração e os critérios de eliminação ou conservação precisam ser definidos antes da oferta comercial. [RETENCAO_ENTREGA_E_ENCERRAMENTO]
A venda do software ou mudança de administrador deve preservar os contratos, os acessos autorizados, os direitos e os deveres de informação aplicáveis. Ela não autoriza divulgação indiscriminada de dados pessoais.

8. Propriedade intelectual e disposições finais
O uso do serviço não transfere o código e a marca ao assinante, salvo contrato específico. As partes devem respeitar direitos de terceiros e as regras legais de responsabilidade. Controvérsias devem ser tratadas pelos canais de atendimento e pelas autoridades competentes, observados os direitos e o foro previstos na legislação aplicável.
A versão aceita e a data do aceite são registradas para comprovar qual texto foi apresentado. A publicação e a coleta de aceite dependem da aprovação do conteúdo final e das informações do prestador. [APROVACAO_JURIDICA_E_OPERACIONAL]`;

export function legalTemplatesFor(identity:LegalTemplateIdentity={}) {
 const brand=identity.brand?.trim()||operatorIdentityDefaults.brand;
 const legalName=identity.legal_name?.trim()||operatorIdentityDefaults.legal_name;
 const amount=(id:string,fallback:number)=>{const value=identity.plans?.find(plan=>plan.id===id)?.amount_cents;return typeof value==='number'&&Number.isInteger(value)&&value>0?value:fallback;};
 const money=(cents:number)=>'R$ '+(cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const trialDays=typeof identity.trial_days==='number'&&Number.isInteger(identity.trial_days)&&identity.trial_days>=0&&identity.trial_days<=90?identity.trial_days:30;
 const graceDays=typeof identity.grace_days==='number'&&Number.isInteger(identity.grace_days)&&identity.grace_days>=0&&identity.grace_days<=30?identity.grace_days:3;
 const values:Record<string,string>={NOME_LEGAL:legalName,MARCA:brand,NATUREZA_DO_PRESTADOR:legalName===operatorIdentityDefaults.legal_name?'pessoa física':'[NATUREZA_DO_PRESTADOR]',
  APRESENTACAO_MARCA:brand==='Tiger Tech'?'Tiger Tech — Sites, Sistemas e Soluções Digitais':brand,
  PRECO_MENSAL:money(amount('monthly',3500)),PRECO_ANUAL:money(amount('yearly',35000)),DIAS_FREE:String(trialDays),
  REGRA_TOLERANCIA:graceDays>0?`A tolerância operacional configurada para regularizar o vencimento de um período pago é de ${graceDays} dia(s), conforme exibido em Plano e assinatura. Ela não prolonga o teste Free nem autoriza cobranças.`:'Não há tolerância operacional configurada após o vencimento do período pago. O teste Free termina no prazo informado.',
  EMAIL_SUPORTE:identity.support_email?.trim()||operatorIdentityDefaults.support_email,
  EMAIL_PRIVACIDADE:identity.privacy_email?.trim()||operatorIdentityDefaults.privacy_email,
  ENDERECO:identity.address?.trim()||(legalName===operatorIdentityDefaults.legal_name?operatorIdentityDefaults.address:'[ENDERECO]')};
 const render=(source:string)=>source.replace(/\[(NOME_LEGAL|MARCA|APRESENTACAO_MARCA|NATUREZA_DO_PRESTADOR|PRECO_MENSAL|PRECO_ANUAL|DIAS_FREE|REGRA_TOLERANCIA|EMAIL_SUPORTE|EMAIL_PRIVACIDADE|ENDERECO)\]/g,(marker,key:string)=>values[key]??marker);
 return {privacy:render(privacyDraft),terms:render(termsDraft)};
}

export const privacyTemplate=legalTemplatesFor().privacy;
export const termsTemplate=legalTemplatesFor().terms;
