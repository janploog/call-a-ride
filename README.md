# Call-a-Ride

Ride-Hailing-Plattform („Uber-Clone") für den deutschen Markt — Marktplatz-Modell mit
freien Fahrern, Start lokal in einer Stadt.

**Planung:** [docs/architecture.md](docs/architecture.md) · Prompt dazu: [docs/planning-prompt.md](docs/planning-prompt.md)

## Struktur

| Pfad | Inhalt |
|---|---|
| `apps/rider` | Fahrgast-App (Expo / React Native, expo-router, Amplify-Auth, MapLibre) |
| `apps/driver` | Fahrer-App (Online-Status, Fahrtangebote, Positions-Streaming, Dokumenten-Upload) |
| `apps/admin` | Admin-Dashboard (React/Vite): Verifizierungsqueue, Fahrten, Preise |
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

### Admin-Zugang anlegen

```bash
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> \
  --username admin@example.com --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true Name=phone_number,Value=+491700000000 \
  --temporary-password 'Anfang12345!'
aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> \
  --username admin@example.com --group-name admin
# Dashboard: cd apps/admin && cp .env.example .env  # Werte eintragen
pnpm --filter @call-a-ride/admin dev
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

**Phase 4 (Fahrer-Onboarding & Admin)** gemäß [Roadmap](docs/architecture.md#4-roadmap):

- Fahrer laden Pflichtdokumente (Führerschein, P-Schein, Fahrzeugschein,
  Versicherung) per presigned S3-Upload hoch; ohne Freischaltung
  (APPROVED) kein Online-Gehen — serverseitig erzwungen
- Admin-Dashboard: Verifizierungsqueue mit Dokumenten-Ansicht und
  Freischalten/Ablehnen, chronologische Fahrtenliste mit Zahlungsstatus,
  Preis-/Provisionskonfiguration zur Laufzeit (config-Tabelle, 60-s-Cache)
- Beidseitige Bewertungen nach Fahrtende (einmal pro Seite,
  Aggregat am bewerteten Nutzer)

Frühere Phasen: Walking Skeleton (0), Rider-Kernflow (1), Driver-App mit
Matching und Live-Tracking (2), Stripe-Zahlungen (3).

Noch offen für Phase 5: Stornierung, Observability-Alarme, Budget-Wächter,
Smoke-Test.
