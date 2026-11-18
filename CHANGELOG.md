# Histórico

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/).

## 0.1.0

### Adicionado

- Build da ACBrLib ConsoleMT (BAL, PosPrinter, NFe e AbecsPinpad) da revisão r48681 para Linux x64, Windows x64, macOS Apple Silicon e macOS Intel, com teste de carga nativo em cada alvo.
- Interface de terminal para navegar no histórico do SVN, compilar candidatas e registrar a aprovação num commit assinado com SSH.
- Release a partir dos binários exatos da matriz aprovada, com `SHA256SUMS`, atestações de procedência, licenças e índice de [fontes correspondentes](docs/fontes-correspondentes.md).
- API pública em `src/index.ts` para repositórios que usam o Forge como submódulo.

### Limitações conhecidas

- O Windows x64 é compilado e testado, mas não é publicado em Releases até que a procedência da `libiconv.dll` do SVN seja comprovada. Veja o [guia de release](RELEASING.md#windows).
