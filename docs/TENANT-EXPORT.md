# Exportação assistida dos dados de uma empresa

A janela comercial aprovada é de **30 dias corridos após o encerramento formal** para solicitar a exportação assistida. Ela não altera os direitos dos titulares nem define um prazo único para apagar documentos que tenham conservação específica justificada.

O painel da plataforma oferece **Exportar dados da empresa**, em **Gestão da plataforma → Assinaturas → Gerenciar**. Ele prepara um arquivo **tar.gz privado**, com registros estruturados em NDJSON e as fotos atuais dos pets. A mesma implementação é usada pela ferramenta operacional `api/scripts/export-tenant.mjs`. A preparação não executa encerramento, exclusão, cobrança, cancelamento ou reembolso, nem encaminha o arquivo ao cliente automaticamente.

## Baixar pelo painel da plataforma

1. Entre com a conta da plataforma da Tiger Tech, em um computador. Abra a empresa correta em **Gestão da plataforma → Assinaturas → Gerenciar**.
2. Use **Exportar dados da empresa** e selecione, pelo título e data, o atendimento que autorizou a entrega. São mostrados até 100 atendimentos recentes daquela empresa. Se não existir solicitação, peça ao administrador que a registre em Suporte.
3. Confira a identidade, os poderes do administrador e o canal privado de entrega. Marque a confirmação somente depois dessa verificação e informe sua senha atual de operação.
4. Use **Preparar e baixar arquivo**. A preparação pode ser cancelada; sair da página ou interromper a requisição também sinaliza o cancelamento ao servidor.
5. Salve o arquivo em local privado, confira o manifesto e as fotos e entregue somente ao responsável verificado. Registre o resultado no chamado. O aviso do painel confirma a preparação do download, não a escolha do destino no computador nem o recebimento pelo cliente.

O acesso é exclusivo da plataforma e exige senha válida novamente, chamado da própria empresa e confirmação da verificação de identidade. A requisição não aceita uma empresa alternativa no corpo: o escopo vem do endereço autorizado. O arquivo não ganha URL pública; a resposta usa attachment, `Cache-Control: no-store` e `nosniff`.

Há uma preparação/download por vez, inclusive entre processos, com trava em uma conexão direta ao banco. Também há limite de três preparações por operador por hora, além do limite existente de confirmação de senha. O download do painel limita o arquivo a **128 MiB** e a duração a dez minutos; volumes maiores exigem lotes assistidos. As cópias temporárias do servidor são removidas após conclusão, falha ou fechamento da resposta. Cancelamento aborta a rede e a compactação e interrompe consultas entre lotes; consultas SQL em curso têm timeout próprio.

No APK, a operação completa orienta usar o computador, pois a ponte instalada salva apenas CSV/JSON. Não foi alterada a ponte nativa nem foi gerado outro APK para esse arquivo compactado.

## Antes de executar

1. Registre a solicitação e confira a empresa no atendimento. Confirme que a pessoa que receberá o arquivo é administradora autorizada ou representante legítima. Valide um canal privado de entrega já conhecido, sem encaminhar a um novo contato não verificado.
2. Identifique o operador autorizado da Tiger Tech e o banco correto do ambiente. As credenciais de banco e de fotos devem estar disponíveis somente no ambiente operacional privado; não as coloque no comando, documento ou chamado.
3. Disponibilize um diretório privado para a saída, com espaço suficiente. O destino precisa ser um **arquivo absoluto novo** terminado em `.tar.gz`. A ferramenta recusa sobrescrever arquivo existente.
4. Compile a API, pois o script usa os módulos de execução de `api/dist/`. São necessários Node compatível com o projeto e o programa oficial `tar` já disponível no Windows ou na imagem Debian.

As confirmações da linha de comando registram uma providência realizada pelo operador. **Elas não autenticam o solicitante por si mesmas e não substituem a verificação no atendimento.** A execução depende do acesso privilegiado já controlado ao ambiente; o identificador do operador, sozinho, não é uma senha ou uma autorização para terceiros.

## Executar

Com o ambiente privado configurado, na raiz do projeto:

```text
npm run build --workspace api
node api/scripts/export-tenant.mjs --tenant UUID_DA_EMPRESA --operator UUID_DO_OPERADOR --reference support:UUID_DO_CHAMADO --identity-verified YES --confirm-export YES --output CAMINHO_ABSOLUTO_NOVO.tar.gz
```

`--reference support:UUID` exige que o chamado pertença à mesma empresa. Quando a verificação aconteceu em um procedimento externo registrado, use `external:REFERENCIA_INTERNA`, de 3 a 80 caracteres de letras, números, ponto, hífen, sublinhado ou barra. Não coloque nome, e-mail, CPF ou texto de solicitação nessa referência. O manifesto e a auditoria guardam seu hash; a evidência original continua no atendimento controlado.

O script confirma no banco que o operador informado possui `is_platform_owner=true`. Ao concluir, confere novamente esse acesso antes de considerar a entrega pronta. Uma revogação durante a preparação provoca falha e remove o arquivo final criado por aquela execução.

