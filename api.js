// Data layer: portfolio backend -> local cache -> bundled snapshot, normalized into one view model.
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

export const API_URL = (process.env.KRAVLONE_API || "https://kravlone.xyz/api").replace(/\/+$/, "");
export const ENDPOINTS = ["profile", "experience", "projects", "skills", "achievements"];
const TIMEOUT_MS = 4000;

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "kravlone",
  "data.json"
);

const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
};

export async function getJson(endpoint) {
  const res = await fetch(`${API_URL}/${endpoint}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  return res.json();
}

// Fetch every endpoint in parallel; each one falls back independently (cache, then snapshot).
export async function fetchRaw({ offline = false } = {}) {
  const cache = readJson(CACHE_FILE) || {};
  const snapshot = readJson(path.join(here, "snapshot.json")) || {};
  const results = offline
    ? ENDPOINTS.map(() => ({ status: "rejected" }))
    : await Promise.allSettled(ENDPOINTS.map(getJson));

  const raw = {};
  const sources = {};
  ENDPOINTS.forEach((key, i) => {
    if (results[i].status === "fulfilled") { raw[key] = results[i].value; sources[key] = "live"; }
    else if (cache[key] !== undefined) { raw[key] = cache[key]; sources[key] = "cache"; }
    else { raw[key] = snapshot[key]; sources[key] = "snapshot"; }
  });

  if (Object.values(sources).includes("live")) {
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...cache, ...raw, fetchedAt: new Date().toISOString() }));
    } catch { /* cache is best-effort */ }
  }
  return { raw, sources, cachedAt: cache.fetchedAt, snapshotAt: snapshot.fetchedAt };
}

// Drive "/file/d/<id>/view" pages are HTML; rewrite to the direct-download form.
export function directResumeUrl(url) {
  const m = url?.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]+)/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
}

export function toViewModel(raw, extras) {
  const profile = raw.profile || {};
  const experience = raw.experience || [];
  const projects = raw.projects || [];
  const current = experience.find((e) => !e.end_date);

  // Group skills by category, keeping backend order.
  const skillGroups = new Map();
  for (const s of raw.skills || []) {
    if (!skillGroups.has(s.category)) skillGroups.set(s.category, []);
    skillGroups.get(s.category).push(s);
  }

  const links = [
    { label: "GitHub", value: profile.github_url },
    { label: "LinkedIn", value: profile.linkedin_url },
    { label: "Twitter", value: profile.twitter_url },
    ...(extras.extraLinks || []),
  ].filter((l) => l.value);

  return {
    about: {
      name: extras.handle && profile.name ? `${profile.name} (${extras.handle})` : profile.name || extras.handle,
      role: current ? `${current.role} • ${current.company}` : profile.title,
      tagline: profile.tagline,
      location: profile.location,
      philosophy: extras.philosophy,
      interests: extras.interests || [],
      currentWork: extras.currentWork || [],
    },
    skills: [...skillGroups].map(([label, items]) => ({
      label,
      value: items.sort((a, b) => a.order - b.order).map((s) => s.name),
    })),
    projects: [...projects].sort((a, b) => (b.featured - a.featured) || (a.order - b.order)),
    experience,
    achievements: raw.achievements || [],
    linux: extras.linux || [],
    links,
    resume: { url: directResumeUrl(profile.resume_url), viewUrl: profile.resume_url },
    contact: { email: profile.email },
  };
}

export async function loadData(opts) {
  const extras = readJson(path.join(here, "extras.json")) || {};
  const { raw, sources, cachedAt, snapshotAt } = await fetchRaw(opts);
  return { data: toViewModel(raw, extras), sources, cachedAt, snapshotAt };
}
