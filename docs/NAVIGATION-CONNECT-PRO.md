# PetCore — Navigation Connect Pro (decisão de 23/11/2026)

Substitui o plano anterior de captura de GPS pelo próprio PetCore. Google Maps/Waze executam navegação e telemetria; PetCore administra viagens, autorização, status operacional e acesso do cliente. Não utilizar trackingPolicy.validatePosition para rejeitar telemetria do Google (não inclui precisão de GPS bruto e o intervalo padrão é 60 s). A migration 025 e vínculo de motoristas permanecem candidatos, não publicados.

## Implementação parcial
- api/src/navigationConnectPro.ts: adaptador REST CreateTrip/GetTrip com OAuth injetável, config padrão Pro, URLs oficiais e normalização de localização, distância e ETA. Sem chamadas automáticas, sem dependências adicionais, sem captura local.
- api/tests/navigationConnectPro.unit.test.ts: oito testes com HTTP simulado; ainda não executados.
- Dados com mais de 150 s são ocultados; nenhum trajeto restante ou tráfego é solicitado.
- Não montar endpoint público diretamente sobre o adaptador. Falta a camada de autorização transacional, persistência de identificadores, limite de criação de viagens, associação do motorista e destinos confirmados, revogação local, e a interface.
- Para evitar custos, iniciar com REST pull coordenado por viagem (não por visitante), sem Pub/Sub e sem opções Enterprise. Definir teto mensal global antes da ativação. Não enviar dados reais antes da revisão jurídica e das políticas do provedor.

## Configuração externa pendente
1. Projeto Google Cloud, faturamento e habilitação Navigation Connect, verificação do aplicativo Android e informações de privacidade. Confirmar elegibilidade do APK existente, certificado e requisitos de desenvolvedor. Não criar outra chave de assinatura.
2. OAuth 2.0 com credenciais de servidor/ADC, mínimo privilégio, configuração fora do Git. Não utilizar token permanente em variável de ambiente ou enviar credenciais ao navegador. Adaptador recebe função que obtém token válido.
3. APK Android: abrir URL oficial via Intent com EXTRA_REFERRER_NAME e PendingIntent de retorno, mantendo restrições de origem e ponte nativa. Não habilitar rastreamento próprio em background. Navegação normal por URL sem token continua alternativa, mas não oferece telemetria integrada.
4. Google Maps Android >= 26.14 ou Waze >= 5.15.5; navegação conectada exige modo carro e consentimento. Não prometer rastreamento em navegador, modo moto ou Google Maps iOS. Confirmar no aparelho.
5. Táxi Dog: uma sessão por destino; busca até tutor e depois até pet shop são destinos distintos. Nunca transformar chegada do Google em confirmação de custódia, entrega, cobrança ou estoque.
6. Cliente: link imprevisível por entrega, com expiração, revogação e acesso somente à posição autorizada. Sem linha de rota restante no Pro. Exibição de mapa Google deve respeitar atribuição e pode ter cobrança separada; não ativar outro SKU sem autorização.

## Validação
Executar em cópia de desenvolvimento:
`node --import tsx --test api/tests/navigationConnectPro.unit.test.ts`
`npm run build -w api`
Testar OAuth, aplicativo verificado, consentimento negado, perda de rede, encerramento, isolamento e custos antes de publicar. Sem testes reais ou ativação nesta etapa.

## Documentação oficial consultada em 23/11/2026
- https://developers.google.com/maps/documentation/navigation/connect/setup-overview-requirements
- https://developers.google.com/maps/documentation/navigation/connect/create-trip
- https://developers.google.com/maps/documentation/navigation/connect/launch-navigation-app
- https://developers.google.com/maps/documentation/navigation/connect/retrieve-trip-data
- https://developers.google.com/maps/documentation/navigation/connect/usage-and-billing
- https://developers.google.com/maps/documentation/navigation/connect/policies
Preview sem cobrança da API; preços previstos pós-GA: Pro franquia global 5.000 viagens/mês e US$5/1.000 na primeira faixa excedente. Viagens são cobradas ao primeiro payload, não por consulta. Mapas e outros serviços podem ser cobrados separadamente. Não considerar a gratuidade garantida.

## Decisão aprovada — carro e motocicleta

- Carro: Navigation Connect Pro, quando o recurso for habilitado e configurado, com alternativa de navegação externa sem token.
- Moto: navegação externa exclusivamente. Google Maps usa travelmode=two-wheeler, Waze usa vehicle_type=motorcycle. Não criar viagens Pro nem anexar tokens a links de motocicleta. O adaptador rejeita explicitamente essas operações.
- A interface futura deve selecionar o veículo da viagem antes de solicitar uma sessão; não assumir carro para entregadores. O servidor deve validar o veículo registrado, não confiar apenas em parâmetros enviados pelo navegador.
- Para motoboy, o cliente acompanha os status operacionais do PetCore; compartilhamento nativo do aplicativo de navegação é manual e depende da disponibilidade no aparelho. Não prometer mapa/ETA integrado, nem aceitar URLs arbitrárias sem validação. Não coletar localização pelo PetCore.
- Para Táxi Dog, manter o transporte de pets adequado e as regras de custódia existentes; não introduzir transporte de animais por motocicleta.
- Testes reais no Android e interface ainda pendentes; nada foi ativado na Hostinger.

Referências oficiais de URLs:
- https://developers.google.com/maps/documentation/urls/get-started
- https://developers.google.com/waze/deeplinks/
