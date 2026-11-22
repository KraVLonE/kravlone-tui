// Regenerate snapshot.json (bundled offline fallback) from the live API. Run before publishing.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ENDPOINTS, getJson, API_URL } from "../api.js";

const out = { _note: "Bundled fallback of raw API responses. Refresh with: npm run snapshot", fetchedAt: new Date().toISOString() };
for (const key of ENDPOINTS) out[key] = await getJson(key);

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "snapshot.json");
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`snapshot.json updated from ${API_URL}`);
