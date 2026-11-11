# PetCore — preparação comercial

Registro de evidências e pendências da preparação comercial. A homologação e as correções móveis/de cobrança estão publicadas; a aprovação operacional/jurídica ainda precisa de conclusão. Não é uma certificação de conformidade.

## Código implementado

- [x] Clientes/tutores, pets, profissionais, serviços, jornadas, agenda e lista de espera.
- [x] Táxi Dog opcional: motoristas, buscas/entregas ligadas ao atendimento, agenda separada, taxa na comanda, cancelamento e proteções de retorno/privacidade. Sem GPS. Evidências locais da revisão de 11/11/2026: 152 testes aprovados, compilação e conferência de fontes desktop/móvel; publicação remota conferida em [TAXI-DOG.md](TAXI-DOG.md).
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
- [x] Correções móveis implementadas após capturas do APK: ações do atendimento em grade com botões de 48 px; guia/resumos com corpo de 16 px e secundários de pelo menos 14 px; cadastros em cartões com rótulos e e-mails longos sem rolagem lateral.
- [x] Página de assinatura sem a explicação longa do PagBank; Assinar agora solicita o checkout autorizado à API e mantém continuação por link se a janela não abrir.
- [x] Migrations controladas, manutenção e scripts de backup criptografado/restauração.
- [x] Código de lembretes com consentimento e controles de envio; isso não significa envio ativado.

## Evidências locais registradas

- [x] Rodada completa anterior: 103 testes aprovados, sendo 18 unitários e 85 de integração, incluindo comercial 19/19, autenticação 11/11, lembretes 8/8 e regressões de upload. As integrações são executadas em série no banco exclusivo para evitar sobreposição das configurações globais usadas pela suíte comercial.
- [x] Autenticação: 11 testes aprovados; lembretes: 8 testes aprovados. Incluídos nos 103 da rodada completa, sem duplicar a contagem.
- [x] Correções atuais: 25 testes comerciais de integração aprovados em PostgreSQL isolado novo com migrations 001–014; 13 testes unitários web aprovados para a ponte Android/checkout. API e interface compilaram. Não somar essa rodada aos 103 anteriores como uma nova suíte completa.
- [x] Ensaio local de interface: botões de atendimento em 360 px; clientes em 320/360 px sem excesso horizontal e com fonte de 16 px; guia/resumos com corpo de 16 px e secundários de 14 px. Checkout anual capturou o endereço correto sem abrir o provedor; cancelamento solicitado e confirmado ficticiamente pelo operador preservou Pago até.
- [x] Backup local AES-256-GCM e restauração em banco isolado: 46 tabelas e contagens conferidas; chave errada, destino ocupado e origem recusados. Não inclui fotos.
- [x] Verificações locais anteriores de login, CRM e modais em computador/celular com dados fictícios.
- [x] Compilação final de API/interface aprovada; TypeScript e Sass conferidos após a reorganização da agenda.
- [x] Jornada fictícia pela interface: serviço, profissional/jornada, cliente, pet e agendamento no celular. Novo atendimento passa a mostrar sua data automaticamente; filtros antigos não o escondem.
- [x] Agenda conferida em 360×740 e 1366×850; login com cachorro inteiro em 320×568 e 360×740. Posição dos avisos mantida.
- [x] Revisão estática concluída; limite de campos multipart do envio de foto corrigido, com reprodução controlada anterior, regressões e revisão independente. Relatório original preserva a versão anterior e não certifica a versão publicada.

Não somar execuções sobrepostas. Resultados locais não comprovam entrega de e-mail, permissões remotas, construção Docker ou operação jurídica.

## Evidências da homologação externa

- [x] Publicação conferida em 11/11/2026 às 19h41 de Brasília: commit `dd90bd405d67fb353704189bed2d27d8282eb67e`, implantação `2753295b-8d14-4883-910a-c09fc784f329` com SUCCESS. Página e saúde responderam 200, com `{ok:true,database:true}`; sessão e opções de transporte anônimas retornaram 401. Os assets `index-BoZ2FMKK.js` e `index-DyZcqTWU.css` corresponderam ao build local por SHA-256. Os cinco serviços estavam sem problemas, falhas recentes ou alterações pendentes. Migrations 001–015 foram conferidas na homologação e no banco original; o recurso permaneceu desativado e sem reservas fictícias em ambos.

