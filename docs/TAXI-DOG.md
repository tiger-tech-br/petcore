# Táxi Dog no PetCore

O transporte é um recurso opcional da mesma empresa no PetCore. A configuração começa desativada: nenhum pet shop recebe corridas, motoristas ou valores fictícios automaticamente. O módulo organiza o transporte de pets relacionado a um atendimento; não é uma loja virtual nem um sistema de entrega de produtos.

## Preparação

1. O responsável ativa o Táxi Dog em Configurações, na configuração de atendimento.
2. Em Serviços, cadastra um serviço do tipo Táxi Dog, com preço e modalidade: busca, entrega ou busca e entrega. O transporte não acrescenta minutos à agenda do banhista ou tosador.
3. No Táxi Dog, cadastra os motoristas e mantém os contatos atualizados.
4. Funcionários que organizam as viagens precisam da permissão Táxi Dog. Essa permissão deve ser concedida somente a quem necessita consultar endereços e contatos para a operação.

## Reserva junto com o atendimento

Em Novo agendamento, selecione os serviços de banho/tosa e o profissional normalmente. Ao solicitar Táxi Dog, escolha o serviço de transporte, endereço, referência, observações e motorista/intervalo para cada trecho solicitado.

A busca deve terminar até o começo do atendimento. A entrega deve começar após o término previsto do atendimento. Os intervalos são verificados na agenda própria dos motoristas, com proteção contra reservas simultâneas. Datas novas são futuras e interpretadas no fuso do pet shop.

A reserva do atendimento e a reserva dos trechos são feitas na mesma transação. Se o motorista já estiver ocupado ou algum dado for inválido, a operação não deixa metade da reserva gravada.

Antes de iniciar o transporte, a equipe pode ajustar a reserva pelo atendimento. Um reagendamento também precisa manter os trechos compatíveis com o novo horário. Após iniciar o transporte, acompanhe as etapas; não substitua a reserva por outra enquanto o pet estiver em trânsito.

## Acompanhamento

O controle registra as etapas informadas pela equipe. Na busca: agendado, a caminho da busca, pet recolhido e chegada ao pet shop. Na entrega: agendado, saída com o pet e entrega ao tutor. O histórico continua ligado ao atendimento.

O banho só começa depois da chegada ou do cancelamento explícito da busca, quando o tutor traz o pet por conta própria. A entrega depende do encerramento do atendimento. Se o banho for cancelado depois de uma chegada registrada, a volta para casa permanece planejada. Um motorista não pode iniciar duas viagens ao mesmo tempo, mesmo que o horário previsto da primeira já tenha passado.

O módulo não coleta localização nem apresenta GPS em tempo real. Não há rastreamento automático, cálculo de distância ou confirmação automática de chegada. O telefone do motorista é um contato de cadastro, não uma integração com o aparelho dele.

## Cobrança

Ao importar o atendimento concluído para uma comanda no Financeiro, o serviço de transporte não cancelado entra uma única vez junto com os serviços do atendimento. A taxa usa o preço combinado quando o transporte foi reservado; mudar o preço no catálogo não altera reservas existentes.

Se o banho foi cancelado e um trecho de transporte já foi realizado, o Financeiro permite importar somente a taxa do transporte, sem cobrar os serviços de banho/tosa cancelados. O cancelamento de todos os trechos antes da criação da comanda retira a taxa da importação. Cancelamentos posteriores não estornam automaticamente uma comanda ou um pagamento já registrado.

Criar a comanda não registra pagamento. A equipe informa o recebimento no Financeiro quando o tutor efetivamente pagar. Depois que a comanda é criada, a reserva e a taxa ficam protegidas contra alteração, enquanto as etapas do transporte continuam disponíveis. Não há cobrança por quilômetro nem cálculo automático de desconto proporcional por trecho cancelado.

## Endereços e privacidade

Endereço, referência e observações ficam na reserva do transporte. A exportação verificada do titular inclui esses dados e os trechos vinculados. A anonimização remove os textos e encerra as viagens ainda agendadas; ela aguarda o encerramento de um transporte em andamento ou de uma entrega pendente após chegada registrada para não apagar o endereço de um pet em trânsito ou aguardando retorno. Auditorias registram identificadores e mudanças de situação, sem copiar o endereço para os metadados.

Revisão jurídica, retenção e procedimentos operacionais continuam no checklist comercial. A presença do módulo não é uma certificação de conformidade.

## Entrega

O mesmo recurso atende ao navegador e ao APK conectado ao serviço. A migration nova é `015_taxi_dog.sql`; as migrations anteriores são preservadas. As evidências de testes e publicação devem ser registradas somente depois de sua execução.

Em 11/11/2026 passaram 20 testes unitários da API, 94 testes de integração existentes, os 20 novos testes de Táxi Dog e 18 testes web (ponte/checkout e datas): 152 verificações ao todo, sem somar execuções repetidas. A compilação da API/interface passou. Na base local de demonstração, a interface foi usada para ativar o módulo, cadastrar serviço e motorista, reservar banho com dois trajetos e avançar as etapas da busca. As reservas não aumentaram a duração do banho. Os testes usaram dados fictícios e nenhum pagamento, e-mail ou cancelamento foi enviado a um provedor real.

A revisão de fontes para desktop foi conferida no navegador em 1024 e 1366 px, com textos principais/campos em 16 px e secundários em pelo menos 14 px. Táxi Dog e formulário também foram conferidos em 320 px, sem excesso horizontal. Não houve teste em aparelho Android nesta rodada. A publicação desta revisão ainda será registrada após conferência remota.
