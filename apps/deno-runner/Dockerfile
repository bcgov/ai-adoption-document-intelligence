# syntax=docker/dockerfile:1.7

FROM denoland/deno:alpine-2.1.4

# Run as the non-root `deno` user provided by the base image.
USER deno
WORKDIR /app

# Copy the runner sources. The base image already provides the deno binary.
COPY --chown=deno:deno src/ ./src/
COPY --chown=deno:deno deno.json ./deno.json

# Warm the type cache so the first request doesn't pay compilation cost.
RUN deno cache src/main.ts

EXPOSE 9090

# Permissions:
#  - allow-net=0.0.0.0:9090       — bind the HTTP server
#  - allow-read=/app,/tmp         — read sources + the temp scripts the runner writes
#  - allow-write=/tmp             — write temp script files
#  - allow-run                    — spawn deno subprocesses (unrestricted so the runner can
#                                   override env vars on spawn; safe inside this container
#                                   which only contains the deno binary)
#  - allow-env                    — read PORT/HOST/PATH for the spawn (subprocess Deno's
#                                   own --allow-env=AI_DI_* enforces script-level isolation)
ENTRYPOINT [ \
  "deno", "run", \
  "--allow-net=0.0.0.0:9090", \
  "--allow-read=/app,/tmp", \
  "--allow-write=/tmp", \
  "--allow-run", \
  "--allow-env", \
  "src/main.ts" \
]

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost:9090/health || exit 1
