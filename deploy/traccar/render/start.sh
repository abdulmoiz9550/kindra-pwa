#!/bin/sh
# Fills the Traccar config from Render environment variables, then starts Traccar.
set -e
: "${PORT:=5055}"
: "${KINDRA_FORWARD_URL:?Set KINDRA_FORWARD_URL to https://<kindra-host>/api/tracking/traccar/forward?secret=<TRACCAR_FORWARD_SECRET>}"
# XML needs & as &amp;; the second sed needs & and | escaped in its replacement.
ESCAPED_URL=$(printf '%s' "$KINDRA_FORWARD_URL" | sed 's/&/\\\&amp;/g; s/[|]/\\|/g')
sed -e "s|__PORT__|$PORT|g" -e "s|__FORWARD_URL__|$ESCAPED_URL|g" \
    /opt/traccar/conf/traccar.xml.template > /opt/traccar/conf/traccar.xml
mkdir -p /opt/traccar/data
# The official image bundles its own Java runtime; fall back to java on PATH for other base images.
JAVA_BIN=/opt/traccar/jre/bin/java
[ -x "$JAVA_BIN" ] || JAVA_BIN=$(command -v java || true)
[ -n "$JAVA_BIN" ] || { echo "Java runtime not found in the Traccar image"; exit 1; }
exec "$JAVA_BIN" -Xms128m -Xmx384m -Djava.net.preferIPv4Stack=true -jar tracker-server.jar conf/traccar.xml
