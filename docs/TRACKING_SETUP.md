# Truck route tracking: setup (addendum v1.3)

Kindra never talks to a GPS brand directly. A Traccar server receives positions and forwards them to Kindra.

## 1. Kindra (existing Render service)

Add these environment variables and redeploy:

| Variable | Value |
|---|---|
| `TRACCAR_FORWARD_SECRET` | A long random string you choose |
| `TRACCAR_URL` | Optional. Traccar base URL, only if you also want Kindra to poll Traccar's API (VPS option) |
| `TRACCAR_TOKEN` | Optional. Traccar API token (or `TRACCAR_USER` + `TRACCAR_PASSWORD`) |
| `OSRM_URL` | Optional. Routing server for planned routes. Empty = public OSRM. `off` = straight line |

The forward URL for Traccar is:

```
https://<kindra-host>/api/tracking/traccar/forward?secret=<TRACCAR_FORWARD_SECRET>
```

Admin → Puertas y rastreo shows whether Kindra is receiving data.

## 2a. Traccar on Render (phones with Traccar Client)

1. New → Web Service → this repo, Root Directory `deploy/traccar/render`, Runtime Docker.
2. Environment variable `KINDRA_FORWARD_URL` = the forward URL above.
3. Add a persistent disk mounted at `/opt/traccar/data` (1 GB).
4. Deploy. The service URL (for example `https://kindra-traccar.onrender.com`) is the Traccar Client server address.

Render accepts only HTTPS on one port, so hardware GPS trackers cannot connect here. Use 2b for them.

## 2b. Traccar on a VPS (hardware GPS trackers and phones)

1. Any small Linux VPS with Docker (1 GB RAM is enough).
2. Copy `deploy/traccar/vps`, set `__FORWARD_URL__` in `traccar.xml`, run `docker compose up -d`.
3. Device address: `<vps-ip>`, port as listed for the model in the Traccar supported devices list. Phones: port 5055.

## 3. Link each truck

1. Phone: install Traccar Client (Android), set the server URL from step 2, frequency 30 s, start the service. Its device identifier is shown in the app.
2. GPS device: its identifier is the IMEI written next to the truck plate.
3. Kindra → Admin → Vehículos (or the entity admin panel): enter the identifier in "IMEI" and choose the source.

Positions are stored in Kindra only while that vehicle has an active trip. Switching a truck from the phone to its GPS device is only a change of IMEI, with no development.

## 4. Field use

- Removal crew: Más → Escolta del viaje → Iniciar viaje. At the destination, scan the gate QR: inside the perimeter it closes the arrival.
- Center, work or coordinator gate staff: Más → Punto de control → scan the vehicle QR, take the photo, confirm.
- Coordinator, supervisor, admin, destination center: Más → Seguimiento; trip detail has the replay slider and the trace integrity check.
- Gate QRs to print: Admin → Puertas y rastreo → Imprimir.
- Without signal, scans and positions stay on the phone and upload when signal returns, marked as delayed.
