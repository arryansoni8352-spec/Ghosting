#!/bin/sh
# GHOSTING AI Shield entrypoint.
# Sets --forwarded-allow-ips from SHIELD_FORWARDED_ALLOW_IPS (default: no trust of forwarded headers).
# Operators MUST set this to the actual reverse-proxy IP/CIDR before exposing the service.
# NEVER use * in production. Leave unset to disable trusted-proxy header processing entirely.
set -e

TRUST="${SHIELD_FORWARDED_ALLOW_IPS:-}"

if [ -n "$TRUST" ]; then
  case "$TRUST" in
    # Reject wildcard - refuse to start rather than silently trust all sources
    \*|"* "|" *")
      echo "ERROR: SHIELD_FORWARDED_ALLOW_IPS='*' is not permitted." >&2
      echo "       Set it to the actual reverse-proxy IP or CIDR (e.g. 10.0.0.1 or 10.0.0.0/8)." >&2
      exit 1
      ;;
  esac
  FORWARDED_ARGS="--proxy-headers --forwarded-allow-ips ${TRUST}"
else
  # No proxy configured: ignore forwarded headers entirely (safest default)
  FORWARDED_ARGS=""
fi

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8080 \
  --workers 1 \
  --no-access-log \
  $FORWARDED_ARGS \
  "$@"
