# The sandbox images (docs/specs/07-runner.md §8): Python with the pinned
# packages of one environment, and nothing else. The same image serves the
# bundled runner (Docker) and the hosted sandbox (Vercel Container Registry).
#
# Build context: packages/runner/environments. Built by `bun run runner:images`
# and by docker-compose.yml.
#   docker build -f packages/runner/images/Dockerfile \
#     --build-arg ENVIRONMENT=numpy -t paperscholar-sandbox-numpy packages/runner/environments

# Keep in step with environments/python-version.
FROM python:3.13.18-slim

ARG ENVIRONMENT=numpy
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore \
    PYTHONDONTWRITEBYTECODE=1

COPY numpy.txt torch.txt /tmp/environments/

# NumPy and pytest come from PyPI; PyTorch from its CPU-only index, as in
# scripts/setup-python.ts.
RUN set -eu; \
    case "$ENVIRONMENT" in \
      numpy) pip install -r /tmp/environments/numpy.txt ;; \
      torch) pip install -r /tmp/environments/numpy.txt; \
             pip install --index-url https://download.pytorch.org/whl/cpu \
               $(grep -E '^[A-Za-z]' /tmp/environments/torch.txt) ;; \
      *) echo "unknown ENVIRONMENT $ENVIRONMENT" >&2; exit 1 ;; \
    esac; \
    rm -rf /tmp/environments; \
    python -c "import numpy, pytest"; \
    if [ "$ENVIRONMENT" = torch ]; then python -c "import torch"; fi; \
    useradd --uid 10001 --user-group --no-create-home --home-dir /work --shell /usr/sbin/nologin sandbox; \
    mkdir /work && chown sandbox:sandbox /work

USER 10001:10001
WORKDIR /work
