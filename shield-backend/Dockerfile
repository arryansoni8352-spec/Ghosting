# GHOSTING AI Shield backend. CPU baseline. Single worker by design (job state is in-process).
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --create-home shield

WORKDIR /app
COPY requirements.txt requirements-ml.txt requirements-video.txt ./
RUN pip install -r requirements.txt -r requirements-ml.txt -r requirements-video.txt

COPY app ./app
COPY pyproject.toml ./
COPY docker-entrypoint.sh /docker-entrypoint.sh

# Model weights are NOT baked into the image (licence unresolved). Mount verified weights at /app/models.
RUN mkdir -p /app/models /data/jobs && chown -R shield:shield /app/models /data
USER shield

ENV SHIELD_JOB_DIR=/data/jobs \
    SHIELD_DEVICE=cpu \
    SHIELD_ALLOW_WEIGHT_DOWNLOAD=false

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4).status == 200 else 1)"

# --workers 1: the in-memory job manager is not shared across processes (see docs).
# --no-access-log: request lines (job ids, client addresses) are not written by the application.
# SHIELD_FORWARDED_ALLOW_IPS: set to your reverse-proxy IP/CIDR. Never use *. Leave unset to
# disable proxy-header trust entirely (safest default for direct exposure).
ENTRYPOINT ["/docker-entrypoint.sh"]
