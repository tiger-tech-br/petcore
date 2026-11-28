# Continuação do PetCore — estado atual em 27/11/2026

## GPS — implementação local em 27/11, publicação pendente

Foi desenvolvido acompanhamento para **Táxi Dog e entregas de produtos**, no mesmo PetCore. O responsável aprovou OpenStreetMap no mapa e um botão para abrir a rota no Google Maps, sem contratar API paga. O mapa interno mostra a última posição; **não calcula rota pelas ruas, distância ou previsão de chegada**. A navegação acontece no Google Maps.

Configurações → Localização e motoristas permite ativar o recurso, informar o endereço do pet shop e vincular um motorista a uma conta da mesma empresa. A permissão transport_driver dá acesso a **Minhas viagens**, restrito aos serviços atribuídos. O motorista inicia explicitamente e pode parar. A equipe acompanha na viagem/entrega e gera link e QR temporários /acompanhar/<token> para o cliente, sem revelar endereço, telefone ou outros pedidos na página pública.

No navegador a captura termina quando a página fica oculta. O APK **1.0.3/código 4** foi gerado e assinado com o mesmo certificado das versões anteriores. Inclui serviço de localização e notificação para uso com tela apagada; o 1.0.2 não possui essa capacidade. Arquivo: releases/PetCore-1.0.3.apk, 1.765.062 bytes, SHA-256 5c7673a451a2161defb9050022c6192a75942bec572eefcb2eb556d8912f3118. **Não declarar teste físico de GPS ou publicação concluída.** Consulte docs/TRACKING.md, docs/ANDROID.md e as evidências antes de orientar a instalação.

Cada sessão dura no máximo 12 horas, guarda somente a última posição e marca dados com mais de 90 segundos como desatualizados. Encerrar/cancelar o serviço, retirar a atribuição ou revogar o acesso invalida o acompanhamento. A manutenção limpa posições e credenciais vencidas e remove metadados encerrados após 24 horas. A exportação do tutor não inclui GPS do motorista. Esses controles não publicam os documentos jurídicos.

A migration nova é **025_transport_tracking.sql**, aplicada somente no PostgreSQL local isolado. **Ainda não foi aplicada na Hostinger.** A rodada completa final passou em **278 integrações**, incluindo **29 casos específicos** (23 GPS e 6 privacidade). Também passaram 45 testes de unidade API, 40 web e 12 Java; os cinco testes de rascunhos foram repetidos após atualização, sem somá-los novamente. API e web compilaram. Android teve lint sem erros e 10 avisos, build e assinatura v2/v3 válidos. Não somar rodadas anteriores. A primeira prévia visual de 27/11 ficou bloqueada, mas em **28/11 o acesso IAB voltou**: telas do motorista, mapa público, estado desatualizado/encerrado, preferências e QR foram conferidos com dados fictícios em 390 px e 1366 px, sem excesso horizontal. A navegação exclusiva do motorista distribui Viagens/Mais em duas colunas, com a página ativa destacada. O painel Hostinger está acessível; falta concluir a implantação controlada e o teste físico de GPS. Não anuncie GPS ativo em produção antes da verificação publicada.

O último runtime publicado comprovado continua sendo b6ababb505caf8af76592a0a5127c8d58ae4cbe3, de 22/11, descrito abaixo. As descrições históricas sem GPS referem-se a ele.

## Atualização de 22/11 — entregas e catálogo publicados

A revisão `b6ababb505caf8af76592a0a5127c8d58ae4cbe3` foi publicada em https://petcore.tigertech.dev.br. Entregas opcionais recebem pedidos internos de WhatsApp/telefone e solicitações do catálogo público com link e QR próprios. O cliente escolhe produtos marcados para o catálogo; confirmar o pedido cria uma única comanda e baixa de estoque. As etapas são Preparando, Saiu para entrega, Entregue e Cancelado. Taxa fixa ou a combinar; recebimento registrado no Financeiro, sem cobrança on-line automática. Não há GPS/rotas nesta revisão; a ampliação para produtos e Táxi Dog está no prompt específico.

