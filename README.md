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
(HTTP API + Lambda), **realtime** (WebSocket API). Region: `eu-central-1`.

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
pnpm start         # Expo Dev Server; QR-Code mit Expo Go scannen
```

## Stand

Phase 0 („Walking Skeleton") gemäß [Roadmap](docs/architecture.md#4-roadmap):
Monorepo, CDK-Grundstack, Registrierung/Login gegen Cognito, `POST /rides` mit
geteilter Preislogik, WebSocket-Echo als Beweis des Rückkanals.
