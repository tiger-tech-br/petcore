# Itens em execução e tarefas concluídas na Hostinger

Conferência de 20/11/2026 na VPS 2162451. A lista pode mostrar como **interrompido** um contêiner que executou uma tarefa pontual e terminou normalmente. Esse estado, sozinho, não indica falha.

| Projeto | O que deve permanecer em execução |
|---|---|
| `petcore-validation` | Aplicação e proxy HTTPS: dois contêineres. A aplicação foi conferida como saudável |
| `petcore-data-20261120` | PostgreSQL: um contêiner saudável. A tarefa `roles` já concluiu a preparação e fica finalizada |
| `petcore-storage-20261120` | Armazenamento privado: um contêiner. A tarefa `prepare` já concluiu a preparação e fica finalizada |
| `petcore-jobs-20261120` | Três agendadores: manutenção, lembretes autorizados e backup |
| `beautybarber` | Três contêineres separados, em execução; banco saudável. Não foram alterados na migração do PetCore |

Os demais itens com nomes como `restore`, `schema-stage`, `public-proof`, `backup-proof`, `release`, `preflight` e `copy` foram utilizados para instalação, transferência e verificações. Os registros conferidos de restauração, esquema, código, backup e validação pública indicaram sucesso. Há também tentativas antigas de construção que não produziram contêineres. Não é necessário deixar todas essas tarefas em execução.

**Não clique em iniciar todos os projetos.** Algumas tarefas possuem travas para evitar repetição e outras só fazem sentido durante uma preparação específica. Não exclua projetos para limpar a lista sem conferir os volumes: um volume que contém banco, arquivos, certificados ou configurações privadas pode ser compartilhado com um serviço ativo.

Para avaliar uma possível falha, confira o serviço que deveria permanecer ativo, o resultado da última execução e seus registros. Um agendador em execução ainda precisa ter o resultado de cada tarefa acompanhado. A manutenção e os lembretes apresentaram execuções com código zero na conferência; o backup foi criado e restaurado em um ensaio separado. A próxima execução diária das 03h deve ser acompanhada normalmente.

O endereço público continua sendo <https://petcore.tigertech.dev.br>. O nome administrativo `petcore-validation` não significa conexão com o Neon: o banco ativo é o PostgreSQL da própria VPS.
