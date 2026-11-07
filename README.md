# PetCore — gestão para pet shops

Sistema SaaS multiempresa da Tiger Tech, em português, com interface responsiva. Abre no login e reúne a operação interna do pet shop. O projeto está em preparação para homologação; a existência dos módulos e testes locais ainda não libera a oferta comercial.

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

A conta atual é PagBank PF. Este fluxo usa links recorrentes hospedados e não precisa de token de produção da API de assinaturas. Os links fornecidos têm valores de R$ 35/R$ 350, mas, na última conferência, ainda identificavam outro produto; continuam sem revisão aprovada no sistema.

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

- Rodada completa de 84 testes aprovada: 18 unitários e 66 de integração, incluindo comercial 19/19 e regressões de upload.
- Restauração local de backup criptografado conferiu 46 tabelas, contagens e proteções contra chave incorreta, destino ocupado e uso da origem. O ensaio não inclui as fotos.
- Compilação final aprovada. Cadastro de serviço, profissional/jornada, cliente, pet e agendamento percorridos com dados fictícios. Agenda com novos espaçamentos conferida em computador/celular; após agendar, a data resultante fica visível. A conferência HTTPS remota ainda precisa ser registrada.

Esses resultados não comprovam construção Docker, entrega de e-mail, permissões do armazenamento remoto ou adequação jurídica da operação.

## Fotos, e-mails e privacidade

Fotos dependem de `OBJECT_STORAGE_*`. A API valida e normaliza a imagem, remove metadados e fornece leitura temporária autorizada. O banco guarda a referência ao arquivo. Configure e confira bucket privado, permissões, versões e retenção no provedor.

Recuperação de senha usa `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY` e `EMAIL_FROM`. Lembretes são outro processo, com `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e liberação explícita por duas variáveis. Ambos permanecem sem validação de envio real nesta homologação. Contatos do CRM não disparam mensagens nem alteram consentimentos.

Suporte e solicitações sobre dados pessoais: **tigertechbr@outlook.com**. O canal de contato não substitui um remetente validado no provedor de e-mail.

A implementação de privacidade não é uma certificação de conformidade. Ainda faltam identificação/endereço reais do operador, revisão dos documentos, fornecedores e regiões efetivos, retenção e procedimentos operacionais aprovados. Veja [PRIVACIDADE-LGPD.md](docs/PRIVACIDADE-LGPD.md) e [LEGAL-DRAFTS.md](docs/LEGAL-DRAFTS.md).

## Railway e recuperação

Foi preparado um ambiente isolado de homologação no Railway, com branch de testes separado no Neon e destinos separados para fotos e backups. O domínio reservado é [petcore-homologacao.up.railway.app](https://petcore-homologacao.up.railway.app). **A implantação e a validação desse endereço ainda estão pendentes neste registro.**

O serviço usa Dockerfile e configurações diretas no Railway para início, migrations e health check. Não depende de `railway.json` ou `railway.toml`. Não é necessário instalar outro PostgreSQL no Railway: o banco permanece no Neon.

O backup cifra dump e manifesto com AES-256-GCM antes do envio a um bucket separado. O script de restauração exige banco novo, vazio e terminado em `_restore_test`. Backups automáticos, alertas, retenção e recuperação dos objetos precisam de configuração e conferência externas.

Procedimentos: [RAILWAY.md](docs/RAILWAY.md) e [OPERACAO.md](docs/OPERACAO.md).

## Principais arquivos

- `api/src/authRoutes.ts`, `dataRoutes.ts`, `calendarRoutes.ts`: acesso, cadastros e agenda.
- `api/src/crmRoutes.ts`, `businessRoutes.ts`, `privacyRoutes.ts`, `commercialRoutes.ts`: módulos de relacionamento, operação, privacidade e plataforma.
- `api/sql/`: migrations aditivas; não altere arquivos já aplicados.
- `api/scripts/migrate.mjs`, `backup.mjs`, `restore-check.mjs`: implantação e recuperação.
- `web/src/CrmPage.tsx`, `InventoryPage.tsx`, `FinancePage.tsx`, `ReportsPage.tsx`, `PrivacyPage.tsx`, `CommercialPages.tsx`: módulos da interface.
- `web/src/FirstSteps.tsx`, `FormDialog.tsx`, `DataPage.tsx`, `CalendarPage.tsx`: orientação e formulários responsivos.

O isolamento usa autorização na API, filtros por empresa, transações e FKs compostas. Não há RLS habilitado. Preservar essas garantias exige testar cada rota nova; uma compilação aprovada não substitui essa verificação.
