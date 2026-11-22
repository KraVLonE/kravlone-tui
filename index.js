#!/usr/bin/env node
import chalk from "chalk";
import boxen from "boxen";
import gradient from "gradient-string";
import inquirer from "inquirer";
import figlet from "figlet";
import open from "open";
import fs from "fs";
import path from "path";
import readline from "readline";
import wrapAnsi from "wrap-ansi";
import { loadData } from "./api.js";

const CYAN = chalk.hex("#00FFFF");
const PINK = chalk.hex("#E90074");
const INTERACTIVE = Boolean(process.stdin.isTTY && process.stdout.isTTY);

let data;
let status = "";

const icons = {
  about:        "*",
  experience:   "=",
  skills:       "+",
  projects:     "#",
  achievements: "^",
  linux:        ">",
  links:        "@",
  resume:       "V",
  email:        "E",
  exit:         "X",
};

const MENU_CHOICES = [
  new inquirer.Separator(),
  { name: `${CYAN(icons.about)}  About Me`, value: "about" },
  { name: `${CYAN(icons.experience)}  Experience`, value: "experience" },
  { name: `${CYAN(icons.skills)}  Skills`, value: "skills" },
  { name: `${CYAN(icons.projects)}  Projects`, value: "projects" },
  { name: `${CYAN(icons.achievements)}  Achievements`, value: "achievements" },
  { name: `${CYAN(icons.linux)}  Linux Stuff`, value: "linux" },
  { name: `${CYAN(icons.links)}  Social Links`, value: "links" },
  new inquirer.Separator(),
  { name: `${chalk.greenBright(icons.resume)}  Download Resume`, value: "resume" },
  { name: `${chalk.yellowBright(icons.email)}  Send Email`, value: "email" },
  new inquirer.Separator(),
  { name: chalk.red(`${icons.exit}  Exit`), value: "exit" }
];

function goodbye() {
  process.stdout.write("\x1b[?25h"); // inquirer hides the cursor; make sure it comes back
  if (INTERACTIVE) console.clear();
  console.log(CYAN("\nGoodbye, Kind Visitor !\n"));
  process.exit(0);
}

// -----------------------------
// KEYBOARD
// -----------------------------
// One keypress listener for the whole app; each screen sets `keyHandler` for its own keys.
// - card screens: ESC / Q / Backspace go back
// - list screens: ESC / Q go back (Backspace is left to inquirer's type-to-search)

const BACK = Symbol("back");
const CARD_BACK_KEYS = new Set(["escape", "q", "backspace"]);
const LIST_BACK_KEYS = new Set(["escape", "q"]);
let keyHandler = null;

function setupKeys() {
  // Must run before the first inquirer prompt: readline only installs its key decoder once per
  // stream, and the default 500ms ESC timeout is what made ESC lag behind Q.
  readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 50 });
  process.stdin.on("keypress", (_str, key) => keyHandler?.(key || {}));
}

// Start listening for "back" immediately, so keys pressed while a slow screen (resume download)
// is still rendering are neither echoed nor lost.
function waitForBack() {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    keyHandler = (key) => {
      if (key.ctrl && key.name === "c") goodbye();
      if (!CARD_BACK_KEYS.has(key.name)) return;
      keyHandler = null;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    };
  });
}

// inquirer list prompt; resolves to BACK on ESC/Q, exits on Ctrl+C.
async function listPrompt(question, { allowBack = true } = {}) {
  const controller = new AbortController();
  if (allowBack) keyHandler = (key) => { if (LIST_BACK_KEYS.has(key.name)) controller.abort(); };
  try {
    const prompt = inquirer.createPromptModule({ signal: controller.signal });
    return (await prompt([{ type: "list", name: "value", pageSize: 20, loop: false, ...question }])).value;
  } catch (err) {
    if (err?.name === "AbortPromptError") return BACK;
    if (err?.name === "ExitPromptError") goodbye();
    throw err;
  } finally {
    keyHandler = null;
  }
}

// -----------------------------
// DATA LOADING
// -----------------------------

function startSpinner(text) {
  if (!process.stderr.isTTY) return () => {};
  const frames = ["|", "/", "-", "\\"];
  let i = 0;
  const timer = setInterval(() => process.stderr.write(`\r${CYAN(frames[i++ % frames.length])} ${text}`), 80);
  return () => { clearInterval(timer); process.stderr.write("\r\x1b[K"); };
}

