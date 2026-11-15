# PetCore — inventário de fornecedores e fluxos

Conferência documental: **15/11/2026**. Responsável: **José Andrey Pereira Lisboa**, pessoa física, marca **Tiger Tech — Sites, Sistemas e Soluções Digitais**. Contato: **tigertechbr@outlook.com**.

Este inventário distingue configurações observadas e declarações públicas dos fornecedores. Não comprova sozinho contratos individualizados, todos os subprocessadores, ausência de transferências ou conformidade integral. Nenhum contrato, compra, mensagem ou migração decorre deste arquivo. O responsável escolheu **manter o Resend e conferir os contratos primeiro**; não há contratação ou migração de e-mail autorizada.

## Ambientes e escopo atual

| Ambiente/fluxo | Situação conhecida | Dados e papel da operação |
|---|---|---|
| Hostinger, `https://petcore.tigertech.dev.br` | Homologação pública isolada; VPS 2162451 em Brasil–Campinas. Aplicação/proxy ativos. Banco de teste separado no Neon. E-mail, armazenamento real e jobs do PetCore desligados; renovação HTTPS autorizada | Requisições, sessão, cadastro e operações fictícias. Não usar este ambiente para anunciar produção ou receber dados reais antes da conclusão do corte |
| Railway, `https://petcore-homologacao.up.railway.app` | Ambiente principal atual, ainda de testes segundo o responsável. Aplicação, manutenção, lembretes e backup permanecem ali; não foram transferidos para a VPS | Dados do sistema e rotinas existentes. A mudança do DNS da Hostinger não migrou o banco, fotos, e-mail, cron ou APK anterior |
| Neon | Principal Railway em `br-late-base-b6izae5a`; Hostinger em `br-fragrant-frost-b6kr9it0`, banco `neondb`; branches de teste/recuperação separados | Cadastros, agenda, Táxi Dog manual, CRM, estoque, financeiro, suporte, privacidade, assinaturas, auditoria e sessões. O operador atende às instruções do pet shop para seus cadastros; José define as finalidades próprias de conta, cobrança, segurança e suporte |
| Fotos e backups | **Railway Storage Buckets**, destinos privados separados. Uso de protocolo S3 compatível não identifica Amazon S3 ou Cloudflare R2 como contratado direto | Fotos vinculadas por empresa; cópias cifradas do banco, fotos e manifestos. Não copiar chaves nem nomes privados completos de objetos para documentos públicos |

Evidências de configuração: [HOSTINGER.md](HOSTINGER.md), [RAILWAY.md](RAILWAY.md), [REVISAO-20261114.md](REVISAO-20261114.md), [PHOTO-RECOVERY.md](PHOTO-RECOVERY.md) e `.env.example`. As regiões abaixo são evidências datadas de consultas anteriores relatadas na operação, sem nova leitura autenticada de todas as contas em 15/11. Antes do corte, guardar um retrato atualizado apenas de metadados, sem valores de variáveis privadas.

## Serviços, localização, retenção e evidências

### Hostinger — aplicação e proxy na VPS

