# Proposta de infraestrutura e e-mail para o PetCore

**Situação atual: migração paga descartada pelo responsável em 14/11/2026 por custo.** Não contratar Google Cloud/Scaleway, criar recursos, aceitar contratos, alterar DNS ou migrar o PetCore com base neste documento. A homologação permanece no Railway e no Neon atuais. O estudo abaixo é referência histórica; não comprova regularização contratual dos fornecedores atuais.

O responsável chegou a autorizar a conferência da cotação final, depois cancelou essa etapa. A consulta à calculadora não vinculou uma conta de cobrança nem criou recurso. Os valores abaixo não são uma contratação aprovada nem uma cotação final completa.

Preparada em 14/11/2026. Este documento é uma proposta para revisão. Nenhuma conta, assinatura, contratação, alteração de DNS ou migração foi realizada nesta pesquisa.

## Recomendação concreta

Usar **Google Cloud em São Paulo para a aplicação e os arquivos privados, manter o PostgreSQL atual no Neon São Paulo e substituir o envio do Resend por Scaleway Transactional Email (TEM), plano Essential, em Paris**.

Esta combinação preserva a aplicação Docker/Node 22 e os processos agendados. Mantém aplicação e banco próximos, e oferece mecanismos contratuais públicos específicos para as transferências necessárias. A implementação do novo envio e a compatibilidade do armazenamento ainda precisam ser homologadas. A proposta não equivale a uma certificação de conformidade do PetCore ou a contratos já aceitos por José.

| Parte | Configuração inicial proposta | Situação |
|---|---|---|
| Aplicação | Compute Engine `e2-small`, 2 GiB de memória, CPU compartilhada, Linux comum, `southamerica-east1` (São Paulo), sem compromisso anual | Escolha técnica; preço regional final pendente |
| Publicação | Docker e proxy HTTPS, uma VM; porta da aplicação restrita à rede dos contêineres | Usar a preparação em `deploy/`, depois de revisão |
| Disco | 20 GiB para sistema e contêineres; sem banco de produção nesse disco | Tarifa regional pendente |
| Fotografias | Bucket Cloud Storage Standard privado em `southamerica-east1` | Homologar compatibilidade antes da mudança |
| Backups | Outro bucket privado, separado das fotografias, com permissões próprias e cópias criptografadas pelo PetCore | Restaurar uma cópia real em destino de teste antes da abertura |
| Banco | Neon atual em São Paulo, sem migração nesta proposta | Conferir plano, DPA e os fluxos próprios do Neon separadamente |
| E-mails | Scaleway TEM Essential, `fr-par` (Paris), API HTTPS | Provedor e modalidade recomendados; aceitar contrato e validar conta depois da decisão de José |
| Domínio | Origem estável proposta `https://petcore.tigertech.dev.br` | José já possui o domínio; nenhum registro foi modificado |

Uma única VM oferece um início simples e econômico, mas não oferece redundância automática contra falha da VM. Os backups devem ficar fora dela. Atualizações do sistema, espaço em disco, renovação do HTTPS e a execução dos agendamentos precisarão de acompanhamento.

## Custos: o que está confirmado e o que é estimativa

Carga usada para o orçamento: uma VM ligada por 730 horas/mês, 20 GiB de disco, 5 GiB de fotografias, 5 GiB de backups retidos, aproximadamente 10 GiB/mês de saída total e 1.000 e-mails transacionais/mês. É uma hipótese de início, não uma medição do uso futuro.

