#!/usr/bin/env bash
# Hook: PreToolUse (Read|Edit|Write|Bash)
# -----------------------------------------------------------------------------
# Protege `.env` en LAS DOS direcciones:
#
#   1. ESCRITURA: no se edita desde el agente.
#   2. LECTURA: no se vuelca a la transcripción con cat/grep/sed/head ni con la
#      herramienta Read. Una sola línea impresa obliga a rotar la credencial.
#
# `Read` está en el matcher a propósito y no se quita: la fuga típica no es un
# `cat` descuidado, es la herramienta de lectura llamada sin pensar sobre un
# fichero que "solo" se quería inspeccionar.
#
# Aquí `.env` contiene GOOGLE_GENERATIVE_AI_API_KEY, que es lo único que hace
# falta para gastar dinero en la cuenta de alguien.
#
# Si necesitas un valor, no lo imprimas:
#   VAR=$(grep -m1 '^CLAVE=' .env | cut -d= -f2-)   # a variable, nunca a stdout
#
# Convención: exit 0 = permite; exit 2 = bloquea (stderr se muestra al agente).
# Usa python3 para parsear el JSON de entrada (jq puede no estar instalado).
# -----------------------------------------------------------------------------

INPUT=$(cat)

VEREDICTO=$(python3 - "$INPUT" <<'PY'
import json, re, sys

try:
    datos = json.loads(sys.argv[1])
except Exception:
    print("OK")
    raise SystemExit

entrada = datos.get("tool_input") or {}
herramienta = datos.get("tool_name") or ""

# .env / .env.<lo que sea>, pero NO .env.example
PROTEGIDO = re.compile(
    r"(?:^|[\s/\"'=(])(\.env(?:\.(?!example)[\w.-]+)?)(?=$|[\s\"';|&)])"
)

# --- 1. Read / Edit / Write sobre el fichero ---------------------------------
ruta = entrada.get("file_path") or ""
if ruta and PROTEGIDO.search(" " + ruta):
    print(("LECTURA|" if herramienta == "Read" else "ESCRITURA|") + ruta)
    raise SystemExit

# --- 2. Bash que toca el fichero --------------------------------------------
comando = entrada.get("command") or ""
if not comando:
    print("OK")
    raise SystemExit

# Verbos que no exponen el contenido ni lo modifican a ciegas.
# `cp .env.example .env` (paso documentado de arranque) sigue permitido.
SEGURAS = {"cp", "mv", "ls", "chmod", "chown", "touch", "test", "[", "stat", "mkdir", "diff"}

# Captura en variable: la salida no llega a la transcripción, así que es la vía
# permitida para leer un valor concreto.
CAPTURA = re.compile(r"^\s*(?:export\s+|local\s+)?[A-Za-z_][A-Za-z0-9_]*=[\"']?\$\(")

for tramo in re.split(r"&&|\|\||\||;|\n", comando):
    if not PROTEGIDO.search(" " + tramo):
        continue

    # Redirigir salida hacia el fichero protegido es una escritura encubierta.
    if re.search(r">>?\s*[\"']?\.env", tramo):
        print("ESCRITURA|" + tramo.strip())
        raise SystemExit

    if CAPTURA.match(tramo):
        continue

    piezas = tramo.strip().split()
    i = 0
    while i < len(piezas) and (piezas[i] == "sudo" or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", piezas[i])):
        i += 1
    verbo = piezas[i] if i < len(piezas) else ""

    if verbo not in SEGURAS:
        print("LECTURA|" + tramo.strip())
        raise SystemExit

print("OK")
PY
)

case "$VEREDICTO" in
  ESCRITURA*)
    echo "BLOQUEADO (escritura): ${VEREDICTO#ESCRITURA|}" >&2
    echo "El fichero .env no se edita desde el agente." >&2
    exit 2
    ;;
  LECTURA*)
    echo "BLOQUEADO (lectura de secretos): ${VEREDICTO#LECTURA|}" >&2
    echo "No se vuelca el contenido de .env a la transcripcion: una linea impresa" >&2
    echo "obliga a rotar la credencial. Si necesitas un valor, cargalo en una" >&2
    echo "variable de shell sin imprimirlo:" >&2
    echo "  VAR=\$(grep -m1 '^CLAVE=' .env | cut -d= -f2-)   # permitido: no imprime" >&2
    echo "y NO hagas echo/cat de esa variable despues." >&2
    exit 2
    ;;
esac

exit 0