Passaram 45 testes da API, 24 do web e 247 integrações em banco isolado. Um ensaio pelo HTTPS publicado passou em 12 verificações, preservou a repetição sem duplicações e removeu os dados temporários; sem e-mail ou pagamento real. O banco tem 58 tabelas e 23 migrations, com 023/024 e sem 016. Aplicação e agendadores usam a nova versão; Beauty Barber preservado. APK 1.0.2 recebe a interface remota ao reabrir; não houve novo teste físico destas entregas. Os documentos jurídicos continuam rascunhos. Resultados detalhados em `docs/evidence/DELIVERY-RELEASE-20261122.json`.


Você está continuando o projeto PetCore da Tiger Tech, um único SaaS para vários pet shops. Trabalhe no projeto existente; não recrie o sistema. O responsável é José Andrey Pereira Lisboa, pessoa física, usando a marca “Tiger Tech — Sites, Sistemas e Soluções Digitais”. Suporte e privacidade: tigertechbr@outlook.com. A identidade e o endereço autorizados já estão nos rascunhos existentes; preserve-os.

## O que está publicado e como funciona

O PetCore está em https://petcore.tigertech.dev.br, na VPS Hostinger 2162451. Aplicação Node.js, PostgreSQL 18.7 com TLS, fotos e backups privados no Versity ficam nessa VPS. Resend continua como provedor de e-mail. Railway e Neon são históricos, sem conexão no ambiente atual. Não recrie serviços neles. O Beauty Barber usa a mesma VPS e é outro projeto: não altere seus contêineres, banco, arquivos ou rede.

Última revisão publicada comprovada: b6ababb505caf8af76592a0a5127c8d58ae4cbe3, em 22/11. Aplicação e agendadores usam o volume petcore_delivery_ed8a7940_20261122 em montagens somente de leitura, com a imagem base acde9dde. As migrations 023/024, entregas e catálogo foram publicados e conferidos. O teste HTTPS removeu os registros temporários. Consulte docs/evidence/DELIVERY-RELEASE-20261122.json; a implantação anterior bc1b48dc continua documentada como histórico.

O banco da revisão publicada acima tem 58 tabelas e 23 migrations: 001–015 e 017–024. A preparação local de GPS acrescenta 025 e uma tabela, ainda sujeitas à aplicação controlada na VPS. A migration 016 pertence a trabalho separado e NÃO foi aplicada; não a execute, modifique ou publique. Não mexa no arquivo NUL. A pasta local tem várias mudanças autorizadas antigas; não descarte alterações nem faça publicação indiscriminada.

## Simplificação feita

- “Adicionar cliente” abre um único formulário para o responsável e um ou mais pets. Campos adicionais ficam recolhidos. Continua possível cadastrar somente o cliente. O cadastro completo é transacional e uma nova tentativa usa a mesma chave para evitar duplicação.
- A lista de clientes mostra os pets vinculados, permite “Adicionar pet” e oferece o atalho de agendamento com cliente/pet preenchidos.
- Hoje tem “Agendar atendimento” e “Cadastrar cliente e pet”; os primeiros passos são serviços, quem atende/horários, cliente/pet e agendamento. Financeiro é apresentado depois.
- “Quem atende e horários” aceita os próprios donos. “Eu faço os atendimentos” preenche o nome e vincula a conta atual; cada pessoa precisa ter jornada e serviços habilitados.
- Nas preferências de Configurações existe “Só banho e tosa”. Esse perfil oculta produtos/estoque do menu e resumo, preservando os dados e o financeiro. O perfil completo também atende quem vende produtos.
- No NOVO agendamento interno e no público não se escolhe profissional. A API define alguém habilitado e disponível, respeitando jornada, intervalos, ausências, reservas existentes e o acesso do funcionário. Uma pessoa pode atender sozinha; duas pessoas compartilham a capacidade. Reagendamentos antigos e chamadas explícitas continuam compatíveis.
- Datas de novos agendamentos devem ser futuras. Não remova essa validação do servidor.

