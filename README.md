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

Alle MVP-Phasen der [Roadmap](docs/architecture.md#4-roadmap) sind umgesetzt:

| Phase | Inhalt |
|---|---|
| 0 | Walking Skeleton: Monorepo, CDK-Grundstack, Cognito-Login, WebSocket-Echo |
| 1 | Rider-Kernflow: Location-Routing/Geocoding, Preis-Quote, Ride-Statemachine, Live-Status |
| 2 | Driver-App, Geohash-Matching mit Angebots-Timeout, Live-Tracking, WS-JWT-Auth |
| 3 | Stripe Connect: PaymentSheet, Off-Session-Charge mit Provisions-Split, Webhook, Verdienst |
| 4 | Fahrer-Verifizierung (S3-Dokumente, Admin-Gate), Admin-Dashboard, Preiskonfiguration, Bewertungen |
| 5 | Stornierung (inkl. Statemachine-Stop + Fahrer-Info), Alarme, Budget-Wächter, Smoke-Test |
| + | Expo-Push (Angebote/Status auch bei geschlossener App), Fahrthistorie, Navigations-Link & Anruf-Button (Fahrer), Wächter für hängende Fahrten, Admin: Nutzer sperren & Stripe-Erstattungen |
| + | SMS-Verifizierung der Telefonnummer (Cognito/SNS): ohne bestätigte Nummer keine Buchung und kein Online-Gehen (serverseitig erzwungen) |

### Beta-Checkliste (manuell, vor dem ersten echten Fahrgast)

1. `cdk deploy --all -c stage=dev -c alarmEmail=du@example.com`, Stripe-Secret
   befüllen, Smoke-Test: `API_URL=… node scripts/smoke.mjs`
2. Kompletter Zwei-Geräte-Durchlauf: Fahrer-Dokumente → Admin-Freischaltung →
   online gehen → Buchung → Angebot → Fahrt → automatische Zahlung → Bewertung
3. Storno-Fälle: vor Matching, während Angebot, nach Zuweisung
4. iOS/Android-Verhalten bei Hintergrund/Sperrbildschirm der Fahrer-App prüfen
   (Background-Location ist bewusst noch nicht aktiviert)
5. AGB/Datenschutzerklärung und PBefG-Klärung (siehe docs/architecture.md, Risiko 1)

### SMS-Versand freischalten (einmalig)

Neue AWS-Accounts stecken in der **SNS-SMS-Sandbox** (SMS nur an verifizierte
Testnummern) und haben ein Ausgabenlimit von **1 $/Monat**. Vor dem Livegang
beides per Support-Case lösen: Produktionszugang für SMS beantragen und das
Limit erhöhen (z. B. 50 $). Kosten in DE: ~6–9 ct pro SMS, fällt nur bei
Registrierung/Nummernwechsel an.

### Bewusst offen (nach der Beta)

Hintergrund-Standort der Fahrer-App, 3D-Secure-Nachzahlungs-Flow,
Servicegebiet-Polygon, Belege per E-Mail (SES), Nummern-Maskierung,
WebSocket-Reconnect-Strategie, gemeinsames UI-Paket,
DSGVO-Account-Löschprozess, CI-Deploy-Pipeline mit OIDC.

Hinweis Expo-Push: benötigt eine EAS-Projekt-ID (`eas init`); ohne sie
überspringen die Apps die Registrierung stillschweigend.
