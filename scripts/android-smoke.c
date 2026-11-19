/*
 * Teste de carga da ACBrLib no Android, equivalente ao scripts/smoke.py.
 * Carrega as bibliotecas de runtime do pacote e cada ACBrLib, chama
 * <PREFIXO>_Inicializar, _Versao e _Finalizar e imprime "ok" ou "FALHA".
 *
 * Uso: acbr-smoke <pasta-do-alvo> <biblioteca>:<PREFIXO> [...]
 * O runtime é aberto pelo caminho completo e com RTLD_GLOBAL; o Bionic
 * reaproveita essas cópias pelo soname quando a ACBrLib as carrega por nome.
 */
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int (*inicializar_fn)(void **, const char *, const char *);
typedef int (*versao_fn)(void *, char *, int *);
typedef int (*finalizar_fn)(void *);
typedef const char *(*openssl_version_fn)(int);
typedef void (*xml_init_fn)(void);

static void *open_library(const char *dir, const char *name) {
  char path[4096];
  snprintf(path, sizeof path, "%s/%s", dir, name);
  return dlopen(path, RTLD_NOW | RTLD_GLOBAL);
}

static int check_runtime(const char *dir) {
  int failures = 0;
  void *crypto = open_library(dir, "libcrypto.so");
  void *ssl = open_library(dir, "libssl.so");
  void *xml = open_library(dir, "libxml2.so");
  if (!crypto || !ssl || !xml) {
    printf("FALHA runtime: %s\n", dlerror());
    return 1;
  }
  openssl_version_fn openssl_version = (openssl_version_fn)dlsym(crypto, "OpenSSL_version");
  xml_init_fn xml_init = (xml_init_fn)dlsym(xml, "xmlInitParser");
  if (!openssl_version || !xml_init) {
    printf("FALHA runtime: funções ausentes\n");
    return 1;
  }
  xml_init();
  printf("ok libcrypto.so (%s)\nok libssl.so\nok libxml2.so\n", openssl_version(0));
  return failures;
}

static int check_library(const char *dir, const char *spec) {
  char name[512], symbol[600];
  const char *colon = strchr(spec, ':');
  if (!colon || (size_t)(colon - spec) >= sizeof name) {
    printf("FALHA argumento inválido: %s\n", spec);
    return 1;
  }
  memcpy(name, spec, (size_t)(colon - spec));
  name[colon - spec] = '\0';
  const char *prefix = colon + 1;

  void *lib = open_library(dir, name);
  if (!lib) {
    printf("FALHA %s: não carregou: %s\n", name, dlerror());
    return 1;
  }
  snprintf(symbol, sizeof symbol, "%s_Inicializar", prefix);
  inicializar_fn inicializar = (inicializar_fn)dlsym(lib, symbol);
  snprintf(symbol, sizeof symbol, "%s_Versao", prefix);
  versao_fn versao = (versao_fn)dlsym(lib, symbol);
  snprintf(symbol, sizeof symbol, "%s_Finalizar", prefix);
  finalizar_fn finalizar = (finalizar_fn)dlsym(lib, symbol);
  if (!inicializar || !versao || !finalizar) {
    printf("FALHA %s: funções %s_* ausentes\n", name, prefix);
    return 1;
  }

  char config[4096];
  snprintf(config, sizeof config, "%s/acbrlib-%s.ini", dir, prefix);
  void *handle = NULL;
  int code = inicializar(&handle, config, "");
  if (code != 0) {
    printf("FALHA %s: %s_Inicializar=%d\n", name, prefix, code);
    return 1;
  }
  char buffer[64] = {0};
  int size = (int)sizeof buffer;
  code = versao(handle, buffer, &size);
  int end = finalizar(handle);
  if (code != 0 || end != 0) {
    printf("FALHA %s: %s_Versao=%d %s_Finalizar=%d\n", name, prefix, code, prefix, end);
    return 1;
  }
  printf("ok %s versao %s\n", name, buffer);
  return 0;
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "Uso: %s <pasta-do-alvo> <biblioteca>:<PREFIXO> [...]\n", argv[0]);
    return 2;
  }
  int failures = check_runtime(argv[1]);
  for (int i = 2; i < argc; i++) failures += check_library(argv[1], argv[i]);
  return failures ? 1 : 0;
}
