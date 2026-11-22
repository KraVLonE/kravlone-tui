# KraVLonE - Terminal Portfolio Card

An interactive terminal portfolio card for **KraVLonE**, delivered via `npx`.

```bash
npx kravlone
```

Requires Node.js 20+.

## What's inside

About · Experience · Skills · Projects (pick one for details) · Achievements · Linux · Links · Resume download · Email

Content is pulled live from the [kravlone.xyz](https://kravlone.xyz) portfolio backend, so the card always matches the website.

## Keys

| Screen | Keys |
|---|---|
| Menus | `↑` `↓` to move, `Enter` to select, type to jump to an item |
| Content screens | `Esc`, `q` or `Backspace` to go back |
| Project list | `Esc` or `q` to go back |
| Anywhere | `Ctrl+C` to quit |

## Options

| Option | Effect |
|---|---|
| `--offline` | Skip the network and use saved data |
| `KRAVLONE_API=<url>` | Use a different backend (e.g. `http://localhost:8000/api`) |

When the output isn't a terminal (`npx kravlone | less`), the card prints every section once and exits.

## How the data works

- **Backend** (`/profile`, `/experience`, `/projects`, `/skills`, `/achievements`): fetched in parallel with a 4s timeout each.
- **Fallbacks**: each endpoint falls back on its own, first to the last good copy cached in `~/.cache/kravlone/data.json`, then to `snapshot.json` bundled in the package. The card works offline and shows a note when data isn't live.
- **`extras.json`**: card-only fields the backend doesn't store (handle, philosophy, interests, current work, Linux, extra links).

## Development

```bash
npm install
npm start                          # run locally
KRAVLONE_API=http://localhost:8000/api npm start
npm run snapshot                   # refresh snapshot.json from the live API
```

`npm publish` refreshes the snapshot automatically (`prepublishOnly`).

## License

ISC