| Item | Valor para planejamento | Qualidade da confirmação |
|---|---:|---|
| VM Google em São Paulo | Reservar US$ 20–25/mês | **Estimativa**, sem confirmação inequívoca da tarifa regional nesta pesquisa |
| IPv4 externo em uso | Aproximadamente US$ 3,65/mês | Tarifa oficial de US$ 0,005/h; cálculo com 730 horas, sem descontar eventual franquia mínima |
| Disco de 20 GiB | Reservar US$ 2–4/mês | **Estimativa**; selecionar classe e São Paulo na cotação final |
| Objetos, operações e tráfego | Reservar US$ 4–7/mês | **Estimativa** para a carga pequena indicada; depende do tráfego e da retenção real |
| **Reserva Google total** | **US$ 30–40/mês** | Orçamento arredondado; não é uma oferta comercial validada |
| Scaleway TEM Essential | **Reservar € 0,25/mês para 1.000 mensagens** | Oficial: 300 mensagens/mês incluídas; € 0,25 por 1.000 adicionais, sem mensalidade. A reserva considera um lote adicional inteiro |
| Neon | Valor do plano atual, a acrescentar | Não consultado nem alterado nesta proposta |
| Domínio | Renovação atual, se aplicável | Não exige comprar outro domínio |

**Total proposto para planejamento: US$ 30–40/mês + até € 0,25/mês de e-mail + o plano atual do Neon**, antes de tributos, conversão e eventuais encargos. Não use esse total como preço fechado: a parcela regional Google deve ser cotada no calculador ou no resumo anterior à criação dos recursos.

Para avaliar o peso no preço de R$ 35/mês do PetCore, uma simulação meramente orçamentária de US$ 1 = R$ 6 e € 1 = R$ 7 resulta em cerca de **R$ 182–242/mês, mais Neon e tributos**. Esses câmbios são hipóteses de orçamento, não cotações atuais. Isso corresponderia à receita bruta de aproximadamente 6–7 assinaturas mensais, ainda sem despesas de cobrança, impostos e suporte. O anual de R$ 350 representa R$ 29,17/mês de receita bruta equivalente.

