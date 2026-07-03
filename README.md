# Call-a-Ride

Ride-Hailing-Plattform („Uber-Clone") für den deutschen Markt — Marktplatz-Modell mit
freien Fahrern, Start lokal in einer Stadt.

**Planung:** [docs/architecture.md](docs/architecture.md) · Prompt dazu: [docs/planning-prompt.md](docs/planning-prompt.md)

## Struktur

| Pfad | Inhalt |
|---|---|
| `apps/rider` | Fahrgast-App (Expo / React Native, expo-router, Amplify-Auth) |
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

**Phase 1 (Rider-Kernflow)** gemäß [Roadmap](docs/architecture.md#4-roadmap):

- Adresssuche und Routing über Amazon Location (v2-APIs, per Lambda-Proxy)
- Preisschätzung vor Buchung (`GET /route`), Fahrt anlegen (`POST /rides`)
- Ride-Lifecycle als Step-Functions-Statemachine — in Phase 1 nimmt ein
  simulierter Fahrer an und die Fahrt durchläuft alle Status bis COMPLETED
- Live-Status-Updates per WebSocket-Push in die App (Fahrt-Screen mit Timeline)
- Karte mit MapLibre + Amazon-Location-Tiles im Buchungs-Screen

Noch offen aus Phase 1→2: JWT-Verifikation beim WebSocket-Connect, echtes
Fahrer-Matching statt Simulation.
