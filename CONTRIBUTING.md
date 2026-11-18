# Como contribuir

Execute `bun install --frozen-lockfile`, `bun run check` e `bun run test`. Se a mudança afetar os binários, compile num clone limpo e informe a revisão do SVN, o alvo, os módulos e o resultado do teste de carga.

## Pull requests

- A `main` só recebe alterações por pull request, com o check `check` aprovado e commits assinados.
- As PRs são mescladas com **merge commit**, para preservar a assinatura dos commits de aprovação.
- Use mensagens no formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), por exemplo `fix(macos): …`, `docs: …` ou `chore(acbr): approve r48681`.

## Patches e alvos

Mantenha os patches pequenos e registre o arquivo original, o motivo e a revisão. Preserve os avisos de terceiros. Ao propor um alvo, inclua o procedimento de compilação num host limpo e o teste de carga nativo.

Alterações na receita ou nos módulos padrão exigem uma nova matriz e uma aprovação assinada antes da tag. Consulte o [guia de release](RELEASING.md).

## API para outros repositórios

Repositórios que usam o Forge como submódulo devem importar somente de [`src/index.ts`](src/index.ts). Os demais módulos de `src/` são internos e podem mudar sem aviso.
