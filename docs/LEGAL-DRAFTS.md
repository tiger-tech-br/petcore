# Documentos jurídicos e de operação — preparação para lançamento

Os textos de `api/src/legalTemplates.ts` são rascunhos originais de Política de Privacidade e Termos de Uso para revisão e preenchimento. Importá-los não os publica nem registra aceite. `LegalScreen.tsx` mostra o estado de preparação quando `GET /api/public/legal` retorna `published:false`.

## Identidade confirmada pelo responsável

- **Responsável pelo PetCore:** José Andrey Pereira Lisboa, pessoa física.
- **Marca:** Tiger Tech.
- **Apresentação da marca:** Tiger Tech — Sites, Sistemas e Soluções Digitais.
- **Suporte e privacidade:** tigertechbr@outlook.com.
- **Endereço informado para os documentos:** Rua Brasílio Machado, 404, Santo André, São Paulo, CEP 09060-700.

O produto continua sendo PetCore. A marca não é apresentada como uma pessoa jurídica distinta. Não foi inventado CNPJ nem inserido CPF no projeto. A LGPD admite agentes de tratamento que sejam pessoas naturais; a identificação da oferta e do contrato deve ser analisada segundo as regras aplicáveis ao negócio. [LGPD, arts. 1º e 5º](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).

A [Política de Privacidade em preparação](POLITICA-DE-PRIVACIDADE.md) contém esses dados reais e separa o tratamento próprio da plataforma dos registros controlados pelos pet shops. A relação de fornecedores descreve a configuração de homologação conhecida, incluindo armazenamento nos Estados Unidos; não afirma que contratos, transferências ou todos os subprocessadores já foram aprovados.

Os [Termos de Uso em preparação](TERMOS-DE-USO.md) também identificam o responsável, a marca e o endereço informados. Ambos são textos concretos para revisão; a criação desses arquivos não é uma publicação nem uma aprovação jurídica.

## Condições já concretizadas nos textos

- Plano Free por 30 dias a partir da confirmação, inicialmente selecionado, sem cartão e sem cobrança automática ao terminar.
- Plano Mensal de R$ 35 por mês e Plano Anual de R$ 350 por 12 meses, com opção de pagamento imediato no primeiro acesso ou durante o teste.
- PagBank PF por link externo recorrente; conferência manual do recebimento para liberar o período exibido no sistema.
- Solicitação de cancelamento, encerramento e reembolso pela área Suporte ou tigertechbr@outlook.com; execução do cancelamento da recorrência no painel do PagBank e confirmação ao solicitante.
- Distinção entre os dados controlados pelo responsável do PetCore e aqueles controlados pelo pet shop, tratados pelo prestador como operador.

Na última conferência operacional, os novos links PagBank estavam identificados como PetCore Mensal, R$ 35, e PetCore Anual, R$ 350, e foram marcados como conferidos. Os documentos jurídicos continuam não publicados. Um teste isolado de Resend foi aceito pelo provedor e o usuário confirmou recebimento na pasta de spam; isso não comprova entrega futura a todos os destinatários. As variáveis de e-mail foram configuradas no Railway para a revisão seguinte. A ativação de lembretes foi autorizada somente para tutores com opt-in válido; o serviço e sua validação operacional ainda estavam em preparação nessa conferência. A operação deve registrar o resultado da ativação e dos testes efetivamente concluídos, sem tratar a mera configuração como comprovação de envio.

`legalTemplatesFor(settings)` também aceita `plans`, `trial_days` e `grace_days`. Quando esses valores válidos forem fornecidos, o texto usa os valores efetivos; os padrões continuam R$ 35/R$ 350, 30 dias de teste e três dias de tolerância somente após período pago. Essa tolerância não estende o Free. Os textos completos já gravados na configuração são versões próprias e não são substituídos automaticamente por alterações dos templates.

A [minuta do acordo de tratamento de dados](ACORDO-DE-TRATAMENTO-DE-DADOS.md) organiza a contratação com cada pet shop. Seus campos de cliente dependem da contratação concreta; os demais anexos pendentes correspondem a decisões e evidências operacionais ainda necessárias.

## Lacunas materiais para a revisão final

