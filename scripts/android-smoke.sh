#!/usr/bin/env bash
# Teste de carga da ACBrLib num emulador ou aparelho Android conectado ao adb.
# Envia cada alvo Android da saída do build com o acbr-smoke da imagem Docker
# (/opt/android-smoke/<alvo>) e executa Inicializar/Versao/Finalizar.
#   android-smoke.sh <pasta out> <pasta com acbr-smoke por alvo> <alvo>...
set -euo pipefail

out=$1 smoke=$2
shift 2
remote=/data/local/tmp/acbrlib-forge
abis=$(adb shell getprop ro.product.cpu.abilist | tr -d '\r')
echo "ABIs do dispositivo: $abis"
failures=0
for target in "$@"; do
  libs=$(jq -r --arg target "$target" \
    '.files[] | select(.target == $target) | "\(.file | split("/") | last):\(.prefix)"' "$out/manifest.json")
  [ -n "$libs" ] || { echo "FALHA $target: nenhuma biblioteca no manifesto"; failures=$((failures + 1)); continue; }
  adb shell rm -rf "$remote/$target"
  adb shell mkdir -p "$remote/$target"
  adb push "$out/$target/." "$remote/$target/" > /dev/null
  adb push "$smoke/$target/acbr-smoke" "$remote/$target/" > /dev/null
  adb shell chmod 755 "$remote/$target/acbr-smoke"
  echo "==> $target"
  # shellcheck disable=SC2086 # cada item de $libs é um argumento <biblioteca>:<prefixo>
  if ! adb shell "cd $remote/$target && LD_LIBRARY_PATH=. ./acbr-smoke . $(echo $libs); echo exit=\$?" \
      | tee "/tmp/android-smoke-$target.log" | tr -d '\r'; then
    failures=$((failures + 1))
  fi
  grep -q 'exit=0' "/tmp/android-smoke-$target.log" || failures=$((failures + 1))
done
exit $(( failures > 0 ))
