#!/usr/bin/env bash
# Baixa a revisão fixada do ACBr e compila os módulos pedidos da ACBrLib.
#   ACBR_REV      revisão do trunk2 (obrigatória)
#   ACBR_MODULES  módulos em Projetos/ACBrLib/Fontes
#   ACBR_TARGETS  linux-x86_64, linux-i386, windows-x86_64 e/ou windows-i386 (padrão: os x86_64)
# Aplica os patches compartilhados (/opt/acbrlib/patches.json, montado pelo
# build.ts) e registra o SHA-256 da lista no manifesto.
set -euo pipefail

: "${ACBR_REV:?informe ACBR_REV}"
ACBR_URL="${ACBR_URL:-https://svn.code.sf.net/p/acbr/code/trunk2}"
ACBR_MODULES="${ACBR_MODULES:-BAL PosPrinter NFe AbecsPinpad}"
ACBR_TARGETS="${ACBR_TARGETS:-linux-x86_64 windows-x86_64}"
export ACBR_HOME=/src/acbr
OUT=/out
PATCHES=/opt/acbrlib/patches.json
[ -f "$PATCHES" ] || { echo "lista de patches ausente: $PATCHES" >&2; exit 2; }
exec 9>/src/.build.lock
flock 9

# O SVN do SourceForge costuma truncar respostas; a cópia de trabalho fica no
# volume, então cada nova tentativa continua de onde a anterior parou.
svn_retry() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    svn --non-interactive --config-option servers:global:http-timeout=60 "$@" && return 0
    echo "svn falhou (tentativa $attempt); repetindo" >&2
    [ -d "$ACBR_HOME/.svn" ] && svn cleanup "$ACBR_HOME" || true
    sleep $((attempt * 5))
  done
  return 1
}

if [ ! -d "$ACBR_HOME/.svn" ]; then
  svn_retry checkout --quiet --depth empty -r "$ACBR_REV" "$ACBR_URL" "$ACBR_HOME"
fi
# Só na primeira vez: repetir --set-depth empty apagaria Projetos/ACBrLib/Fontes.
if [ ! -d "$ACBR_HOME/Projetos/ACBrLib" ]; then
  svn_retry update --quiet -r "$ACBR_REV" --set-depth empty \
    "$ACBR_HOME/Projetos" "$ACBR_HOME/Projetos/ACBrLib"
fi
# A cópia de trabalho é reaproveitada: desfaz os patches antes de atualizar.
svn_retry revert --quiet --recursive "$ACBR_HOME"
svn_retry update --quiet -r "$ACBR_REV" --set-depth infinity \
  "$ACBR_HOME/Fontes" "$ACBR_HOME/Projetos/ACBrLib/Fontes"
python3 /opt/acbrlib/patches.py "$ACBR_HOME" "$PATCHES"