1. **Operação de cobrança e cancelamento:** definir prazo praticável de conferência, resposta e execução, validar o cancelamento no painel e informar as condições finais. Isso não afasta prazos e direitos legais aplicáveis.
2. **Reembolso e encerramento:** definir a regra comercial fora das hipóteses legais obrigatórias, o tratamento do período pago e a janela/formato da entrega completa dos dados. Não foi inventada multa, cláusula de não reembolso ou desconto proporcional.
3. **Retenção e continuidade:** aprovar critérios por categoria de dado, versões de fotos e ciclos de backups; validar eliminação e reaplicação de direitos após restauração. Não há prazo universal de retenção criado por estes documentos.
4. **Fornecedores e transferências:** conferir contratos, subprocessadores, fluxos e instrumento legal aplicável, especialmente para infraestrutura nos Estados Unidos e e-mails. Uma região configurada não comprova o atendimento dessas obrigações.
5. **Instrumentos e prontidão:** revisar a identificação exigível na oferta/contrato, formalização aplicável, minuta por pet shop, contatos de incidente, versão/data e aprovação do responsável. Não há afirmação de certificação ou revisão jurídica concluída.

Os marcadores operacionais e de revisão correspondentes permanecem intencionalmente nos textos e impedem a publicação prematura pelo fluxo existente. Os dados reais já fornecidos — nome, natureza de pessoa física, marca, endereço, contato, planos e ciclo Free — não ficaram como marcadores genéricos.

A migration `011_operator_identity.sql` preenche o nome somente quando estiver vazio e a configuração não estiver publicada. Para essa identidade confirmada, também preenche o endereço somente se estiver vazio. Insere a política somente se também estiver vazia, resolvendo os dados de identificação e contato existentes. Preserva nomes, endereços e textos personalizados, os documentos publicados, as datas e versões de publicação, os aceites e a situação dos checkouts. O helper puro `legalTemplatesFor(settings)` fornece rascunhos com os dados da configuração; retorna `{privacy, terms}`. A natureza e o endereço de um prestador personalizado diferente do responsável confirmado ficam como pendência quando não informados, para não atribuir dados de outra pessoa.

O responsável pelo PetCore deve revisar as condições reais e obter assessoria jurídica adequada ao seu negócio antes de publicar. Nenhum arquivo declara que o software está certificado pela ANPD ou que a presença de um checkbox garante conformidade.

## Informações que não podem ser inventadas

- Nome legal de quem oferece e contrata o serviço, natureza de sua atuação e identificação necessária ao contrato.
- Endereço e canais reais para suporte e privacidade.
- Pessoas responsáveis por atendimento, incidentes e decisões de conservação.
- Fornecedores realmente habilitados, finalidades, regiões e contratos de tratamento.
- Regras de assinatura, renovação, atraso, cancelamento, reembolso, migração e entrega de dados.
- Prazos e critérios concretos de retenção e recuperação de backups.
- Nível de serviço e horários de suporte que possam ser cumpridos.

Nome, e-mails e endereço confirmados já são resolvidos nos rascunhos padrão. Permanecem, entre outras revisões, `[REVISAO_FORNECEDORES_E_TRANSFERENCIAS]`, `[RETENCAO_E_CICLO_DE_BACKUPS]` e `[APROVACAO_JURIDICA_E_OPERACIONAL]`. Em uma configuração personalizada podem restar outros marcadores, inclusive `[ENDERECO]` e `[NATUREZA_DO_PRESTADOR]`. Eles precisam ser substituídos ou removidos somente após a revisão correspondente. Retire também os rótulos de rascunho apenas quando a versão final estiver aprovada. O sistema não deve publicar documentos incompletos ou coletar um aceite que aparente dar validade a dados fictícios.

A política de privacidade não substitui a identificação exigível na oferta e na contratação. O art. 2º do Decreto nº 7.962/2013 prevê dados de identificação do fornecedor, quando houver, e endereço físico e eletrônico para contratos de consumo no comércio eletrônico. Defina o enquadramento e os dados exigíveis com orientação adequada; não conclua que a ausência de CNPJ permite omitir todas as demais informações. Não se deve publicar CPF apenas para preencher um campo técnico inexistente. [Decreto nº 7.962/2013](https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-publicacaooriginal-139266-pe.html).

## Instrumento de tratamento entre Tiger Tech e pet shop

Além dos termos públicos, prepare um instrumento contratual que documente, no mínimo:

1. **Partes e funções efetivas.** Identifique o controlador dos registros de tutores e atendimentos e a operadora que presta o PetCore. Separe as finalidades próprias da prestadora, como sua cobrança, conta e segurança.
2. **Objeto e instruções.** Descreva as categorias de dados, titulares, finalidades, duração e operações permitidas. Instruções incompatíveis com a lei não devem ser executadas automaticamente.
3. **Acessos e confidencialidade.** Defina pessoas autorizadas, necessidade de acesso, desligamento, equipe de suporte e deveres de confidencialidade. O suporte não deve ter acesso irrestrito e informal a todos os clientes.
4. **Segurança e continuidade.** Registre os controles, atualização, segregação entre empresas, gestão de credenciais, backups, testes de restauração e tratamento de falhas.
5. **Suboperadores e localização.** Liste fornecedores reais, regiões, condições de contratação e procedimento de atualização. Analise as transferências internacionais e seus instrumentos; não basta citar nomes de fornecedores.
6. **Atendimento aos titulares.** Defina o canal, o encaminhamento, a verificação proporcional de identidade, a colaboração para pesquisa e exportação e o registro de providências. O direito não pode ser descartado só porque um dado está fora da tela de tutores.
7. **Incidentes.** Estabeleça responsáveis, canais de emergência, comunicação entre as partes, preservação de evidências e informações necessárias à avaliação e às comunicações legais.
8. **Conservação e encerramento.** Defina a entrega segura, formato, janela de exportação, hipóteses justificadas de retenção, eliminação/desidentificação, ciclo de backups e confirmação das providências. Uma restauração precisa reaplicar exclusões e revogações já atendidas.
9. **Auditoria e prestação de contas.** Estabeleça evidências proporcionais e minimizadas, sem replicar senhas, documentos ou conversas pessoais em logs.
10. **Transferência ou venda do projeto.** A aquisição do código não concede liberdade irrestrita sobre os dados pessoais. Defina a continuidade dos contratos, a transição de acessos e os deveres de informação aplicáveis à mudança do prestador.

Esse roteiro serve para preparar o instrumento com os fatos reais e a análise jurídica; não é um contrato individualizado já aprovado.

## Cuidados com cobrança e oferta

O preço, a periodicidade e as condições de renovação precisam coincidir na oferta, no PetCore e no checkout do provedor. A autorização de uma cobrança recorrente pertence ao pagador no fluxo do provedor. Um link de retorno ou um status informado pelo navegador não é prova de recebimento.

Se o operador confere manualmente no PagBank o pagamento que libera acesso, informe essa condição e mantenha referência, responsável e período correspondente. O lançamento da assinatura no PetCore deve refletir o que foi confirmado. A política deve explicar cancelamento da renovação e tratamento de estornos sem prometer uma integração inexistente.

A eventual emissão de documentos fiscais, a formalização do negócio e suas obrigações contábeis precisam de análise própria. O módulo de Financeiro registra operações e não substitui essas obrigações.

## Procedimento de publicação e aceite

1. Preencha e revise o cadastro do operador e os canais de atendimento.
2. Revise os rascunhos, o instrumento entre as partes, os fornecedores e a retenção.
3. Confira a oferta e o checkout, o suporte, os testes e o plano de incidentes/continuidade.
4. Atribua uma versão e uma data de vigência ao texto final; mantenha o histórico da versão oferecida.
5. Publique somente após a aprovação pelo responsável. Os aceites devem associar usuário, versão e data, sem substituir consentimentos específicos para outras finalidades.
6. Comunique alterações relevantes conforme as obrigações aplicáveis e preserve o texto efetivamente apresentado à pessoa que aceitou.

## Fontes oficiais usadas como referência

- [PagBank: recorrência para pessoa física e gestão pelo painel](https://developer.pagbank.com.br/docs/pagamentos-recorrentes).
- [PagBank: painel de pagamentos recorrentes](https://developer.pagbank.com.br/docs/painel-de-pagamentos-recorrentes).
- [Código de Defesa do Consumidor, inclusive art. 49 — Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html).

- [Direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).
- [Perguntas frequentes e orientação sobre encarregado/canais — ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).
- [Lei nº 13.709/2018, art. 18 — Senado Federal](https://normas.leg.br/?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2018-08-14%3B13709%21art18).
- [Transferência internacional — Resolução ANPD nº 19/2024](https://dspace.mj.gov.br/bitstream/1/13458/2/RES_ANPD_2024_19.pdf).
- [Comunicação de incidentes — ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis).
- [Guia de segurança para agentes de pequeno porte — ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/processo-guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte.pdf).

Verifique atualizações normativas na revisão final. A pertinência de uma hipótese legal, de um prazo ou de uma cláusula depende dos fatos; as referências não aprovam automaticamente a operação da Tiger Tech.
