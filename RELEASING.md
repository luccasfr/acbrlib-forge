# Preparar um release do ACBrLib Forge

O workflow **Prepare release** roda numa tag `vX.Y.Z` e empacota os binários que a matriz aprovada produziu, sem recompilar. Ele cria um rascunho em **Releases**, e o mantenedor o publica depois de revisar arquivos e notas.

Para compilar no seu hardware, siga o [guia de build](README.md#compilar-a-partir-dos-fontes). A matriz usa runners padrão do GitHub, gratuitos em repositórios públicos. [Cobrança do GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

## Alvos publicados

| Alvo | Matriz nativa | Release |
| --- | --- | --- |
| Linux x64 | Sim | Sim |
| macOS Apple Silicon | Sim | Sim |
| macOS Intel | Sim | Sim |
| Windows x64 | Sim | Sim |

A lista de alvos publicados fica em `RELEASE_TARGETS`, em [`src/review.ts`](src/review.ts). O workflow lê a lista dali e recusa pacotes de outros alvos.

## 1. Configurar a validação técnica

- Em **Settings → Secrets and variables → Actions → Secrets**, cadastre `ACBRLIB_CANDIDATE_KEY` com 32 bytes aleatórios em hexadecimal, por exemplo `openssl rand -hex 32`. Os binários da matriz são enviados cifrados com essa chave, porque artefatos de repositórios públicos podem ser baixados por qualquer pessoa.
- Use o GitHub CLI autenticado na conta que mantém o repositório. Configure a assinatura SSH do Git e registre a chave pública em `approvers` no formato `allowed_signers`. O primeiro cadastro é assinado pela própria chave. Alterações posteriores exigem a assinatura de um aprovador anterior.

### Validade da aprovação

O release reaproveita os artefatos da execução aprovada, então a aprovação vale enquanto eles existirem e puderem ser decifrados:

- **Expiração:** os artefatos `build-*` e `evidence-*` ficam 90 dias no GitHub, o máximo permitido. Publique a tag dentro desse prazo, contado a partir da execução registrada em `ACBR_EVIDENCE` no `acbr.lock`.
- **Troca de chave:** trocar `ACBRLIB_CANDIDATE_KEY` invalida os artefatos já cifrados.

Nos dois casos, execute a matriz novamente e reaprove a mesma revisão antes da tag.

## 2. Aprovar a revisão

A `main` é protegida: exige pull request e o check `check`, inclusive para administradores. Mescle as PRs com **merge commit**. Squash e rebase recriam os commits sem a assinatura do aprovador, e a verificação passaria a recusar o lock. A assinatura que vale para a aprovação é a conferida pelo Forge contra `approvers`, independentemente do selo "Verified" do GitHub.

1. Atualize a versão em `package.json` e mescle na `main` a receita que será publicada.
2. Em **Actions → Validate ACBrLib**, execute o workflow manualmente na `main`, informando a revisão do SVN. Anote o ID da execução quando os quatro alvos passarem.
3. Numa branch criada a partir da `main`, com histórico completo:

   ```sh
   bun run forge approve 48681 --run <id-da-execucao>
   bun run forge verify
   ```

   O Forge compara revisão, receita, patches, commit de origem e SHA-256 do artefato de cada alvo. Depois grava `approved-builds.json`, o hash dele no `acbr.lock` e um relatório em `changes/`, num commit assinado. A interface `bun run forge review` faz o mesmo de forma guiada.
4. Abra a PR da aprovação e mescle-a com merge commit.

Para voltar a uma revisão anterior, repita o fluxo com essa revisão. Qualquer alteração na receita depois da validação exige uma nova execução.

## 3. Publicar a distribuição

Em **Settings → Secrets and variables → Actions → Variables**, mantenha:

| Variável | Valor |
| --- | --- |
| `ACBRLIB_DISTRIBUTION_REVIEWED` | `true` depois de conferir os [avisos de terceiros](THIRD_PARTY_NOTICES.md) dos alvos publicados |
| `ACBRLIB_CORRESPONDING_SOURCE_URL` | `https://github.com/luccasfr/acbrlib-forge/blob/main/docs/fontes-correspondentes.md` |

Crie uma tag anotada e assinada no merge commit da aprovação, com a mesma versão do `package.json`:

```sh
git switch main && git pull
git tag -s v0.1.0 -m "ACBrLib Forge v0.1.0"
git push origin v0.1.0
```

O workflow confere tag, aprovação assinada e configuração da distribuição. Em seguida baixa os artefatos aprovados, confere o SHA-256 de cada um antes de extraí-lo e empacota um `.tar.gz` por alvo publicado. O rascunho inclui `SHA256SUMS` e atestações de procedência.

Confira em **Releases** os arquivos, o `SHA256SUMS` e as notas, e publique o rascunho. Se o envio falhar depois de o rascunho ser criado, inspecione os assets existentes antes de repetir; o workflow não sobrescreve releases.

Para verificar a procedência de um arquivo publicado:

```sh
gh attestation verify <arquivo.tar.gz> --repo luccasfr/acbrlib-forge
```

## Dependências do Windows

O pacote do Windows não usa as DLLs prontas do SVN do ACBr (`DLLs/OpenSSL`, `DLLs/LibXml2`), cuja origem não é verificável: a `libiconv.dll` da r18175, por exemplo, não confere com nenhum build público. O estágio `windows-runtime` do [`docker/Dockerfile`](docker/Dockerfile) compila OpenSSL, libiconv e libxml2 com mingw-w64, a partir dos tarballs oficiais, e o build recusa o pacote quando:

- uma DLL importa algo que não é do Windows nem do próprio pacote;
- a `libxml2.dll` não exporta alguma função que o ACBr da revisão carrega por `GetProcAddress`.

Para atualizar uma dependência:

1. Troque a versão e o SHA-256 no `Dockerfile`. Confira o hash com o publicado pelo projeto; no caso da libiconv, valide a assinatura GPG do tarball com o [keyring do GNU](https://ftp.gnu.org/gnu/gnu-keyring.gpg).
2. Mantenha o OpenSSL na série 3.x: a ACBrLib procura `libcrypto-3-x64.dll` e `libssl-3-x64.dll`.
3. Atualize os textos em `LICENSES/` se a licença mudar e repita a matriz e a aprovação.

## Validação entre releases

PRs e commits na `main` executam typecheck e testes. PRs que alteram a receita (`src/`, `scripts/`, `docker/`, `patches/`, `modules.json` e workflows) também compilam em Docker. A matriz com os binários cifrados roda só no disparo manual a partir da `main`.