# A NFe valida o XML contra os schemas e, no Windows, carrega OpenSSL e
# libxml2 da pasta da biblioteca. Essas DLLs são compiladas dos fontes
# oficiais na imagem (docker/windows-runtime.sh), não copiadas do SVN.
svn_export() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    svn export --non-interactive --config-option servers:global:http-timeout=60 --quiet --force -r "$ACBR_REV" "$ACBR_URL/$1" "$2" && return 0
    echo "svn export falhou (tentativa $attempt); repetindo" >&2
    sleep $((attempt * 5))
  done
  return 1
}
case " $ACBR_MODULES " in
  *" NFe "*)
    svn_export Exemplos/ACBrDFe/Schemas/NFe "$OUT/schemas/NFe"
    required=$(grep -oE "GetProcAddr[A-Za-z]*\([^,]+, *'[A-Za-z0-9_]+'" \
      "$ACBR_HOME/Fontes/ACBrLibXML2/ACBrLibXml2Ext.pas" | grep -oE "'[A-Za-z0-9_]+'" | tr -d "'" | sort -u)
    [ -n "$required" ] || { echo "nenhuma função da libxml2 encontrada no ACBr" >&2; exit 1; }
    for target in $ACBR_TARGETS; do
      case "$target" in windows-*) ;; *) continue ;; esac
      mkdir -p "$OUT/$target"
      cp /opt/windows-runtime/"$target"/*.dll "$OUT/$target/"
      # Toda função que a ACBrLib busca por GetProcAddress na libxml2
      # precisa estar exportada pela DLL compilada.
      exports=$(objdump -p "/opt/windows-runtime/$target/libxml2.dll" \
        | sed -n '/\[Ordinal\/Name Pointer\] Table/,/^$/p' | awk '{print $NF}' | sort -u)
      missing=$(comm -23 <(echo "$required") <(echo "$exports"))
      [ -z "$missing" ] || { echo "$target/libxml2.dll não exporta: $missing" >&2; exit 1; }
    done
    ;;
esac

entries=()
for target in $ACBR_TARGETS; do
  # Os nomes dos modos variam entre módulos (caixa e sufixo -MT). Sem modo
  # win32 oficial, o Windows i386 deriva do modo win64 do próprio projeto:
  # mesmas opções, só a CPU e o SO mudam, e o arquivo troca 64 por 32.
  fallback=
  case "$target" in
    linux-x86_64) pattern='^linux-x86_64(-mt)?$'; os=linux; cpu=x86_64; bin=Linux; ext=so ;;
    linux-i386) pattern='^linux-i386(-mt)?$'; os=linux; cpu=i386; bin=Linux; ext=so ;;
    windows-x86_64) pattern='^win64-x86_64-mt$'; os=win64; cpu=x86_64; bin=Windows; ext=dll ;;
    windows-i386) pattern='^win32-i386-mt$'; os=win32; cpu=i386; bin=Windows; ext=dll; fallback='^win64-x86_64-mt$' ;;
    *) echo "alvo desconhecido: $target" >&2; exit 2 ;;
  esac
  mkdir -p "$OUT/$target"
  for module in $ACBR_MODULES; do
    dir="$ACBR_HOME/Projetos/ACBrLib/Fontes/$module"
    project="$dir/ACBrLib${module}ConsoleMT.lpi"
    [ -f "$project" ] || { echo "$module não tem projeto ConsoleMT" >&2; exit 2; }
    modes=$(grep -oE '<Item[0-9]+ Name="[^"]+"' "$project" | cut -d'"' -f2)
    mode=$(echo "$modes" | grep -iE "$pattern" | head -1 || true)
    derived=false
    if [ -z "$mode" ] && [ -n "$fallback" ]; then
      mode=$(echo "$modes" | grep -iE "$fallback" | head -1 || true)
      derived=true
    fi
    [ -n "$mode" ] || { echo "$module não tem modo para $target" >&2; exit 2; }
    prefix=$(grep -oE '[A-Za-z]+_Inicializar\b' "$dir/ACBrLib$module.lpr" | head -1)
    prefix=${prefix%_Inicializar}
    echo "==> $module ($target, modo $mode$([ "$derived" = true ] && echo ", derivado para $os/$cpu"))"
    rm -rf "$dir/bin/$bin/CONSOLE-MT"
    log="$OUT/$target/$module.log"
    "$LAZARUS_DIR/lazbuild" --quiet --lazarusdir="$LAZARUS_DIR" --build-all \
      --ws=nogui --os="$os" --cpu="$cpu" --build-mode="$mode" "$project" > "$log" 2>&1 \
      || { grep -E 'Error|Fatal' "$log" | tail -30; exit 1; }
    for file in "$dir/bin/$bin/CONSOLE-MT"/*."$ext"; do
      name=$(basename "$file")
      [ "$derived" = true ] && name=${name/64./32.}
      cp "$file" "$OUT/$target/$name"
      sum=$(sha256sum "$file" | cut -d' ' -f1)
      entries+=("    {\"module\": \"$module\", \"prefix\": \"$prefix\", \"target\": \"$target\", \"file\": \"$target/$name\", \"sha256\": \"$sum\", \"buildMode\": \"$mode\", \"derivedMode\": $derived}")
    done
  done
done

{
  echo "{"
  echo "  \"acbrRevision\": $ACBR_REV,"
  echo "  \"acbrUrl\": \"$ACBR_URL\","
  echo "  \"patches\": \"$(sha256sum "$PATCHES" | cut -d' ' -f1)\","
  echo "  \"fpc\": \"$(fpc -iV)\","
  echo "  \"lazarus\": \"$("$LAZARUS_DIR/lazbuild" --version | tail -1)\","
  for target in $ACBR_TARGETS; do
    case "$target" in
      windows-*) echo "  \"${target}Runtime\": $(cat "/opt/windows-runtime/$target/versions.json")," ;;
    esac
  done
  echo "  \"variant\": \"ConsoleMT\","
  echo "  \"files\": ["
  (IFS=$'\n'; echo "${entries[*]}" | sed '$!s/$/,/')
  echo "  ]"
  echo "}"
} > "$OUT/manifest.json"

cat "$OUT/manifest.json"
# Dentro do contêiner só as bibliotecas Linux x86_64 podem ser carregadas; o
# i386 é testado num contêiner linux/386 e o Windows, em Windows.
case " $ACBR_TARGETS " in
  *" linux-x86_64 "*) python3 /opt/acbrlib/smoke.py "$OUT" linux-x86_64 ;;
esac