- [x] Revisão histórica `d463fa12`, implantação `00a6dea0-7d32-4b9e-8ac0-7cac9276c9fc`, SUCCESS em 09/11/2026 às 21h22 de Brasília. Página/saúde 200, banco OK, sessão anônima 401 e assets `index-C_n1QduZ.js`/`index-DpZQfskv.css` idênticos ao build local por SHA-256; cinco serviços sem problemas, falhas recentes ou alterações pendentes.
- [x] Branch Neon de homologação separado: `petcore-homologacao-20261106`.
- [x] Destinos separados para fotos e backups criados; variáveis de referência configuradas.
- [x] Configurações diretas do serviço definidas para Dockerfile, início, pré-deploy e saúde.
- [x] Ensaio HTTPS anterior de 12 verificações na revisão `434a341f`: saúde/banco, contato público, cookie seguro, configuração de recuperação sem envio, Free, origens, isolamento/permissões, fotos privadas normalizadas, substituição/exclusão, exportação e anonimização.
- [x] Todos os registros e objetos fictícios desse ensaio foram removidos; nenhuma cobrança ou mensagem foi enviada por ele.
- [x] Migrations 001–014 presentes na homologação e no banco original, confirmado como somente testes. A 014 foi aplicada pelo pré-deploy `2f176aca-c7b5-47a8-9ac1-8a95e9c445d4` e pelo comando de migration no original. A cópia anterior `br-quiet-mountain-b62dyl9j` permanece registrada.
- [x] Manutenção a cada 15 minutos e backup diário às 03h de Brasília executados com confirmação.
- [x] Backup remoto e restauração isolada conferiram 46 tabelas; registro do backup com prefixo `ff3dc3a4` ficou `verified`. O dump não inclui fotos.
- [x] Um teste de e-mail aceito pelo Resend; usuário confirmou recebimento na pasta Spam.
- [x] Variáveis de recuperação aplicadas na revisão publicada; configuração conferida sem enviar mensagem real.
- [x] Serviço de lembretes criado/configurado para cada cinco minutos; autorização do usuário limitada a tutores com opt-in.
- [x] Registro histórico da revisão `434a341f` na aplicação, manutenção e lembretes, com 12 verificações HTTPS aprovadas. A aplicação atual usa a revisão final acima; esse ensaio anterior não foi repetido integralmente nesta entrega.
- [x] Lembretes ativados por autorização expressa, cron de cinco minutos, até 20 por execução e prazo de 10s por envio. Execução em 06/11/2026 às 22h55 de Brasília: nenhum lembrete autorizado devido, zero mensagens enviadas.
- [ ] Confirmar registros do remetente no painel Resend e resultados SPF/DKIM/DMARC do e-mail recebido; acompanhar entrega. Ver [EMAIL.md](EMAIL.md).
- [ ] Conferir retenção, alertas, guarda da chave e recuperação dos objetos de fotos.

Aplicativo HTTPS: [petcore-homologacao.up.railway.app](https://petcore-homologacao.up.railway.app). Esse endereço e a revisão acima já foram conferidos; não comprovam automaticamente a publicação de revisões posteriores.

As capturas do APK enviadas pelo usuário comprovam instalação e uso de algumas telas. As correções posteriores dessas telas e do fluxo de assinatura já passaram pelos testes e compilação locais acima; a publicação final foi concluída e conferida no Railway. Não representam nova versão nativa do APK nem nova execução dos ensaios HTTPS anteriores.

## Pendências para comercialização

- [ ] Revisão e aprovação dos termos, aviso de privacidade, contrato de operação e fornecedores/regiões efetivos.
- [ ] Retenção, incidentes, resposta a titulares, encerramento e transferência de administração praticáveis e aprovados.
- [x] Novos links conferidos sem compra: [PetCore Mensal — R$ 35](https://pag.ae/82jFKCTjo) e [PetCore Anual — R$ 350](https://pag.ae/82jFLbrjr); revisão aprovada no cadastro dos planos. Links antigos substituídos.
- [ ] Publicação jurídica final: permanece desativada e continua sendo uma pendência para a oferta comercial. Por solicitação do usuário, o checkout revisado não depende de `legal.published`; isso não aprova nem publica os documentos.
- [ ] Homologar a operação de cancelamento/recuperação de checkout no PagBank com os controles novos: pedido do cliente, cancelamento real pelo vendedor, referência/senha/período esperado, preservação do período pago e liberação posterior.
- [ ] Proteção da chave de backup e procedimento de recuperação fora do ambiente ativo.
- [ ] Homologação completa antes de receber clientes reais e anunciar.

A conta PagBank atual é PF: checkout externo por links recorrentes e conciliação manual. Não há captura de cartão, integração bancária ou token da API de assinaturas necessário a esse fluxo.

Não há cancelamento automático da recorrência pelos links PF. O botão do cliente registra um pedido de suporte; o operador cancela no provedor e concilia a confirmação, sem reduzir o período pago. O novo plano passa a valer após o novo recebimento. Checkout pendente é persistido por empresa para bloquear assinaturas paralelas e só pode ser liberado manualmente após conferência, reautenticação e justificativa. A confirmação do encerramento resolve os pedidos anteriores daquele ciclo; um novo pagamento exige novo controle de recorrência. O roteiro está em [OPERACAO.md](OPERACAO.md).

## Limites do escopo

O sistema gerencia o pet shop internamente, incluindo vendas no balcão e o Táxi Dog opcional vinculado ao atendimento. Não inclui loja virtual, entrega de produtos, status de pedidos de comércio eletrônico ou emissão fiscal. O transporte usa etapas manuais, sem GPS. Recursos de privacidade não são uma certificação de conformidade. O guia e as evidências de entrega do transporte ficam em [TAXI-DOG.md](TAXI-DOG.md).

A hospedagem começa no endereço do Railway. Um subdomínio futuro da Tiger Tech pode ser configurado depois, sem alterar o site principal agora.

## Referências

- [Guia de publicação](RAILWAY.md) e [operação/recuperação](OPERACAO.md).
- [Privacidade e procedimentos](PRIVACIDADE-LGPD.md).
- [PagBank: recorrência](https://developer.pagbank.com.br/docs/pagamentos-recorrentes).
- [ANPD: direitos e agentes de tratamento](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).
