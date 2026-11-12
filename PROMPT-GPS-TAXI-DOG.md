# Prompt de continuidade — GPS e rotas do Táxi Dog

Preparado em 11/11/2026. **Este documento planeja a próxima implementação; GPS e rotas ainda não foram implementados ou ativados.**

Copie o texto a partir de “Solicitação” para o chat que dará continuidade. Anexe os arquivos atuais que forem necessários: um chat sem acesso ao computador não consegue ler caminhos locais. Nunca anexe `.env`, tokens, senhas ou a pasta `.android-signing/`.

## Solicitação

Continue o **PetCore**, SaaS de gestão de pet shops da Tiger Tech, no projeto `C:\Users\andre\Desktop\petcore-saas`. Quero acrescentar **localização do motorista e exibição de rotas no Táxi Dog do próprio PetCore**. Trabalhe a partir dos arquivos atuais, preserve os recursos existentes e entregue mudanças verificáveis. Se não tiver acesso ao código, peça os arquivos necessários antes de propor alterações como se já conhecesse sua implementação.

Leia primeiro `PROMPT-CHATGPT-GRATUITO.md` e `docs/TAXI-DOG.md`. Esta solicitação autoriza desenvolver GPS e rotas quando este prompt for utilizado, substituindo a restrição anterior de aguardar uma nova solicitação. Não significa que o recurso já exista, esteja publicado ou tenha sido testado em aparelho.

### O que já existe

- Interface React/TypeScript/Vite/SCSS, API Node.js/Express e PostgreSQL no Neon. Hospedagem no Railway; sessão autenticada no servidor e isolamento por empresa.
- Táxi Dog opcional por pet shop, serviços e preços, motoristas, busca e entrega ligadas ao atendimento, horários separados da agenda do profissional, conflitos de motorista, etapas manuais e taxa na mesma comanda.
- Preserve os controles de custódia do pet, volta para casa após cancelamento do banho, bloqueio de alterações após faturamento, snapshots de preço e cobrança única do transporte. O GPS não deve confirmar automaticamente coleta, chegada ou entrega, nem mudar preços por quilômetro.
- O banco tem migrations até `015_taxi_dog.sql`. Confirme a última antes de criar a próxima; não edite migrations já aplicadas.
- `taxi_drivers` ainda não possui vínculo com usuário autenticado; a permissão atual `taxi_dog` permite operar o módulo. Resolva a identidade e o acesso do motorista antes da captura de localização.
- O APK atual é um WebView, pacote `br.dev.tigertech.petcore`, versão 1.0.1/código 2, com permissões de internet e rede. Não possui serviço nativo de localização.

### Experiência desejada

1. O responsável vincula cada motorista a um usuário da mesma empresa. O motorista tem uma área simples com suas próprias viagens, destino, etapas e controles de localização, sem precisar acessar todos os dados do pet shop.
2. Ao começar uma viagem atribuída, o motorista escolhe **Iniciar compartilhamento**. Mostre claramente a atividade, o destinatário da localização e **Parar compartilhamento**. Nunca acompanhe fora da viagem ou antes dessa ação explícita.
3. A equipe autorizada vê, dentro do PetCore, o motorista no mapa, o destino, uma rota pelas ruas, distância e previsão de chegada identificada como estimativa. Não precisa usar outro sistema de gestão.
4. Mostre precisão, horário da última posição e estados como sem conexão, permissão negada e localização desatualizada. Uma posição antiga não pode aparecer como acompanhamento ao vivo.
5. Mantenha uma lista acessível com as informações da viagem quando o mapa não carregar. O motorista pode ter um botão para abrir a navegação em um aplicativo de mapas; navegação curva a curva dentro do PetCore não é requisito desta primeira entrega.
6. O acesso inicial ao mapa é da equipe autorizada da empresa. Links públicos de acompanhamento para tutores ficam para uma solicitação futura.

### Localização no navegador e no APK

- Navegador: implementar captura por geolocalização em contexto seguro, com permissão do usuário e indicação das limitações. Tratar como alternativa em primeiro plano; não prometer rastreamento contínuo ao fechar, ocultar ou suspender a página.
- Android: implementar captura nativa adequada à versão do Android, com serviço de localização em primeiro plano, notificação persistente e ação de parar. O motorista inicia enquanto o app está visível. Avaliar permissões necessárias conforme a documentação oficial vigente; não solicitar acesso permanente em segundo plano por conveniência.
- O objetivo no APK é continuar durante uma viagem com a tela apagada ou outro app aberto. Isso exige uma nova versão instalada e testes em aparelho. Não alegar que uma atualização da página, sozinha, acrescenta essa capacidade ao APK atual.
- Preservar origem HTTPS permitida, cookies, autenticação e restrições da ponte nativa. Não expor a sessão em JavaScript nem criar uma ponte ampla. Se o serviço precisar de credencial própria, limitar a viagem/dispositivo, validade e escopo, com revogação e armazenamento adequado.
- Parar captura e revogar a autorização de rastreamento ao concluir/cancelar a viagem, encerrar a sessão, trocar o motorista ou perder autorização. Em perda de rede, aplicar prazo e comportamento documentados; ao reconectar, o servidor deve revalidar a viagem antes de aceitar novos envios.

### Mapas, endereços e rotas

