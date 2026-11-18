# Como contribuir

Execute `bun install --frozen-lockfile`, `bun run check` e `bun run test`. Se a mudança afetar os binários, compile em um clone limpo e informe a revisão do SVN, o alvo, os módulos e o resultado do teste de carga.

Mantenha os patches pequenos e registre o arquivo original, o motivo e a revisão. Preserve os avisos de terceiros. Ao propor um alvo, inclua o procedimento de compilação em um host limpo e o teste de carga nativo.

Alterações na receita ou nos módulos padrão exigem uma nova matriz e aprovação assinada antes da tag. Consulte o [guia de release](RELEASING.md).