## Encaixes — revisão publicada em 21/11

A lista de espera separa solicitações ativas do histórico. Um pedido com período vencido aparece como “Período encerrado”; se o tempo restante não comporta o serviço, a tela também explica isso. Não ofereça uma data antiga nem transforme esse caso em um erro genérico de ausência de horários. “Atualizar período” permite informar uma nova disponibilidade futura, com duração suficiente para o serviço, e devolve o pedido à situação Aguardando.

“Buscar horários” procura oportunidades dentro do período do tutor, respeitando o fuso e o relógio do servidor, serviços habilitados, jornada, pausas, ausências e atendimentos existentes. As respostas distinguem período vencido, serviço indisponível, ausência de profissional elegível e falta de vaga. O novo encaixe não exige que o usuário escolha quem atende: o servidor seleciona automaticamente alguém habilitado e disponível, respeitando o acesso do funcionário. A reserva exige confirmação explícita da autorização do tutor e confere novamente a disponibilidade.

“Excluir pedido” pede confirmação e encerra o item por alteração de situação (`closed`), preservando histórico e auditoria; não apaga fisicamente o registro. Pedidos já convertidos em agendamento devem ser tratados pela Agenda. “Marcar oferta” é um registro interno: a equipe ainda precisa falar com o tutor, sem mensagem automática. Preserve a posição existente dos avisos e os formulários em modal/tela inteira.

## Link, QR Code e pedidos do tutor

Em Configurações → Agendamento pelo cliente, cada pet shop tem um link /agendar/<token aleatório> e QR Code gerado localmente, sem serviço externo de QR. O responsável pode copiar, compartilhar e trocar o link; trocar invalida os QR Codes antigos.

O tutor informa serviço, horário disponível, contato e pet. Não vê pessoas da equipe, clientes ou dados internos. O envio é um PEDIDO: só reserva o horário após confirmação pelo pet shop. Na Agenda, “Pedidos dos clientes” fica recolhido, mostra a quantidade e atualiza automaticamente. Ao confirmar, o responsável escolhe explicitamente um cadastro existente ou cria cliente/pet; não associe clientes pelo telefone recebido publicamente. A disponibilidade é conferida de novo. Avise o tutor pelo contato informado: não há confirmação automática por WhatsApp nem rastreamento público do pedido.

Na revisão publicada bc1b48dc, o agendamento público é uma funcionalidade normal do produto, **independente de `legal.published` e sem flag ou modo de teste para liberá-lo**. O link começa desativado e o responsável o ativa em Configurações. A recepção depende de empresa ativa, assinatura que permita alterações e configuração `enabled=true`, com essas condições conferidas no servidor. O Pet Shop Demonstração 1 teve o link ativado e conferido em 21/11. Não force ativação para todas as empresas nem retire as verificações de acesso. O campo informativo `legal_ready` não bloqueia ativação ou recepção. Os documentos continuam em rascunho; essa ativação não os publica.

Solicitar pelo formulário não autoriza publicidade ou lembretes por e-mail. Os contatos transitórios dos pedidos têm limpeza após 30 dias e exclusão administrativa; pedidos confirmados são tratados na exportação/anonimização do titular por vínculo explícito. A remoção do bloqueio técnico não publica os documentos nem comprova adequação jurídica.

## Site, APK e apresentação

Site e APK usam a mesma interface remota em https://petcore.tigertech.dev.br. A última versão aceita no aparelho é 1.0.2/código 3 (instalação, login, formulário e exportação). A publicação web de 22/11 não exigiu APK novo. Em 27/11 foi gerado **1.0.3/código 4**, assinado com o mesmo certificado, para a capacidade GPS nativa. Ele pode ser instalado sobre a versão anterior; o GPS só aparecerá depois da publicação da interface/API. Ainda não foi testado no aparelho. Fechar e reabrir carrega a interface publicada.

