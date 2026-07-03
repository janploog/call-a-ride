#!/usr/bin/env node
/**
 * Smoke-Test gegen eine deployte Umgebung:
 *   API_URL=https://xxxx.execute-api.eu-central-1.amazonaws.com node scripts/smoke.mjs
 *
 * Prüft die öffentliche Oberfläche (Health, Auth-Schutz der Kern-Routen).
 * Vollständige Fahrt-Durchläufe brauchen zwei angemeldete Nutzer und laufen
 * bewusst manuell (siehe README, Abschnitt Beta-Checkliste).
 */

const apiUrl = process.env.API_URL;
if (!apiUrl) {
  console.error("API_URL fehlt, z. B. API_URL=https://…execute-api… node scripts/smoke.mjs");
  process.exit(1);
}

let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`✗ ${name}: ${err.message}`);
  }
}

await check("GET /health antwortet 200 mit ok:true", async () => {
  const res = await fetch(`${apiUrl}/health`);
  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  const body = await res.json();
  if (body.ok !== true) throw new Error(`unerwarteter Body: ${JSON.stringify(body)}`);
});

for (const [method, path] of [
  ["POST", "/rides"],
  ["GET", "/route?fromLat=52.52&fromLon=13.4&toLat=52.5&toLon=13.41"],
  ["GET", "/places/search?text=Bahnhof&lat=52.52&lon=13.4"],
  ["GET", "/drivers/me"],
  ["GET", "/admin/rides"],
]) {
  await check(`${method} ${path.split("?")[0]} ist ohne JWT gesperrt (401)`, async () => {
    const res = await fetch(`${apiUrl}${path}`, { method });
    if (res.status !== 401) throw new Error(`Status ${res.status} statt 401`);
  });
}

await check("POST /webhooks/stripe lehnt ungültige Signatur ab (400)", async () => {
  const res = await fetch(`${apiUrl}/webhooks/stripe`, {
    method: "POST",
    headers: { "stripe-signature": "invalid" },
    body: "{}",
  });
  if (res.status !== 400) throw new Error(`Status ${res.status} statt 400`);
});

console.log(failures === 0 ? "\nAlle Smoke-Checks bestanden." : `\n${failures} Check(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
