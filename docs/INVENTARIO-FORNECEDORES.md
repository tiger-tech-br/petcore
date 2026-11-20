# PetCore — inventário de fornecedores e fluxos

Conferência documental: **15/11/2026**; consultas de **19/11/2026**; infraestrutura efetiva atualizada após o corte de **20/11/2026**. Responsável: **José Andrey Pereira Lisboa**, pessoa física, marca **Tiger Tech — Sites, Sistemas e Soluções Digitais**. Contato: **tigertechbr@outlook.com**.

Este inventário distingue configurações observadas e declarações públicas dos fornecedores. Não comprova sozinho contratos individualizados, todos os subprocessadores, ausência de transferências ou conformidade integral. Nenhum contrato, compra, mensagem ou migração decorre deste arquivo. O responsável escolheu **manter o Resend e conferir os contratos primeiro**; não há contratação ou migração de e-mail autorizada.

**Atualização de 19/11/2026:** após autorização expressa, foram enviadas quatro consultas a Hostinger, Neon/Databricks, Railway e Resend, com o remetente PetCore já configurado no Resend e Reply-To tigertechbr@outlook.com. As quatro foram aceitas pela API (HTTP 200 e identificador retornado); **entrega aos destinatários e respostas dos fornecedores permanecem pendentes**. Não foram enviados dados de clientes nem contratados novos planos. O envio não comprova regularização contratual. [Textos enviados](CONSULTAS-FORNECEDORES.md), [registro sem credenciais](evidence/PROVIDER-QUERIES-20261119.json).

## Ambientes e escopo atual

| Ambiente/fluxo | Situação conhecida | Dados e papel da operação |
|---|---|---|
| Hostinger, `https://petcore.tigertech.dev.br` | Destino ativo na VPS 2162451, Brasil–Campinas: aplicação/proxy, PostgreSQL 18.7 com TLS e papel restrito, armazenamento Versity e rotinas. Banco `petcore` com 50 tabelas e 19 migrations | Requisições, sessões e registros do sistema. Os dados restaurados foram declarados de teste pelo responsável. Migração técnica concluída não publica os documentos nem libera por si só dados reais |
| Fotos e backups na Hostinger | Versity Gateway 1.11.0, volumes e contas privados, buckets separados, acesso autorizado por HTTPS. Backup diário às 03h de Brasília e recuperação real do banco e de foto fictícia conferidos em 20/11 | Fotos por empresa e cópias cifradas do banco, fotos e manifestos. S3 é o protocolo de acesso; Versity é software executado na VPS, não um novo serviço de armazenamento contratado |
| Cópias externas no computador do responsável | Arquivos históricos e nova cópia cifrada autenticados em 20/11; continuidade externa manual | A cópia também está fora do servidor. Definir a frequência de atualização e a destinação dessas cópias; o backup diário no disco da VPS não cobre perda do servidor |
| Resend | Configuração preservada e usada pela aplicação na Hostinger. Avisos de suporte habilitados após fila vazia; lembretes têm processo separado e consentimento próprio | Destinatários e conteúdo transacional necessário. A entrega e a recuperação de senha completas no destino atual mantêm verificações próprias |
| Railway — histórico retirado | Cinco serviços e dois buckets do PetCore removidos; ambiente conferido sem serviços, buckets ou volumes. Exclusão do projeto aceita, ainda listado na conferência seguinte. Outros sete projetos da conta foram preservados | Não integra o processamento ativo do PetCore. A exclusão dos recursos não comprova eliminação de todos os logs/cópias administrativos do fornecedor nem cancelamento da assinatura da conta |
| Neon — origem preservada | Sem conexão ativa do PetCore. A cópia de 19/11 às 03h02 foi aceita pelo responsável, restaurada e comparada na VPS; o Neon aguarda retirada pelo responsável | Acervo histórico de testes, separado da operação ativa. Acompanhar sua destinação e a retenção residual; não descrevê-lo como banco atual do PetCore |

Evidências atuais: [migração de 20/11](MIGRACAO-HOSTINGER-20261120.md), [recibo público](evidence/HOSTINGER-DATA-STAGING-20261120.json) e [HOSTINGER.md](HOSTINGER.md). As consultas contratuais e fontes abaixo conservam as datas da revisão documental anterior; o corte técnico não comprova novos contratos ou mecanismos. Os registros de Railway/Neon servem ao histórico e ao encerramento desses fluxos. Respostas desses dois fornecedores não são tratadas como condição para usar um fornecedor atual que os substituiu.

## Serviços, localização, retenção e evidências

### Hostinger — aplicação, PostgreSQL, objetos e rotinas na VPS

