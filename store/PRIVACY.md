# Privacy Policy — Eye Rest 20-20-20

_Last updated: 21 August 2026_

## Short version

Eye Rest collects nothing. It has no server, no account, and makes no network
requests. Everything it remembers stays in your own browser.

## What the extension stores

Two things, both kept locally by Chrome's storage API:

1. **Your settings** — reminder interval, rest length, notification style, sound
   choice, and Pomodoro durations. These are saved with `chrome.storage.sync`, so
   Chrome may sync them between your own signed-in devices, the same way it syncs
   your bookmarks. That syncing is performed by Chrome, not by us, and we never
   see the data.
2. **Your break count** — how many completed breaks you took, per day, for the
   last 90 days. This is saved with `chrome.storage.local` and never leaves the
   device. You can erase it at any time with "Reset statistics" in the settings.

## What the extension does not do

- It does not collect, transmit, sell, or share any personal information.
- It does not use analytics, telemetry, crash reporting, or advertising.
- It does not contain remote or third-party code, and loads nothing from the network.
- It does not request permission to read the pages you visit, and cannot do so.

## Permissions and why they exist

| Permission | Why |
|---|---|
| `alarms` | Schedules the break reminders and Pomodoro phases |
| `notifications` | Shows the reminder as a system notification, if you choose that style |
| `storage` | Saves your settings and your local break count |
| `idle` | Notices when you step away, so the timer restarts instead of nagging you on return |

## Removing your data

Uninstalling the extension removes everything it stored. To clear just the break
history while keeping the extension, open its settings and use "Reset statistics".

## Contact

Questions about this policy: open an issue at
https://github.com/n23eos/eye-rest-20-20-20