O programa de linha de comando imprime somente um resultado operacional: identificador da exportação, empresa, caminho privado, contagens e SHA-256. Uma falha imprime um código, sem credenciais nem respostas internas do banco ou do provedor. Esse comando é uma alternativa da operação técnica; o uso normal pelo responsável da plataforma é o download protegido acima.

## Conteúdo e consistência

- `data/*.ndjson`: um objeto JSON por linha, UTF-8, datas em formato ISO e valores monetários em centavos. Os identificadores preservam os vínculos entre registros.
- `photos/`: os bytes das fotos atuais, referenciados por `pets.photo_file`. Não se trata apenas de links que expiram.
- `manifest.json`: formato, empresa, instante do snapshot, coleções, contagens, fotos, tamanho e SHA-256 de cada arquivo de dados/foto, além das exclusões técnicas declaradas.
- `LEIA-ME.txt`: orientações de leitura e cuidado com o arquivo.

São abrangidos cadastros, serviços e jornadas, agenda e histórico, espera, consentimentos, CRM, produtos e estoque, vendas/comandas, despesas, caixa e lançamentos, equipe com seus dados e permissões autorizados, suporte, solicitações de privacidade e assinatura. A exportação inclui apenas a empresa escolhida.

Não são incluídos hashes de senha, sessões, convites e tokens, credenciais, configurações globais, filas internas com payloads de entrega, chaves de idempotência/replay, metadados brutos de auditoria ou registros de outras empresas. As tabelas e campos são selecionados explicitamente; uma coleção por empresa ou campo ainda não revisado faz a ferramenta recusar a exportação, em vez de declarar uma entrega completa com dados silenciosamente omitidos.

O banco usa um snapshot `REPEATABLE READ READ ONLY`. A ferramenta mantém as mesmas travas compartilhadas de schema e de fotos usadas pelo backup; a exclusão física de fotos aguarda a liberação da trava. Chaves de foto precisam corresponder à própria empresa e pet. Perda da conexão, foto ausente, falha de armazenamento ou estouro de limite impedem uma entrega parcial.

Os limites são de um milhão de linhas por coleção, até dez mil fotos, oito MiB por foto e um GiB de dados descomprimidos. Ao ultrapassá-los, há erro explícito para planejar lotes assistidos. Não há truncamento silencioso nem afirmação de completude nesses casos.

## Entrega e encerramento

O arquivo é **em claro**, protegido pelo diretório de trabalho e pelas permissões do sistema operacional. Transfira-o somente por canal privado aprovado para o administrador verificado. Quando o canal exigir um arquivo cifrado, prepare a cifra e a entrega da senha separadamente pelo procedimento operacional; não envie os dois juntos nem use os segredos de backup como senha do cliente.

Ao usar a CLI em um contêiner Railway, a saída fica no disco efêmero; a operação técnica precisa providenciar a retirada protegida antes de encerrá-lo. Pelo painel, o próprio servidor prepara o download autenticado e limpa sua cópia temporária. Nenhum dos fluxos cria link público, publica o arquivo em um bucket ou comprova recebimento pelo cliente. O pet shop solicita a exportação; a preparação e a entrega continuam assistidas pela Tiger Tech.

Confira o SHA-256, a lista de coleções e as fotos antes da entrega. Registre o canal, destinatário verificado, data, resultado e aceite ou ocorrência no chamado. Depois da entrega e da necessidade operacional, remova as cópias locais pelo procedimento aprovado. A auditoria mínima registra operador, empresa, hash da referência, hash do arquivo e contagens, sem copiar os dados exportados.

A entrega não autoriza apagar valores/documentos que precisem ser conservados, não cancela recorrência no PagBank e não reaplica automaticamente exclusões depois de uma restauração. Essas providências seguem seus procedimentos próprios.

## Verificação

Com PostgreSQL exclusivo terminado em `_test` e as migrations aplicadas, incluindo 001–015 e 017, sem a 016 não publicada:

```text
npm run build --workspace api
node --test api/tests/tenantExport.integration.test.mjs
node --import tsx --test api/tests/tenantExportRoute.integration.test.ts
node --experimental-strip-types --test web/tests/tenantExportDownload.unit.test.ts
```

Os sete testes da CLI usam duas empresas fictícias, armazenamento simulado e um arquivo realmente compactado/extraído. Conferem isolamento, dados e bytes das fotos, ausência de credenciais/payloads, autorização do operador e referência, proteção de destino, falha de provedor, schema não revisado, trava de exclusão e revogação durante a preparação.

Os seis testes da rota usam autenticação/permissões e senha com registros fictícios e um exportador simulado, sem consultar datasets de clientes ou armazenamento real. Conferem escopo, download privado, limpeza, limite, concorrência e aborto. Quatro testes web conferem sessão/cabeçalho, tratamento de erro, formato/tamanho do arquivo e validação antes de enviar. Nenhum desses ensaios comprova entrega a um cliente real ou leitura no bucket de produção.
