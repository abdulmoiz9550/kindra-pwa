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
exec java -Xms128m -Xmx384m -Djava.net.preferIPv4Stack=true -jar tracker-server.jar conf/traccar.xml
