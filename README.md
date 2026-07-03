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

### Stripe einrichten (Testmodus)

Nach dem ersten Deploy die Test-Keys ins Secret legen und den Webhook anlegen:

```bash
aws secretsmanager put-secret-value --secret-id car-dev-stripe \
  --secret-string '{"secretKey":"sk_test_…","webhookSecret":"whsec_…"}'
# Webhook-Endpoint im Stripe-Dashboard: <HttpApiUrl>/webhooks/stripe
# Events: payment_intent.succeeded, payment_intent.payment_failed, account.updated
```

Publishable Key (`pk_test_…`) in `apps/rider/.env` als
`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` eintragen.

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

**Phase 3 (Zahlungen)** gemäß [Roadmap](docs/architecture.md#4-roadmap):

- Fahrgast hinterlegt eine Karte über die Stripe PaymentSheet (SetupIntent,
  off-session-fähig); nach Fahrtende bucht ein EventBridge-getriggertes
  Lambda den Fahrpreis automatisch ab
- Destination Charge mit Provisions-Split: Plattform-Anteil bleibt,
  Rest geht an das Stripe-Connect-Konto (Express) des Fahrers
- Fahrer-Onboarding per Stripe-Link aus der App; account.updated-Webhook
  pflegt payoutsEnabled; Verdienstübersicht (heute/Woche/gesamt) in der App
- Stripe-Keys liegen im Secrets Manager, der Webhook prüft Signaturen

Frühere Phasen: Walking Skeleton (0), Rider-Kernflow mit Location-Routing
und Ride-Statemachine (1), Driver-App mit echtem Geohash-Matching und
Live-Tracking (2).

Noch offen für Phase 4+: Fahrer-Verifizierung mit Dokumenten-Upload,
Admin-Dashboard, Bewertungen, Stornierung, Observability-Alarme.
