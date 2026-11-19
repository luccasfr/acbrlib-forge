# Histórico

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/).

## 0.4.0

### Adicionado

- Alvos Android arm64-v8a e armeabi-v7a na matriz e em Releases, com os modos oficiais do ACBr, a API 24 como mínima e páginas de 16 KB no arm64.
- Compiladores cruzados do FPC 3.2.2 para `aarch64-android` e `arm-android` (ARMv7-A, VFPv3), com os binutils ARM do Debian 12 e o sysroot do NDK r30.
- OpenSSL 3.5.9 e libxml2 2.15.4 para Android, compilados pelo Forge com o NDK a partir dos mesmos tarballs oficiais.
- Checagem de ELF de cada biblioteca Android no build: arquitetura, dependências só do Bionic, alinhamento de 16 KB e funções exportadas.
- Teste de carga num emulador Android na CI, com o programa `scripts/android-smoke.c`.

## 0.3.0

### Adicionado

- Alvos Linux i386 e Windows i386 na matriz nativa e em Releases. O Linux i386 é testado num contêiner `linux/386`, e o Windows i386, com Python x86 no Windows.
- Compiladores cruzados do FPC 3.2.2 para `i386-linux` e `i386-win32`, gerados do mesmo fonte fixado, com binutils i686 e a libc i386 do Debian 12.
- DLLs de runtime do Windows i386 (`libcrypto-3.dll`, `libssl-3.dll`, `legacy.dll`, `libxml2.dll` e `libiconv-2.dll`), compiladas com mingw-w64 i686 a partir dos mesmos tarballs do x64.
- Campos `buildMode` e `derivedMode` em cada biblioteca do manifesto.

### Alterado

- BAL, PosPrinter e AbecsPinpad não têm modo win32 oficial na r48681. No Windows i386, o Forge deriva esses módulos do modo win64 do próprio projeto e os marca com `derivedMode` (veja o README).

## 0.2.0

### Adicionado

- Pacote do Windows x64 em Releases.
- DLLs de runtime do Windows compiladas pelo Forge com mingw-w64 a partir dos tarballs oficiais: OpenSSL 3.5.9 (com o provider `legacy`), libxml2 2.15.4 e libiconv 1.19.1. As versões ficam em `windows-x86_64Runtime` no manifesto.
- O build recusa DLLs com dependências fora do pacote e uma `libxml2.dll` sem alguma das funções que o ACBr carrega.
- O teste de carga do Windows também carrega e inicializa as DLLs de runtime.

### Alterado

- As DLLs prontas do SVN do ACBr (`DLLs/OpenSSL`, `DLLs/LibXml2`) deixam de ser usadas. O pacote do Windows não leva mais `libxslt.dll` e `libexslt.dll`, que a ACBrLib não carrega, nem depende do runtime do Visual C++.
- GitHub Actions atualizadas para as versões com Node 24.

## 0.1.0

### Adicionado

- Build da ACBrLib ConsoleMT (BAL, PosPrinter, NFe e AbecsPinpad) da revisão r48681 para Linux x64, Windows x64, macOS Apple Silicon e macOS Intel, com teste de carga nativo em cada alvo.
- Interface de terminal para navegar no histórico do SVN, compilar candidatas e registrar a aprovação num commit assinado com SSH.
- Release a partir dos binários exatos da matriz aprovada, com `SHA256SUMS`, atestações de procedência, licenças e índice de [fontes correspondentes](docs/fontes-correspondentes.md).
- API pública em `src/index.ts` para repositórios que usam o Forge como submódulo.

### Limitações conhecidas

- O Windows x64 era compilado e testado, mas ficou fora de Releases porque a procedência da `libiconv.dll` do SVN não era comprovada. Resolvido na 0.2.0.
