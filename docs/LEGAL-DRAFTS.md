# Documentos jurídicos e de operação — preparação para lançamento

Os textos de `api/src/legalTemplates.ts` são rascunhos originais de Política de Privacidade e Termos de Uso para revisão e preenchimento. Importá-los não os publica nem registra aceite. `LegalScreen.tsx` mostra o estado de preparação quando `GET /api/public/legal` retorna `published:false`.

O responsável pelo PetCore deve revisar as condições reais e obter assessoria jurídica adequada ao seu negócio antes de publicar. Nenhum arquivo declara que o software está certificado pela ANPD ou que a presença de um checkbox garante conformidade.

## Informações que não podem ser inventadas

- Nome legal de quem oferece e contrata o serviço, natureza de sua atuação e identificação necessária ao contrato.
- Endereço e canais reais para suporte e privacidade.
- Pessoas responsáveis por atendimento, incidentes e decisões de conservação.
- Fornecedores realmente habilitados, finalidades, regiões e contratos de tratamento.
- Regras de assinatura, renovação, atraso, cancelamento, reembolso, migração e entrega de dados.
- Prazos e critérios concretos de retenção e recuperação de backups.
- Nível de serviço e horários de suporte que possam ser cumpridos.

Os marcadores `[NOME_LEGAL]`, `[ENDERECO]`, `[EMAIL_SUPORTE]`, `[EMAIL_PRIVACIDADE]` e `[APROVACAO_JURIDICA_E_OPERACIONAL]` precisam ser substituídos ou removidos após a revisão correspondente. Retire também os rótulos de rascunho apenas quando a versão final estiver aprovada. O sistema não deve publicar documentos incompletos ou coletar um aceite que aparente dar validade a dados fictícios.

Não é necessário publicar o CPF pessoal do empreendedor na política de privacidade por conveniência técnica. Defina, com orientação adequada, a identificação contratual exigível e a forma de operação comercial; isso não é decidido por uma configuração de software.

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

- [Direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).
- [Perguntas frequentes e orientação sobre encarregado/canais — ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).
- [Lei nº 13.709/2018, art. 18 — Senado Federal](https://normas.leg.br/?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2018-08-14%3B13709%21art18).
- [Transferência internacional — Resolução ANPD nº 19/2024](https://dspace.mj.gov.br/bitstream/1/13458/2/RES_ANPD_2024_19.pdf).
- [Comunicação de incidentes — ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis).
- [Guia de segurança para agentes de pequeno porte — ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/processo-guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte.pdf).

Verifique atualizações normativas na revisão final. A pertinência de uma hipótese legal, de um prazo ou de uma cláusula depende dos fatos; as referências não aprovam automaticamente a operação da Tiger Tech.
