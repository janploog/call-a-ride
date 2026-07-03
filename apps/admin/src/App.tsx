import { getCurrentUser, signIn, signOut } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { api, type AdminDriver, type AdminRide, type Pricing } from "./api";

type Tab = "drivers" | "rides" | "pricing";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("drivers");

  useEffect(() => {
    getCurrentUser()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="container">Lade…</div>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <div className="container">
      <h1>Call-a-Ride Admin</h1>
      <nav>
        <button className={tab === "drivers" ? "active" : ""} onClick={() => setTab("drivers")}>
          Fahrer-Verifizierung
        </button>
        <button className={tab === "rides" ? "active" : ""} onClick={() => setTab("rides")}>
          Fahrten
        </button>
        <button className={tab === "pricing" ? "active" : ""} onClick={() => setTab("pricing")}>
          Preise
        </button>
        <button
          style={{ marginLeft: "auto" }}
          onClick={() => signOut().then(() => setAuthed(false))}
        >
          Abmelden
        </button>
      </nav>
      {tab === "drivers" && <DriversTab />}
      {tab === "rides" && <RidesTab />}
      {tab === "pricing" && <PricingTab />}
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { isSignedIn } = await signIn({ username: email, password });
      if (isSignedIn) onSuccess();
      else setError("Zusätzlicher Anmeldeschritt nötig – bitte Nutzer prüfen.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    }
  }

  return (
    <form className="login" onSubmit={onSubmit}>
      <h1>Admin-Login</h1>
      <input
        type="email"
        placeholder="E-Mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Passwort"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <div className="error">{error}</div>}
      <button className="primary" type="submit">
        Anmelden
      </button>
    </form>
  );
}

function DriversTab() {
  const [status, setStatus] = useState("PENDING");
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [docs, setDocs] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);

  async function load(nextStatus = status) {
    try {
      const res = await api.listDrivers(nextStatus);
      setDrivers(res.drivers);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function onShowDocs(userId: string) {
    const res = await api.driverDocuments(userId);
    setDocs((prev) => ({ ...prev, [userId]: res.documents }));
  }

  async function onVerify(userId: string, decision: "APPROVED" | "REJECTED") {
    await api.verifyDriver(userId, decision);
    await load();
  }

  return (
    <div>
      <nav>
        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button key={s} className={status === s ? "active" : ""} onClick={() => setStatus(s)}>
            {s}
          </button>
        ))}
      </nav>
      {error && <div className="error">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Fahrer</th>
            <th>Dokumente</th>
            <th>Stripe</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.userId}>
              <td>
                <code>{d.userId.slice(0, 8)}…</code>
                <div className="muted">{d.updatedAt}</div>
              </td>
              <td className="docs">
                {Object.keys(d.documents).length} eingereicht{" "}
                {docs[d.userId] ? (
                  Object.entries(docs[d.userId] ?? {}).map(([type, url]) => (
                    <a key={type} href={url} target="_blank" rel="noreferrer">
                      {type}
                    </a>
                  ))
                ) : (
                  <button className="action" onClick={() => onShowDocs(d.userId)}>
                    ansehen
                  </button>
                )}
              </td>
              <td>{d.payoutsEnabled ? "Auszahlung aktiv" : "—"}</td>
              <td>
                <button className="action approve" onClick={() => onVerify(d.userId, "APPROVED")}>
                  Freischalten
                </button>
                <button className="action reject" onClick={() => onVerify(d.userId, "REJECTED")}>
                  Ablehnen
                </button>
              </td>
            </tr>
          ))}
          {drivers.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Keine Fahrer mit Status {status}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RidesTab() {
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRides()
      .then((r) => setRides(r.rides))
      .catch((e) => setError(e instanceof Error ? e.message : "Laden fehlgeschlagen"));
  }, []);

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Strecke</th>
            <th>Status</th>
            <th>Zahlung</th>
            <th>Preis</th>
          </tr>
        </thead>
        <tbody>
          {rides.map((r) => (
            <tr key={r.rideId}>
              <td>{new Date(r.createdAt).toLocaleString("de-DE")}</td>
              <td>
                {r.pickupAddress} → {r.dropoffAddress}
              </td>
              <td>{r.status}</td>
              <td>{r.paymentStatus ?? "—"}</td>
              <td>{(r.estimatedFareCents / 100).toFixed(2)} €</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricingTab() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getPricing().then((r) => setPricing(r.pricing));
  }, []);

  if (!pricing) return <div>Lade…</div>;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!pricing) return;
    setMessage(null);
    try {
      await api.savePricing(pricing);
      setMessage("Gespeichert – wirkt innerhalb von 60 Sekunden.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  const fields: Array<{ key: keyof Pricing; label: string; step?: string }> = [
    { key: "baseFareCents", label: "Grundpreis (Cent)" },
    { key: "perKmCents", label: "Preis pro km (Cent)" },
    { key: "perMinuteCents", label: "Preis pro Minute (Cent)" },
    { key: "minimumFareCents", label: "Mindestfahrpreis (Cent)" },
    { key: "commissionRate", label: "Provision (0–0.5)", step: "0.01" },
  ];

  return (
    <form className="pricing" onSubmit={onSave}>
      {fields.map(({ key, label, step }) => (
        <label key={key}>
          {label}
          <input
            type="number"
            step={step ?? "1"}
            value={pricing[key]}
            onChange={(e) =>
              setPricing({ ...pricing, [key]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      <button className="primary" type="submit">
        Speichern
      </button>
      {message && <div className="muted">{message}</div>}
    </form>
  );
}
