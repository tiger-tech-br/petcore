-- Identidade e endereço fornecidos pelo responsável. Não publica nem altera documentos personalizados.
UPDATE commercial_settings SET
 legal_name=CASE WHEN legal_name IS NULL OR btrim(legal_name)='' THEN 'José Andrey Pereira Lisboa' ELSE legal_name END,
 address=CASE WHEN (address IS NULL OR btrim(address)='') AND (legal_name IS NULL OR btrim(legal_name) IN ('','José Andrey Pereira Lisboa')) THEN 'Rua Brasílio Machado, 404, Santo André, São Paulo, CEP 09060-700' ELSE address END,updated_at=now()
WHERE singleton=true AND published=false AND
 (legal_name IS NULL OR btrim(legal_name)='' OR ((address IS NULL OR btrim(address)='') AND btrim(legal_name)='José Andrey Pereira Lisboa'));

UPDATE commercial_settings SET privacy_text=format($petcore_policy$POLÍTICA DE PRIVACIDADE DO PETCORE — RASCUNHO PARA REVISÃO

1. Quem responde pelo tratamento
O PetCore é um sistema de gestão para pet shops oferecido por %1$s, %7$s, sob a marca %2$s. A apresentação institucional da marca é: %3$s.
O canal de suporte é %4$s e o canal para solicitações sobre dados pessoais é %5$s. Endereço para contato e identificação da oferta: %6$s.

%1$s atua como controlador dos dados necessários à administração das contas de acesso à plataforma, da relação contratual, das assinaturas, da segurança e do suporte do PetCore. Cada pet shop é responsável pelas decisões sobre os dados de seus tutores, clientes, profissionais e atendimentos. Para prestar essas funcionalidades, o responsável pelo PetCore atua como operador, segundo instruções legítimas do pet shop e o instrumento de tratamento de dados. Essas funções decorrem das atividades efetivas e não apenas do nome usado no contrato. O pet shop deve informar aos titulares sua identidade, finalidades e canal de atendimento.

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
O fluxo preparado para as assinaturas utiliza links externos do PagBank. Quando o checkout estiver habilitado, os dados completos do cartão serão informados diretamente naquele ambiente, sujeito ao aviso de privacidade e às condições do provedor. O PetCore não coleta nem armazena número completo do cartão ou código de segurança. A liberação da assinatura depende da conferência manual do recebimento pelo responsável, com registro da referência e do período de acesso; o retorno do navegador não confirma o pagamento.
Um lançamento manual de Pix ou cartão no Financeiro do pet shop é uma informação registrada pela equipe e não representa acesso à conta bancária. A função não solicita credenciais bancárias.

5. Compartilhamento e fornecedores
O acesso é limitado às pessoas autorizadas do pet shop e às atividades necessárias à prestação, ao suporte e à segurança. O responsável não recebe autorização para vender registros dos pet shops ou usá-los em finalidade incompatível com o contrato. O ambiente de homologação preparado para o lançamento possui os seguintes fornecedores e usos:
- Neon: banco PostgreSQL configurado na região AWS São Paulo, Brasil (sa-east-1).
- Railway: hospedagem da aplicação nos Estados Unidos (us-east4-eqdc4a) e armazenamento separado de fotos e backups na região IAD, Estados Unidos. As fotos usam armazenamento privado e os backups do banco são cifrados antes do envio.
- PagBank: checkout externo das assinaturas e informações necessárias à conferência dos recebimentos. Os links e as condições da oferta ainda dependem de revisão antes da habilitação comercial.
- Microsoft Outlook: caixa de suporte e privacidade %5$s, que recebe as mensagens enviadas voluntariamente pelos usuários e titulares. Não foi estabelecida nesta preparação uma região exclusiva para o processamento dessa caixa.
- Resend: integração de e-mails de recuperação e lembretes preparada, mas ainda não ativada no ambiente de homologação. Antes da ativação, devem ser conferidos remetente, destinatários, contratos, regiões e configuração operacional. Lembretes exigem a autorização específica mencionada nesta política.
Esta lista descreve a configuração conhecida na preparação. As localizações informadas não demonstram que todos os dados, metadados, acessos administrativos ou subfornecedores de cada provedor fiquem nessas regiões. A lista final precisa coincidir com o ambiente utilizado pelos clientes e com os contratos aplicáveis. [REVISAO_FORNECEDORES_E_TRANSFERENCIAS]
Se houver tratamento no exterior, o responsável deve identificar os países ou regiões envolvidos, avaliar a transferência internacional e adotar o mecanismo legal aplicável, inclusive cláusulas contratuais adequadas quando cabíveis. A escolha de uma região de hospedagem, isoladamente, não comprova regularidade de todas as transferências.

6. Conservação e encerramento
Os dados operacionais são mantidos durante a prestação do serviço segundo as instruções do pet shop e os critérios de necessidade. No encerramento, o controlador deve definir e comunicar a entrega, eliminação ou desidentificação dos registros, ressalvadas as hipóteses legítimas de conservação. Documentos financeiros, evidências de exercício de direitos e registros de segurança devem ter finalidade, acesso e duração de conservação documentados na tabela de retenção aplicável.
Os prazos e critérios de retenção por categoria de dado e o ciclo de expiração das cópias de segurança ainda precisam ser definidos, documentados e informados na versão final. [RETENCAO_E_CICLO_DE_BACKUPS]
A remoção no banco ativo não significa remoção instantânea em backups ou em fornecedores externos. Uma restauração deve reaplicar as solicitações de exclusão e revogação antes de reabrir o acesso. Não se deve conservar dados indefinidamente por mera conveniência.

7. Direitos e atendimento
O titular pode solicitar confirmação do tratamento, acesso, correção, informação sobre compartilhamentos, revogação de consentimento e demais direitos aplicáveis, incluindo portabilidade, bloqueio, anonimização ou eliminação nas hipóteses legais. Encaminhe a solicitação ao pet shop responsável pelos seus atendimentos; para dados administrados diretamente pelo responsável do PetCore, use %5$s. Se não souber a quem se dirigir, o mesmo canal pode auxiliar no encaminhamento ao responsável correto. Não há cobrança pelo exercício dos direitos.
Pode ser necessária uma verificação proporcional de identidade para evitar entregar ou alterar dados de outra pessoa. Não envie documentos ou informações sensíveis sem necessidade e orientação do responsável. O pedido será analisado, com resposta sobre as providências ou as razões de eventual impossibilidade, observando os prazos legais aplicáveis. Os direitos relativos a registros necessários a obrigações legais devem ser analisados conforme o caso. O titular também pode recorrer à ANPD e aos demais órgãos competentes.

8. Segurança e incidentes
O serviço utiliza controles de autenticação, autorização por empresa e transmissão protegida quando publicado por HTTPS. O responsável operacional deve manter backups, gestão de acessos, atualização e resposta a incidentes. Não existe segurança absoluta. Incidentes com risco ou dano relevante devem ser avaliados e comunicados pelo controlador conforme a legislação e regulamentação aplicáveis; a operadora deve colaborar e fornecer informações necessárias.

9. Cookies e alterações
O acesso utiliza cookies necessários à sessão. Ferramentas opcionais de publicidade, rastreamento ou análise devem ser avaliadas separadamente antes de serem adicionadas. A versão e a data de vigência desta política são apresentadas na página. Alterações relevantes devem ser comunicadas de forma adequada aos afetados.

Este texto é um rascunho. A publicação depende da conferência dos dados reais, das operações, dos fornecedores, da retenção e dos instrumentos contratuais pelo responsável e por sua assessoria jurídica. Não representa certificação de conformidade. [APROVACAO_JURIDICA_E_OPERACIONAL]$petcore_policy$,
 legal_name,COALESCE(NULLIF(btrim(brand),''),'Tiger Tech'),
 CASE WHEN COALESCE(NULLIF(btrim(brand),''),'Tiger Tech')='Tiger Tech' THEN 'Tiger Tech — Sites, Sistemas e Soluções Digitais' ELSE brand END,
 COALESCE(NULLIF(btrim(support_email),''),'tigertechbr@outlook.com'),
 COALESCE(NULLIF(btrim(privacy_email),''),'tigertechbr@outlook.com'),
 COALESCE(NULLIF(btrim(address),''),'[ENDERECO]'),
 CASE WHEN btrim(legal_name)='José Andrey Pereira Lisboa' THEN 'pessoa física' ELSE '[NATUREZA_DO_PRESTADOR]' END),updated_at=now()
WHERE singleton=true AND published=false AND btrim(privacy_text)='';
