# Privacidade e operação do PetCore

Este documento descreve controles técnicos e um roteiro operacional. Não certifica conformidade, não substitui o contrato de tratamento nem a análise das operações reais. Antes de atender clientes comerciais, o responsável deve completar os dados da Tiger Tech, aprovar os documentos, definir fornecedores/regiões e executar o roteiro de validação.

## Responsabilidades

Para os cadastros de tutores, clientes, pets e atendimentos inseridos pelo estabelecimento, o pet shop normalmente define finalidade e meios essenciais do tratamento e atua como controlador. A Tiger Tech presta o serviço conforme instruções legítimas e o contrato de tratamento. Para os dados que usa em suas próprias contas, cobrança, segurança e suporte, a Tiger Tech deve identificar e documentar suas próprias responsabilidades. O enquadramento depende da operação efetiva; o nome de um contrato, isoladamente, não define o papel das partes. [Orientações da ANPD sobre agentes e titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados).

O pet shop precisa de um canal para seus titulares. A Tiger Tech precisa de identificação e canais reais para suporte e privacidade. Não publicar um CPF pessoal como contato ou identificador desnecessário. Não inventar CNPJ, razão social, endereço, responsável ou garantias de segurança. O enquadramento como agente de pequeno porte não deve ser presumido; eventual dispensa de encarregado não elimina o dever de disponibilizar um canal. [Perguntas frequentes da ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).

## Controles implementados

- Acesso ao painel de privacidade somente por administrador autenticado da empresa.
- Solicitações ligadas a um tutor da mesma empresa, com tipo, descrição, situação e resultado.
- Registro do meio de verificação de identidade, sem exigir cópia de documento no sistema.
- Histórico das providências e auditoria sem copiar senhas ou textos livres para o evento.
- Exportação JSON mediante confirmação da senha atual e identidade verificada.
- Desidentificação protegida mediante senha, confirmação expressa, motivo e revisão de conservação.
- Cancelamento dos atendimentos futuros pendentes/confirmados, tarefas e esperas abertas e lembretes elegíveis quando o cadastro é desidentificado.
- Revogação da autorização de lembretes e limpeza dos identificadores/textos ligados ao cadastro.
- Conservação dos valores e lançamentos financeiros, com limpeza de textos pessoais vinculados.
- Táxi Dog: endereços, referências e orientações de transporte são acessíveis à equipe autorizada por empresa, entram na exportação verificada e são removidos na anonimização. O fluxo aguarda viagens em andamento e entregas pendentes após chegada registrada antes de apagar o endereço. Não há coleta de GPS ou compartilhamento automático com aplicativos de mapas.
- Fila idempotente para exclusão de fotos no armazenamento ativo, com tentativas e acompanhamento.
- Documentos públicos versionados, configuráveis e não publicados automaticamente a partir do rascunho.

As proteções de novos cadastros, CRM, agenda e vendas devem impedir reidentificar um tutor marcado com `anonymized_at`. Toda nova rota que grava dados de um tutor precisa verificar esse estado no servidor e seguir a mesma ordem de bloqueio transacional da operação de privacidade.

## Atendimento de uma solicitação

