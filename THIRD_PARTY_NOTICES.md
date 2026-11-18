# Avisos de terceiros

O arquivo [LICENSE](LICENSE) (MIT) se aplica à parte original do Forge: scripts, interface de terminal, imagem Docker e workflows. As bibliotecas compiladas e os trechos de terceiros seguem as licenças abaixo. Todo pacote de release inclui este arquivo, a pasta `LICENSES/` e o `SOURCES.md` com os [fontes correspondentes](docs/fontes-correspondentes.md).

## Código compilado nas bibliotecas

| Componente | Licença | Texto |
| --- | --- | --- |
| ACBr e ACBrLib | LGPL 2.1 ou posterior, conforme os cabeçalhos dos arquivos | [ACBr](LICENSES/ACBr.txt) · [LGPL 2.1](LICENSES/LGPL-2.1-or-later.txt) |
| Synapse (incorporado ao ACBr) | Licença BSD do Synapse | [Synapse](LICENSES/Synapse.txt) |
| RTL e pacotes do Free Pascal | LGPL com exceção de ligação estática | [COPYING.FPC](LICENSES/FPC-RTL-exception.txt) · [LGPL 2.1](LICENSES/LGPL-2.1-or-later.txt) |
| LCL do Lazarus (widgetset nogui) | LGPL modificada do Lazarus | [COPYING.modifiedLGPL](LICENSES/Lazarus-modifiedLGPL.txt) · [LGPL 2.1](LICENSES/LGPL-2.1-or-later.txt) |

Os patches em `patches/shared.json` e `patches/darwin.ts` alteram arquivos do ACBr e do Synapse. Os trechos alterados continuam sob as licenças dos arquivos de origem.

## Arquivos incluídos nos pacotes

| Alvo | Arquivos de terceiros no pacote | Licença |
| --- | --- | --- |
| Linux x64 | Schemas da NF-e | Distribuídos pelo ACBr na revisão declarada |
| Windows x64 | `libcrypto-3-x64.dll`, `libssl-3-x64.dll` e `legacy.dll` do OpenSSL 3; `libxml2.dll`; `libiconv-2.dll`; schemas da NF-e | OpenSSL: [Apache 2.0](LICENSES/OpenSSL-Apache-2.0.txt) · libxml2: [MIT](LICENSES/libxml2-MIT.txt) · libiconv: [LGPL 2.1 ou posterior](LICENSES/LGPL-2.1-or-later.txt) |
| macOS (arm64 e x64) | `libcrypto.3.dylib`, `libssl.3.dylib` e `legacy.dylib` do OpenSSL 3, além dos schemas da NF-e | OpenSSL: [Apache 2.0](LICENSES/OpenSSL-Apache-2.0.txt) |

No Linux, OpenSSL 3 e libxml2 vêm do sistema. No macOS, a libxml2 vem do sistema.

As DLLs do Windows são compiladas pelo Forge, com mingw-w64, a partir dos tarballs oficiais do OpenSSL, da libxml2 e da libiconv, fixados por SHA-256 em [`docker/Dockerfile`](docker/Dockerfile). A receita está em [`docker/windows-runtime.sh`](docker/windows-runtime.sh), e as versões ficam registradas no `manifest.json` de cada pacote.