O QR publicado é desenhado em **canvas**, compatível com o APK 1.0.2 sem alterar a camada nativa. Não volte a usar imagem com `src="data:..."` dentro do APK: o WebView bloqueia esse tipo de recurso. O navegador mantém o download PNG; no APK esse download fica oculto, pois a ponte de exportação aceita CSV/JSON, não PNG. O link continua disponível para copiar; Compartilhar usa a função do navegador quando disponível e recorre à cópia. Não libere esquemas inseguros nem gere outro APK apenas para atualizar esses recursos remotos. Ainda não houve novo ensaio físico específico do QR e do encaixe no aparelho após essa publicação.

## Delivery de produtos — publicado em 22/11

O usuário autorizou **as duas formas** no mesmo PetCore: cadastro interno dos pedidos recebidos por WhatsApp/telefone e catálogo público para o cliente escolher produtos e solicitar a entrega. Não recrie outro SaaS nem substitua a primeira forma pela segunda. A ativação é opcional por pet shop (`delivery_enabled`) e exige perfil completo, de quem também vende produtos; “Só banho e tosa” continua simples.

Na preparação, “Entregas de produtos” permite cadastrar cliente, telefone, endereço, referência, produtos/quantidades, taxa e observações. Pedidos manuais criam uma única comanda e uma única baixa de estoque na mesma transação. As etapas são Preparando → Saiu para entrega → Entregue, com cancelamento controlado e histórico. Entregar não marca o pagamento como recebido. Os recebimentos e reembolsos seguem o Financeiro, usando a mesma comanda; não registre uma venda paralela nem repita a baixa.

O catálogo público tem link `/loja/<token aleatório>` e QR em canvas. Só exibe produtos ativos marcados com public_catalog_visible=true e preços públicos; não expõe custo, cadastros internos ou quantidade exata em estoque. O cliente escolhe os produtos e informa seus dados de entrega. O envio cria um **pedido pendente**, sem reservar estoque, cobrar ou criar venda. O pet shop confere disponibilidade, endereço e taxa e confirma ou recusa em “Pedidos recebidos”. A confirmação revalida preços/estoque e cria a mesma estrutura de venda/entrega dos pedidos manuais, com proteção contra repetição. Vincular um cliente existente é uma escolha explícita do operador, nunca uma associação automática pelo telefone recebido.

A taxa pode ser configurada para o catálogo. Sem taxa configurada, o cliente vê que ela será combinada e o operador precisa informar o valor na confirmação, inclusive zero se gratuita. Área atendida e recados devem refletir a operação real do pet shop. Não invente frete grátis, região ou prazo. Não existe pagamento online, entrega automática por transportadora, GPS ou mapa de rotas nesta preparação. O pagamento e a entrega são combinados com o pet shop; os estados são atualizados pela equipe.

Dados de entregas entram na exportação do titular e da empresa. Uma entrega ativa precisa ser concluída ou cancelada antes da anonimização; contatos e textos de entregas encerradas são limpos, preservando o histórico financeiro. Pedidos públicos transitórios têm retenção de 30 dias, como os de agendamento. Não associe contatos pendentes por coincidência de nome/telefone. Essas funcionalidades de dados não comprovam publicação jurídica ou conformidade aprovada.

Preserve a identidade azul-marinho/turquesa e o mesmo cachorro inteiro no login. Mantenha letras legíveis, espaçamento, ausência de rolagem lateral e ações dos formulários visíveis. Hoje/Agenda/Clientes/Mais é navegação fixa no celular/APK. Não crie um rodapé adicional. Preserve a posição atual dos avisos de sucesso/erro; apenas limpe um erro quando a operação tiver sido resolvida.

