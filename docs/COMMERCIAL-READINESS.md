# PetCore — preparação comercial

Este registro acompanha trabalho em andamento. Um build aprovado não substitui a validação de implantação e operação.

## Entregas desta rodada

- [ ] Produtos, movimentos e estoque com concorrência e histórico.
- [ ] Vendas, recebimentos, despesas, contas e caixa.
- [ ] Relatórios e gráficos baseados nos registros reais.
- [ ] Planos R$ 40/mês e R$ 400/ano; controle de validade e conciliação de pagamentos.
- [ ] PagBank PF: Link de Pagamento Recorrente externo, sem coletar cartões no PetCore.
- [ ] Suporte com solicitações e respostas no painel.
- [ ] Privacidade: solicitações, exportação, verificação, anonimização e auditoria.
- [ ] Documentos jurídicos revisáveis e identificação do operador, sem dados inventados.
- [ ] Publicação Railway com migração controlada, HTTPS, prontidão e encerramento seguro.
- [ ] Backups criptografados e procedimento de restauração testado.
- [ ] Lembretes com consentimento, deduplicação, retentativas e tratamento de falhas.
- [ ] Testes de regressão, autorização, concorrência, dinheiro, privacidade e responsividade.
- [ ] Revisão de segurança e correções verificadas.

## Decisões do usuário

- A primeira hospedagem será no Railway, inicialmente no domínio HTTPS gerado pela plataforma.
- O Neon atual contém somente testes. Dados reais serão incluídos após a preparação comercial.
- A conta PagBank é PF. A documentação oficial atual exige Link Recorrente para essa modalidade; não se deve tentar habilitar a API de assinaturas restrita a PJ.
- Preservar a identidade PetCore, o cachorro inteiro no login, modais responsivos e a posição original dos avisos.

## Configurações externas que precisam de valores reais antes do anúncio

- Identificação do responsável, endereço e canais de suporte/privacidade.
- Revisão e aprovação dos termos, aviso de privacidade, contrato de operação e subprocessadores/regiões realmente contratados.
- Links recorrentes mensal/anual criados no painel PagBank, valores conferidos e procedimento de conciliação.
- Serviço Railway, credenciais privadas de banco, e-mail e armazenamento; não publicar o arquivo .env.
- Destino de backup separado, chave de criptografia protegida, alertas e teste de restauração.
- Homologação da URL HTTPS real, envio de e-mail e upload. Configurações ausentes não são consideradas concluídas.

## Referências oficiais

- [PagBank: recorrência e elegibilidade PF/PJ](https://developer.pagbank.com.br/docs/pagamentos-recorrentes)
- [ANPD: direitos e agentes de tratamento](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes)
- [ANPD: comunicação de incidentes](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Railway: domínios](https://docs.railway.com/networking/domains/working-with-domains)
