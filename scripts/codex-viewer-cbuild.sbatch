#!/usr/bin/env bash
#SBATCH --job-name=codex-viewer
#SBATCH --partition=cbuild
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --time=48:00:00
#SBATCH --output=codex-viewer-cbuild-%j.log
#SBATCH --error=codex-viewer-cbuild-%j.log

set -euo pipefail

REPO_ROOT="${CODEX_VIEWER_ROOT:-${SLURM_SUBMIT_DIR:-$(pwd)}}"
PORT="${PORT:-5656}"
HOST_FQDN="$(hostname -f 2>/dev/null || hostname)"
INTERNAL_ORIGIN="http://${HOST_FQDN}:${PORT}/"
ENV_FILE="${CODEX_VIEWER_ENV_FILE:-${REPO_ROOT}/codex-viewer-cbuild.env}"
LOG_FILE="${REPO_ROOT}/codex-viewer-cbuild-${SLURM_JOB_ID}.log"

cat > "${ENV_FILE}" <<EOF
JOB_ID=${SLURM_JOB_ID}
NODE=${HOST_FQDN}
PORT=${PORT}
ORIGIN=${INTERNAL_ORIGIN}
LOG=${LOG_FILE}
EOF

echo "codex-viewer job ${SLURM_JOB_ID}"
echo "node=${HOST_FQDN}"
echo "port=${PORT}"
echo "origin=${INTERNAL_ORIGIN}"
echo "repo=${REPO_ROOT}"
echo "env=${ENV_FILE}"

cd "${REPO_ROOT}"

export CC_VIEWER_INTERNAL_ORIGIN="${INTERNAL_ORIGIN}"
export CC_VIEWER_NO_AUTO_OPEN=1
export NO_AUTO_OPEN=1
export PORT

exec npm start