1. Registre o pedido efetivamente recebido, selecionando o titular e o tipo correspondente. Colete apenas a informação necessária à análise.
2. Confirme a identidade ou representação por um meio proporcional ao risco, sem pedir documentos excessivos. Não entregue uma exportação só porque alguém conhece o nome do cliente.
3. Analise o pedido e a hipótese legal pertinente. Os direitos incluem acesso, correção, informações sobre compartilhamento, revogação e os demais pedidos cabíveis de bloqueio, eliminação, anonimização e portabilidade. Nem toda solicitação determina apagar qualquer documento independentemente de uma obrigação de conservação. [Direitos dos titulares na ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares), [texto do art. 18 da LGPD no Senado](https://normas.leg.br/?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2018-08-14%3B13709%21art18).
4. Registre no painel a verificação de identidade e as providências. Para correção, atualize o cadastro autorizado e documente o resultado. Para oposição ou revogação, confirme o bloqueio ou a alteração da preferência nos fluxos correspondentes.
5. Quando autorizado, prepare a exportação com sua senha atual. Entregue o arquivo apenas ao titular verificado por canal seguro; não envie para endereço novo não validado. O sistema não envia essa resposta automaticamente.
6. O JSON contém dados vinculados do tutor, pets, atendimentos, CRM, consentimentos, espera e vendas/lançamentos correspondentes. As fotos podem ter links privados temporários de 15 minutos; o arquivo informa fotos pendentes se o armazenamento não estiver disponível. Históricos muito grandes exigem entrega assistida em lotes, sem considerar o limite técnico uma recusa do direito.
7. Registre a resposta e conclua ou justifique a impossibilidade de atendimento. Controle os prazos legais aplicáveis; o painel não decide automaticamente se uma hipótese legal ou uma negativa é válida.

Solicitações sobre dados da conta da própria Tiger Tech, contratos, usuários da equipe ou suporte devem ser encaminhadas ao responsável da plataforma, com registro no canal de privacidade. A exportação automática deste módulo é centrada no cadastro do tutor; outros acervos precisam de levantamento pelo responsável e não podem ser ignorados por não aparecerem nesse arquivo.

## Desidentificação, conservação e cópias

O nome da ação na API é `anonymize`, mas a operação técnica deve ser compreendida pelo seu escopo: substitui identificadores diretos e limpa textos ligados ao cadastro ativo, preservando identificadores técnicos e registros necessários à operação e à escrituração. Não oferece garantia universal de irreversibilidade nem elimina informações conservadas em outros acervos. O controlador deve avaliar se o resultado satisfaz o pedido e a definição legal no caso concreto.

Antes de executar:

- Avalie as hipóteses de conservação e a obrigação de comunicação aos demais agentes envolvidos.
- Confira campos livres em despesas, estoque, caixa, suporte, documentos externos e sistemas de terceiros. Um texto sem vínculo estruturado ao tutor não pode ser encontrado com certeza por este procedimento.
- Finalize atendimentos em andamento. Um lembrete com processamento ativo também impede a execução até encerrar seu processamento, evitando tratar um envio em curso como se fosse recuperável.
- Confira os efeitos informados no formulário: atendimentos futuros são cancelados e retornos/esperas são encerrados. A ação não estorna pagamentos no provedor; qualquer reembolso deve seguir o fluxo financeiro e contratual pertinente.
- Use o motivo controlado correspondente, confirme a revisão de conservação, digite `ANONIMIZAR` e informe a senha atual.

Os vínculos financeiros e números de documentos não devem ser apagados de forma a corromper caixa ou escrituração. A finalidade e a duração de retenção precisam ser fundamentadas pelo controlador, com orientação contábil/jurídica quando necessário. A fila de fotos só pode remover chaves do prefixo da própria empresa e não expõe credenciais ou chaves privadas ao painel.

Uma exclusão de objeto no bucket ativo não equivale a limpar versões anteriores, réplicas, backups ou cópias do provedor de e-mail. Defina versionamento/lifecycle e acompanhe a remoção de versões segundo a política aprovada. A preservação de backups deve ter acesso restrito, prazo definido e uso limitado à recuperação. Ao restaurar uma cópia, reaplique revogações e solicitações já atendidas antes de devolver o acesso. Não restaure uma base antiga diretamente no ambiente ativo sem essa conferência.

## Tabela de retenção a aprovar antes da operação comercial

| Categoria | Critério a documentar | Providência e responsável |
|---|---|---|
| Conta e permissões | Vigência do vínculo, segurança, obrigações e exercício de direitos | Revogação de acesso, exportação e destinação pelo responsável da plataforma |
| Tutores, pets, agenda e CRM | Finalidade do serviço e instruções legítimas do pet shop | Correção, limitação, desidentificação ou eliminação conforme análise do controlador |
| Vendas e documentos financeiros | Obrigações aplicáveis e defesa de direitos, com duração fundamentada | Preservar valores/documentos necessários e restringir ou remover dados pessoais excessivos |
| Consentimentos e solicitações | Evidência mínima da providência e necessidade de comprovação | Minimizar conteúdo, restringir acesso e revisar conservação |
| Segurança e auditoria | Finalidade, risco e eventuais regras legais específicas | Definir duração, acesso e descarte, evitando retenção indefinida por padrão operacional |
| Fotos e versões | Necessidade do cadastro e ciclo de exclusão | Fila no bucket ativo e política de versões/replicação aprovada |
| Backups | Janela de recuperação e expiração aprovada | Cifra, acesso restrito, expiração e reaplicação de exclusões na restauração |

Esta tabela não impõe um número genérico de anos a todos os dados. O responsável deve transformá-la em política concreta, aprovada e executável, e informar seus critérios aos titulares.

## Fornecedores e transferências

Mantenha um inventário dos serviços efetivamente habilitados, dos acessos concedidos e das regiões de processamento, inclusive backups e suporte. Possíveis fornecedores deste projeto são Railway, Neon, armazenamento S3 compatível, Resend e PagBank; só os configurados devem constar como fornecedores ativos. Confira os contratos e mecanismos aplicáveis antes de transferir dados. Não conclua que hospedar em um país elimina todas as transferências realizadas por outros serviços. [Regulamento e cláusulas de transferência internacional — Resolução ANPD nº 19/2024](https://dspace.mj.gov.br/bitstream/1/13458/2/RES_ANPD_2024_19.pdf).

Para PagBank, os dados completos do cartão devem permanecer no checkout do provedor. O registro de um pagamento ou de uma referência de assinatura no PetCore não autoriza criar cobranças fora da autorização concedida pelo pagador.

## Incidentes e continuidade

Ao identificar incidente, preserve evidências necessárias, contenha o acesso, avalie o alcance por empresa e acione os responsáveis. A operadora precisa fornecer ao controlador as informações disponíveis e cooperar; cabe ao controlador avaliar e cumprir as comunicações aplicáveis. A ANPD possui procedimento e regulamento próprios para comunicação de incidentes com risco ou dano relevante. Não presumir isenção ou prazo diferenciado sem analisar o enquadramento. [Canal oficial de comunicação de incidentes da ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis).

Mantenha responsáveis, contatos alternativos, rotina de restauração e testes de backup. O lançamento comercial depende de essa rotina existir fora do código, com armazenamento e credenciais configurados, alertas e pessoa responsável por acompanhar falhas.

## Rotas e validação técnica

Todas as rotas `/api/privacy` exigem administrador da empresa. Há listagem e detalhe de solicitações, busca limitada de tutores, criação e atualização de análise, exportação e desidentificação protegidas, consulta da fila e retomada de exclusões. A fila tem processamento idempotente e limites de lote; não aceita uma chave arbitrária enviada pelo navegador.

`api/tests/privacy.integration.test.ts` usa apenas `TEST_DATABASE_URL` terminado em `_test`, contas fictícias e variáveis de armazenamento esvaziadas para nunca atingir o bucket real. Verifica permissões, isolamento, validação, senha e seu limite, exportação, conservação de lançamentos, cancelamentos, revogação e fila. A existência do teste não comprova sua execução; o resultado da rodada de validação deve ser registrado pelo responsável pela entrega.

Antes da liberação: executar migrations em ambiente isolado; rodar os testes; conferir todos os fluxos e formatos de exportação; validar o bucket e suas versões com dados fictícios; ensaiar restauração; aprovar dados e textos públicos; revisar contrato de tratamento, fornecedores e retenção; e documentar os responsáveis pelo atendimento.
