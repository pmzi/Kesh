# Getting started

This guide takes you from a fresh clone to a plugin running on your iPhone. Kesh is not published to npm or the App Store yet, so you run the companion from source and build the iOS app yourself.

Kesh has two parts:

- the **companion**, a Node program on your Mac (`packages/companion`);
- the **app**, a React Native iOS app (`apps/ios`).

## Prerequisites

| Requirement | Notes |
|---|---|
| macOS | The iOS app can only be built on a Mac. |
| Xcode 26 or newer | Needed for the iOS 26 SDK (on-device AI code is compiled against FoundationModels). |
| Node 22 or newer | The companion declares `"node": ">=22"`. |
| CocoaPods | Installed through Bundler (`apps/ios/Gemfile`). Ruby comes with macOS; a newer Ruby from rbenv or similar also works. |
| Claude Code | Installed and logged in: run `claude`, then `/login`. Only needed to create plugins and to use Claude models from plugins. |
| An iPhone or the Simulator | Tested on the Simulator and on one iPhone 15 Pro. |

Your Mac and your iPhone must be on the same Wi-Fi network for a real device.

## 1. Clone and install

```bash
git clone https://github.com/pmzi/Kesh.git
cd Kesh
npm install
```

The root `package.json` declares `packages/*` as workspaces, so this installs the companion, protocol and SDK packages. The iOS app is a separate project with its own `package.json` and lock file.

## 2. Start the companion

```bash
npm run companion
```

This runs `npm run dev -w packages/companion`. You can also run `cd packages/companion && npm run dev`.

On first start the companion:

1. creates the workspace folder `~/.kesh/workspace/` (with a `CLAUDE.md` for Claude Code, an SDK type file, a `tsconfig.json` and two sample plugins, `hello` and `water-tracker`);
2. builds every plugin it finds in `~/.kesh/workspace/plugins/`;
3. starts a WebSocket server on a random free port, on all interfaces, accepting only private-network peers;
4. prints a QR code, the pairing URL (`kesh://pair?host=...&port=...&token=...`), and the workspace path;
5. prints `waiting for devices...`.

Options (from `packages/companion`, pass flags after `--`, for example `npm run dev -- --port 4567`):

| Flag | Default | Meaning |
|---|---|---|
| `--port <n>` | random free port | Fixed port. Use this so the phone keeps working across restarts. |
| `--workspace <dir>` | `~/.kesh/workspace` | Workspace directory. |
| `--config-dir <dir>` | `~/.kesh` | Where paired devices (`config.json`) and plugin versions (`versions.json`) are stored. |

Subcommands: `init` creates the workspace without starting the server; `unpair` forgets all paired devices.

The pairing token is single-use. After one phone has paired, the token is spent; restart the companion to get a new QR code if you want to pair another device. The pairing URL contains a secret: do not paste it into issues, screenshots or chats.

## 3. Build and run the app

```bash
cd apps/ios
npm install
bundle install
cd ios && bundle exec pod install && cd ..
npm start                      # Metro bundler; leave this running
open ios/Kesh.xcworkspace
```

Always open the `.xcworkspace`, not the `.xcodeproj`.

### On the Simulator

Pick an iPhone simulator in Xcode and press Run. The Simulator has no camera, so in the app tap "Enter code instead" and paste the `kesh://pair?...` line the companion printed.

### On a real iPhone with a free Apple ID

1. Connect the phone with a cable and unlock it. Choose "Trust this computer" if asked.
2. In Xcode open the Kesh project, select the **Kesh** target, then **Signing & Capabilities**.
3. Tick **Automatically manage signing** and choose your personal team (add your Apple ID under Xcode, Settings, Accounts first).
4. Change the **Bundle Identifier**. The checked-in value, `com.pouya.kesh`, is registered to the author, so a free account cannot sign it. Use something unique such as `com.yourname.kesh`.
5. Enable **Developer Mode** on the phone: Settings, Privacy & Security, Developer Mode, then restart when asked. (The option appears after you first try to install a development build.)
6. Pick your iPhone as the run destination and press Run. Keep the phone unlocked during the install.
7. If the app refuses to open ("Untrusted Developer"), go to Settings, General, VPN & Device Management, tap your Apple ID under Developer App, and choose Trust.
8. Free signing profiles expire after **7 days**. When the app stops opening, run it from Xcode again.

A Debug build loads its JavaScript from Metro, so the phone must be able to reach Metro on your Mac (same Wi-Fi). For a build that does not need Metro, change the scheme's Run configuration to Release (Product, Scheme, Edit Scheme, Run, Build Configuration), which embeds the JavaScript bundle. This is standard React Native behavior; it has not been separately tested for Kesh.

## 4. Pair

Open Kesh. It opens straight to your plugin list and does not need a Mac. To connect, tap the pill at the top right ("Connect" until you have paired), choose "Pair a new Mac", then give it the pairing code.

