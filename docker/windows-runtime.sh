#!/usr/bin/env bash
# Compila, a partir dos fontes oficiais, as DLLs que a ACBrLib carrega no
# Windows: OpenSSL (libcrypto, libssl e o provider legacy), libiconv e libxml2.
# Usa mingw-w64 (threads win32) para x86_64 e i686 e grava cada alvo em
# $RUNTIME/<alvo>, com as versões em versions.json. Cada tarball é conferido
# pelo SHA-256 fixado no Dockerfile antes de ser extraído.
set -euo pipefail

: "${OPENSSL_VERSION:?}" "${OPENSSL_SHA256:?}"
: "${LIBICONV_VERSION:?}" "${LIBICONV_SHA256:?}"
: "${LIBXML2_VERSION:?}" "${LIBXML2_SHA256:?}"
RUNTIME=/opt/windows-runtime
SOURCES=$(mktemp -d)
JOBS=$(nproc)
export LDFLAGS="-static-libgcc"

fetch() {
  local url=$1 sha=$2 file
  file="$SOURCES/$(basename "$url")"
  curl -fsSL --retry 5 -o "$file" "$url"
  echo "$sha  $file" | sha256sum -c - >/dev/null
}

quiet() {
  local log="$SOURCES/step.log"
  "$@" > "$log" 2>&1 || { tail -60 "$log"; exit 1; }
}

fetch "https://ftp.gnu.org/pub/gnu/libiconv/libiconv-$LIBICONV_VERSION.tar.gz" "$LIBICONV_SHA256"
fetch "https://download.gnome.org/sources/libxml2/${LIBXML2_VERSION%.*}/libxml2-$LIBXML2_VERSION.tar.xz" "$LIBXML2_SHA256"
fetch "https://github.com/openssl/openssl/releases/download/openssl-$OPENSSL_VERSION/openssl-$OPENSSL_VERSION.tar.gz" "$OPENSSL_SHA256"

# build <alvo> <host mingw> <alvo do Configure do OpenSSL> <sufixo das DLLs do OpenSSL> <pacote gcc>
build() {
  local target=$1 host=$2 openssl_target=$3 suffix=$4 gcc_package=$5
  local work prefix out
  work=$(mktemp -d)
  prefix="$work/prefix"
  out="$RUNTIME/$target"
  for archive in "$SOURCES"/*.tar.*; do tar -xf "$archive" -C "$work"; done

  cd "$work/libiconv-$LIBICONV_VERSION"
  quiet ./configure --host="$host" --prefix="$prefix" --enable-shared --disable-static --disable-nls
  quiet make -j"$JOBS"
  quiet make install

  cd "$work/libxml2-$LIBXML2_VERSION"
  quiet ./configure --host="$host" --prefix="$prefix" --enable-shared --disable-static \
    --with-iconv="$prefix" --with-legacy --without-python --without-zlib --without-icu \
    --without-readline --without-history --without-http --without-debug --without-docs
  quiet make -j"$JOBS"
  quiet make install

  cd "$work/openssl-$OPENSSL_VERSION"
  quiet ./Configure "$openssl_target" shared no-docs no-tests --cross-compile-prefix="$host-" \
    --prefix="$prefix" --libdir=lib
  quiet make -j"$JOBS"
  quiet make install_sw

  # A ACBrLib procura libxml2.dll (sem o sufixo de ABI do mingw); o import da
  # libiconv dentro da libxml2 continua apontando para libiconv-2.dll.
  mkdir -p "$out"
  cp "$prefix/bin/libcrypto-3$suffix.dll" "$prefix/bin/libssl-3$suffix.dll" "$prefix/bin/libiconv-2.dll" "$out/"
  cp "$prefix/lib/ossl-modules/legacy.dll" "$out/"
  cp "$prefix"/bin/libxml2-*.dll "$out/libxml2.dll"
  "$host-strip" --strip-unneeded "$out"/*.dll

  # Só DLLs do sistema ou do próprio pacote podem aparecer nos imports.
  local system='^(kernel32|msvcrt|advapi32|user32|ws2_32|crypt32|bcrypt|gdi32|ole32|shell32)\.dll$'
  for dll in "$out"/*.dll; do
    for import in $("$host-objdump" -p "$dll" | awk '/DLL Name/{print tolower($3)}'); do
      [[ "$import" =~ $system ]] && continue
      ls "$out" | grep -qix "$import" \
        || { echo "$target/$(basename "$dll") depende de $import, fora do pacote" >&2; exit 1; }
    done
  done

  printf '{\n  "openssl": "%s",\n  "libxml2": "%s",\n  "libiconv": "%s",\n  "mingw-w64-gcc": "%s"\n}\n' \
    "$OPENSSL_VERSION" "$LIBXML2_VERSION" "$LIBICONV_VERSION" \
    "$(dpkg-query -W -f='${Version}' "$gcc_package")" > "$out/versions.json"
  cd /
  rm -rf "$work"
  ls -l "$out"
}

build windows-x86_64 x86_64-w64-mingw32 mingw64 -x64 gcc-mingw-w64-x86-64-win32
build windows-i386 i686-w64-mingw32 mingw "" gcc-mingw-w64-i686-win32
rm -rf "$SOURCES"