- Diferenciar posição GPS de cálculo de rota: um ponto no mapa não produz, sozinho, o caminho pelas ruas ou o tempo de chegada.
- Pesquisar fornecedores na documentação oficial, apresentar uma recomendação com limites, custos e condições de uso verificáveis e implementar uma integração substituível. Não presumir gratuidade ilimitada, usar infraestrutura pública de demonstração comercialmente ou ativar cobrança/contratar serviços sem autorização.
- Preparar exemplos de variáveis sem segredos. Chaves secretas ficam no servidor; se o mapa precisar de chave pública no navegador, restringi-la às APIs e origens permitidas conforme o fornecedor. Nunca pedir chaves reais no chat.
- Cadastrar e confirmar endereço/coordenadas do **próprio pet shop por empresa**. O endereço da Tiger Tech nos documentos jurídicos não é a origem dos transportes dos clientes.
- Confirmar a localização do tutor a partir do endereço da reserva, com correção manual quando houver ambiguidade. Não enviar endereços ou coordenadas reais para um fornecedor durante protótipos; usar dados fictícios até a configuração apropriada.
- Na busca, o destino é o tutor antes da coleta e o pet shop depois da coleta. Na entrega, o destino é o tutor. Respeitar as etapas existentes e não reorganizar compromissos automaticamente.
- Calcular rotas viárias e exibir distância/tempo estimados; limitar recálculos, frequência, consumo e cache conforme os termos do provedor. Não consultar a API de rotas a cada posição recebida nem desenhar uma linha reta apresentada como rota real.

### Acesso, dados e privacidade

- Separar o acesso do motorista às próprias viagens da permissão da equipe que organiza transportes. Empresa, usuário e atribuição devem ser verificados no servidor em cada envio/consulta; não confiar em `tenant_id` ou `driver_id` enviados pelo aparelho.
- Autorizar captura somente em uma viagem ativa atribuída ao motorista. Preservar o bloqueio de duas viagens simultâneas e impedir acompanhamento entre empresas ou por usuários sem acesso.
- Validar latitude/longitude, precisão, horários de captura e recebimento, tamanho e frequência dos envios. Rejeitar posições antigas, fora de ordem ou com horário futuro indevido; reenvios não podem duplicar registros ou fazer dados antigos parecerem atuais.
- Começar pela última posição válida por viagem, com atualização autenticada e uso controlado da infraestrutura existente. Histórico detalhado de deslocamentos só deve existir se houver finalidade, retenção e necessidade definidas; não guardar posições indefinidamente por padrão.
- Explicar finalidade, quem acompanha e quando a coleta termina. A permissão do Android ou navegador, sozinha, não equivale à conformidade com a LGPD. Atualizar os documentos e procedimentos pertinentes, mantendo a necessidade de revisão jurídica.
- Integrar localização aos procedimentos aplicáveis de acesso, exportação, retenção e exclusão. O motorista também é titular de dados. Não copiar coordenadas/endereço para logs gerais ou auditorias desnecessariamente; preservar a proteção que impede apagar o endereço de um pet em trânsito ou aguardando retorno.

### Visual e recursos a preservar

- Manter o mesmo cachorro, identidade PetCore, fontes legíveis e espaçamento. Desktop: corpo/campos/ações em 16 px e secundários em pelo menos 14 px; preservar as regras de tipografia do Android, incluindo textos comerciais maiores.
- Manter Hoje, Agenda, Clientes e Mais como a barra de navegação inferior fixa, sem criar outro rodapé. Não mover nem alterar os avisos gerais de sucesso e erro. Mapas e formulários devem caber na largura disponível sem rolagem lateral.
- Preservar agenda, CRM, financeiro, privacidade e cobrança: Free de 30 dias, R$ 35/mês e R$ 350/ano. O fluxo PagBank CPF continua como está; GPS não altera assinaturas ou cancelamentos.

### Verificação e entrega

1. Implementar e testar com posições simuladas e relógio controlado, sem acompanhar pessoas reais ou disparar pagamentos/mensagens. Verificar isolamento entre empresas, motorista incorreto, reatribuição, sessão revogada, viagem encerrada, posições atrasadas e perda/reconexão de rede.
2. Testar mapa indisponível, endereço ambíguo, limites do provedor, permissões negadas/revogadas, interrupção do serviço e ausência de sinal. Estimativas e posições antigas precisam estar corretamente identificadas.
3. Verificar Android em aparelho com tela apagada, outro app aberto, restrições de bateria e perda de rede. Se não houver aparelho disponível, registrar essa pendência e não declarar que o rastreamento em segundo plano foi validado.
4. Gerar novo APK com versão incrementada e **o mesmo certificado privado existente**, sem expor ou substituir a chave. Preservar os controles de origem, arquivos/fotos e navegação existentes. Compilação não substitui teste em aparelho.
5. Entregar código, nova migration, testes pertinentes, configuração de exemplo sem segredos, instruções de ativação/desativação, evidências e atualização dos prompts. Antes de publicar, conferir as mudanças e os testes necessários; relatar o que está implementado, configurado, testado e ainda pendente separadamente.
6. Se faltar fornecedor, credencial ou decisão de custo, concluir a parte independente e explicar a etapa concreta que falta. Não simular um GPS funcionando em produção nem declarar o sistema inteiro pronto para comercialização por causa deste recurso.

### Referências oficiais para revalidar na implementação

- Geolocalização na web: https://www.w3.org/TR/geolocation/
- Permissões e localização no Android: https://developer.android.com/develop/sensors-and-location/location/permissions
- Restrições de início de serviço Android: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- Exemplo de API de rotas: https://developers.google.com/maps/documentation/routes/
- Cobrança e limites dessa API: https://developers.google.com/maps/documentation/routes/usage-and-billing

Essas referências explicam as diferenças técnicas. A presença de uma referência Google não constitui escolha, contratação ou configuração desse fornecedor.
