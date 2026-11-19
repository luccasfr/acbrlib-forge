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
| OpenSSL (macOS, incluído no pacote) | Fórmula `openssl@3` do Homebrew, construída a partir de [openssl.org](https://www.openssl.org/source/) | Registrada em `macos-*Toolchain.openssl` |
| OpenSSL (Windows, incluído no pacote) | Tarball oficial em [github.com/openssl/openssl/releases](https://github.com/openssl/openssl/releases) | `windows-*Runtime.openssl` |
| libxml2 (Windows, incluída no pacote) | Tarball oficial em [download.gnome.org/sources/libxml2](https://download.gnome.org/sources/libxml2/) | `windows-*Runtime.libxml2` |
| libiconv (Windows, incluída no pacote) | Tarball oficial em [ftp.gnu.org/pub/gnu/libiconv](https://ftp.gnu.org/pub/gnu/libiconv/), com assinatura GPG do mantenedor | `windows-*Runtime.libiconv` |
| mingw-w64 (compilador das DLLs do Windows) | Pacotes `gcc-mingw-w64-x86-64-win32` e `gcc-mingw-w64-i686-win32` do Debian 12 | `windows-*Runtime.mingw-w64-gcc` |
| OpenSSL e libxml2 (Android, incluídos no pacote) | Os mesmos tarballs oficiais do Windows | `android-*Runtime.openssl` e `android-*Runtime.libxml2` |
| Android NDK (compilador e sysroot do Bionic) | [developer.android.com/ndk](https://developer.android.com/ndk/downloads), com SHA-1 conferido no site e SHA-256 fixado | `android-*Runtime.ndk` e `android-*Runtime.api` |

No Linux, OpenSSL 3 e libxml2 são dependências do sistema e não vão no pacote. No macOS, a libxml2 é a do sistema.

As DLLs do Windows são compiladas por [`docker/windows-runtime.sh`](../docker/windows-runtime.sh), sem alterações nos fontes, a partir dos tarballs fixados por SHA-256 em [`docker/Dockerfile`](../docker/Dockerfile). A libxml2 é gerada como `libxml2-16.dll` e copiada como `libxml2.dll`, o nome que a ACBrLib carrega.

## Disponibilidade

Os fontes do ACBr ficam no SVN do Projeto ACBr, e as alterações e a receita ficam neste repositório. Se algum desses locais ficar indisponível, abra uma issue com a versão do pacote. O mantenedor fornece uma cópia dos fontes correspondentes daquele release por pelo menos três anos depois da publicação.