Táxi Dog já possui planejamento de busca/entrega e motoristas, com ativação opcional por pet shop. O GPS novo está implementado localmente, conforme a atualização de 27/11 no início deste arquivo; ainda não foi publicado. Não anuncie como disponível antes da implantação e das conferências.

## Comercial e privacidade: limites reais

Plano Free = teste de 30 dias; mensal R$ 35 e anual R$ 350. Preserve esses valores. PagBank CPF usa links externos e conciliação/cancelamento pelo suporte em até um dia útil, de segunda a sexta. Selecionar plano não comprova pagamento nem cancela recorrência no PagBank. Evite dois botões de cancelamento para a mesma ação. Não prometa cancelamento automático sem integração compatível. Política comercial aprovada: devolução proporcional do período não utilizado, sem restringir direitos legais; exportação após encerramento e retenção dos backups por 30 dias.

Os documentos continuam RASCUNHOS, published=false. Revisão/publicação jurídica, procedimentos e mecanismo aplicável aos fluxos internacionais permanecem pendentes. Não invente conformidade nem apague os marcadores de revisão. Hostinger contratada não torna o Resend nacional; Railway/Neon não são fornecedores ativos. As consultas aos fornecedores já foram enviadas, não as reenvie sem instrução.

Nunca solicite senhas, tokens ou chaves pelo chat. Preserve arquivos privados fora do Git e as cópias de segurança. A guarda das chaves no Bitwarden já foi realizada. Não gere custos ou contrate serviços sem aprovação concreta.

## Histórico de verificação da revisão publicada

Na publicação histórica 7b9a9990, passaram 45 testes de unidade da API, 22 do web e 197 de integração (195 no PostgreSQL isolado da VPS e dois casos de backup em PostgreSQL temporário exclusivo de loopback). O ensaio no endereço publicado comprovou login, cadastro com dois pets, repetição sem duplicação, agendamento automático do dono, rejeição de horário ocupado, perfil essencial e o bloqueio jurídico do link público que existia naquela revisão; os registros temporários foram removidos, sem e-mail ou cobrança. A manutenção e os lembretes tiveram execução com código zero após essa atualização. Os três contêineres do Beauty Barber foram preservados. Esses resultados não são testes novos dos ajustes seguintes nem prova da regra de ativação atualizada.

## Verificação da publicação de encaixes e agendamento

Em 21/11, a revisão bc1b48dc passou 61 testes de integração no banco isolado e 24 testes de unidade do web. A aplicação publicada respondeu saudável; o link público do Pet Shop Demonstração 1 foi ativado com documentos ainda em rascunho. Os três pedidos com períodos antigos foram preservados para atualização ou encerramento pelo usuário. As evidências estão no arquivo ENCAIXE-AGENDAMENTO-PUBLICO-20261121.json; ele não comprova nova verificação física do APK.

## Verificação de entregas e próximos passos

A implantação das migrations 023/024 e da revisão b6ababb505caf8af76592a0a5127c8d58ae4cbe3 foi concluída na Hostinger. Resultados reais e limites estão em docs/evidence/DELIVERY-RELEASE-20261122.json: 247 integrações, 45 unidades API, 24 web e 12 verificações HTTPS, com limpeza dos dados temporários. A interface foi conferida com dados fictícios a 390px, sem overflow lateral. Reabrir o APK 1.0.2 carrega esta interface; o novo fluxo não foi testado fisicamente no aparelho.

Para continuar o GPS já desenvolvido, use PROMPT-GPS-TAXI-DOG.md e docs/TRACKING.md. Preserve os testes, conclua as verificações pendentes e publique a revisão exata; não recrie o módulo nem presuma acesso administrativo disponível.

Use docs/GUIA-RAPIDO-PETSHOP.md para explicar o uso ao dono do pet shop. Confira docs/COMMERCIAL-READINESS.md e docs/HOSTINGER.md para pendências e operação. Corrija falhas demonstradas e teste o que mudou; não dê como concluída uma publicação ou ação apenas enfileirada.
