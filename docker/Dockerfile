# Compila a ACBrLib (variante ConsoleMT, sem GUI) para Linux x86_64 e, por
# compilação cruzada, Windows x86_64. macOS não é coberto por esta imagem.

# DLLs de runtime do Windows (OpenSSL, libiconv e libxml2), compiladas com
# mingw-w64 a partir dos tarballs oficiais. Os SHA-256 conferem com os
# publicados pelo OpenSSL e pelo GNOME; o tarball da libiconv foi conferido
# pela assinatura GPG do mantenedor (Bruno Haible, E0FFBD975397F77A).
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc AS windows-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    OPENSSL_VERSION=3.5.9 \
    OPENSSL_SHA256=603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a \
    LIBICONV_VERSION=1.19.1 \
    LIBICONV_SHA256=9a06844846d664d7122161700c10a64480d7c7bcead3091925a785b38c91edab \
    LIBXML2_VERSION=2.15.4 \
    LIBXML2_SHA256=98087fd181d9070724f3fbc65c7377db03038eb92bd882374daff44940138821

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl make perl xz-utils pkgconf \
        gcc-mingw-w64-x86-64-win32=12.2.0-14+deb12u1+25.2+b1 \
        binutils-mingw-w64-x86-64=2.40-2+10.4 \
        mingw-w64-x86-64-dev=10.0.0-3 \
        gcc-mingw-w64-i686-win32=12.2.0-14+deb12u1+25.2+b1 \
        binutils-mingw-w64-i686=2.40-2+10.4 \
        mingw-w64-i686-dev=10.0.0-3 \
    && rm -rf /var/lib/apt/lists/*

COPY docker/windows-runtime.sh /opt/windows-runtime.sh
RUN bash /opt/windows-runtime.sh

# Android: OpenSSL e libxml2 por ABI, o sysroot do Bionic para o FPC ligar e
# o teste de carga do emulador, com o NDK r30 (LTS). O SHA-1 publicado pelo
# Google para o zip (5107f898313790e449e87eee2183d9a20602dee9) foi conferido
# antes de fixar o SHA-256 abaixo. O NDK não vai para a imagem final.
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc AS android-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_NDK_VERSION=r30 \
    ANDROID_NDK_SHA256=753611f410d002cfcd3f3dc2ef49aad532089d3180b436c060a90bf0fcb64df2 \
    ANDROID_API=24 \
    OPENSSL_VERSION=3.5.9 \
    OPENSSL_SHA256=603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a \
    LIBXML2_VERSION=2.15.4 \
    LIBXML2_SHA256=98087fd181d9070724f3fbc65c7377db03038eb92bd882374daff44940138821

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl make perl xz-utils pkgconf unzip=6.0-28+deb12u1 patchelf \
    && rm -rf /var/lib/apt/lists/*

COPY docker/android-runtime.sh /opt/android-runtime.sh
COPY scripts/android-smoke.c /opt/android-smoke.c
RUN bash /opt/android-runtime.sh

FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc

ENV DEBIAN_FRONTEND=noninteractive \
    FPC_VERSION=3.2.2 \
    FPC_SOURCE_SHA256=d542e349de246843d4f164829953d1f5b864126c5b62fd17c9b45b33e23d2f44 \
    FPC_CROSS_PREFIX=/opt/fpc-cross \
    LAZARUS_TAG=lazarus_3_6 \
    LAZARUS_SHA256=535c01c9f6dc00867753b2a4d4e08b12fc8939ed314b5179c8bcb19f7d836f35 \
    LAZARUS_DIR=/opt/lazarus

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl subversion make binutils python3 fpc=3.2.2+dfsg-20 libssl3 libxml2 util-linux \
        binutils-i686-linux-gnu=2.40-2 libc6-dev-i386-cross=2.36-8cross1 \
        binutils-aarch64-linux-gnu=2.40-2 binutils-arm-linux-gnueabi=2.40-2 \
    && rm -rf /var/lib/apt/lists/* \
    && for tool in as ld ar nm objcopy objdump ranlib readelf strip; do \
        ln -s /usr/bin/aarch64-linux-gnu-$tool /usr/bin/aarch64-linux-android-$tool; \
        ln -s /usr/bin/arm-linux-gnueabi-$tool /usr/bin/arm-linux-androideabi-$tool; \
    done

COPY --from=android-runtime /opt/android-runtime /opt/android-runtime
COPY --from=android-runtime /opt/android-sysroot /opt/android-sysroot
COPY --from=android-runtime /opt/android-smoke /opt/android-smoke

# Compiladores e unidades RTL/FCL cruzados, a partir dos fontes oficiais (o
# pacote fpc-source do Debian não traz os Makefiles): win64, win32,
# linux-i386 e Android (aarch64 e armv7a). Windows usa montador e linker
# internos do FPC; os demais usam os binutils do Debian (o Linux i386 com a
# libc i386 de /usr/i686-linux-gnu, o Android com o sysroot do NDK). Os
# prefixos *-linux-android* são os que os modos Android do ACBr pedem. No
# arm-android, o padrão do fpc.cfg segue os modos do ACBr (ARMv7-A, VFPv3):
# o lazbuild compila os pacotes do Lazarus sem as opções do projeto, e uma
# FPU diferente da RTL faria o compilador não achar a unit system.
RUN curl -fsSL -o /tmp/fpc.tar.gz \
        https://downloads.freepascal.org/fpc/dist/${FPC_VERSION}/source/fpc-${FPC_VERSION}.source.tar.gz \
    && echo "${FPC_SOURCE_SHA256}  /tmp/fpc.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/fpc.tar.gz -C /tmp \
    && for target in win64:x86_64:: win32:i386:: linux:i386:i686-linux-gnu-: \
        android:aarch64:aarch64-linux-android-: "android:arm:arm-linux-androideabi-:-CpARMV7A -CfVFPV3"; do \
        os=${target%%:*}; rest=${target#*:}; cpu=${rest%%:*}; rest=${rest#*:}; \
        prefix=${rest%%:*}; options=${rest#*:}; \
        make -C /tmp/fpc-${FPC_VERSION} clean crossall crossinstall \
            OS_TARGET=$os CPU_TARGET=$cpu BINUTILSPREFIX=$prefix CROSSOPT="$options" \
            INSTALL_PREFIX=${FPC_CROSS_PREFIX} \
            > /tmp/fpc-cross.log 2>&1 || { tail -50 /tmp/fpc-cross.log; exit 1; }; \
    done \
    && for compiler in ppcross386 ppcrossa64 ppcrossarm; do \
        ln -s ${FPC_CROSS_PREFIX}/lib/fpc/${FPC_VERSION}/$compiler /usr/bin/$compiler; \
    done \
    && rm -rf /tmp/fpc.tar.gz /tmp/fpc-${FPC_VERSION} /tmp/fpc-cross.log \
    && printf '%s\n' \
        "-Fu${FPC_CROSS_PREFIX}/lib/fpc/\$fpcversion/units/\$fpctarget" \
        "-Fu${FPC_CROSS_PREFIX}/lib/fpc/\$fpcversion/units/\$fpctarget/*" \
        "#IFDEF CPUI386" "#IFDEF LINUX" "-XPi686-linux-gnu-" "-Fl/usr/i686-linux-gnu/lib" "#ENDIF" "#ENDIF" \
        "#IFDEF ANDROID" \
        "#IFDEF CPUAARCH64" "-Fl/opt/android-sysroot/android-arm64-v8a" "#ENDIF" \
        "#IFDEF CPUARM" "-Fl/opt/android-sysroot/android-armeabi-v7a" "-CpARMV7A" "-CfVFPV3" "#ENDIF" \
        "#ENDIF" \
        >> /etc/fpc.cfg

# lazbuild a partir dos fontes oficiais: os pacotes Lazarus do Debian não
# registram a LCL para o lazbuild. A LCL nogui é compilada sob demanda por alvo.
RUN curl -fsSL -o /tmp/lazarus.tar.gz \
        https://gitlab.com/freepascal.org/lazarus/lazarus/-/archive/${LAZARUS_TAG}/lazarus-${LAZARUS_TAG}.tar.gz \
    && echo "${LAZARUS_SHA256}  /tmp/lazarus.tar.gz" | sha256sum -c - \
    && mkdir -p ${LAZARUS_DIR} \
    && tar -xzf /tmp/lazarus.tar.gz -C ${LAZARUS_DIR} --strip-components=1 \
    && rm /tmp/lazarus.tar.gz \
    && (make -C ${LAZARUS_DIR} lazbuild > /tmp/lazbuild.log 2>&1 \
        || (tail -50 /tmp/lazbuild.log; exit 1)) \
    && rm /tmp/lazbuild.log

COPY --from=windows-runtime /opt/windows-runtime /opt/windows-runtime
COPY docker/build.sh docker/patches.py scripts/smoke.py /opt/acbrlib/
RUN chmod +x /opt/acbrlib/build.sh

VOLUME ["/src", "/out"]
ENTRYPOINT ["/opt/acbrlib/build.sh"]
