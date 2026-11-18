# Compila a ACBrLib (variante ConsoleMT, sem GUI) para Linux x86_64 e, por
# compilação cruzada, Windows x86_64. macOS não é coberto por esta imagem.
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
    && rm -rf /var/lib/apt/lists/*

# Unidades RTL/FCL para win64, a partir dos fontes oficiais (o pacote
# fpc-source do Debian não traz os Makefiles). O FPC usa montador e linker
# internos nesse alvo, então não é preciso binutils cruzado.
RUN curl -fsSL -o /tmp/fpc.tar.gz \
        https://downloads.freepascal.org/fpc/dist/${FPC_VERSION}/source/fpc-${FPC_VERSION}.source.tar.gz \
    && echo "${FPC_SOURCE_SHA256}  /tmp/fpc.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/fpc.tar.gz -C /tmp \
    && (make -C /tmp/fpc-${FPC_VERSION} clean crossall crossinstall \
        OS_TARGET=win64 CPU_TARGET=x86_64 INSTALL_PREFIX=${FPC_CROSS_PREFIX} \
        > /tmp/fpc-cross.log 2>&1 || (tail -50 /tmp/fpc-cross.log; exit 1)) \
    && rm -rf /tmp/fpc.tar.gz /tmp/fpc-${FPC_VERSION} /tmp/fpc-cross.log \
    && printf '%s\n' \
        "-Fu${FPC_CROSS_PREFIX}/lib/fpc/\$fpcversion/units/\$fpctarget" \
        "-Fu${FPC_CROSS_PREFIX}/lib/fpc/\$fpcversion/units/\$fpctarget/*" \
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

COPY docker/build.sh docker/patches.py scripts/smoke.py /opt/acbrlib/
RUN chmod +x /opt/acbrlib/build.sh

VOLUME ["/src", "/out"]
ENTRYPOINT ["/opt/acbrlib/build.sh"]
