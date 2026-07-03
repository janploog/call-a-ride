# Call-a-Ride

Ride-Hailing-Plattform („Uber-Clone") für den deutschen Markt — Marktplatz-Modell mit
freien Fahrern, Start lokal in einer Stadt.

**Planung:** [docs/architecture.md](docs/architecture.md) · Prompt dazu: [docs/planning-prompt.md](docs/planning-prompt.md)

## Struktur

| Pfad | Inhalt |
|---|---|
| `apps/rider` | Fahrgast-App (Expo / React Native, expo-router, Amplify-Auth, MapLibre) |
| `apps/driver` | Fahrer-App (Online-Status, Fahrtangebote, Positions-Streaming) |
| `packages/core` | Geteilte Domain-Logik: Zod-Schemas, Preisberechnung, Geohash (pure TS, getestet) |
| `services/backend` | Lambda-Handler (TypeScript) + AWS-CDK-Infrastruktur |

CDK-Stacks (`car-<stage>-…`): **auth** (Cognito), **data** (DynamoDB), **api**
(HTTP API + Lambda), **realtime** (WebSocket API), **rideflow** (Step-Functions-
Statemachine für den Fahrt-Lebenszyklus), **location** (API-Key für Karten-Tiles).
Region: `eu-central-1`.

## Entwicklung

Voraussetzungen: Node ≥ 22, pnpm 10.

```bash
pnpm install
pnpm test          # Unit-Tests (packages/core)
pnpm typecheck     # alle Workspaces
pnpm synth         # CDK-Templates generieren (validiert die Infrastruktur)
```

### Backend deployen (dev)

```bash
cd services/backend
pnpm exec cdk bootstrap        # einmalig pro Account/Region
pnpm run deploy:dev
```

### Rider-App starten

Stack-Outputs (User-Pool-IDs, API-URLs) in `apps/rider/.env` eintragen
(Vorlage: `.env.example`), dann:

```bash
cd apps/rider
npx expo run:android   # oder run:ios — Dev-Build erforderlich
```

> **Hinweis:** Seit Phase 1 enthält die App das native MapLibre-Modul für die
> Amazon-Location-Karte — **Expo Go reicht nicht mehr**, es braucht einen
> Dev-Build (`npx expo run:android|ios` lokal oder EAS Build).
> Der Karten-API-Key kommt aus dem location-Stack:
> `aws location describe-key --key-name car-dev-maps --query Key --output text`

## Stand

**Phase 2 (Driver-App & echtes Matching)** gemäß [Roadmap](docs/architecture.md#4-roadmap):

- Fahrer-App: Online-Schalter, Positions-Streaming über WebSocket,
  Fahrtangebot mit Annehmen/Ablehnen, Fahrt-Screen mit Statuswechseln
- Echtes Matching in der Statemachine: Geohash-Umkreissuche um den Abholort,
  Angebot per Callback-Pattern (Task-Token, 30-s-Timeout), bei Ablehnung/
  Timeout Weiterreichung an den nächsten Fahrer, max. 5 Versuche
- Live-Tracking: Fahrer-Position wird während der Fahrt an den Fahrgast
  weitergeleitet und in der Rider-App auf der Karte angezeigt
- WebSocket-Connect verifiziert jetzt das Cognito-JWT (aws-jwt-verify)

Noch offen für Phase 3+: Zahlungen (Stripe Connect), Expo-Push zusätzlich zum
WebSocket-Kanal, Hintergrund-Standort der Fahrer-App, Stornierung durch den
Fahrgast, gemeinsames UI-Paket für beide Apps.
