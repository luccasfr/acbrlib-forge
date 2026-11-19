#!/usr/bin/env bash
# Prepara o necessário para a ACBrLib no Android, por ABI, com o NDK fixado:
#   /opt/android-runtime/<alvo>  libcrypto.so, libssl.so, legacy.so e libxml2.so
#                                compilados dos tarballs oficiais e versions.json
#   /opt/android-sysroot/<alvo>  crt*_so.o e bibliotecas do Bionic para o FPC ligar
#   /opt/android-smoke/<alvo>    acbr-smoke, o teste de carga do emulador
set -euo pipefail

: "${ANDROID_NDK_VERSION:?}" "${ANDROID_NDK_SHA256:?}" "${ANDROID_API:?}"
: "${OPENSSL_VERSION:?}" "${OPENSSL_SHA256:?}"
: "${LIBXML2_VERSION:?}" "${LIBXML2_SHA256:?}"
SOURCES=$(mktemp -d)
JOBS=$(nproc)
NDK=/opt/android-ndk-$ANDROID_NDK_VERSION
TOOLCHAIN=$NDK/toolchains/llvm/prebuilt/linux-x86_64
SYSROOT=$TOOLCHAIN/sysroot
# O Android 15 exige bibliotecas alinhadas em páginas de 16 KB.
export LDFLAGS="-Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384"
export ANDROID_NDK_ROOT=$NDK PATH="$TOOLCHAIN/bin:$PATH"

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

fetch "https://dl.google.com/android/repository/android-ndk-$ANDROID_NDK_VERSION-linux.zip" "$ANDROID_NDK_SHA256"
unzip -q "$SOURCES/android-ndk-$ANDROID_NDK_VERSION-linux.zip" -d /opt
rm "$SOURCES/android-ndk-$ANDROID_NDK_VERSION-linux.zip"
fetch "https://download.gnome.org/sources/libxml2/${LIBXML2_VERSION%.*}/libxml2-$LIBXML2_VERSION.tar.xz" "$LIBXML2_SHA256"
fetch "https://github.com/openssl/openssl/releases/download/openssl-$OPENSSL_VERSION/openssl-$OPENSSL_VERSION.tar.gz" "$OPENSSL_SHA256"

# build <alvo> <triplo do sysroot> <alvo do clang> <alvo do Configure do OpenSSL>
build() {
  local target=$1 triple=$2 clang=$3 openssl_target=$4
  local work prefix out
  work=$(mktemp -d)
  prefix="$work/prefix"
  out="/opt/android-runtime/$target"
  for archive in "$SOURCES"/*.tar.*; do tar -xf "$archive" -C "$work"; done

  cd "$work/openssl-$OPENSSL_VERSION"
  quiet ./Configure "$openssl_target" -D__ANDROID_API__="$ANDROID_API" shared no-docs no-tests \
    --prefix="$prefix" --libdir=lib
  quiet make -j"$JOBS"
  quiet make install_sw

  # O Bionic só traz iconv a partir da API 28; a libxml2 usa as codificações
  # embutidas (UTF-8, UTF-16 e ISO-8859-1), suficientes para a NF-e.
  cd "$work/libxml2-$LIBXML2_VERSION"
  quiet ./configure --host="$clang" CC="$clang$ANDROID_API-clang" AR=llvm-ar RANLIB=llvm-ranlib \
    STRIP=llvm-strip --prefix="$prefix" \
    --enable-shared --disable-static --without-iconv --with-legacy --without-python \
    --without-zlib --without-icu --without-readline --without-history --without-http \
    --without-debug --without-docs
  quiet make -j"$JOBS"
  quiet make install

  mkdir -p "$out"
  cp "$prefix/lib/libcrypto.so" "$prefix/lib/libssl.so" "$prefix/lib/ossl-modules/legacy.so" "$out/"
  # O ACBr carrega libxml2.so; o Android não aceita o sufixo de versão no nome.
  cp "$(readlink -f "$prefix/lib/libxml2.so")" "$out/libxml2.so"
  patchelf --set-soname libxml2.so "$out/libxml2.so"
  llvm-strip --strip-unneeded "$out"/*.so

  # Só bibliotecas do Bionic ou do próprio pacote, alinhadas em 16 KB.
  for lib in "$out"/*.so; do
    for needed in $(llvm-readelf -d "$lib" | sed -n 's/.*(NEEDED).*\[\(.*\)\]/\1/p'); do
      case "$needed" in libc.so|libdl.so|libm.so|liblog.so) continue ;; esac
      [ -f "$out/$needed" ] || { echo "$target/$(basename "$lib") depende de $needed, fora do pacote" >&2; exit 1; }
    done
    for align in $(llvm-readelf -lW "$lib" | awk '$1 == "LOAD" {print $NF}'); do
      (( align >= 16384 )) || { echo "$target/$(basename "$lib") não está alinhada em 16 KB" >&2; exit 1; }
    done
  done

  mkdir -p "/opt/android-sysroot/$target" "/opt/android-smoke/$target"
  cp -L "$SYSROOT/usr/lib/$triple/$ANDROID_API"/*.o "$SYSROOT/usr/lib/$triple/$ANDROID_API"/*.so \
    "/opt/android-sysroot/$target/"
  "$clang$ANDROID_API-clang" -O2 -Wall -Werror -o "/opt/android-smoke/$target/acbr-smoke" \
    /opt/android-smoke.c -ldl

  printf '{\n  "openssl": "%s",\n  "libxml2": "%s",\n  "ndk": "%s",\n  "api": %s\n}\n' \
    "$OPENSSL_VERSION" "$LIBXML2_VERSION" "$ANDROID_NDK_VERSION" "$ANDROID_API" > "$out/versions.json"
  cd /
  rm -rf "$work"
  ls -l "$out"
}

build android-arm64-v8a aarch64-linux-android aarch64-linux-android android-arm64
build android-armeabi-v7a arm-linux-androideabi armv7a-linux-androideabi android-arm
rm -rf "$SOURCES" "$NDK"
