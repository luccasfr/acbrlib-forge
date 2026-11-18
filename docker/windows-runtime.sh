#!/usr/bin/env bash
# Compila, a partir dos fontes oficiais, as DLLs que a ACBrLib carrega no
# Windows: OpenSSL (libcrypto, libssl e o provider legacy), libiconv e libxml2.
# Usa mingw-w64 (threads win32) e grava o resultado em $RUNTIME, com as
# versões em versions.json. Cada tarball é conferido pelo SHA-256 fixado no
# Dockerfile antes de ser extraído.
set -euo pipefail

: "${OPENSSL_VERSION:?}" "${OPENSSL_SHA256:?}"
: "${LIBICONV_VERSION:?}" "${LIBICONV_SHA256:?}"
: "${LIBXML2_VERSION:?}" "${LIBXML2_SHA256:?}"
HOST=x86_64-w64-mingw32
PREFIX=/opt/windows-deps
RUNTIME=/opt/windows-runtime
WORK=$(mktemp -d)
JOBS=$(nproc)
export LDFLAGS="-static-libgcc"

fetch() {
  local url=$1 sha=$2 file
  file="$WORK/$(basename "$url")"
  curl -fsSL --retry 5 -o "$file" "$url"
  echo "$sha  $file" | sha256sum -c - >/dev/null
  tar -xf "$file" -C "$WORK"
}

quiet() {
  local log="$WORK/step.log"
  "$@" > "$log" 2>&1 || { tail -60 "$log"; exit 1; }
}

fetch "https://ftp.gnu.org/pub/gnu/libiconv/libiconv-$LIBICONV_VERSION.tar.gz" "$LIBICONV_SHA256"
cd "$WORK/libiconv-$LIBICONV_VERSION"
quiet ./configure --host="$HOST" --prefix="$PREFIX" --enable-shared --disable-static --disable-nls
quiet make -j"$JOBS"
quiet make install

fetch "https://download.gnome.org/sources/libxml2/${LIBXML2_VERSION%.*}/libxml2-$LIBXML2_VERSION.tar.xz" "$LIBXML2_SHA256"
cd "$WORK/libxml2-$LIBXML2_VERSION"
quiet ./configure --host="$HOST" --prefix="$PREFIX" --enable-shared --disable-static \
  --with-iconv="$PREFIX" --with-legacy --without-python --without-zlib --without-icu \
  --without-readline --without-history --without-http --without-debug --without-docs
quiet make -j"$JOBS"
quiet make install

fetch "https://github.com/openssl/openssl/releases/download/openssl-$OPENSSL_VERSION/openssl-$OPENSSL_VERSION.tar.gz" "$OPENSSL_SHA256"
cd "$WORK/openssl-$OPENSSL_VERSION"
quiet ./Configure mingw64 shared no-docs no-tests --cross-compile-prefix="$HOST-" \
  --prefix="$PREFIX" --libdir=lib
quiet make -j"$JOBS"
quiet make install_sw

# A ACBrLib procura libxml2.dll (sem o sufixo de ABI do mingw); o import da
# libiconv dentro da libxml2 continua apontando para libiconv-2.dll.
mkdir -p "$RUNTIME"
cp "$PREFIX/bin/libcrypto-3-x64.dll" "$PREFIX/bin/libssl-3-x64.dll" "$PREFIX/bin/libiconv-2.dll" "$RUNTIME/"
cp "$PREFIX/lib/ossl-modules/legacy.dll" "$RUNTIME/"
cp "$PREFIX"/bin/libxml2-*.dll "$RUNTIME/libxml2.dll"
"$HOST-strip" --strip-unneeded "$RUNTIME"/*.dll

# Só DLLs do sistema ou do próprio pacote podem aparecer nos imports.
system='^(kernel32|msvcrt|advapi32|user32|ws2_32|crypt32|bcrypt|gdi32|ole32|shell32)\.dll$'
for dll in "$RUNTIME"/*.dll; do
  for import in $("$HOST-objdump" -p "$dll" | awk '/DLL Name/{print tolower($3)}'); do
    [[ "$import" =~ $system ]] && continue
    [ -f "$RUNTIME/$(basename "$import")" ] || ls "$RUNTIME" | grep -qix "$import" \
      || { echo "$(basename "$dll") depende de $import, fora do pacote" >&2; exit 1; }
  done
done

gcc_version=$(dpkg-query -W -f='${Version}' gcc-mingw-w64-x86-64-win32)
printf '{\n  "openssl": "%s",\n  "libxml2": "%s",\n  "libiconv": "%s",\n  "mingw-w64-gcc": "%s"\n}\n' \
  "$OPENSSL_VERSION" "$LIBXML2_VERSION" "$LIBICONV_VERSION" "$gcc_version" > "$RUNTIME/versions.json"
rm -rf "$WORK" "$PREFIX"
ls -l "$RUNTIME"