- **Fluxo:** navegador/APK → proxy HTTPS → aplicação na VPS; acesso ao Neon por TLS. Requisições podem incluir IP, cabeçalhos, identificador de sessão e conteúdo das operações. Senhas não devem integrar logs.
- **Local comprovado da VPS:** Brasil–Campinas. A região da VM não comprova localização de suporte, painel, backups do provedor ou metadados administrativos.
- **Contrato:** o DPA público de 29/09/2026 cobre VPS, cita LGPD e admite cliente controlador ou operador. A transferência descrita publicamente utiliza instrumentos europeus/UK; **mecanismo brasileiro específico dos fluxos efetivos ainda não comprovado**. Isso não equivale a afirmar inexistência de instrumento ou ilicitude. [DPA Hostinger](https://www.hostinger.com/legal/dpa)
- **Retenção:** política do PetCore: janela de exportação de 30 dias após encerramento formal e backups por 30 dias, com exceções legais individualizadas. Backups semanais da VPS foram oferecidos no painel; não presumir cópia existente, teste de recuperação ou expiração igual à política do aplicativo.
- **Falta:** entidade contratante da conta, escopo/regiões de acesso e cópias, contrato aplicável e retenção do fornecedor. Não é necessário contratar outra VM para pedir essas informações.

### Railway — aplicação, rotinas e armazenamento de objetos

- **Regiões registradas anteriormente:** aplicação `us-east4-eqdc4a`; buckets de fotos e backups em **IAD**. Reconfirmar os metadados das instâncias antes da transferência final; não chamar IAD de região brasileira.
- **Dados:** aplicação/rotinas processam os registros necessários; fotos privadas são lidas por URLs temporárias autorizadas; backups contêm dados pessoais mesmo cifrados. Separação e cifra reduzem risco e não eliminam obrigações.
- **Contrato:** Railway atua como operador/suboperador no DPA. O texto público consultado descreve EU/UK SCC e DPF, sem comprovação de mecanismo brasileiro para este uso. Guardar a versão efetivamente aplicável à conta. [DPA Railway](https://railway.com/legal/dpa)
- **Metadados/retenção:** a documentação diferencia região da carga e processamento próprio da Railway, principalmente nos EUA; retenção de logs varia por plano. A região do bucket é escolhida na criação e não pode ser alterada. Confirmar plano e retenção de cada serviço, logs, cópias e objetos excluídos. [Segurança Railway](https://docs.railway.com/enterprise/security), [Storage Buckets](https://docs.railway.com/storage-buckets)
- **Falta:** entidade e cadeia aplicável aos buckets, regiões de metadados/acesso, prazo de exclusão física e mecanismo para a operação brasileira. Não presumir fornecedor subjacente apenas pelo endpoint S3.

### Neon/Databricks — PostgreSQL

- **Região registrada:** AWS `sa-east-1` (São Paulo); branches principal, homologação e recuperação são ambientes distintos. Isso não demonstra que toda telemetria, suporte ou cópia administrativa fica no Brasil.
- **Contrato:** os termos Neon de 14/10/2026 identificam Databricks e admitem cliente pessoa física. O DPA Databricks admite cliente controlador ou operador; o instrumento público consultado não comprovou mecanismo específico brasileiro. Os termos também apontam subprocessadores, incluindo Grafana Labs nos EUA para infraestrutura. [Termos Neon](https://neon.com/platform-terms), [DPA Databricks](https://www.databricks.com/legal/dpa)
- **Retenção:** os 30 dias dos backups gerados pelo PetCore são uma política própria; não configuram por si só histórico de restauração, logs ou eliminação dos branches pelo Neon. **Plano, histórico e prazos efetivos da conta ainda precisam ser registrados.**
- **Falta:** qual instrumento está vinculado à conta, destinos de acesso/cópias/telemetria e mecanismo aplicável a dados brasileiros do cliente que atua como operador. Não é necessário trocar o banco para realizar a consulta.

### Resend — recuperação de senha, suporte e lembretes

- **Estado:** mantido por decisão do responsável. Configuração existente no Railway; Hostinger desligada. Recuperação/suporte usam `EMAIL_*`; lembretes têm credenciais e flags separadas. Opt-in do tutor é requisito dos lembretes, sem autorizar marketing.
- **Dados mínimos:** destinatário, remetente, assunto e corpo transacional; recuperação inclui link secreto de uso limitado; suporte envia aviso e referência autenticada, sem histórico completo. Nunca incluir senha, base de tutores ou foto em chamados ao provedor.
- **Local/contrato:** o fornecedor declara armazenamento nos **EUA**; região de envio não muda isso. Afirma não aceitar cláusulas ANPD específicas e oferecer seu DPA padrão. **A base brasileira das transferências deste uso permanece não demonstrada**; preservar essa pendência ao revisar os documentos. [FAQ de segurança Resend](https://resend.com/security)
- **Evidência da conta em 15/11:** a sessão autenticada em Settings → Documents apresentou o DPA preassinado pelo fornecedor e descrito como executado com o cadastro, com [download do instrumento assinado](https://resend.com/static/documents/resend-dpa-signed.pdf). O instrumento da conta foi localizado sem novo aceite; localização não comprova por si só a base brasileira nem substitui sua revisão e guarda privadas.
- **Retenção declarada:** mensagens/logs 30 dias nos planos Free/Pro/Scale; dados remanescentes até 90 dias após encerramento; backups 7 dias. Não confundir exclusão no PetCore com eliminação simultânea no provedor. [Mesma fonte](https://resend.com/security)
- **Falta:** arquivar DPA da conta e cadeia aplicável; verificar possibilidade de mecanismo válido antes de abrir os envios com dados reais. SPF restaurado e entrega de teste não resolvem o contrato.

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

1. Versões e datas dos termos/DPAs efetivamente aplicáveis às contas, com comprovantes privados de aceite e entidade contratante. Arquivos não devem conter credenciais ou documentos pessoais publicados.
2. Região e plano efetivos de cada serviço/bucket; suporte e metadados registrados separadamente. `auto`, S3, criptografia e região Brasil não são, isoladamente, mecanismo de transferência.
3. Mecanismo por fluxo conforme legislação brasileira. A ANPD informa adequação da UE e os mecanismos reconhecidos; não declara equivalência universal de EU SCC/DPF. [ANPD — transferências internacionais](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)
4. Retenção efetiva de registros do aplicativo, objetos, backups, logs, e-mail e obrigações legais; exclusões e revogações precisam ser reaplicadas antes de reabrir uma restauração.
5. Atualização do cadastro de fornecedores e documentos públicos **depois** da decisão e comprovação. Este inventário não publica os rascunhos jurídicos ou autoriza novos fornecedores.

As perguntas preparadas em [CONSULTAS-FORNECEDORES.md](CONSULTAS-FORNECEDORES.md) permitem avançar sem criar custo ou migrar infraestrutura. Elas ainda não foram enviadas. Não se institui aqui exigência de contratar advogado, trocar todos os fornecedores ou paralisar permanentemente o projeto.