Fontes de preços: [Compute Engine](https://cloud.google.com/products/compute/pricing/general-purpose), [discos](https://cloud.google.com/compute/disks-image-pricing), [rede e IPv4](https://cloud.google.com/vpc/network-pricing), [Cloud Storage](https://cloud.google.com/storage/pricing), [calculador Google](https://cloud.google.com/products/calculator), [Scaleway TEM](https://www.scaleway.com/en/pricing/managed-services/) e [franquia mensal TEM](https://www.scaleway.com/en/docs/transactional-email/how-to/manage-tem-plans/).

As tabelas Google podem abrir com Iowa selecionado. O valor exibido nessa seleção **não comprova a tarifa de São Paulo**. Não foi possível concluir a conferência regional; por isso as parcelas correspondentes estão identificadas como estimativas. Não se pressupõem créditos promocionais, gratuidade permanente ou descontos por compromisso.

### Conferência da cotação final — 14/11/2026

**A cotação regional continua incompleta.** Foram consultados novamente as tabelas oficiais, o calculador público e a documentação do catálogo. A leitura pública disponível retornou as tabelas com Iowa selecionado; os parâmetros de região não produziram uma tabela de São Paulo verificável. O calculador abriu sem itens, e não foi gerado um orçamento regional. O [catálogo oficial](https://docs.cloud.google.com/billing/v1/how-tos/catalog-api) exige habilitar a API e usar uma chave; não se criou projeto, chave ou conta para essa finalidade. Não se adotaram preços de terceiros como substitutos de uma cotação oficial.

Os valores e cálculos já verificáveis são:

| Parcela | Unidade e cálculo | Valor em USD |
|---|---|---:|
| Um IPv4 externo em uso, tabela de VM padrão | `730 h × US$ 0,005/h` | **US$ 3,65** antes de eventual franquia mínima |
| Operações classe A em bucket Standard regional | `10.000 operações ÷ 1.000 × US$ 0,005` | **US$ 0,05**, hipótese adicional de volume |
| Operações classe B em bucket Standard regional | `50.000 operações ÷ 1.000 × US$ 0,0004` | **US$ 0,02**, hipótese adicional de volume |

As quantidades de operações acima servem para completar o cenário de orçamento; não são medições do PetCore. Fontes: [IPv4](https://cloud.google.com/vpc/network-pricing#ipaddress) e [operações Cloud Storage](https://cloud.google.com/storage/pricing#operations-pricing). A soma **US$ 3,72** é somente o subtotal dessas três parcelas, não o preço da infraestrutura.

Para concluir a cotação no [calculador oficial](https://cloud.google.com/products/calculator), preencher e registrar estes itens, **sem concluir criação ou contratação**:

| Item a cotar | Entrada exata | Cálculo de conferência |
|---|---|---|
| Compute Engine | Uma VM `e2-small`, `southamerica-east1`, Linux comum sem licença premium, On Demand, 730 h/mês, sem Spot e sem compromisso | `730 × tarifa regional USD/h` |
| Disco de inicialização | Persistent Disk **Balanced (`pd-balanced`) zonal**, 20 GiB, mesma região, 730 h/mês. Essa é a classe escolhida para fechar o cenário | `14.600 × tarifa regional USD/GiB-h`, ou `20 × tarifa USD/GiB-mês` se o calculador apresentar mês |
| Fotografias | Cloud Storage **Standard regional**, `southamerica-east1`, média de 5 GiB no mês; bucket privado | `3.650 × tarifa USD/GiB-h`, ou `5 × tarifa USD/GiB-mês` |
| Backups | Segundo bucket Standard regional, mesma região, média total retida de 5 GiB no mês | Mesmo cálculo das fotografias; acrescentar versões ou cópias retidas se ultrapassarem os 5 GiB |
| Operações de objetos | 10.000 classe A e 50.000 classe B, somadas nos dois buckets | US$ 0,07 no cenário descrito |
| IPv4 | Um endereço em uso na VM durante 730 h | Aproximadamente US$ 3,65 |
| Saída de dados | 10 GiB/mês no total, a separar entre saída da VM e downloads diretos do Cloud Storage, com destino dos usuários no Brasil | Aplicar as tarifas do produto, origem, destino e modalidade correspondentes; não cobrar os mesmos bytes nos dois produtos |

Faltam comprovar na seleção **São Paulo**: tarifa horária `e2-small`, tarifa `pd-balanced`, tarifa Standard dos objetos e saída para o destino escolhido. Também falta definir a divisão dos 10 GiB: o código fornece URLs assinadas para leitura direta das fotos, portanto não se pode considerar que toda a saída passe pela VM. Se for necessário um cenário único para a simulação, usar **2 GiB de saída da VM e 8 GiB de downloads diretos dos objetos para o Brasil**, claramente como hipótese, mantendo o total em 10 GiB. Tráfego adicional de backup/restauração e crescimento devem ser orçados à parte.

A [tabela de rede](https://cloud.google.com/vpc/network-pricing) informa 200 GiB/mês incluídos para **Standard Tier**, agregados por conta. Essa condição pode reduzir a saída da VM se essa modalidade for escolhida e houver franquia disponível; **não deve ser aplicada aos downloads diretos do Cloud Storage nem presumida para Premium Tier**. O valor por GiB que aparece sob Iowa não foi usado como tarifa de São Paulo.

O total Google somente poderá ser registrado como cotação conferida depois de obter esses campos, a moeda de cobrança e o resumo do calculador. Se a conta cobrar em BRL, conferir os SKUs em BRL: uma conversão hipotética da tabela USD não é o valor contratual. Até lá, **US$ 30–40/mês permanece uma reserva aprovada para planejamento, sem confirmação de preço final ou de teto de cobrança**. O componente Scaleway e o plano Neon continuam separados como na tabela anterior.

## Por que esta combinação tem um caminho contratual verificável

### Google: contrato de cliente com mecanismo brasileiro

O [Cloud Data Processing Addendum de clientes](https://cloud.google.com/terms/data-processing-addendum), apêndice 3, seção Brazil, prevê as cláusulas brasileiras para controlador–operador, operador–operador e transferências de Google a suboperadores. O mecanismo aplicável depende da entidade contratante e do destino. Com Google Brasil, é especialmente relevante a cobertura de transferências posteriores pelo Google; a região São Paulo sozinha não prova ausência de acessos internacionais. O texto também atribui obrigações ao cliente que atua para controladores terceiros.

Os [termos Google](https://cloud.google.com/terms) admitem cliente pessoa física ou entidade. A documentação de [Cloud Billing](https://docs.cloud.google.com/billing/docs/concepts?hl=pt-br) prevê perfil individual; [alterações cadastrais](https://docs.cloud.google.com/billing/docs/how-to/modify-billing-account?hl=pt-br) contemplam CPF/CNPJ. Isso é um caminho público para contratação como pessoa física, sujeito à verificação cadastral e ao meio de pagamento. Não se criou perfil nem se confirmou aprovação de uma conta de José.

Antes de usar dados reais, guardar privadamente a entidade Google contratante, os termos/DPA efetivamente aceitos, a data de aceite e as cláusulas aplicáveis. Não basta arquivar apenas um endereço público.

### Scaleway TEM: pessoa física, papéis de operador e processamento na França

Os [termos específicos TEM de 07/04/2026](https://www-uploads.scaleway.com/Specific_Conditions_Transactionnal_Email_Services_v042026_3f5487a93c.pdf) admitem pessoa física ou jurídica. O [DPA Scaleway](https://www-uploads.scaleway.com/DPA_2024_ENG_b0abb5cc26.pdf) integra o contrato e contempla cliente como controlador ou operador e Scaleway como operador ou suboperador. Sua definição de legislação aplicável inclui a proteção de dados brasileira. A [documentação de cadastro](https://www.scaleway.com/en/docs/account/setup-lifecycle/create-an-account/) permite conta pessoal, sem exigir dados de uma empresa. Aprovação de identidade, cobrança internacional e habilitação de envio ainda dependem da conta real.

A [política específica TEM](https://www.scaleway.com/en/docs/transactional-email/reference-content/data-privacy/), revisada em 19/10/2026, declara processamento de conteúdo, metadados, logs, webhooks e backups na França; ausência de cópia fora da UE; e ausência de suboperador dedicado ao conteúdo ou aos metadados. O corpo é eliminado ao terminar o processamento, com exceções para mensagens retidas e backups. Metadados permanecem enquanto o domínio TEM estiver ativo, e exclusões específicas podem exigir chamado. Portanto, limitar assunto e conteúdo e manter um procedimento de exclusão. O servidor destinatário, escolhido pelo titular, terá seu próprio armazenamento depois da entrega; não existe promessa de manter a mensagem apenas na Europa após recebida.

A base de transferência **Brasil → França** proposta é a adequação, não uma alegação de equivalência automática de cláusulas europeias. A [Resolução ANPD 32/2026](https://bibliotecadigital.mj.gov.br/bitstream/1/16638/2/RES_ANPD_2026_32.pdf) reconhece os destinos UE/EEE nela especificados. A [ANPD explica os mecanismos](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados). A adequação não dispensa base legal do tratamento, transparência, segurança e atendimento dos titulares.

Guardar os termos, DPA e política TEM vigentes ao contratar e acompanhar a [lista de suboperadores](https://www.scaleway.com/en/subprocessorlist/). O DPA geral permite mudanças e trata transferências externas; não interpretar sua simples menção a cláusulas europeias como autorização brasileira universal. Reavaliar se o fluxo TEM deixar de seguir o escopo francês documentado. Não enviar bases de tutores ou conteúdo de mensagens em chamados de suporte sem necessidade.

### Limite da conclusão

Há evidência pública para uma contratação apta a pessoa física e aos papéis necessários **nos dois novos fornecedores propostos**. Ainda não há comprovação de contratos firmados por José. O Neon é preservado por continuidade técnica; este documento não certifica os mecanismos de transferência da conta Neon. Também não substitui a revisão dos demais agentes efetivamente usados, como cobrança, distribuição Android e suporte.

O contrato PetCore–petshop deve autorizar os suboperadores e descrever os fluxos. José pode ser controlador dos dados da própria assinatura e operador dos dados tratados por instrução do petshop; um contrato que somente o trate como controlador não deve ser presumido suficiente para todos os lembretes dos tutores.

## Preparação e migração após a decisão de José

1. **Fechar orçamento e aceite.** Conferir a cotação Google São Paulo para a carga indicada, plano Neon e meio de pagamento; José revisa e aceita os contratos. Arquivar comprovantes privados sem publicar CPF, chaves ou credenciais. A presente tarefa não autoriza criar recursos pagos ou aceitar termos em seu nome.
2. **Homologar com dados fictícios.** Construir a imagem atual, usar banco de teste e manter as migrations aprovadas do projeto. O PostgreSQL permanece no Neon; não criar outro banco apenas para esta mudança. Aplicar os arquivos de preparação de `deploy/` somente na implantação autorizada.
3. **Validar armazenamento.** O Google documenta [interoperabilidade XML com ferramentas S3 e credenciais HMAC](https://docs.cloud.google.com/storage/docs/interoperability). Isso não garante compatibilidade integral do PetCore. Testar `Put/Get/Head/Delete/List`, `IfNoneMatch`, metadados, hashes, leitura por URL assinada, expiração, acesso entre empresas e bloqueio anônimo. Se necessário, adaptar o código; não presumir que basta mudar o endpoint.
4. **Preservar e restaurar.** Copiar fotografias e backups com conferência de contagem, tamanho e hash. Restaurar banco e fotografias em destino isolado, comprovando que as chaves necessárias estão disponíveis. Manter a origem preservada durante a transição, com prazo definido para encerramento e exclusão posteriores.
5. **Adaptar todo o e-mail.** A aplicação atual usa Resend em recuperação, suporte e processos de lembretes. Criar adaptador TEM e testar as três famílias, com tempos máximos, recusas, indisponibilidade e controle de duplicidade. A idempotência e as tentativas atuais não devem ser transferidas por suposição; validar o comportamento real da nova API. Usar remetente do domínio próprio e mensagens estritamente transacionais.
6. **Preparar domínio e retorno.** Conferir DNS atual e preservar o recebimento de e-mail já existente. Depois de autorização, adicionar somente os registros exatos exigidos para remetente, DKIM, SPF/Return-Path e DMARC. Não publicar exemplos de DNS como se fossem valores da conta. Configurar a origem HTTPS estável em `APP_ORIGIN`, links de recuperação e callbacks de cobrança.
7. **Preparar novo APK.** O Android atual fixa origem e host de homologação em `android/app/src/main/java/br/dev/tigertech/petcore/UrlPolicy.java`. A mudança para `petcore.tigertech.dev.br` exige atualizar a política de URL, testes, versão, assinatura e gerar/distribuir novo APK. Conferir login, recuperação, fotos, downloads e links externos no aparelho. O APK antigo não passa a usar o novo host por simples alteração de DNS desse subdomínio.
8. **Agendamentos e corte.** Conferir execução, fuso e logs dos jobs de manutenção, backup, suporte e lembretes. Antes de habilitar os novos, impedir que a instalação antiga execute os mesmos envios. Revalidar as autorizações e preferências dos destinatários. Só então concluir o corte e acompanhar os primeiros ciclos de backup e entrega.

## Alternativa compacta não fechada nesta pesquisa

Concentrar VM, Object Storage compatível com S3 e TEM na Scaleway em Paris reduziria fornecedores e tenderia a preservar melhor a integração S3. O DPA consultado contempla os dois papéis do cliente. **Não há preço completo de VM/disco/IPv4/objetos conferido nesta pesquisa**, portanto esta variante não é apresentada como orçamento fechado ou recomendação principal. Manter Neon em São Paulo com aplicação em Paris acrescentaria latência entre aplicação e banco; medir os fluxos reais antes de optar por isso. Não se recomenda migrar o banco nem assumir banco gerenciado gratuito para resolver essa latência sem projeto e orçamento próprios.

## Resultado desta preparação

A recomendação principal está definida e o caminho contratual dos novos fornecedores foi documentado. Permanecem concretamente pendentes: cotação regional Google, revisão do contrato/fluxos Neon, aceite pessoal de José, habilitação da conta TEM, homologação do armazenamento e adaptação do e-mail. Nenhuma dessas etapas foi apresentada como já concluída.
