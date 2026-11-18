# Preparar um release da ACBrLib Forge

O workflow **Prepare release** roda em uma tag `vX.Y.Z` e usa os binários da execução aprovada. O mantenedor publica o rascunho depois de revisar os arquivos e as notas.

## 1. Configurar a validação técnica

- Em **Settings → Secrets and variables → Actions → Secrets**, cadastre `ACBRLIB_CANDIDATE_KEY` com 32 bytes aleatórios em hexadecimal. Gere o valor localmente, por exemplo com `openssl rand -hex 32`, e guarde-o como segredo. Mantenha a mesma chave até concluir o release.
- O Windows recebe os binários cifrados para o teste de carga. A validação guarda somente arquivos cifrados e evidências de SHA-256. Se os artefatos expirarem ou a chave for trocada, execute a matriz e aprove a nova candidata.
- Use o GitHub CLI autenticado na conta que mantém o repositório. Configure a assinatura SSH do Git e registre a chave pública em `approvers` no formato `allowed_signers`. O primeiro cadastro é assinado pela própria chave. Alterações posteriores exigem assinatura de um aprovador anterior.

## 2. Aprovar a revisão

1. Atualize a versão de `package.json` e envie à `main` a receita que será publicada. No GitHub Actions, execute manualmente **Validate ACBrLib** nessa branch, passando a revisão do SVN.
2. Confira os resultados de Linux x64, Windows x64, macOS Apple Silicon e macOS Intel. Anote o ID da execução.
3. No clone com histórico Git completo, execute os comandos abaixo. A interface `bun run forge review` também permite selecionar a revisão e informar o ID.

```sh
bun run forge approve 48681 --run <id-da-execucao>
bun run forge verify
```

O Forge compara revisão, receita, patches, commit de origem e SHA-256 do artefato por alvo. O commit assinado registra o inventário em `approved-builds.json` e seu hash em `acbr.lock`. Para reaprovar ou voltar, execute o mesmo fluxo com a revisão nas evidências novas. Alterações na receita após a validação exigem uma nova execução.

## 3. Preparar a distribuição e revisar o rascunho

Confira os termos dos binários, dependências, schemas e patches nos [avisos de terceiros](THIRD_PARTY_NOTICES.md). Registre os avisos e textos de licença aplicáveis em `LICENSES/`. Disponibilize os fontes correspondentes e registre a revisão em **Settings → Secrets and variables → Actions → Variables** com `ACBRLIB_DISTRIBUTION_REVIEWED=true` e `ACBRLIB_CORRESPONDING_SOURCE_URL`. A URL HTTPS pública deve apontar para os fontes da revisão publicada ou para um índice que os identifique.

Envie o commit de aprovação à branch `main`. Crie a tag no commit aprovado, com a mesma versão de `package.json`:

```sh
git tag -a v0.1.0 -m "ACBrLib Forge v0.1.0"
git push origin v0.1.0
```

O workflow confere tag, assinatura e condições de distribuição. Depois baixa a execução aprovada, confere o hash de cada arquivo antes de extraí-lo e empacota os mesmos binários em quatro arquivos `.tar.gz`. O rascunho inclui `SHA256SUMS` e atestações do empacotamento. O manifesto identifica o commit que originou os binários e a toolchain usada.

Em **Releases**, confira os quatro arquivos, o `SHA256SUMS` e as notas antes de publicar o rascunho. Se o envio falhar depois de criar o rascunho, inspecione os assets existentes antes de repetir o envio. O workflow preserva releases existentes.

Para verificar a procedência de um arquivo já publicado:

```sh
gh attestation verify <arquivo.tar.gz> --repo luccasfr/acbrlib-forge
```

## Validação entre releases

PRs e atualizações em `main` executam typecheck e testes. PRs que alteram a receita também compilam em Docker. O envio dos binários cifrados fica no disparo manual da matriz a partir de `main`. O envio público fica no fluxo de release.
