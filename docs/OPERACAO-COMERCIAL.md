# Operação comercial e privacidade do PetCore

Roteiro de trabalho para José Andrey Pereira Lisboa, responsável pela Tiger Tech, preparado em 13/11/2026 e atualizado para o corte de 20/11/2026. Não publica documentos nem executa cobrança, estorno, cancelamento ou exclusão por conta própria.

## Ambiente efetivo desde 20/11/2026

O PetCore em `https://petcore.tigertech.dev.br` usa aplicação, PostgreSQL 18.7 e armazenamento privado Versity na VPS Hostinger 2162451, em Campinas. A recuperação real de uma cópia nova e de uma foto fictícia foi conferida. O Resend continua como serviço externo de e-mail; avisos de suporte e agendadores estão configurados na VPS. Isso não comprova a entrega de todas as mensagens nem o teste completo de recuperação de senha.

Os cinco serviços e os dois buckets antigos do PetCore foram removidos do Railway após copiar e conferir os arquivos; a exclusão do projeto vazio foi aceita, ainda listado na conferência seguinte. Outros sete projetos da conta foram preservados, e a assinatura da conta não foi cancelada. O Neon continua preservado para retirada pelo responsável, sem conexão ativa do PetCore. Ver [migração e evidências](MIGRACAO-HOSTINGER-20261120.md). Essas alterações técnicas não publicam os termos ou a política de privacidade.

## Condições aprovadas

| Item | Condição |
|---|---|
| Free | 30 dias desde a confirmação, sem cartão nem cobrança automática ao terminar |
| Mensal / anual | R$ 35 por mês / R$ 350 por 12 meses, checkout recorrente PagBank |
| Conciliação e cancelamento | Até um dia útil, de segunda a sexta-feira; priorizar urgências e vencimentos próximos |
| Reembolso voluntário | Valor proporcional ao período pago não utilizado, sem afastar direitos legais |
| Exportação no encerramento | Assistida, na janela de 30 dias corridos, com administrador verificado |
| Backups | Retenção operacional de 30 dias, com exclusão controlada e registro de expiração |
| Atendimento | Suporte no sistema e tigertechbr@outlook.com |

## Rotina do responsável

Em cada dia útil, conferir sino, chamados abertos/em atendimento e avisos que falharam ou ficaram incertos. O e-mail é alerta; sua ausência não apaga o pedido. Ler o chamado não significa resolvê-lo. Registrar providências, datas e resposta ao cliente.

Acompanhar backup, manutenção e lembretes e investigar falhas ou filas acumuladas. Preservar as chaves de cifra e de atualização Android em cópia privada recuperável fora do ambiente ativo. A existência de uma variável no servidor não comprova essa guarda. Ensaiar recuperação após alterações relevantes e periodicamente, sem restaurar sobre produção.

A rotina atual executa manutenção a cada 15 minutos, lembretes a cada cinco minutos e backup às 03h de Brasília, com retenção ativa de 30 dias. Os 15 registros históricos de backup foram classificados como legados e exigem destinação separada; as cópias externas no computador também precisam de rotina de atualização e exclusão. A cópia externa de 20/11 foi autenticada, mas sua continuidade é manual, pelo procedimento do [guia da VPS](../GUIA-HOSTINGER-VPS-DO-ZERO.txt) e por `scripts/archive-hostinger-storage.mjs`. Não considerar uma cópia no mesmo disco da VPS como proteção contra perda do servidor.

No Gerenciador Docker, o projeto principal é `petcore-validation`; banco, objetos e agendadores têm projetos próprios. Tarefas pontuais de migração e verificação podem aparecer paradas após terminar. Conferir finalidade, código de saída e último resultado antes de classificá-las como falha, reiniciá-las ou excluí-las. Não apagar volumes de uma tarefa antiga sem identificar se os serviços ativos ainda os usam; não alterar o projeto BeautyBarber durante a operação do PetCore.

## Pagamento, cancelamento e troca

1. Identificar empresa, plano, titular e transação no produto correto do PagBank. Escolha do plano, retorno do navegador ou comprovante enviado não bastam como confirmação.
2. Conferir o recebimento e registrar referência, data e plano no painel da plataforma. Conferir o período de acesso resultante.
3. O botão vermelho **Cancelar assinatura** cria um pedido. O vendedor autorizado cancela a recorrência no PagBank e confere o resultado, preservando o período já pago. Não criar cobrança só para cumprir um checklist.
4. Em **Confirmar cancelamento no PagBank**, registrar referência, motivo, senha e período esperado. Formulário antigo recusado exige nova conferência. Não retirar travas por SQL.
5. Só liberar nova contratação quando permitido. O novo plano passa a valer após recebimento confirmado. Registrar no chamado a operação, a data e até quando o acesso permanece.

