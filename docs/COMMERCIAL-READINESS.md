# PetCore — preparação comercial

Registro de evidências e pendências da preparação comercial. A homologação está publicada; os ajustes posteriores e a aprovação operacional/jurídica ainda precisam de conclusão. Não é uma certificação de conformidade.

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
- [x] Identidade informada: José Andrey Pereira Lisboa, pessoa física; marca Tiger Tech — Sites, Sistemas e Soluções Digitais.
- [x] Endereço informado: Rua Brasílio Machado, 404, Santo André/SP, CEP 09060-700. Domínio institucional/remetente: tigertech.dev.br. Sem CNPJ informado.
- [x] Guia de primeiros passos, explicação de pré-requisitos e atalhos conforme permissão.
- [x] Modais responsivos; identidade visual, cachorro inteiro e posição dos avisos preservados.
- [x] Migrations controladas, manutenção e scripts de backup criptografado/restauração.
- [x] Código de lembretes com consentimento e controles de envio; isso não significa envio ativado.

## Evidências locais registradas

- [x] Rodada completa atual: 103 testes aprovados, sendo 18 unitários e 85 de integração, incluindo comercial 19/19, autenticação 11/11, lembretes 8/8 e regressões de upload. As integrações são executadas em série no banco exclusivo para evitar sobreposição das configurações globais usadas pela suíte comercial.
- [x] Autenticação: 11 testes aprovados; lembretes: 8 testes aprovados. Incluídos nos 103 da rodada completa, sem duplicar a contagem.
- [ ] Executar e registrar a suíte completa após os ajustes mais recentes de autenticação e lembretes; não somar rodadas para inventar um total final.
- [x] Backup local AES-256-GCM e restauração em banco isolado: 46 tabelas e contagens conferidas; chave errada, destino ocupado e origem recusados. Não inclui fotos.
- [x] Verificações locais anteriores de login, CRM e modais em computador/celular com dados fictícios.
- [x] Compilação final de API/interface aprovada; TypeScript e Sass conferidos após a reorganização da agenda.
- [x] Jornada fictícia pela interface: serviço, profissional/jornada, cliente, pet e agendamento no celular. Novo atendimento passa a mostrar sua data automaticamente; filtros antigos não o escondem.
- [x] Agenda conferida em 360×740 e 1366×850; login com cachorro inteiro em 320×568 e 360×740. Posição dos avisos mantida.
- [x] Revisão estática concluída; limite de campos multipart do envio de foto corrigido, com reprodução controlada anterior, regressões e revisão independente. Relatório original preserva a versão anterior e não certifica a versão publicada.

Não somar execuções sobrepostas. Resultados locais não comprovam entrega de e-mail, permissões remotas, construção Docker ou operação jurídica.

## Evidências da homologação externa

- [x] Imagem Docker construída e serviço HTTPS publicado: implantação `a95f6d9d-c094-49bd-8673-4d51fde633e5`, revisão `434a341f`, estado `SUCCESS`.
- [x] Branch Neon de homologação separado: `petcore-homologacao-20261106`.
- [x] Destinos separados para fotos e backups criados; variáveis de referência configuradas.
- [x] Configurações diretas do serviço definidas para Dockerfile, início, pré-deploy e saúde.
- [x] Ensaio HTTPS de 12 verificações: saúde/banco, contato público, cookie seguro, configuração de recuperação sem envio, Free, origens, isolamento/permissões, fotos privadas normalizadas, substituição/exclusão, exportação e anonimização.
- [x] Todos os registros e objetos fictícios desse ensaio foram removidos; nenhuma cobrança ou mensagem foi enviada por ele.
- [x] Migrations 001–013 presentes na homologação e no banco original, confirmado como somente testes. Atualizações após a cópia de preservação `br-quiet-mountain-b62dyl9j`.
- [x] Manutenção a cada 15 minutos e backup diário às 03h de Brasília executados com confirmação.
- [x] Backup remoto e restauração isolada conferiram 46 tabelas; registro do backup com prefixo `ff3dc3a4` ficou `verified`. O dump não inclui fotos.
- [x] Um teste de e-mail aceito pelo Resend; usuário confirmou recebimento na pasta Spam.
- [x] Variáveis de recuperação aplicadas na revisão publicada; configuração conferida sem enviar mensagem real.
- [x] Serviço de lembretes criado/configurado para cada cinco minutos; autorização do usuário limitada a tutores com opt-in.
- [x] Revisão `434a341f` publicada na aplicação, manutenção e lembretes. Ensaio atual com 12 verificações HTTPS aprovado, incluindo configuração de recuperação sem enviar e-mail; dados e fotos fictícios removidos.
- [x] Lembretes ativados por autorização expressa, cron de cinco minutos, até 20 por execução e prazo de 10s por envio. Execução em 06/11/2026 às 22h55 de Brasília: nenhum lembrete autorizado devido, zero mensagens enviadas.
- [ ] Confirmar registros do remetente no painel Resend e resultados SPF/DKIM/DMARC do e-mail recebido; acompanhar entrega. Ver [EMAIL.md](EMAIL.md).
- [ ] Conferir retenção, alertas, guarda da chave e recuperação dos objetos de fotos.

Aplicativo HTTPS: [petcore-homologacao.up.railway.app](https://petcore-homologacao.up.railway.app). Esse endereço e a revisão acima já foram conferidos; não comprovam automaticamente a publicação de revisões posteriores.

## Pendências para comercialização

- [ ] Revisão e aprovação dos termos, aviso de privacidade, contrato de operação e fornecedores/regiões efetivos.
- [ ] Retenção, incidentes, resposta a titulares, encerramento e transferência de administração praticáveis e aprovados.
- [x] Novos links conferidos sem compra: [PetCore Mensal — R$ 35](https://pag.ae/82jFKCTjo) e [PetCore Anual — R$ 350](https://pag.ae/82jFLbrjr); revisão aprovada no cadastro dos planos. Links antigos substituídos.
- [ ] Publicação jurídica final: permanece desativada e ainda condiciona a liberação do checkout no aplicativo.
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
