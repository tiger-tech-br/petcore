# Localização do motorista — Táxi Dog e entregas

Estado em 27/11/2026: implementação local. A última publicação comprovada na Hostinger é a revisão de entregas de 22/11, sem GPS. A migration 025 ainda não foi aplicada na VPS. A disponibilidade deve ser conferida após a implantação, não pela existência destes arquivos.

## Uso pelo pet shop, depois da publicação

1. Em Configurações, abra **Localização e motoristas**. Informe o endereço do pet shop e ative o acompanhamento. Coordenadas do estabelecimento são opcionais e devem corresponder a um ponto confirmado; o sistema não adivinha coordenadas a partir do endereço.
2. Cadastre o motorista ou aproveite um cadastro existente. Vincule uma conta da mesma empresa. Na equipe, conceda **Área do motorista: somente suas viagens e localização**. Para um acesso exclusivo de motorista, retire permissões administrativas desnecessárias.
3. Atribua o motorista ao trecho de Táxi Dog ou à entrega de produtos. A mesma pessoa não pode sair simultaneamente em dois serviços.
4. O motorista entra com a própria conta, abre **Minhas viagens**, avança a etapa e escolhe **Iniciar compartilhamento**. Ele confirma que a equipe e o cliente com link poderão ver sua posição e autoriza a localização no aparelho.
5. Na viagem ou entrega, a equipe abre o acompanhamento. **Gerar link de acompanhamento** oferece um link temporário e QR Code. Compartilhe somente com o cliente daquele serviço; qualquer pessoa que receber esse link poderá acompanhar enquanto ele for válido. Gerar outro link invalida o anterior.
6. A localização é encerrada quando o motorista para ou o serviço termina/cancela. A posição não confirma automaticamente que um pet foi recolhido ou entregue. As etapas continuam sendo registradas pelas pessoas responsáveis.

O GPS é opcional. Pet shops sem transporte podem continuar com o cadastro e a agenda simples. Ativar o GPS não muda preços, duração do banho, estoque, recebimentos ou as regras de custódia do pet.

## Navegador e APK

No navegador, a página deve permanecer aberta e visível. Ocultar a página encerra a captura e exige novo início explícito ao voltar. Navegar dentro do PetCore mantém um aviso de atividade com ação **Parar compartilhamento**. Sair da conta ou trocar de empresa encerra o compartilhamento.

O APK 1.0.2 não tem serviço de GPS. A atualização 1.0.3 acrescenta essa capacidade nativa, com início pela tela visível, permissão de localização e notificação persistente com ação para parar. A captura não deve reiniciar sozinha após reiniciar o aparelho ou encerrar o serviço. Compilação e testes automatizados não comprovam funcionamento com tela apagada em um aparelho real; O arquivo assinado já está em releases/PetCore-1.0.3.apk; consultar os resultados de geração em ANDROID.md.

## Mapas e rotas aprovados

O mapa usa Leaflet e os tiles públicos do OpenStreetMap, com atribuição visível. O provedor recebe a região aproximada mostrada, além dos dados normais de uma conexão. O Referer enviado às imagens contém somente a origem, sem o token do link. Não fazer download de mapas para uso offline, pré-carregamento em massa ou remover a atribuição.

**Abrir rota no Google Maps** abre uma navegação externa para o destino da etapa. O Google Maps calcula a rota e pode usar a localização autorizada pelo próprio usuário. O PetCore não contratou API de rotas e não apresenta distância, tempo previsto ou um trajeto pelas ruas no mapa interno. Não desenhar uma linha reta e chamá-la de rota.

O mapa depende de internet e da disponibilidade do provedor. A posição tem data/hora e precisão aproximada. Mais de 90 segundos sem captura ou recebimento recente é identificado como desatualizado, mesmo que a consulta HTTP tenha acabado de responder. Não confundir última posição com localização atual.

## Acesso e retenção

O servidor revalida empresa, assinatura, permissão, motorista, usuário, atribuição, sessão e estado do serviço. Um link público contém um identificador imprevisível limitado a uma única sessão e não dá acesso a contatos, endereços, conta, outras entregas ou viagens. Tokens de envio ficam em memória no aparelho e não são inseridos em URLs ou auditorias.

Cada sessão dura no máximo 12 horas. Só a última posição é armazenada, sem histórico de percurso. Encerramento limpa coordenadas e credenciais de envio/consulta. Reatribuição, retirada de acesso, troca de senha e desligamento do recurso também impedem consultas ou novos envios autorizados anteriormente. A rotina de manutenção limpa dados vencidos e apaga metadados encerrados após 24 horas. Não aumentar a retenção sem uma necessidade definida.

A exportação privada da empresa inclui os dados operacionais, sem hashes reutilizáveis de acesso. A exportação do tutor omite a localização do motorista. A anonimização verifica transportes ativos e limpa as sessões vinculadas ao serviço encerrado. Os documentos jurídicos continuam rascunhos; este recurso exige que finalidades, fornecedores e procedimentos sejam considerados na revisão já pendente.

## Implantação e validação

- Preservar a migration 016 e o arquivo NUL fora desta entrega. Aplicar somente 025 depois de backup e conferência das migrations existentes.
- Publicar API, interface, dependências Leaflet e manutenção da mesma revisão. Conferir os privilégios do papel de runtime na nova tabela, sem conceder administração ao aplicativo.
- Manter GPS desativado por padrão em todas as empresas. Ativar somente por escolha do responsável; não iniciar localização de ninguém para testar a implantação.
- Conferir saúde, autenticação, recursos estáticos, política de conteúdo para os tiles e um fluxo com coordenadas fictícias. Não usar dados pessoais, cobrar ou enviar e-mails nesse ensaio.
- Atualizar ANDROID.md, prompts e evidências com a revisão efetivamente publicada e resultados reais.

Validação final: **278/278 integrações** em PostgreSQL 18.7 isolado, incluindo **23 casos de GPS e 6 de privacidade**; **45 unidades API**, **40 web** e **12 Java**, todos aprovados. API/web compilaram e o APK 1.0.3 foi assinado com o certificado existente. O lint Android terminou com zero erros e dez avisos. Nenhuma conexão com a VPS, localização real, mensagem ou pagamento ocorreu nesses testes. A primeira conferência visual ficou bloqueada em 27/11. Em 28/11, o IAB voltou: foram conferidos motorista, preferências, QR e mapa público com dados fictícios em 390 e 1366 px; sem excesso horizontal. Botões de ação de 48 px, texto de ações de 16 px e rótulos de preferências de 17 px. Viagens/Mais ficam fixos, em duas colunas e com seleção ativa. Publicação e teste físico continuam pendentes.

No aparelho, testar com um cadastro fictício: início explícito, permissão negada/concedida, notificação, tela apagada, outro aplicativo, perda de conexão, retorno de rede, Parar pela notificação, encerramento da viagem e revogação do link. Verificar também login, Voltar, fotos e exportação existentes. Não declarar segundo plano validado apenas por build ou captura de tela.

Referências: [política dos tiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/), [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html), [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).
