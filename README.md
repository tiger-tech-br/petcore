# PetCore — gestão para pet shops

Sistema SaaS multiempresa da Tiger Tech, em português, com interface responsiva e operação interna do pet shop. A homologação está publicada em [petcore-homologacao.up.railway.app](https://petcore-homologacao.up.railway.app). A revisão HTTPS conferida é `4d5ffe41`, implantação `b23f40a5-9c42-4710-9c2a-cb0668a7d04e`, concluída com sucesso. Ajustes posteriores ainda precisam da publicação e validação final; este registro não declara prontidão comercial.

O contexto para continuar no ChatGPT gratuito está em [PROMPT-CHATGPT-GRATUITO.md](PROMPT-CHATGPT-GRATUITO.md). O estado de entrega está em [COMMERCIAL-READINESS.md](docs/COMMERCIAL-READINESS.md).

## O que já existe

| Área | Comportamento implementado |
|---|---|
| Acesso e empresas | Login, sessão no PostgreSQL, senhas Argon2id, recuperação por provedor configurado, convites e permissões por empresa |
| Cadastros e agenda | Clientes/tutores, pets, serviços, profissionais, jornada, pausas, folgas, agenda, reagendamento, antecipação, faltas e histórico |
| Lista de espera | Registro, sugestões de vaga e encaixe transacional |
| CRM | Carteira dos tutores existentes, segmentos de inatividade, ficha, contatos manuais e tarefas de retorno |
| Produtos e estoque | Cadastro, preço/custo, mínimo, movimentos e histórico; controle de saldo e concorrência |
| Financeiro | Vendas/comandas internas de produtos e serviços, recebimentos parciais, despesas e caixa com fechamento |
| Relatórios | Indicadores, gráficos e exportação CSV a partir dos registros da empresa |
| Plano e assinatura | Free de 30 dias, Mensal de R$ 35 e Anual de R$ 350; validade, suspensão e conciliação manual |
| Suporte | Chamados e respostas entre o pet shop e a plataforma |
| Privacidade | Pedidos de titulares, verificação de identidade, exportação, anonimização e auditoria |
| Operação | Migrations controladas, manutenção, fotos em armazenamento privado e scripts de backup criptografado/restauração |

Produtos e estoque servem ao balcão e ao consumo interno. Não há loja virtual, compras públicas, táxi dog, entregas ou acompanhamento de pedidos de comércio eletrônico.

Uma venda aberta ou um serviço agendado não é dinheiro recebido. O Financeiro registra recebimentos informados pela equipe; não precisa acessar a conta bancária do pet shop. Não há integração bancária, emissão fiscal ou captura de cartão no PetCore.

## Primeiros passos e aparência

O responsável recebe um guia: cadastrar serviços; cadastrar o profissional e configurar sua jornada/serviços; cadastrar cliente e pet; agendar; registrar um recebimento. Quando falta um cadastro necessário, a interface explica a dependência e oferece um atalho a quem tem permissão. Funcionários sem essa permissão recebem orientação para procurar o responsável.

Preserve o visual oficial das referências `pet-core-login.png` e `painel-petcore.png`: azul-marinho, turquesa, fundos claros, marca com pata/coração e o mesmo cachorro em `web/public/images/petcore-dog.png`. No login móvel, ele deve aparecer inteiro, incluindo as patas, com conteúdo centralizado e espaçamento.

Os formulários usam `FormDialog`: tela inteira até 780 px e modal centralizado no computador, sem formulários escondidos abaixo das listas. Foco, fechamento e rolagem do fundo são controlados. **Os avisos gerais de sucesso e erro mantêm a posição e o comportamento originais**, conforme pedido do usuário.

## Planos e cobrança

- **Plano Free:** experiência de 30 dias; não é gratuito permanente. Vem selecionado no modal do primeiro acesso do responsável. O relógio começa quando ele confirma o Free.
- **Plano Mensal:** R$ 35.
- **Plano Anual:** R$ 350.

É possível escolher um plano pago imediatamente, sem aguardar o teste. O pagamento acontece no checkout externo do PagBank. Escolher um plano ou voltar do checkout não comprova pagamento e não ativa acesso pago. A plataforma confere o recebimento no PagBank e registra a conciliação.

A conta atual é PagBank PF. Este fluxo usa links recorrentes hospedados e não precisa de token de produção da API de assinaturas. Os links atuais foram conferidos, sem compra: [PetCore Mensal — R$ 35](https://pag.ae/82jFKCTjo) e [PetCore Anual — R$ 350](https://pag.ae/82jFLbrjr). A revisão dos planos está aprovada no cadastro. Os links antigos de “sistema de demandas” não devem ser reutilizados. A publicação jurídica continua desativada; ela ainda é uma condição para liberar o checkout aos clientes pelo aplicativo.

O Free termina no vencimento, sem os dias de tolerância dos planos pagos. O vencimento bloqueia alterações, preservando consulta, assinatura, suporte e os canais próprios de privacidade. Documentos jurídicos publicados exigem aceite explícito da versão atual.

## Tecnologia e execução local

React 19, TypeScript, Vite e SCSS na interface; Node.js 22.12+, Express 5 e PostgreSQL na API. Sessões ficam no banco; os dados operacionais não ficam em `localStorage`. A imagem inclui clientes PostgreSQL 18 para backup e restauração.

1. Instale Node.js compatível e PostgreSQL local; `compose.yml` é uma alternativa com Docker.
2. Execute `npm ci` na raiz.
3. Copie `.env.example` para `.env` somente se ainda não existir. Defina conexão, senha e segredo de sessão privados.
4. Execute `npm run db:migrate`.
5. Somente em desenvolvimento, configure os valores `SEED_*` e execute `npm run db:seed` para criar a plataforma e empresas demonstrativas.
6. Execute `npm run dev` e abra `http://localhost:5173`.

Não execute seed em bases com clientes reais. Nunca envie `.env`, senhas, tokens ou conexões com senha ao repositório ou ao chat.

Para celular na mesma rede, mantenha `APP_ORIGIN=http://localhost:5173` e adicione o endereço Network real do Vite em `APP_ALLOWED_ORIGINS`. Reinicie a API após mudar as variáveis. Não use `*`; preserve o cabeçalho `X-PetCore-Request`.

## Testes e evidências locais

```powershell
npm run build
npm run test:unit -w api
npm run db:migrate -w api -- --test
npm run test:integration -w api
```

Integrações exigem `TEST_DATABASE_URL` de banco exclusivo terminado em `_test`, sem usar `DATABASE_URL` como alternativa. A suíte comercial altera configurações globais desse banco durante o teste e as restaura; não execute duas cópias dessa suíte no mesmo banco ao mesmo tempo.

Evidências registradas nesta preparação:

- Rodada completa de 103 testes aprovada: 18 unitários e 85 de integração, incluindo comercial 19/19, autenticação 11/11, lembretes 8/8 e regressões de upload.
- Restauração local de backup criptografado conferiu 46 tabelas, contagens e proteções contra chave incorreta, destino ocupado e uso da origem. O ensaio não inclui as fotos.
- Compilação da revisão publicada aprovada. Cadastro de serviço, profissional/jornada, cliente, pet e agendamento percorridos com dados fictícios. Agenda com novos espaçamentos conferida em computador/celular; após agendar, a data resultante fica visível.
- Ensaio HTTPS com 11 verificações aprovado: sessão segura, Free, origens, isolamento, permissões mínimas, fotos privadas, substituição/exclusão, exportação e anonimização. Todos os registros e objetos fictícios desse ensaio foram removidos.
- Recuperação invalida também os links anteriores da mesma conta. Os lembretes preservam a autorização em edições parciais e usam ordem sequencial dos eventos de consentimento. Os testes usam provedor simulado, sem e-mails reais.

Construção Docker, HTTPS e controles remotos de fotos já tiveram conferência. Isso não comprova adequação jurídica nem entrega regular de e-mails na Caixa de Entrada.

## Fotos, e-mails e privacidade

Fotos dependem de `OBJECT_STORAGE_*`. A API normaliza a imagem, remove metadados e fornece leitura temporária autorizada. Upload real, recusa de leitura anônima e exclusão foram conferidos. A retenção de versões e a recuperação dos objetos continuam sendo procedimentos próprios do armazenamento.

Recuperação usa `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY` e `EMAIL_FROM`; as variáveis foram configuradas sem disparar deploy e aguardam a revisão final. Lembretes usam outro processo, `RESEND_*` e liberação explícita. O serviço de lembretes foi preparado para cada cinco minutos, mas sua ativação ainda precisa ser confirmada após concluir o código e os testes. Somente tutores com autorização registrada podem receber. Contatos do CRM não disparam mensagens nem concedem consentimento.

Um único teste de e-mail foi aceito pelo Resend e o usuário confirmou o recebimento na pasta Spam. Isso comprova aquele recebimento, sem garantir entrega na Caixa de Entrada. O diagnóstico DNS e as verificações restantes estão em [EMAIL.md](docs/EMAIL.md).

Suporte e solicitações sobre dados pessoais: **tigertechbr@outlook.com**. O canal de contato não substitui um remetente validado no provedor de e-mail.

A identidade e o endereço foram informados: **José Andrey Pereira Lisboa**, pessoa física, marca **Tiger Tech — Sites, Sistemas e Soluções Digitais**, Rua Brasílio Machado, 404, Santo André/SP, CEP 09060-700. Domínio institucional e remetente: `tigertech.dev.br`. Não foi informado CNPJ. A implementação de privacidade não é certificação de conformidade: revisão/publicação jurídica, fornecedores, retenção e procedimentos operacionais ainda precisam de aprovação. Veja [PRIVACIDADE-LGPD.md](docs/PRIVACIDADE-LGPD.md) e [LEGAL-DRAFTS.md](docs/LEGAL-DRAFTS.md).

## Railway e recuperação

O ambiente de homologação usa o Neon e destinos privados separados para fotos e backups. Migrations 001–013 foram aplicadas na homologação e no banco original, confirmado como somente testes, após a cópia de preservação `br-quiet-mountain-b62dyl9j`. Não use seed ou testes destrutivos quando houver dados reais.

O serviço usa Dockerfile e configurações diretas no Railway para início, migrations e health check. Não depende de `railway.json` ou `railway.toml`. Não é necessário instalar outro PostgreSQL no Railway: o banco permanece no Neon.

A manutenção a cada 15 minutos e o backup diário às 03h de Brasília já tiveram execução confirmada. O backup cifra dump e manifesto com AES-256-GCM antes do envio a um bucket separado. Uma restauração remota conferiu 46 tabelas e registrou o backup de prefixo `ff3dc3a4` como `verified`. O dump não inclui fotos. Alertas, retenção, guarda externa da chave e recuperação dos objetos exigem acompanhamento próprio.

Procedimentos: [RAILWAY.md](docs/RAILWAY.md) e [OPERACAO.md](docs/OPERACAO.md).

## Principais arquivos

- `api/src/authRoutes.ts`, `dataRoutes.ts`, `calendarRoutes.ts`: acesso, cadastros e agenda.
- `api/src/crmRoutes.ts`, `businessRoutes.ts`, `privacyRoutes.ts`, `commercialRoutes.ts`: módulos de relacionamento, operação, privacidade e plataforma.
- `api/sql/`: migrations aditivas; não altere arquivos já aplicados.
- `api/scripts/migrate.mjs`, `backup.mjs`, `restore-check.mjs`: implantação e recuperação.
- `web/src/CrmPage.tsx`, `InventoryPage.tsx`, `FinancePage.tsx`, `ReportsPage.tsx`, `PrivacyPage.tsx`, `CommercialPages.tsx`: módulos da interface.
- `web/src/FirstSteps.tsx`, `FormDialog.tsx`, `DataPage.tsx`, `CalendarPage.tsx`: orientação e formulários responsivos.

O isolamento usa autorização na API, filtros por empresa, transações e FKs compostas. Não há RLS habilitado. Preservar essas garantias exige testar cada rota nova; uma compilação aprovada não substitui essa verificação.
