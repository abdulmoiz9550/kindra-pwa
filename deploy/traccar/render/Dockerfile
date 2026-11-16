# Traccar on a Render web service (paid plan). Receives phones running Traccar Client (OsmAnd protocol over HTTPS)
# on Render's public port and forwards every position and device event to Kindra.
# Hardware GPS trackers that use raw TCP protocols cannot reach Render: use deploy/traccar/vps instead.
FROM traccar/traccar:latest
COPY traccar.xml.template /opt/traccar/conf/traccar.xml.template
COPY start.sh /opt/traccar/start.sh
RUN chmod +x /opt/traccar/start.sh
WORKDIR /opt/traccar
ENTRYPOINT ["/opt/traccar/start.sh"]
