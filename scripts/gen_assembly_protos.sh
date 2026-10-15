#!/usr/bin/env bash
# Generate Python gRPC stubs for Empery assembly.v1.
# Usage: ./scripts/gen_assembly_protos.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROTO_DIR="${ROOT}/core/protos"
OUT_PKG="${PROTO_DIR}/empery/assembly/v1"
PROTO_FILE="${PROTO_DIR}/empery/assembly/v1/assembly.proto"
PYTHON="${ROOT}/.venv/bin/python"
if [[ ! -x "${PYTHON}" ]]; then
  PYTHON="python3"
fi

cd "${ROOT}"

# Well-known types (google/protobuf/*.proto) ship with grpcio-tools or protobuf.
PB_INCLUDE="$("${PYTHON}" - <<'PY'
import pathlib
candidates = []
try:
    import grpc_tools
    candidates.append(pathlib.Path(grpc_tools.__file__).resolve().parent / "proto")
except Exception:
    pass
try:
    import google.protobuf
    # site-packages often has google/protobuf/*_pb2.py but not .proto;
    # grpc_tools._proto may bundle them in newer wheels as package data.
    p = pathlib.Path(google.protobuf.__file__).resolve().parent
    candidates.append(p)
except Exception:
    pass
for c in candidates:
    if (c / "google" / "protobuf" / "struct.proto").is_file() or (c / "struct.proto").is_file():
        print(c)
        break
else:
    # Empty include still works if types were previously compiled into descriptor pool
    print(candidates[0] if candidates else ".")
PY
)"

"${PYTHON}" -m grpc_tools.protoc \
  -I "${PROTO_DIR}" \
  -I "${PB_INCLUDE}" \
  --python_out="${PROTO_DIR}" \
  --grpc_python_out="${PROTO_DIR}" \
  --pyi_out="${PROTO_DIR}" \
  "${PROTO_FILE}"

# grpc_tools emits `from empery.assembly.v1 import assembly_pb2` (or bare import).
# Rewrite so imports work as `core.protos.empery.assembly.v1`.
GRPC_PY="${OUT_PKG}/assembly_pb2_grpc.py"
if [[ -f "${GRPC_PY}" ]]; then
  sed -i \
    -e 's/^from empery\.assembly\.v1 import assembly_pb2/from core.protos.empery.assembly.v1 import assembly_pb2/' \
    -e 's/^import assembly_pb2 as /from core.protos.empery.assembly.v1 import assembly_pb2 as /' \
    -e 's/^import assembly_pb2$/from core.protos.empery.assembly.v1 import assembly_pb2/' \
    "${GRPC_PY}"
fi

for d in \
  "${ROOT}/core/protos" \
  "${ROOT}/core/protos/empery" \
  "${ROOT}/core/protos/empery/assembly" \
  "${ROOT}/core/protos/empery/assembly/v1"
do
  touch "${d}/__init__.py"
done

echo "Generated stubs in ${OUT_PKG}"
ls -la "${OUT_PKG}"/assembly_pb2*.py*