async function init() {
  const stop = startSpinner("Loading card...");
  let result;
  try {
    result = await loadData({ offline: process.argv.includes("--offline") });
  } finally {
    stop();
  }
  data = result.data;

  const stale = Object.values(result.sources).filter((s) => s !== "live");
  if (stale.length) {
    const from = result.sources.profile === "cache" ? result.cachedAt : result.snapshotAt;
    const when = from ? new Date(from).toLocaleDateString() : "an earlier version";
    status = chalk.gray(`(offline: showing saved data from ${when})`);
  }
}

// -----------------------------
// SAFE HELPERS
// -----------------------------

// open() can fail on headless/SSH machines; the link is always printed, so just ignore failures.
async function safeOpen(target) {
  try {
    const child = await open(target);
    child?.on?.("error", () => {});
  } catch { /* no browser available */ }
}

function uniquePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}${ext}`);
  for (let n = 1; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base}-${n}${ext}`);
  return candidate;
}

async function downloadResume() {
  const { url, viewUrl } = data.resume;
  console.log(chalk.gray("\nDownloading resume..."));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error("server did not return a PDF");

    const filePath = uniquePath(process.cwd(), "KraVLonE-Resume", ".pdf");
    fs.writeFileSync(filePath, buf);
    console.log(chalk.green(`[ok] Saved to ${filePath}`));
    await safeOpen(filePath);
  } catch (err) {
    console.error(chalk.red(`\n[x] Download failed: ${err.message}`));
    console.log(`Opening it in your browser instead: ${clickableLink(viewUrl || url, viewUrl || url)}`);
    await safeOpen(viewUrl || url);
  }
}

// -----------------------------
// UI HELPERS
// -----------------------------

function printTitle() {
  const ascii = figlet.textSync("KraVLonE", { horizontalLayout: "fitted" });
  console.log(gradient(["#00FFFF", "#E90074", "#00FFFF"]).multiline(ascii));
  if (status) console.log(status);
}

function freshScreen() {
  console.clear();
  printTitle();
}

function card(content) {
  return boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: "round",
    borderColor: "#00FFFF",
  });
}

// Usable text width inside a card: terminal width (capped for readability) minus border (2) + padding (6).
function innerWidth() {
  return Math.max(30, Math.min(process.stdout.columns || 80, 100) - 8);
}

// Wrap text to `width`, indenting continuation lines by `indent` spaces (first line is not indented).
function wrap(text, width, indent = 0) {
  return wrapAnsi(String(text ?? ""), Math.max(10, width - indent), { hard: true })
    .split("\n")
    .map((line, i) => (i ? " ".repeat(indent) + line : line))
    .join("\n");
}

function bullet(text, indent = 2) {
  return `${" ".repeat(indent)}• ${wrap(text, innerWidth(), indent + 2)}`;
}

function labelled(rows, sep = "  ") {
  const width = Math.max(0, ...rows.map((r) => r.label.length));
  const indent = width + sep.length;
  return rows
    .map((r) => `${CYAN(r.label.padEnd(width, " "))}${sep}${wrap(r.value, innerWidth(), indent)}`)
    .join("\n");
}

