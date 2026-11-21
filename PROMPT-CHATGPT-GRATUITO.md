# Continuação do PetCore — estado atual em 21/11/2026

Você está continuando o projeto PetCore da Tiger Tech, um único SaaS para vários pet shops. Trabalhe no projeto existente; não recrie o sistema. O responsável é José Andrey Pereira Lisboa, pessoa física, usando a marca “Tiger Tech — Sites, Sistemas e Soluções Digitais”. Suporte e privacidade: tigertechbr@outlook.com. A identidade e o endereço autorizados já estão nos rascunhos existentes; preserve-os.

## O que está publicado e como funciona

O PetCore está em https://petcore.tigertech.dev.br, na VPS Hostinger 2162451. Aplicação Node.js, PostgreSQL 18.7 com TLS, fotos e backups privados no Versity ficam nessa VPS. Resend continua como provedor de e-mail. Railway e Neon são históricos, sem conexão no ambiente atual. Não recrie serviços neles. O Beauty Barber usa a mesma VPS e é outro projeto: não altere seus contêineres, banco, arquivos ou rede.

Revisão publicada: 7b9a9990d617c788ee7cf7869cecfd306664e936. A imagem base continua acde9dde; API, página compilada e dependências de produção usam montagens somente de leitura do volume petcore_build_3b1d5816_20261121. O nome do volume corresponde ao candidato de teste; duas correções finais de mensagens do web foram conferidas por hash e compiladas na revisão publicada. Consulte docs/evidence/SIMPLIFICACAO-AGENDAMENTO-20261121.json antes de alterar a implantação.

O banco tem 53 tabelas e 21 migrations: 001–015 e 017–022. A migration 016 pertence a trabalho separado e NÃO foi aplicada; não a execute, modifique ou publique. Não mexa no arquivo NUL. A pasta local tem várias mudanças autorizadas antigas; não descarte alterações nem faça publicação indiscriminada.

## Simplificação feita

- “Adicionar cliente” abre um único formulário para o responsável e um ou mais pets. Campos adicionais ficam recolhidos. Continua possível cadastrar somente o cliente. O cadastro completo é transacional e uma nova tentativa usa a mesma chave para evitar duplicação.
- A lista de clientes mostra os pets vinculados, permite “Adicionar pet” e oferece o atalho de agendamento com cliente/pet preenchidos.
- Hoje tem “Agendar atendimento” e “Cadastrar cliente e pet”; os primeiros passos são serviços, quem atende/horários, cliente/pet e agendamento. Financeiro é apresentado depois.
- “Quem atende e horários” aceita os próprios donos. “Eu faço os atendimentos” preenche o nome e vincula a conta atual; cada pessoa precisa ter jornada e serviços habilitados.
- Nas preferências de Configurações existe “Só banho e tosa”. Esse perfil oculta produtos/estoque do menu e resumo, preservando os dados e o financeiro. O perfil completo também atende quem vende produtos.
- No NOVO agendamento interno e no público não se escolhe profissional. A API define alguém habilitado e disponível, respeitando jornada, intervalos, ausências, reservas existentes e o acesso do funcionário. Uma pessoa pode atender sozinha; duas pessoas compartilham a capacidade. Reagendamentos antigos e chamadas explícitas continuam compatíveis.
- Datas de novos agendamentos devem ser futuras. Não remova essa validação do servidor.

## Link, QR Code e pedidos do tutor

Em Configurações → Agendamento pelo cliente, cada pet shop tem um link /agendar/<token aleatório> e QR Code gerado localmente, sem serviço externo de QR. O responsável pode copiar, compartilhar e trocar o link; trocar invalida os QR Codes antigos.

O tutor informa serviço, horário disponível, contato e pet. Não vê pessoas da equipe, clientes ou dados internos. O envio é um PEDIDO: só reserva o horário após confirmação pelo pet shop. Na Agenda, “Pedidos dos clientes” fica recolhido, mostra a quantidade e atualiza automaticamente. Ao confirmar, o responsável escolhe explicitamente um cadastro existente ou cria cliente/pet; não associe clientes pelo telefone recebido publicamente. A disponibilidade é conferida de novo. Avise o tutor pelo contato informado: não há confirmação automática por WhatsApp nem rastreamento público do pedido.

