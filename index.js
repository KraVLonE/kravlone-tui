#!/usr/bin/env node
import chalk from "chalk";
import boxen from "boxen";
import gradient from "gradient-string";
import inquirer from "inquirer";
import figlet from "figlet";
import open from "open";
import fs from "fs";
import path from "path";
import axios from "axios";
import readline from "readline";

let lastMenuIndex = 0;

const MENU_CHOICES = [
  new inquirer.Separator(),
  { name: "👤 About Me", value: "about" },
  { name: "💡 Skills", value: "skills" },
  { name: "💻 Projects", value: "projects" },
  { name: "🐧 Linux Stuff", value: "linux" },
  { name: "🔗 Social Links", value: "links" },
  new inquirer.Separator(),
  { name: chalk.greenBright("📄 Download Resume"), value: "resume" },
  { name: chalk.yellowBright("✉️  Send Email"), value: "email" },
  new inquirer.Separator(),
  { name: chalk.red("🚀 Exit"), value: "exit" }
];


async function loadCardData() {
  const url = "https://gist.githubusercontent.com/KraVLonE/b8d4e2f939beab1b2c3dd617a5385ac5/raw/krav-card.json"

  try {
    const res = await axios.get(url, { timeout: 5000 });
    return res.data;
  } catch (e) {
    console.error("❌ Failed to load card data:", e.message);
    process.exit(1);
  }
}

// -----------------------------
// SAFE PROMPT WRAPPER
// -----------------------------
async function safePrompt(promptFn) {
  try {
    return await promptFn();
  } catch (err) {
    if (err?.name === "ExitPromptError") {
      console.clear();
      console.log(chalk.hex("#00FFFF")("\nGoodbye, Kind Visitor ! 👋\n"));
      process.exit(0);
    }
    throw err;
  }
}

async function downloadResume() {
  const url = data.resume.url;
  const filePath = path.join(process.cwd(), "KraVLonE-Resume.pdf");

  const writer = fs.createWriteStream(filePath);
  const resp = await axios.get(url, { responseType: "stream" });
  resp.data.pipe(writer);

  writer.on("finish", () => {
    console.log(`\n📄 Resume downloaded to: ${filePath}\n`);
    open(filePath);
  });
  writer.on("error", (err) => {
    console.error("❌ Download failed:", err);
  });
}


// -----------------------------
// UI HELPERS
// -----------------------------

function printTitle() {
  const ascii = figlet.textSync("KraVLonE", {
    horizontalLayout: "fitted"
  });

  const neon = gradient(["#00FFFF", "#E90074", "#00FFFF"]);
  console.log(neon.multiline(ascii));
}

function card(content) {
  return boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: "round",
    borderColor: "#00FFFF",
  });
}

async function waitForBack({ drainTimeout = 60 } = {}) {
  function safeSetRawMode(value) {
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(value);
    } catch (e) {
    }
  }

  process.stdin.resume();
  safeSetRawMode(false);

  await new Promise((resolve) => {
    let timer = null;
    const onData = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        process.stdin.removeListener("data", onData);
        resolve();
      }, drainTimeout);
    };

    timer = setTimeout(() => {
      process.stdin.removeListener("data", onData);
      resolve();
    }, drainTimeout);

    process.stdin.on("data", onData);
  });

  return new Promise((resolve) => {
    safeSetRawMode(true);
    process.stdin.resume();

    const onData = (chunk) => {
      const b0 = chunk && chunk.length ? chunk[0] : null;
      // Ctrl + C
      if (b0 === 0x03) {
        cleanup();
        console.clear();
        console.log(chalk.hex("#00FFFF")("\nGoodbye, Kind Visitor ! 👋"));
        process.exit(0);
      }

      // ESC, Backspace
      if (b0 === 0x1b || b0 === 0x7f || b0 === 0x08) {
        cleanup();
        return resolve();
      }
    };

    const cleanup = () => {
      try { process.stdin.removeListener("data", onData); } catch (e) {}
      safeSetRawMode(false);
      try { process.stdin.pause(); } catch (e) {}
    };

    process.stdin.on("data", onData);

    const watchdog = setTimeout(() => {
      try { process.stdin.removeListener("data", onData); } catch (_) {}
      safeSetRawMode(false);
      try { process.stdin.pause(); } catch (_) {}
      resolve();
    }, 10 * 60 * 1000);

    const originalResolve = resolve;
    resolve = (...args) => {
      clearTimeout(watchdog);
      originalResolve(...args);
    };
  });
}

function clickableLink(text, url) {
  return `\u001b]8;;${url}\u0007${chalk.underline(text)}\u001b]8;;\u0007`;
}


// -----------------------------
// CONTENT SECTIONS
// -----------------------------

function showAbout() {
  console.log(
    card(`
${chalk.hex("#00FFFF")("► Name")}        : ${data.about.name}
${chalk.hex("#00FFFF")("► Role")}        : ${data.about.role}
${chalk.hex("#00FFFF")("► Philosophy")}  : ${data.about.philosophy}

${chalk.hex("#00FFFF")("► Interests")}
  ${data.about.interests.join(" • ")}

${chalk.hex("#00FFFF")("► Current Work")}
  ${data.about.currentWork.join(" • ")}
`)
  );
}

