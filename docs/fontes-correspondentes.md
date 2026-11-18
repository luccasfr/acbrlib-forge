# Fontes correspondentes

Cada pacote publicado em **Releases** traz um `SOURCES.md` com a revisão do ACBr, o commit do Forge e o SHA-256 dos patches. Este índice explica onde obter cada parte dos fontes usados para produzir esses binários.

## ACBr e ACBrLib

As bibliotecas são compiladas a partir do SVN público do Projeto ACBr, na revisão indicada em `SOURCES.md`:

```sh
svn export -r <revisão> https://svn.code.sf.net/p/acbr/code/trunk2 acbr-trunk2
```

Os projetos ConsoleMT ficam em `Projetos/ACBrLib/Fontes/<módulo>/` e as unidades compartilhadas, em `Fontes/`. Os schemas da NF-e vêm de `Exemplos/ACBrDFe/Schemas/NFe`.

## Alterações aplicadas

O Forge aplica sobre a revisão exportada os patches versionados neste repositório, no commit indicado em `SOURCES.md`:

- [`patches/shared.json`](../patches/shared.json): substituições exatas em todos os alvos;
- [`patches/darwin.ts`](../patches/darwin.ts): ajustes para macOS em unidades do ACBr e do Synapse.

A receita completa de build, incluindo scripts, imagem Docker e workflows, está no mesmo commit. Para reproduzir um pacote, faça o checkout desse commit e siga o [guia de build](../README.md#compilar-a-partir-dos-fontes).

## Toolchain e dependências

| Componente | Origem | Versão |
| --- | --- | --- |
| Free Pascal (RTL e pacotes) | [downloads.freepascal.org](https://downloads.freepascal.org/fpc/dist/) no Linux; Homebrew no macOS | Registrada no `manifest.json` do pacote |
| Lazarus (LCL nogui e lazbuild) | Tag `lazarus_3_6` em [gitlab.com/freepascal.org/lazarus](https://gitlab.com/freepascal.org/lazarus/lazarus) | Registrada no `manifest.json` do pacote |
| OpenSSL (somente macOS, incluído no pacote) | Fórmula `openssl@3` do Homebrew, construída a partir de [openssl.org](https://www.openssl.org/source/) | Registrada em `macos-*Toolchain.openssl` |

No Linux, OpenSSL 3 e libxml2 são dependências do sistema e não vão no pacote. No macOS, a libxml2 é a do sistema.

## Disponibilidade

Os fontes do ACBr ficam no SVN do Projeto ACBr, e as alterações e a receita ficam neste repositório. Se algum desses locais ficar indisponível, abra uma issue com a versão do pacote. O mantenedor fornece uma cópia dos fontes correspondentes daquele release por pelo menos três anos depois da publicação.
