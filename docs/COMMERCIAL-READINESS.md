# PetCore — preparação comercial

Registro de preparação em 06/11/2026. Diferencia código existente, validação local e configurações externas. Ainda não é declaração de prontidão comercial.

## Código implementado

- [x] Clientes/tutores, pets, profissionais, serviços, jornadas, agenda e lista de espera.
- [x] CRM com carteira, segmentos, contatos manuais e tarefas de retorno.
- [x] Produtos, movimentos de estoque, concorrência e histórico.
- [x] Vendas/comandas internas, recebimentos parciais, despesas e caixa.
- [x] Relatórios, gráficos e CSV a partir dos registros da empresa.
- [x] Planos R$ 35/mês e R$ 350/ano; Free de teste por 30 dias.
- [x] Modal inicial com Free selecionado; pago pode ser escolhido imediatamente.
- [x] Validade e conciliação manual: escolher plano/retornar do checkout não comprova pagamento.
- [x] Free sem tolerância extra; tolerância somente para período pago.
- [x] Chamados de suporte e respostas da plataforma.
- [x] Solicitações de privacidade, verificação, exportação, anonimização e auditoria.
- [x] Canais de suporte/privacidade: tigertechbr@outlook.com; documentos continuam em rascunho.
- [x] Guia de primeiros passos, explicação de pré-requisitos e atalhos conforme permissão.
- [x] Modais responsivos; identidade visual, cachorro inteiro e posição dos avisos preservados.
- [x] Migrations controladas, manutenção e scripts de backup criptografado/restauração.
- [x] Código de lembretes com consentimento e controles de envio; isso não significa envio ativado.

## Evidências locais registradas

- [x] Rodada completa: 84 testes aprovados, sendo 18 unitários e 66 de integração, incluindo a suíte comercial 19/19 e as regressões de upload.
- [x] Backup local AES-256-GCM e restauração em banco isolado: 46 tabelas e contagens conferidas; chave errada, destino ocupado e origem recusados. Não inclui fotos.
- [x] Verificações locais anteriores de login, CRM e modais em computador/celular com dados fictícios.
- [x] Compilação final de API/interface aprovada; TypeScript e Sass conferidos após a reorganização da agenda.
- [x] Jornada fictícia pela interface: serviço, profissional/jornada, cliente, pet e agendamento no celular. Novo atendimento passa a mostrar sua data automaticamente; filtros antigos não o escondem.
- [x] Agenda conferida em 360×740 e 1366×850; login com cachorro inteiro em 320×568 e 360×740. Posição dos avisos mantida.
- [x] Revisão estática concluída; limite de campos multipart do envio de foto corrigido, com reprodução controlada anterior, regressões e revisão independente. Relatório original preserva a versão anterior e não certifica a versão publicada.

Não somar execuções sobrepostas. Resultados locais não comprovam entrega de e-mail, permissões remotas, construção Docker ou operação jurídica.

## Homologação externa em preparação

- [x] Projeto Railway isolado criado; serviço e domínio reservados.
- [x] Branch Neon de homologação separado: `petcore-homologacao-20261106`.
- [x] Destinos separados para fotos e backups criados; variáveis de referência configuradas.
- [x] Configurações diretas do serviço definidas para Dockerfile, início, pré-deploy e saúde.
- [x] Serviços de manutenção e backup criados, com variáveis por referência e horários de cron configurados; ainda sem fonte, implantação ou execução.
- [x] Migrations 006–010 aplicadas e verificadas na cópia de homologação, preservando o branch original.
- [ ] Construir e implantar a imagem no Railway.
- [ ] Verificar migrations, saúde, HTTPS, sessão e fluxos reais no endereço publicado.
- [ ] Conferir permissões/privacidade remotas, upload, leitura e exclusão de fotos.
- [ ] Executar backup remoto e restauração isolada com o destino configurado.
- [ ] Conectar revisão aprovada e implantar os crons; conferir execução, retenção, alertas e recuperação de objetos.
- [ ] Validar recuperação de senha e lembretes com remetente/destinatários autorizados. Envios seguem desabilitados.

Domínio reservado: [petcore-homologacao.up.railway.app](https://petcore-homologacao.up.railway.app). Sua reserva não comprova aplicação implantada.

## Pendências para comercialização

- [ ] Nome/identificação jurídica e endereço reais do responsável.
- [ ] Revisão e aprovação dos termos, aviso de privacidade, contrato de operação e fornecedores/regiões efetivos.
- [ ] Retenção, incidentes, resposta a titulares, encerramento e transferência de administração praticáveis e aprovados.
- [ ] Revisão dos links PagBank: R$ 35/R$ 350 conferidos anteriormente, mas ainda com nome de outro produto; permanecem sem aprovação.
- [ ] Conferência de conciliação/cancelamento no PagBank e instruções claras ao cliente.
- [ ] Proteção da chave de backup e procedimento de recuperação fora do ambiente ativo.
- [ ] Homologação completa antes de receber clientes reais e anunciar.

A conta PagBank atual é PF: checkout externo por links recorrentes e conciliação manual. Não há captura de cartão, integração bancária ou token da API de assinaturas necessário a esse fluxo.

## Limites do escopo

O sistema gerencia o pet shop internamente, incluindo vendas no balcão. Não inclui loja virtual, táxi dog, entregas, status de pedidos de comércio eletrônico ou emissão fiscal. Recursos de privacidade não são uma certificação de conformidade.

A hospedagem começa no endereço do Railway. Um subdomínio futuro da Tiger Tech pode ser configurado depois, sem alterar o site principal agora.

## Referências

- [Guia de publicação](RAILWAY.md) e [operação/recuperação](OPERACAO.md).
- [Privacidade e procedimentos](PRIVACIDADE-LGPD.md).
- [PagBank: recorrência](https://developer.pagbank.com.br/docs/pagamentos-recorrentes).
- [ANPD: direitos e agentes de tratamento](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).
