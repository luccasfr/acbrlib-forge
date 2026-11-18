# Avisos de terceiros

O arquivo [LICENSE](LICENSE) se aplica à parte original do Forge.

- Os trechos dos fontes do Projeto ACBr em `patches/shared.json` e `patches/darwin.ts` preservam os [avisos dos arquivos da revisão r48681](LICENSES/ACBr.txt), inclusive o aviso do Synapse em `OpenSSLExt.pas`. Os trechos sob LGPL 2.1 ou posterior continuam sob essa licença. [Texto da LGPL 2.1](LICENSES/LGPL-2.1-or-later.txt)
- Os trechos do Synapse em `patches/darwin.ts` preservam os direitos e as condições dos cabeçalhos de origem. [Avisos do Synapse](LICENSES/Synapse.txt)
- O Forge obtém os fontes do ACBr e da ACBrLib no SVN público, na revisão declarada. Preserve os termos e os avisos de cada arquivo, inclusive dos trechos usados em `patches/`. [Fontes e licença do Projeto ACBr](https://projetoacbr.com.br/fontes/)
- Os patches para Darwin também afetam arquivos do Synapse incorporados ao ACBr. Essas alterações seguem os termos e avisos dos arquivos do Synapse.
- Lazarus e Free Pascal fornecem o compilador e as unidades usados no build. O Forge obtém ambos nas fontes de origem dos projetos.
- OpenSSL, libxml2, DLLs auxiliares e schemas da NF-e no Windows vêm da revisão escolhida do ACBr. O pacote macOS usa OpenSSL do Homebrew e a libxml2 do sistema.

Antes de distribuir os binários, confira os avisos e as obrigações de disponibilização dos fontes de cada arquivo. Inclua os fontes correspondentes e os patches aplicados conforme esses termos. Veja a configuração da publicação no [guia de release](RELEASING.md).
