# MorniHosting: schlankes Image für einen Hytale-Server.
# Enthält nur Java 25 und ein Startskript; die Server-Dateien lädt beim ersten Start der offizielle
# Hytale-Downloader (downloader.hytale.com) in den Server-Ordner. Keine fremden Dateien im Image.
#
# Verfasst mit Claude 🤖
FROM eclipse-temurin:25-jre

# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/* \
 && ln -sf /data/.machine-id /etc/machine-id

COPY --chmod=755 entrypoint.sh /usr/local/bin/hytale-entrypoint

# Uid 1000 wie das Panel, damit beide den Server-Ordner lesen und schreiben können.
USER 1000:1000
WORKDIR /data
ENV HYTALE_PORT=5520 \
    MEMORY=4096M \
    HYTALE_UPDATE=false
EXPOSE 5520/udp
ENTRYPOINT ["/usr/local/bin/hytale-entrypoint"]