- **Scan:** point the camera at the QR code in your terminal. Allow Camera access, and allow Local Network access when iOS asks. QR scanning is implemented and was checked by hand on a real iPhone, but is not covered by automated tests.
- **Type it:** tap "Enter code instead" and paste the `kesh://pair?...` URL.
- **Camera app:** on a real phone you can also scan the QR with the stock Camera app; it offers to open Kesh.

The companion prints `device connected: <your phone's name> (newly paired)`. From now on the phone reconnects in the background using a stored device key; the pill shows "Offline" when the Mac is not reachable, and "Disconnect" in the same sheet keeps it offline until you tap Connect. Bonjour auto-discovery is not implemented, so the phone always connects to the host and port it was paired with.

## 5. Make a plugin

```bash
cd ~/.kesh/workspace
claude
```

Then ask for something concrete:

```text
add a plugin that tracks how many cups of coffee I drink, with a daily goal and a streak
```

Claude reads the workspace `CLAUDE.md`, writes `plugins/<id>/manifest.json`, `index.tsx` and `icon.svg`, and the companion prints `built <id> v1` and `pushed <id> v1 to 1 device(s)`. The phone shows the review screen with the permissions requested. Accept it and open the plugin from the home screen. Ask Claude to change it and the phone updates in place. See [plugin-authoring.md](plugin-authoring.md) to write plugins yourself.

To try the examples, copy any folder from [examples/plugins](../examples/plugins) into `~/.kesh/workspace/plugins/`.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Companion says `waiting for devices...` and nothing happens | The phone has not connected. Check that it is on the same Wi-Fi as the Mac, that you paired, and that Local Network access is allowed for Kesh. Watch the companion output for `rejected:` lines. |
| Phone and Mac are on different Wi-Fi networks, or a guest network | The phone cannot reach the Mac. Join the same network. Guest networks and some routers block device-to-device traffic ("client isolation"). Corporate or VPN setups may also block it. |
| Local Network permission denied | iOS silently blocks connections to your Mac. On the phone: Settings, Kesh, turn on Local Network. If Kesh is not listed, delete the app, reinstall it, and allow the prompt. |
| It worked yesterday, now it is shows "Offline" or "Connecting…" for a long time | The companion port changes on every start, and the phone remembers the old one. Re-pair: open the new pairing URL or scan the new QR with the iPhone Camera app (it hands the link to Kesh), or tap the pill, "Pair a new Mac", "Enter code instead". Use `--port` to keep a fixed port. |
| `bad_token` / "invalid or already used pairing token" | The token is single-use and only valid for the companion run that printed it. Restart the companion and pair with the new QR. |
| `bad_device_key` / "unknown device key; re-pair" | The Mac forgot this device (for example after `kesh unpair` or deleting `~/.kesh/config.json`). Re-pair. |
| Install to the iPhone fails because the phone is locked | Unlock the phone and keep it awake, then run again. Xcode cannot launch an app on a locked device. |
| "Untrusted Developer" when opening the app | Settings, General, VPN & Device Management, trust your Apple ID profile. |
| Xcode: "Developer Mode disabled" | Enable Developer Mode on the phone (Settings, Privacy & Security) and restart it. |
| Xcode: signing fails or the bundle identifier is unavailable | Change the bundle identifier to a unique value and select your personal team. |
| App opens then closes after about a week | Free signing expired (7 days). Run from Xcode again. |
| Red screen "Could not connect to development server" | A Debug build needs Metro. Run `npm start` in `apps/ios`, same Wi-Fi, or build Release. |
| The plugin does not appear on the phone | Check the companion output. A `BUILD ERROR in <id>` means the bundle failed and the last good version is kept. The folder name must equal the manifest `id` (kebab-case), `index.tsx` must exist, and permissions must be from the allowed list. If you declined the plugin on the review screen, it is not offered again until its contents change or the app restarts. |
| The plugin appears but I never saw a review screen | Updates to an installed plugin are applied silently as long as they ask for no new permissions. New permissions bring back the review screen. |
| `WARNING plugin <id>: icon.svg ignored: ...` | The icon failed the sanitizer (disallowed element or attribute, over 24 KB, not square, not valid XML...). The plugin still installs, without an icon. Fix the SVG; see [plugin-authoring.md](plugin-authoring.md#iconsvg). |
| AI with Claude fails: "Claude Code is not installed on this Mac" or "Not logged in" | Install Claude Code, run `claude`, then `/login`. Restart the companion so it re-checks. |
| `pod install` fails | Run `bundle install` first, from `apps/ios`. Make sure Xcode command line tools are selected (`xcode-select -p`). |
| I removed a plugin on the phone and it came back | Long-press removal only deletes the phone's copy. If the folder still exists in the workspace, the companion offers it again for review on the next connection. Delete the folder to remove it everywhere. |