Tentativa abandonada de checkout exige conferir se criou recorrência. A liberação administrativa pede referência, justificativa, reautenticação e confirmação de ausência de recorrência ativa; não expirar a trava automaticamente por idade. Se uma cobrança ocorrer durante o atendimento, analisar a restituição cabível. O pedido do cliente não autoriza continuar cobrando.

O [guia oficial de recorrência](https://developer.pagbank.com.br/docs/pagamentos-recorrentes) distingue o produto disponível para a conta. Para a assinatura criada por Link Recorrente, a [orientação oficial ao vendedor](https://faq.pagbank.com.br/duvida/como-suspender-ou-excluir-uma-assinatura-feita-usando-pagamento-recorrente/104) indica entrar no painel de assinaturas, localizar a assinatura, abrir suas opções, selecionar o cancelamento e confirmar. Conferir o estado e guardar a referência. A documentação do painel de API não deve ser presumida como descrição de todos os recursos do Link Recorrente.

O software e o roteiro podem ser validados com registros fictícios e consulta da documentação. A primeira execução financeira real é registrada quando houver um pedido legítimo ou uma assinatura de teste já disponível e autorizada; não se cria cobrança desnecessária para transformar essa evidência em pré-requisito artificial de lançamento. A consulta do guia não deve ser registrada como se uma recorrência real já tivesse sido cancelada.

## Encerramento antecipado e reembolso proporcional

Cancelar renovação e encerrar antecipadamente são escolhas distintas. Confirmar o pedido expresso, a data de corte, os recebimentos abrangidos e o valor. Aplicar primeiro os direitos obrigatórios que possam exigir restituição integral ou outra providência. A política voluntária não os reduz.

Para cada período pago ainda não totalmente consumido:

`proporcional = valor efetivamente pago × duração restante após a data de corte ÷ duração total do período pago`

Usar início/fim/corte registrados e o mesmo critério para todos os períodos; arredondar para centavos. O resultado fica entre zero e o valor pago ainda não devolvido. Incluir períodos futuros pagos quando cabível, sem duplicar valores nem substituir o preço pago pelo preço atual. Registrar cálculo e dados no chamado.

O titular autorizado executa a devolução no PagBank, confere o resultado e registra referência, valor, data de corte e resposta. Um dia útil é o prazo da providência da Tiger Tech; processamento do provedor ou emissor é informado conforme o caso, sem promessa de crédito instantâneo no cartão.

**Limite do sistema atual:** invalidar recebimento no PetCore é uma ação integral e não executa estorno externo. Não usar essa ação como reembolso parcial. O encerramento deve manter o histórico financeiro e o acesso coerente com a data acordada, por procedimento administrativo registrado. Enquanto não houver operação específica de ajuste parcial, o caso é assistido; não apagar ou reduzir arbitrariamente recebimentos.

## Exportação e destinação

1. Registrar encerramento formal, início/fim da janela de 30 dias e administrador. Verificar identidade e poderes por canal já conhecido; nome conhecido ou novo e-mail não bastam.
2. Confirmar registros e fotos compreendidos na entrega. Excluir senhas, hashes, sessões, tokens, segredos e dados de outras empresas.
3. Gerar exportação assistida com manifesto, contagens e verificações em ambiente protegido. Conferir completude. Relatório ou exportação de um tutor não equivale à empresa inteira; nunca entregar dump global de vários pet shops.
4. Entregar somente ao destinatário verificado, por canal privado, com validade e instruções. Renovar uma entrega autorizada quando um link expirar; a duração desse link não reduz a janela contratual.
5. Ao fim da janela, executar e registrar a destinação dos dados ativos e fotos conforme instruções legítimas e hipóteses de conservação. Os 30 dias não são prazo único de documentos sujeitos a conservação própria.
6. Registrar exclusões/revogações a reaplicar na restauração. Conferir a expiração dos backups separadamente; uma exclusão ativa não é remoção instantânea em todos os fornecedores.

## Direitos e incidentes

O mesmo e-mail recebe pedidos sobre dados pessoais. Identificar o controlador que decide cada pedido, verificar identidade de modo proporcional e registrar solicitação, providência, responsável, prazo e resposta. Não exigir documentos excessivos. A janela comercial de exportação não substitui direitos dos titulares.

Em suspeita de incidente, preservar evidências minimizadas, conter o acesso afetado e registrar quando se tomou conhecimento, empresas e categorias atingidas. Acionar o contato do pet shop com as informações disponíveis e complementar a investigação. Para finalidades próprias, José conduz a avaliação. Seguir o [procedimento oficial da ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis), sem presumir dispensa ou prazo ampliado pelo porte.

## Inventário de fornecedores

Registrar por fluxo: dados, titulares, finalidade, exportador/importador, países, duração, acessos posteriores, hipótese de tratamento, mecanismo de transferência e evidência. A localização de uma máquina não descreve todos os fluxos.

| Fluxo | Fato conhecido | Providência |
|---|---|---|
| Hostinger | Aplicação, PostgreSQL e objetos ativos na VPS em Campinas; a região da VM não descreve suporte, painel ou cópias administrativas | Conferir instrumentos efetivos da conta, acessos, regiões e retenção desses fluxos |
| Versity na VPS | Software de armazenamento privado executado na Hostinger; não foi contratado um novo serviço externo por usar S3 | Acompanhar acesso às fotos, expiração dos backups e recuperação; manter cópia fora do servidor |
| Neon — saída histórica | Banco não é mais usado pelo PetCore; acervo de teste preservado para retirada pelo responsável | Registrar destinação e retenção residual; resposta contratual não é condição para usar o novo banco local |
| Railway — saída histórica | Serviços e buckets do PetCore removidos; exclusão do projeto aceita e outros projetos da conta preservados | Conferir conclusão da saída e retenção residual; não presumir cancelamento da assinatura da conta |
| Resend | Envio por São Paulo não muda armazenamento declarado nos EUA; não assina/anexa cláusulas ANPD | Identificar mecanismo por fluxo; se não houver cabimento válido, limitar ou substituir o fluxo antes de dados reais |
| PagBank | Checkout e conciliação | Conferir condições do produto e dados necessários |
| Outlook | Região exclusiva da caixa não comprovada | Conferir contrato/mecanismo e evitar dados desnecessários nos avisos |

Os fatos técnicos atuais constam da [migração de 20/11](MIGRACAO-HOSTINGER-20261120.md); as declarações contratuais datadas estão no [inventário de fornecedores](INVENTARIO-FORNECEDORES.md), incluindo [Resend](https://resend.com/security) e o [DPA histórico Railway](https://railway.com/legal/dpa). Esses registros não comprovam um instrumento brasileiro firmado por esta conta. Avaliar os fluxos atuais e acompanhar a saída dos antigos separadamente. Cópias e registros contratuais ficam privados, sem tokens ou senhas no repositório.

## Caminhos para transferências

**Instrumento ou destino adequado:** executar mecanismo aplicável ao Brasil ou escolher fornecedor/configuração cuja cobertura esteja comprovada, incluindo transferências posteriores. A [ANPD](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados) reconhece a União Europeia pela Resolução 32/2026; isso não torna automaticamente adequado armazenamento nos EUA ou valida cláusulas estrangeiras não reconhecidas.

**Necessidade demonstrável:** o art. 33, IX, combinado com art. 7º, II, V ou VI, é possibilidade legal preservada pela Resolução 19. É preciso justificar necessidade e hipótese no caso concreto. Execução contratual considera contrato do qual o titular seja parte; o contrato Tiger Tech–pet shop não enquadra automaticamente todos os tutores, empregados e terceiros. Preço ou conveniência, isoladamente, não demonstram esse enquadramento. Não preencher o inventário em bloco sem análise e evidências do controlador.

**Consentimento específico, quando cabível:** art. 33, VIII, exige manifestação destacada e informação prévia do caráter internacional, distinta de outras finalidades. Checkbox geral, aceite dos termos e autorização atual de lembrete não provam esse consentimento. Avaliar liberdade, revogação e viabilidade do serviço; não transformar consentimento forçado em solução universal de infraestrutura.

Escolher e documentar o caminho efetivo antes de declarar o fluxo apto a dados reais. Não é necessária autorização individual da ANPD para todo mecanismo que já tenha cabimento legal, nem se pode substituir a avaliação por uma declaração genérica de conformidade. Fontes: [LGPD, arts. 7º e 33](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html) e [Resolução 19, Anexo I, arts. 1º e 9º](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024).

## Liberação

As condições comerciais escolhidas não precisam ser perguntadas novamente. A migração técnica, os ensaios de banco/fotos e a configuração das rotinas têm evidências de 20/11; acompanhar sua execução e a continuidade da cópia externa. Permanecem a recuperação de senha completa e a entrega de e-mails no destino atual, a revisão dos fluxos/contratos efetivos e a aprovação/publicação dos textos completos pelo responsável. Os registros de saída de Railway e Neon não os tornam dependências ativas do lançamento. Não remover marcadores para simular aprovação. Registrar os ensaios efetivos e a implantação atual, sem somar rodadas históricas ou chamar navegador de teste físico.
