# Continuar o GPS do PetCore — 27/11/2026

Continue o projeto existente PetCore. O GPS para Táxi Dog e entregas de produtos **já foi desenvolvido localmente**. Não recrie esse trabalho. Leia PROMPT-CHATGPT-GRATUITO.md, docs/TRACKING.md e docs/ANDROID.md. Um chat sem acesso ao computador precisa receber os arquivos de código necessários; nunca envie .env, senhas, tokens, chaves ou pastas privadas.

## Decisões aprovadas

- O mesmo PetCore atende vários pet shops. GPS opcional por empresa, sem forçar uso em quem trabalha só com banho e tosa.
- Leaflet e mapa OpenStreetMap com atribuição. Rotas abertas externamente pelo botão Google Maps. Não contratar APIs ou recursos pagos sem orçamento aprovado.
- O motorista tem conta vinculada ao cadastro da mesma empresa e permissão transport_driver. Minhas viagens mostra somente serviços atribuídos. A equipe atribui o motorista no Táxi Dog ou entrega.
- Captura somente depois de ação explícita durante serviço ativo. Mostrar atividade e Parar compartilhamento. No navegador, ocultar a página encerra a captura. O APK 1.0.3 usa serviço nativo com notificação; testar fisicamente antes de afirmar suporte validado a tela apagada.
- Link e QR /acompanhar/<token> temporários por serviço. Cliente vê apenas estado/posição/atualização/precisão; não recebe acesso a contatos, endereços, contas ou outras viagens.
- Última posição apenas; sem histórico de percurso. Sessão máxima de 12 horas, desatualizado após 90 segundos; encerramento revoga credenciais e limpa coordenadas. Manutenção limpa metadados após 24 horas.
- GPS não conclui etapas, não calcula tarifa por quilômetro e não registra pagamento. Preservar custódia dos pets, conflitos, cobrança única, estoque e isolamento por empresa.

## Arquivos e estado

Migration nova: api/sql/025_transport_tracking.sql. Foi aplicada no PostgreSQL 18.7 local isolado, **não na Hostinger**. Não execute, modifique ou publique api/sql/016_taxi_driver_accounts.sql; não mexa no arquivo NUL.

API: trackingRoutes.ts, trackingService.ts; integrações com autenticação, transporte, financeiro, privacidade, manutenção e exportação privada. Interface: DriverTrackingPage, TrackingPanel, TrackingLocationView, PublicTrackingPage, TransportSettingsPanel, TrackingActivityBar e trackingCapture. Android: TrackingService, TrackingHttp, TrackingPolicy e ponte separada PetCoreTracking, preservando exportação/fotos/navegação existentes.

Passaram **278 integrações** na rodada final, incluindo **29 específicas (23 GPS e 6 privacidade)**. Também passaram 45 unidades API, 40 web e 12 Java, com API/web compilados. APK 1.0.3 assinado, v2/v3 válidas, certificado preservado; lint zero erros/dez avisos. UI visual bloqueada por timeout do canal nativo na primeira chamada IAB. Nenhuma publicação ou teste físico GPS foi realizado.

Último runtime publicado comprovado: b6ababb505caf8af76592a0a5127c8d58ae4cbe3 (22/11), em https://petcore.tigertech.dev.br. Aplicação, PostgreSQL e armazenamento ficam na Hostinger VPS 2162451. Não recriar Railway ou Neon. Beauty Barber compartilha a VPS e não deve ser alterado.

## O que concluir

1. Conferir código e contratos entre API, web e Android; corrigir somente falhas demonstradas. Executar testes e build proporcionais à alteração. Verificar interface em celular e desktop com dados fictícios.
2. O APK 1.0.3/código 4 já foi gerado: releases/PetCore-1.0.3.apk; SHA-256 5c7673a451a2161defb9050022c6192a75942bec572eefcb2eb556d8912f3118. Certificado preservado. Depois da publicação, orientar teste físico de permissões, notificação, tela apagada, Maps, perda de rede e parada. Nunca substituir a chave ou publicar material privado. Manter o 1.0.2 preservado.
3. Recuperar acesso administrativo autorizado à Hostinger por um meio disponível. O controle do navegador foi interrompido por não confirmar a URL do Chrome. Não contornar esse bloqueio e não dizer que uma publicação ocorreu.
4. Com acesso disponível, criar backup antes da migration, aplicar 025 com papel apropriado, verificar grants restritos e publicar revisão exata de API/web/manutenção. Conferir saúde e ensaio fictício com limpeza. GPS continua desativado por padrão; não captar localização real para o ensaio.
5. Registrar revisão, banco e resultados em docs/evidence, atualizar os dois prompts e fornecer APK para teste físico. Se o acesso continuar indisponível, entregar código/binário e explicar a etapa concreta necessária à publicação.

Não prometer rota pelas ruas, distância ou previsão de chegada dentro do PetCore: esses cálculos são feitos pelo Google Maps externo. Não declarar adequação jurídica, aprovação de contratos ou liberação comercial: documentos continuam rascunhos. Preservar Free 30 dias, mensal R$ 35 e anual R$ 350, cachorro inteiro no login, fontes legíveis, avisos existentes e navegação móvel fixa sem rodapé adicional.