function showSkills() {
  const lines = [];
  const maxLabelLen = Math.max(...data.skills.map(s => s.label.length));
 
  data.skills.forEach(section => {
  	const paddedLabel = section.label.padEnd(maxLabelLen, " ");
    lines.push(
      `${chalk.hex("#00FFFF")(`► ${paddedLabel}`)}  ${section.value.join(", ")}`
    );
  });

  console.log(card(lines.join("\n")));
}

function showProjects(){
  const lines = [];

  lines.push(chalk.hex("#00FFFF")("AI & ML Projects"));
  data.projects.aiml.forEach(p =>
    lines.push(`  • ${chalk.bold(p.name)} – ${p.desc}`)
  );

  lines.push("");
  lines.push(chalk.hex("#00FFFF")("System & Cloud"));
  data.projects.systemcloud.forEach(p =>
    lines.push(`  • ${chalk.bold(p.name)} – ${p.desc}`)
  );

  lines.push("");
  lines.push(chalk.hex("#00FFFF")("Software & Web"));
  data.projects.softwareweb.forEach(p =>
    lines.push(`  • ${chalk.bold(p.name)} – ${p.desc}`)
  );
  console.log(card(lines.join("\n")))
}

function showLinks() {
  const lines = [];
  const maxLabelLen = Math.max(...data.links.map(s => s.label.length));

  data.links.forEach(section => {
  	const paddedLabel = section.label.padEnd(maxLabelLen, " ");
    lines.push(
      `${chalk.hex("#00FFFF")(`${paddedLabel}`)}  ${section.value}`
    );
  });

  console.log(card(lines.join("\n")));
}

function showLinux() {
  const lines = [];
  const maxLabelLen = Math.max(...data.linux.map(s => s.label.length));

  data.linux.forEach(section => {
  	const paddedLabel = section.label.padEnd(maxLabelLen, " ");
    lines.push(
      `${chalk.hex("#00FFFF")(`${paddedLabel}`)}  ${section.value}`
    );
  });

  console.log(card(lines.join("\n")));
}

// -----------------------------
// MAIN MENU
// -----------------------------

async function mainMenu() {
  console.clear();
  printTitle();
  
  const ans = await safePrompt(() =>
    inquirer.prompt([
      {
        type: "list",
        name: "menu",
        message: chalk.hex("#E90074")("Choose an option:"),
        choices: MENU_CHOICES,
        default: MENU_CHOICES[lastMenuIndex]?.value,
        pageSize : 20
      }
    ])
  );

  lastMenuIndex = MENU_CHOICES.findIndex((c) => c.value === ans.menu);

  if (ans.menu === "about") {
    console.clear();
    printTitle();
    showAbout();
    console.log(chalk.hex("#E90074")("\nPress ESC or Backspace to go back"));
    await waitForBack();
    return mainMenu();
  }

  if (ans.menu === "skills") {
    console.clear();
    printTitle();
    showSkills();
    console.log(chalk.hex("#E90074")("\nPress ESC or Backspace to go back"));
    await waitForBack();
    return mainMenu();
  }
  
  if (ans.menu === "projects") {
    console.clear();
    printTitle();
    showProjects();
    console.log(chalk.hex("#E90074")("\nPress ESC or Backspace to go back"));
    await waitForBack();
    return mainMenu();
  }
  
  if (ans.menu === "linux") {
    console.clear();
    printTitle();
    showLinux();
    console.log(chalk.hex("#E90074")("\nPress ESC or Backspace to go back"));
    await waitForBack();
    return mainMenu();
  }

  if (ans.menu === "links") {
    console.clear();
    printTitle();
    showLinks();
    console.log(chalk.hex("#E90074")("\nPress ESC or Backspace to go back"));
    await waitForBack();
    return mainMenu();
  }

  if (ans.menu === "resume") {
    console.clear();
    printTitle();
    
    console.log(
      card(`
  ${chalk.hex("#00FFFF")("Resume Download")}
  Click the link below to download:
  
  ${clickableLink(
    "Download Resume",
    data.resume.url
  )}
  `)
    );
    
    console.log(chalk.hex("#E90074")("\nPress ESC or Backspace to go back"));
    await downloadResume();
    await waitForBack();
    return mainMenu();
  }
  
  if (ans.menu === "email") {
    console.clear();
    printTitle();
  
    console.log(
      card(`
  ${chalk.hex("#00FFFF")("Send me an email")}
  Click below or press ENTER in your browser:
  
  ${clickableLink(
    "Email Me",
    `mailto:${data.contact.email}?subject=Hello%20KraVLonE`
  )}
  `)
    );
  
    await open(`mailto:${data.contact.email}?subject=Hello%20KraVLonE`);
  
    console.log(chalk.hex("#E90074")("\nPress ESC or Backspace to go back"));
    await waitForBack();
    return mainMenu();
  }
  

  if (ans.menu === "exit") {
    console.clear();
    console.log(chalk.hex("#00FFFF")("\nGoodbye, Kind Visitor ! 👋"));
    process.exit(0);
  }
}

let data = await loadCardData();
mainMenu();