- **Fluxo:** navegador/APK → proxy HTTPS → aplicação; PostgreSQL local por TLS verificado e objetos privados Versity na mesma VPS. Banco e administração do armazenamento não têm portas publicadas na internet. Requisições podem incluir IP, cabeçalhos, identificador de sessão e conteúdo das operações. Senhas não devem integrar logs.
- **Local comprovado da VPS:** Brasil–Campinas. A região da VM não comprova localização de suporte, painel, backups do provedor ou metadados administrativos.
- **Contrato:** o DPA público de 29/09/2026 cobre VPS, cita LGPD e admite cliente controlador ou operador. A transferência descrita publicamente utiliza instrumentos europeus/UK; **mecanismo brasileiro específico dos fluxos efetivos ainda não comprovado**. Isso não equivale a afirmar inexistência de instrumento ou ilicitude. [DPA Hostinger](https://www.hostinger.com/legal/dpa)
- **Retenção:** política do PetCore: janela de exportação de 30 dias após encerramento formal e backups por 30 dias, com exceções legais individualizadas. A rotina ativa usa retenção de 30 dias; os 15 registros históricos foram classificados como legados após cópia verificada e não são apagados por essa rotina. A destinação desse acervo e das cópias no computador deve ser registrada separadamente. Recuperação real de uma cópia nova e de foto fictícia foi conferida em 20/11. Isso não comprova existência ou retenção de snapshots próprios da Hostinger, ainda que oferecidos no painel.
- **Falta:** entidade contratante da conta, escopo/regiões de acesso e cópias, contrato aplicável e retenção do fornecedor. Não é necessário contratar outra VM para pedir essas informações.

### Railway — histórico de aplicação, rotinas e objetos retirados

- **Estado de 20/11:** recursos do PetCore removidos após cópia e conferência. Não é fornecedor da aplicação, dos jobs ou dos objetos ativos do PetCore. O pedido de exclusão do projeto foi aceito; a conta conserva outros projetos sem alterações.
- **Regiões históricas:** aplicação `us-east4-eqdc4a`; buckets em **IAD**, que não é região brasileira. Preservar o registro para documentar o tratamento anterior.
- **Dados históricos:** aplicação e rotinas processavam os registros necessários; os backups continham dados pessoais mesmo cifrados. Cópia e remoção dos recursos não demonstram eliminação instantânea em logs ou backups administrativos do fornecedor.
- **Contrato:** Railway atua como operador/suboperador no DPA. O texto público consultado descreve EU/UK SCC e DPF, sem comprovação de mecanismo brasileiro para este uso. Guardar a versão efetivamente aplicável à conta. [DPA Railway](https://railway.com/legal/dpa)
- **Metadados/retenção:** a documentação diferencia região da carga e processamento próprio da Railway, principalmente nos EUA; retenção de logs varia por plano. A região do bucket é escolhida na criação e não pode ser alterada. Confirmar plano e retenção de cada serviço, logs, cópias e objetos excluídos. [Segurança Railway](https://docs.railway.com/enterprise/security), [Storage Buckets](https://docs.railway.com/storage-buckets)
- **Acompanhamento de saída:** entidade e cadeia aplicável ao serviço histórico, regiões de metadados/acesso e prazo de exclusão física. A consulta já enviada continua registrada; sua resposta não é requisito de contratação da infraestrutura atual. Não presumir fornecedor subjacente apenas pelo endpoint S3.

### Neon/Databricks — origem histórica do PostgreSQL

- **Estado de 20/11:** projeto preservado para retirada pelo responsável, sem conexão ativa do PetCore. O banco efetivo é o PostgreSQL da Hostinger. A indisponibilidade por cota impediu exportação SQL atual; o responsável autorizou a cópia de testes de 19/11 às 03h02, com possível defasagem informada, e a restauração foi verificada.
- **Região registrada:** AWS `sa-east-1` (São Paulo); branches principal, homologação e recuperação são ambientes distintos. Isso não demonstra que toda telemetria, suporte ou cópia administrativa fica no Brasil.
- **Contrato:** os termos Neon de 14/10/2026 identificam Databricks e admitem cliente pessoa física. O DPA Databricks admite cliente controlador ou operador; o instrumento público consultado não comprovou mecanismo específico brasileiro. Os termos também apontam subprocessadores, incluindo Grafana Labs nos EUA para infraestrutura. [Termos Neon](https://neon.com/platform-terms), [DPA Databricks](https://www.databricks.com/legal/dpa)
- **Retenção:** os 30 dias dos backups gerados pelo PetCore são uma política própria; não configuram por si só histórico de restauração, logs ou eliminação dos branches pelo Neon. **Plano, histórico e prazos efetivos da conta ainda precisam ser registrados.**
- **Acompanhamento de saída:** qual instrumento cobriu a conta e a retenção dos acessos/cópias/telemetria históricos, além da retirada do acervo preservado. A consulta já enviada continua registrada; não exigir sua resposta como se Neon ainda fornecesse o banco ativo.

### Resend — recuperação de senha, suporte e lembretes

- **Estado:** mantido por decisão do responsável, com configuração preservada na Hostinger. Recuperação/suporte usam `EMAIL_*`; os avisos de suporte foram habilitados após conferência da fila vazia. Lembretes usam credenciais e flags separadas, com agendador na VPS a cada cinco minutos. Opt-in do tutor é requisito dos lembretes, sem autorizar marketing. Configuração e execução do job não comprovam entrega de uma nova mensagem ou consumo completo de um link de recuperação no destino atual.
- **Dados mínimos:** destinatário, remetente, assunto e corpo transacional; recuperação inclui link secreto de uso limitado; suporte envia aviso e referência autenticada, sem histórico completo. Nunca incluir senha, base de tutores ou foto em chamados ao provedor.
- **Local/contrato:** o fornecedor declara armazenamento nos **EUA**; região de envio não muda isso. Afirma não aceitar cláusulas ANPD específicas e oferecer seu DPA padrão. **A base brasileira das transferências deste uso permanece não demonstrada**; preservar essa pendência ao revisar os documentos. [FAQ de segurança Resend](https://resend.com/security)
- **Evidência da conta em 15/11:** a sessão autenticada em Settings → Documents apresentou o DPA preassinado pelo fornecedor e descrito como executado com o cadastro, com [download do instrumento assinado](https://resend.com/static/documents/resend-dpa-signed.pdf). O instrumento da conta foi localizado sem novo aceite; localização não comprova por si só a base brasileira nem substitui sua revisão e guarda privadas.
- **Retenção declarada:** mensagens/logs 30 dias nos planos Free/Pro/Scale; dados remanescentes até 90 dias após encerramento; backups 7 dias. Não confundir exclusão no PetCore com eliminação simultânea no provedor. [Mesma fonte](https://resend.com/security)
- **Atualização em 19/11:** DPA da conta já arquivado, após localização e conferência em 15/11. A consulta específica ao Resend foi enviada e aceita pela API; entrega e resposta seguem pendentes.
- **Falta:** registrar a cadeia aplicável e verificar possibilidade de mecanismo válido antes de abrir os envios com dados reais. SPF restaurado, entrega de teste e aceitação da consulta pela API não resolvem o contrato.

### PagBank — cobrança externa

- **Fluxo:** responsável do pet shop abre o link Mensal R$ 35 ou Anual R$ 350 no PagBank. O PetCore não captura cartão ou senha bancária. A conciliação registra plano, recebimento, validade e referências necessárias; cancelamento da recorrência é manual pelo vendedor.
- **Papel/local:** PagBank tem finalidades e obrigações próprias de pagamento, segurança e regulação. Não tratá-lo automaticamente como simples suboperador de todos os dados. Não foi comprovada residência exclusivamente brasileira da cadeia de pagamento nesta revisão.
- **Retenção:** a documentação oficial prevê limites para esquecimento quando há pendências/serviços e obrigações de conservação. Não prometer apagar registros financeiros no mesmo prazo das fotos. [Esquecimento no PagBank](https://faq.pagbank.com.br/duvida/como-solicitar-o-esquecimento-dos-meus-dados-no-pagseguro/1108), [normas de segurança e privacidade indicadas pelo PagBank](https://sobreuol.noticias.uol.com.br/normas-de-seguranca-e-privacidade)
- **Falta:** guardar contrato/política vigentes da conta PF e roteiro comprovado de cancelamento, conciliação e reembolso, sem realizar cobrança de teste não autorizada.

### Microsoft Outlook.com — caixa do suporte

- **Fluxo:** `tigertechbr@outlook.com` recebe avisos de suporte e contatos diretos de clientes/titulares. Mudar apenas o provedor de envio não remove esse destino. O fluxo deve reduzir o aviso a referência/assunto e tratar detalhes no painel autenticado.
- **Papel/local:** a conta é Outlook.com, não prova de contratação Microsoft 365 empresarial ou de DPA empresarial. Região exclusiva da caixa e mecanismo brasileiro específico não foram comprovados. A política Microsoft cobre conteúdo e dados de comunicação e descreve armazenamento internacional. [Política Microsoft](https://www.microsoft.com/pt-br/privacy/privacystatement)
- **Retenção:** mensagens permanecem na caixa e pastas até destinação; não há comprovação de regra automática de 30 dias nesta conta. Evitar pedidos de dados/documentos desnecessários por e-mail e registrar procedimento de exclusão/exportação, inclusive pastas enviadas/excluídas.

### Registro.br/NIC.br — domínio e DNS

- **Fluxo:** cadastro do titular e contatos do domínio, administração e registros DNS públicos `tigertech.dev.br`/`petcore`. DNS não recebe o cadastro completo dos tutores ou o conteúdo das operações HTTPS.
- **Estado:** domínio no Registro.br; nameservers observados `e.sec.dns.br`/`f.sec.dns.br`; A do PetCore e registros de e-mail foram salvos pelo responsável. Não divulgar CPF ou credenciais do titular neste inventário.
- **Contrato/retenção:** preservar os termos aceitos da conta e verificar o aviso de privacidade do registro. A página pública dependeu de JavaScript nesta consulta; **conteúdo e prazos não foram extraídos**, portanto não se certifica uma região exclusiva ou prazo. [Política Registro.br](https://registro.br/politica-de-privacidade/), [tutorial administrativo](https://www.registro.br/ajuda/tutoriais-administrativos/)

### Let's Encrypt/ISRG — certificado HTTPS

- **Fluxo:** Caddy solicita/renova certificado do subdomínio, usando o contato autorizado; não transmite os cadastros dos pet shops para a emissão. Domínio e dados do certificado integram registros públicos de transparência.
- **Papel/local/retenção:** ISRG é entidade nos EUA. A política declara coleta de informações de emissão/validação, incluindo IPs e logs ACME, com conservação mínima de dois anos; contato não é publicado. Esse fluxo é distinto do armazenamento de tutores. Não aplicar os 30 dias dos backups à transparência de certificados. [Privacidade Let's Encrypt](https://letsencrypt.org/privacy/)
- **Estado:** aceite dos termos v1.8 e renovações autorizado em 14/11; emissão obtida. Guardar comprovante do aceite e escopo do certificado. Não alegar que isso seja mecanismo de transferência dos demais fornecedores.

### Android/APK e dispositivo do cliente

- **Fluxo:** o APK é cliente WebView do PetCore; envia requisições à origem autorizada e abre PagBank externamente. Seleção de foto/exportação ocorre pelos seletores do Android. Arquivos exportados passam a existir também no destino escolhido pelo usuário.
- **Código conferido:** `AndroidManifest.xml` solicita Internet/estado de rede, sem permissão de localização; geolocalização está desativada e prompts são recusados. Backup automático do aplicativo está desabilitado. Não há GPS de motorista nesta versão.
- **Papel/local/retenção:** sessão, cache e arquivos escolhidos dependem do aparelho e do usuário; não prometer exclusão de cópias exportadas por ele. Não há evidência de publicação na Play Store ou de fornecedor separado de analytics contratado pelo APK. A conferência é do código, não certificação do comportamento do sistema operacional. [Guia Android](ANDROID.md), [orientação oficial de segurança WebView](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion)

## O que deve acompanhar a revisão final

1. Versões e datas dos termos/DPAs efetivamente aplicáveis às contas atuais, com comprovantes privados de aceite e entidade contratante; registros dos fornecedores retirados acompanham seu encerramento histórico. Arquivos não devem conter credenciais ou documentos pessoais publicados.
2. Região e plano efetivos de cada serviço/bucket; suporte e metadados registrados separadamente. `auto`, S3, criptografia e região Brasil não são, isoladamente, mecanismo de transferência.
3. Mecanismo por fluxo conforme legislação brasileira. A ANPD informa adequação da UE e os mecanismos reconhecidos; não declara equivalência universal de EU SCC/DPF. [ANPD — transferências internacionais](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)
4. Retenção efetiva de registros do aplicativo, objetos, backups, logs, e-mail e obrigações legais; exclusões e revogações precisam ser reaplicadas antes de reabrir uma restauração.
5. Atualização do cadastro de fornecedores e documentos públicos **depois** da decisão e comprovação. Este inventário não publica os rascunhos jurídicos ou autoriza novos fornecedores.

As perguntas registradas em [CONSULTAS-FORNECEDORES.md](CONSULTAS-FORNECEDORES.md) preservam o acompanhamento contratual. **Em 19/11, após autorização expressa, as quatro foram enviadas e aceitas pela API; entrega e respostas seguem pendentes.** Em 20/11 a migração técnica para a Hostinger foi concluída por decisão do responsável. Conferir os fluxos e instrumentos dos fornecedores efetivos; acompanhar Railway/Neon como saída histórica, sem transformá-los em dependências do destino atual. Não se institui aqui exigência de contratar advogado, trocar todos os fornecedores ou paralisar permanentemente o projeto. A publicação jurídica continua uma providência separada, sem aprovação por este inventário.
