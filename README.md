# Important e-mails alert

Tiny desktop app that watches a POP mailbox and notifies you about new important emails until you acknowledge them. Optional Slack webhook. Built with [tinyjs](https://tinyjs.app/).

Greek README: [README.el.md](./README.el.md)

## Features

- Poll a POP3/POP3S mailbox on an interval
- Desktop notifications that repeat until you mark an email as seen
- Tray icon with unread count
- Inbox / Read / Spam tabs, search, dark·light·system theme
- Mark spam → block the sender (no further alerts); undo anytime
- Optional Slack Incoming Webhook to a specific channel
- UI language: English or Greek
- Credentials stored locally in SQLite (Settings screen)

## Requirements

- [tinyjs](https://tinyjs.app/) ≥ 0.50
- Linux (beta), macOS, or Windows
- A mailbox with POP enabled (app password recommended)

## Run

```bash
tinyjs dev
```

Build a packaged app:

```bash
tinyjs build
```

## First setup

1. Open **Settings**
2. Enter POP host, port (usually `995`), user, password, TLS
3. Optionally paste a Slack Incoming Webhook URL
4. Save, then **Test connection**
5. Use **Check now** or wait for the poll interval

## Spam

- **Spam** on an email blocks that sender address
- Future mail from the same address is stored under Spam with no notification / Slack ping
- **Not spam** (or **Unblock** in the blocked-senders list) restores the sender and returns those messages to the inbox as unread

## Privacy

- Data lives in the per-app data directory (SQLite)
- Passwords are never returned to the UI after save
- No cloud account; Slack is only used if you configure a webhook

## License

MIT — use and adapt freely for your team.
