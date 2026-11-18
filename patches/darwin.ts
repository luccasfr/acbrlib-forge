/**
 * Ajustes mínimos para o darwin. Cada um altera só o ramo DARWIN (ou uma
 * conversão neutra) e é idempotente; um texto ausente interrompe o build
 * para revisão quando a revisão do ACBr mudar.
 *
 * - O OpenSSL era procurado pelos nomes sem versão. No macOS esses nomes
 *   resolvem para os stubs de /usr/lib, que abortam o processo inteiro. O
 *   build distribui o OpenSSL 3 ao lado da biblioteca (`@loader_path`).
 * - O provedor `legacy` (PFX com RC2/3DES) é procurado na pasta do OpenSSL
 *   carregado, como no Windows. Sem isso, o OpenSSL usaria a pasta da
 *   instalação de origem e um segundo libcrypto entraria no processo.
 * - A LibXml2 não tinha ramo darwin; usa a do sistema.
 * - No darwin `TThreadID` é um ponteiro (pthread_t), não um inteiro.
 */
const crlf = (text: string) => text.replace(/\n/g, "\r\n");
export const darwinPatches: { file: string; from: string; to: string }[] = [
  {
    // Carregar só o `legacy` desliga o fallback para o `default` e nenhum PFX
    // abre (nem RC2: PKCS12KDF e HMAC ficam no `default`).
    file: "Fontes/ACBrOpenSSL/OpenSSLExt.pas",
    from: "      OSSL_PROVIDER_load(Nil, 'legacy'); // Loading legacy.dll",
    to: "      {$IfDef DARWIN}OSSL_PROVIDER_load(Nil, 'default');{$EndIf}\r\n      OSSL_PROVIDER_load(Nil, 'legacy'); // Loading legacy.dll",
  },
  {
    file: "Fontes/ACBrOpenSSL/OpenSSLExt.pas",
    from: crlf("uses\n  strutils\n"),
    to: crlf("uses\n  strutils {$IfDef DARWIN}, dl{$EndIf}\n"),
  },
  {
    file: "Fontes/ACBrOpenSSL/OpenSSLExt.pas",
    from: crlf("Function LoadLibraries : Boolean;\n"),
    to: crlf(
      [
        "{$IfDef DARWIN}",
        "// Caminho do Mach-O que contém o endereço (GetModuleFilename).",
        "function DarwinModuleFile(Address: Pointer): String;",
        "var",
        "  Info: dl_info;",
        "begin",
        "  Result := '';",
        "  if Assigned(Address) and (dladdr(Address, @Info) <> 0) and Assigned(Info.dli_fname) then",
        "    Result := String(Info.dli_fname);",
        "end;",
        "{$EndIf}",
        "",
        "Function LoadLibraries : Boolean;",
        "",
      ].join("\n"),
    ),
  },
  {
    file: "Fontes/ACBrOpenSSL/OpenSSLExt.pas",
    from: crlf("  {$EndIf}\n\n  Result := (SSLLibHandle<>0) and (SSLUtilHandle<>0);\n"),
    to: crlf(
      [
        "  {$EndIf}",
        "  {$IfDef DARWIN}",
        "  if (SSLLibHandle <> 0) then",
        "    SSLLibFile := DarwinModuleFile(GetProcAddress(SSLLibHandle, 'SSL_new'));",
        "  if (SSLUtilHandle <> 0) then",
        "    SSLUtilFile := DarwinModuleFile(GetProcAddress(SSLUtilHandle, 'OPENSSL_init_crypto'));",
        "  {$EndIf}",
        "",
        "  Result := (SSLLibHandle<>0) and (SSLUtilHandle<>0);",
        "",
      ].join("\n"),
    ),
  },
  ...["Fontes/ACBrOpenSSL/OpenSSLExt.pas", "Fontes/Terceiros/synalist/ssl_openssl_lib.pas"].flatMap(
    (file) => [
      { file, from: "('libssl.dylib')", to: "('@loader_path/libssl.3.dylib')" },
      { file, from: "('libcrypto.dylib')", to: "('@loader_path/libcrypto.3.dylib')" },
    ],
  ),
  {
    file: "Fontes/Terceiros/synalist/ssl_openssl11_lib.pas",
    from: "DLLSSLName: string = 'libssl.dylib';",
    to: "DLLSSLName: string = '@loader_path/libssl.3.dylib';",
  },
  {
    file: "Fontes/Terceiros/synalist/ssl_openssl11_lib.pas",
    from: "DLLUtilName: string = 'libcrypto.dylib';",
    to: "DLLUtilName: string = '@loader_path/libcrypto.3.dylib';",
  },
  {
    file: "Fontes/Terceiros/synalist/ssl_openssl3_lib.pas",
    from: "DLLSSLName: string = 'libssl.3.dylib';",
    to: "DLLSSLName: string = '@loader_path/libssl.3.dylib';",
  },
  {
    file: "Fontes/Terceiros/synalist/ssl_openssl3_lib.pas",
    from: "DLLUtilName: string = 'libcrypto.3.dylib';",
    to: "DLLUtilName: string = '@loader_path/libcrypto.3.dylib';",
  },
  {
    file: "Fontes/ACBrLibXML2/ACBrLibXml2Ext.pas",
    from: "LIBXML2_SO = 'libxml2.so';",
    to: "LIBXML2_SO = {$IFDEF DARWIN}'/usr/lib/libxml2.2.dylib'{$ELSE}'libxml2.so'{$ENDIF};",
  },
  {
    file: "Projetos/ACBrLib/Fontes/Comum/ACBrLibComum.pas",
    from: "IntToHex(GetThreadID,0)",
    to: "IntToHex(PtrUInt(GetThreadID),0)",
  },
];