O link público está DESATIVADO por padrão e permanece desativado na VPS enquanto published=false nos documentos. Link/QR podem ser conferidos nas Configurações, mas não anuncie o formulário como ativo. Publicação jurídica e assinatura válida são verificadas no servidor antes de ativar ou receber pedidos. Solicitar pelo formulário não autoriza publicidade ou lembretes por e-mail. Os contatos transitórios dos pedidos têm limpeza após 30 dias e exclusão administrativa; pedidos confirmados são tratados na exportação/anonimização do titular por vínculo explícito.

## Site, APK e apresentação

Site e APK usam a mesma interface remota. O APK atual é 1.0.2/código 3 e já teve instalação, login, formulário e exportação aceitos no aparelho pelo responsável. Estas mudanças são do web: nenhum APK novo foi gerado. Fechar e reabrir o aplicativo carrega a página atualizada.

Preserve a identidade azul-marinho/turquesa e o mesmo cachorro inteiro no login. Mantenha letras legíveis, espaçamento, ausência de rolagem lateral e ações dos formulários visíveis. Hoje/Agenda/Clientes/Mais é navegação fixa no celular/APK. Não crie um rodapé adicional. Preserve a posição atual dos avisos de sucesso/erro; apenas limpe um erro quando a operação tiver sido resolvida.

Táxi Dog já possui planejamento de busca/entrega e motoristas, com ativação opcional por pet shop. GPS e rotas em tempo real NÃO foram implementados. Não anuncie esses recursos; o plano futuro está no prompt específico.

## Comercial e privacidade: limites reais

Plano Free = teste de 30 dias; mensal R$ 35 e anual R$ 350. Preserve esses valores. PagBank CPF usa links externos e conciliação/cancelamento pelo suporte em até um dia útil, de segunda a sexta. Selecionar plano não comprova pagamento nem cancela recorrência no PagBank. Evite dois botões de cancelamento para a mesma ação. Não prometa cancelamento automático sem integração compatível. Política comercial aprovada: devolução proporcional do período não utilizado, sem restringir direitos legais; exportação após encerramento e retenção dos backups por 30 dias.

Os documentos continuam RASCUNHOS, published=false. Revisão/publicação jurídica, procedimentos e mecanismo aplicável aos fluxos internacionais permanecem pendentes. Não invente conformidade nem apague os marcadores de revisão. Hostinger contratada não torna o Resend nacional; Railway/Neon não são fornecedores ativos. As consultas aos fornecedores já foram enviadas, não as reenvie sem instrução.

Nunca solicite senhas, tokens ou chaves pelo chat. Preserve arquivos privados fora do Git e as cópias de segurança. A guarda das chaves no Bitwarden já foi realizada. Não gere custos ou contrate serviços sem aprovação concreta.

## Verificação e próximos trabalhos

Passaram 45 testes de unidade da API, 22 do web e 197 de integração (195 no PostgreSQL isolado da VPS e dois casos de backup em PostgreSQL temporário exclusivo de loopback). O ensaio no endereço publicado comprovou login, cadastro com dois pets, repetição sem duplicação, agendamento automático do dono, rejeição de horário ocupado, perfil essencial e bloqueio jurídico do link público; os registros temporários foram removidos, sem e-mail ou cobrança. A manutenção e os lembretes tiveram execução com código zero após a atualização. Os três contêineres do Beauty Barber foram preservados.

Use docs/GUIA-RAPIDO-PETSHOP.md para explicar o uso ao dono do pet shop. Confira docs/COMMERCIAL-READINESS.md e docs/HOSTINGER.md para pendências e operação. Corrija falhas demonstradas e teste o que mudou; não dê como concluída uma publicação ou ação apenas enfileirada.
