# Planungs-Prompt: „Call-a-Ride" – Uber-Clone auf AWS

Diesen Prompt kannst du (z. B. in einer neuen Claude-Session) verwenden, um eine
vollständige Feature- und Infrastrukturplanung zu erhalten. Fülle vorher die
Platzhalter in eckigen Klammern aus – je konkreter, desto besser das Ergebnis.

---

## Der Prompt

```text
Du bist ein erfahrener Solution Architect und Product Lead mit Schwerpunkt auf
Mobility-Plattformen (Ride-Hailing) und AWS-Cloud-Architekturen. Hilf mir, eine
Ride-Hailing-App („Uber-Clone") namens Call-a-Ride von Grund auf zu planen.

## Kontext
- Zielmarkt: [z. B. Deutschland / DACH, zunächst eine Stadt]
- Zielgruppe: [z. B. Privatpersonen; später evtl. Business-Kunden]
- Team & Erfahrung: [z. B. 1–2 Entwickler, gute TypeScript-Kenntnisse, wenig AWS-Erfahrung]
- Budgetrahmen: [z. B. < 200 €/Monat Cloud-Kosten in der MVP-Phase]
- Zeithorizont: [z. B. MVP in 3 Monaten]
- Plattformen: [z. B. iOS + Android (Cross-Platform), Web-Admin-Dashboard]
- Besonderheiten: [z. B. DSGVO-Konformität ist Pflicht, Hosting in eu-central-1]

Falls dir wichtige Informationen fehlen, stelle mir zuerst gezielte Rückfragen,
bevor du planst.

## Aufgabe 1 – Feature-Planung
Erstelle eine priorisierte Feature-Liste, getrennt nach den drei Rollen:
1. Fahrgast (Rider): Registrierung/Login, Fahrt anfragen, Preisschätzung,
   Fahrer-Tracking in Echtzeit, Bezahlung, Fahrthistorie, Bewertungen
2. Fahrer (Driver): Onboarding & Verifizierung (Führerschein, Fahrzeug),
   Fahrten annehmen/ablehnen, Navigation, Verdienstübersicht, Auszahlung
3. Admin/Betreiber: Nutzer- und Fahrerverwaltung, Fahrtenübersicht,
   Preisgestaltung (Surge Pricing ja/nein), Support-Tools, Analytics

Teile die Features in drei Stufen ein:
- MVP (unverzichtbar für den ersten Launch)
- V2 (kurz nach Launch)
- Später (Nice-to-have)
Begründe bei strittigen Features kurz die Einordnung.

## Aufgabe 2 – AWS-Infrastruktur
Entwirf eine konkrete AWS-Architektur für das MVP und beschreibe den
Wachstumspfad. Gehe explizit auf folgende Bausteine ein und begründe
jede Wahl (inkl. Alternativen und warum du sie verwirfst):
- Auth & Nutzerverwaltung (z. B. Amazon Cognito)
- API-Schicht (z. B. API Gateway + Lambda vs. ECS Fargate vs. AppSync)
- Echtzeit-Kommunikation für Live-Standorte und Fahrt-Status
  (z. B. API Gateway WebSockets, AppSync Subscriptions, IoT Core)
- Geodaten & Matching: Fahrersuche im Umkreis, ETA-Berechnung, Routing
  (z. B. Amazon Location Service vs. Google Maps API, ElastiCache/Redis
  mit Geo-Queries für das Fahrer-Matching)
- Datenhaltung (z. B. DynamoDB vs. Aurora PostgreSQL – wofür jeweils?)
- Asynchrone Verarbeitung & Events (EventBridge, SQS, Step Functions –
  z. B. für den Ride-Lifecycle: angefragt → zugewiesen → unterwegs →
  abgeschlossen → abgerechnet)
- Zahlungen (Stripe/Adyen-Integration – was läuft wo, PCI-Scope)
- Push-Benachrichtigungen (SNS, Pinpoint, FCM/APNs)
- Datei-Storage & CDN (S3, CloudFront – z. B. für Dokumenten-Uploads
  beim Fahrer-Onboarding)
- Observability (CloudWatch, X-Ray, Alarme)
- Sicherheit & DSGVO (IAM-Grundschnitt, Verschlüsselung, Datenlöschkonzept,
  Region eu-central-1)
- Infrastructure as Code (CDK vs. Terraform) und CI/CD (z. B. GitHub Actions)
- Umgebungen (dev/staging/prod, Account-Struktur)

Liefere dazu:
- Ein Architekturdiagramm als Mermaid-Diagramm
- Eine grobe monatliche Kostenschätzung für das MVP bei
  [z. B. 500 Nutzern, 50 Fahrern, 100 Fahrten/Tag]

## Aufgabe 3 – Tech-Stack & Projektstruktur
Empfiehl einen konkreten Stack für Mobile-Apps (z. B. React Native/Expo vs.
Flutter), Backend-Sprache/Framework und Monorepo-Struktur. Berücksichtige
unsere Team-Erfahrung aus dem Kontext.

## Aufgabe 4 – Roadmap
Erstelle eine Umsetzungs-Roadmap in Phasen (Meilensteine mit grober
Aufwandsschätzung), beginnend mit einem „Walking Skeleton"
(ein minimaler End-to-End-Durchstich: App → API → DB → Echtzeit-Update).

## Ausgabeformat
- Strukturiertes Markdown-Dokument mit den vier Aufgaben als Kapitel
- Entscheidungen als kurze Tabellen (Option, Pro, Contra, Empfehlung)
- Am Ende: Liste der 5 größten Risiken/offenen Fragen des Projekts
```

---

## Hinweise zur Verwendung

1. **Platzhalter ausfüllen** – besonders Team-Erfahrung, Budget und Zielmarkt
   beeinflussen die Architektur-Empfehlungen stark (z. B. Serverless vs.
   Container, Location Service vs. Google Maps).
2. **Rückfragen zulassen** – der Prompt fordert das Modell auf, erst
   Rückfragen zu stellen. Das lohnt sich; beantworte sie, bevor die
   eigentliche Planung startet.
3. **Iterativ arbeiten** – nimm das Ergebnis-Dokument als `docs/architecture.md`
   ins Repo auf und verfeinere einzelne Kapitel in Folge-Prompts
   (z. B. „Vertiefe das Datenmodell für DynamoDB mit konkreten Tabellen
   und Access Patterns").