function formatMonth(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clickableLink(text, url) {
  return `\u001b]8;;${url}\u0007${chalk.underline(text)}\u001b]8;;\u0007`;
}

// -----------------------------
// CONTENT SECTIONS
// -----------------------------

function showAbout() {
  const a = data.about;
  const rows = [
    { label: "► Name", value: a.name },
    { label: "► Role", value: a.role },
    a.location && { label: "► Location", value: a.location },
    a.philosophy && { label: "► Philosophy", value: a.philosophy },
  ].filter(Boolean);
  const lines = [labelled(rows, "  : ")];
  if (a.tagline) lines.push("", wrap(a.tagline, innerWidth()));
  if (a.interests.length) lines.push("", CYAN("► Interests"), `  ${wrap(a.interests.join(" • "), innerWidth(), 2)}`);
  if (a.currentWork.length) lines.push("", CYAN("► Current Work"), `  ${wrap(a.currentWork.join(" • "), innerWidth(), 2)}`);
  console.log(card(lines.join("\n")));
}

function showExperience() {
  if (!data.experience.length) return console.log(card("No experience to show."));
  const w = innerWidth();
  const blocks = data.experience.map((e) => {
    const when = `${formatMonth(e.start_date)} – ${e.end_date ? formatMonth(e.end_date) : "Present"}`;
    // Role on the left, dates right-aligned on the same line (dates drop to their own line if it won't fit).
    const gap = w - e.role.length - when.length;
    const header = gap >= 2
      ? `${chalk.bold(CYAN(e.role))}${" ".repeat(gap)}${chalk.gray(when)}`
      : `${chalk.bold(CYAN(e.role))}\n${chalk.gray(when)}`;
    const lines = [header, wrap([chalk.bold(e.company), e.location && chalk.gray(e.location)].filter(Boolean).join(chalk.gray(" • ")), w)];
    if (e.pointers?.length) lines.push("", e.pointers.map((pt) => bullet(pt)).join("\n\n"));
    if (e.tech_stack?.length) lines.push("", `${CYAN("Tech")}  ${chalk.gray(inlineList(e.tech_stack, w, 6, " · ").trimStart())}`);
    return lines.join("\n");
  });
  console.log(card(blocks.join(`\n\n${chalk.gray("─".repeat(w))}\n\n`)));
}

// Category heading on its own line, items underneath, blank line between groups.
function showSkills() {
  if (!data.skills.length) return console.log(card("No skills to show."));
  const w = innerWidth();
  const groups = data.skills.map((s) => `${chalk.bold(CYAN(`► ${s.label}`))}\n${inlineList(s.value, w, 2)}`);
  console.log(card(groups.join("\n\n")));
}

// Lay items out on lines of at most `width`, never splitting an item and never starting a line with a separator.
function inlineList(items, width, indent = 0, sep = "  ·  ") {
  const pad = " ".repeat(indent);
  const lines = [];
  let line = [];
  let len = indent;
  for (const item of items) {
    const add = (line.length ? sep.length : 0) + item.length;
    if (line.length && len + add > width) {
      lines.push(line);
      line = [];
      len = indent;
    }
    len += (line.length ? sep.length : 0) + item.length;
    line.push(item);
  }
  if (line.length) lines.push(line);
  return lines.map((l) => pad + l.join(chalk.gray(sep))).join("\n");
}

function showAchievements() {
  if (!data.achievements.length) return console.log(card("No achievements to show."));
  const lines = data.achievements.map((a) => {
    const date = a.date ? chalk.gray(` (${formatMonth(a.date)})`) : "";
    return bullet(`${chalk.bold(CYAN(a.title))}${date} – ${a.description}`, 0);
  });
  console.log(card(lines.join("\n")));
}

// Non-interactive overview (also used when stdout is piped).
function showProjectList() {
  const featured = data.projects.filter((p) => p.featured);
  const rest = data.projects.filter((p) => !p.featured);
  const lines = [];
  const group = (title, list) => {
    if (!list.length) return;
    if (lines.length) lines.push("");
    lines.push(CYAN(title));
    list.forEach((p) => lines.push(bullet(`${chalk.bold(p.title)} – ${p.one_liner}`)));
  };
  group("Featured", featured);
  group(featured.length ? "More Projects" : "Projects", rest);
  console.log(card(lines.join("\n") || "No projects to show."));
}

const LINK_LABELS = { repo: "Repo", live_demo: "Live demo", demo: "Demo", docs: "Docs", video: "Video" };

function showProjectDetail(p) {
  const w = innerWidth();
  const meta = [p.role, formatMonth(p.date), p.location].filter(Boolean).join(" • ");
  const lines = [chalk.bold(CYAN(p.title)), wrap(p.one_liner, w)];
  if (meta) lines.push(chalk.gray(wrap(meta, w)));
  if (p.outcome) lines.push("", `${CYAN("► Outcome")}  ${wrap(p.outcome, w, 11)}`);
  if (p.pointers?.length) lines.push("", CYAN("► Highlights"), ...p.pointers.map((pt) => bullet(pt)));
  if (p.tech_stack?.length) lines.push("", CYAN("► Tech"), `  ${wrap(p.tech_stack.join(", "), w, 2)}`);

  const links = Object.entries(p.links || {})
    .filter(([, url]) => typeof url === "string" && url.trim())
    .map(([key, url]) => ({ label: LINK_LABELS[key] || key, value: clickableLink(url, url) }));
  if (links.length) lines.push("", CYAN("► Links"), labelled(links.map((l) => ({ ...l, label: `  ${l.label}` }))));

  console.log(card(lines.join("\n")));
}

// Interactive: pick a project, view details, come back to the list.
async function runProjects() {
  if (!data.projects.length) {
    freshScreen();
    console.log(card("No projects to show."));
    console.log(PINK("\nPress ESC, Q or Backspace to go back"));
    return waitForBack();
  }
  const featured = data.projects.filter((p) => p.featured);
  const rest = data.projects.filter((p) => !p.featured);
  const max = Math.max(30, (process.stdout.columns || 80) - 6);
  const choice = (p) => ({
    name: `${chalk.bold(p.title)}${chalk.gray(` – ${truncate(p.one_liner, Math.max(10, max - p.title.length - 3))}`)}`,
    value: p,
  });
  const choices = [
    ...(featured.length ? [new inquirer.Separator(CYAN("── Featured ──")), ...featured.map(choice)] : []),
    ...(rest.length ? [new inquirer.Separator(CYAN(featured.length ? "── More ──" : "── Projects ──")), ...rest.map(choice)] : []),
    new inquirer.Separator(),
    { name: chalk.red("<  Back to menu"), value: BACK },
  ];

  let last;
  while (true) {
    freshScreen();
    const project = await listPrompt({
      message: `${PINK("Pick a project:")} ${chalk.gray("(ESC/Q to go back)")}`,
      choices,
      default: last,
    });
    if (project === BACK) return;
    last = project;

    const back = waitForBack();
    freshScreen();
    showProjectDetail(project);
    console.log(PINK("\nPress ESC, Q or Backspace to go back"));
    await back;
  }
}

function showLinks() {
  console.log(card(labelled(data.links.map((l) => ({ label: l.label, value: clickableLink(l.value, l.value) })))));
}

function showLinux() {
  console.log(card(labelled(data.linux)));
}

async function showResume() {
  if (!data.resume.url) return console.log(card("Resume link is not available right now."));
  console.log(card(`${CYAN("Resume Download")}\nDirect link: ${clickableLink("Download Resume", data.resume.url)}`));
  await downloadResume();
}

async function showEmail() {
  const mailUrl = `mailto:${data.contact.email}?subject=Hello%20KraVLonE`;
  console.log(card(`${CYAN("Send me an email")}\n${data.contact.email}\n${clickableLink("Email Me", mailUrl)}`));
  await safeOpen(mailUrl);
}

// Card screens: render, then ESC/Q/Backspace returns to the menu.
const CARD_SECTIONS = {
  about: showAbout,
  experience: showExperience,
  skills: showSkills,
  achievements: showAchievements,
  linux: showLinux,
  links: showLinks,
  resume: showResume,
  email: showEmail,
};
// Screens that run their own navigation.
const MENU_SECTIONS = { projects: runProjects };

// -----------------------------
// MAIN
// -----------------------------

async function mainMenu() {
  let lastMenuValue;
  while (true) {
    freshScreen();
    const choice = await listPrompt(
      { message: PINK("Choose an option:"), choices: MENU_CHOICES, default: lastMenuValue },
      { allowBack: false } // nothing to go back to from the top level
    );
    lastMenuValue = choice;
    if (choice === "exit") goodbye();

    if (MENU_SECTIONS[choice]) {
      await MENU_SECTIONS[choice]();
      continue;
    }

    const back = waitForBack();
    freshScreen();
    await CARD_SECTIONS[choice]();
    console.log(PINK("\nPress ESC, Q or Backspace to go back"));
    await back;
  }
}

// Piped / non-interactive: print the read-only sections once and exit.
function printAll() {
  printTitle();
  [showAbout, showExperience, showSkills, showProjectList, showAchievements, showLinux, showLinks].forEach((fn) => fn());
  console.log(`Resume: ${data.resume.viewUrl || data.resume.url}\nEmail:  ${data.contact.email}`);
}

try {
  if (INTERACTIVE) setupKeys();
  await init();
  if (INTERACTIVE) await mainMenu();
  else printAll();
} catch (err) {
  console.error(chalk.red(`\n[x] Something went wrong: ${err.message}`));
  process.exit(1);
}
