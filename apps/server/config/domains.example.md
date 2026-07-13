# domains.json — Reference

Configuration file listing domains to block. Used by the server (and `generate-system-config.ts` at install time) to produce `/etc/hosts` entries and PF firewall rules.

## Schema

```json
{
  "version": 2,
  "defaults": { ... },
  "entries": [ ... ]
}
```

Version 1 files (`tags` instead of `category`/`source`) are migrated automatically at server startup: `adult` → `adult`, `social`/`video` → `entertainment`, everything else → `other`.

## Defaults

Applied to every entry unless overridden at entry level.

| Field           | Type    | Default | Description                                                |
| --------------- | ------- | ------- | ---------------------------------------------------------- |
| `includeWww`    | boolean | `true`  | Auto-add `www.{domain}` variant                            |
| `includeMobile` | boolean | `false` | Auto-add `m.{domain}` variant                              |
| `hosts`         | boolean | `true`  | Block via `/etc/hosts` (`0.0.0.0 domain`)                  |
| `pf`            | boolean | `true`  | Block via PF firewall (`block return out quick to domain`) |

## Entry Fields

| Field           | Type     | Required | Description                                                                                                |
| --------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `domain`        | string   | yes      | Primary domain to block (e.g. `instagram.com`)                                                             |
| `category`      | string   | yes      | Blocking policy: `adult` (always blocked), `entertainment` (blocked per schedule), `other` (never blocked) |
| `source`        | string   | yes      | `manual` (human-added) or `ollama` (AI-classified)                                                         |
| `aliases`       | string[] | no       | Additional domains to block alongside primary (e.g. `["youtu.be"]`). `includeWww` applies to aliases too.  |
| `includeWww`    | boolean  | no       | Override default — add/skip `www.` variant for this entry                                                  |
| `includeMobile` | boolean  | no       | Override default — add/skip `m.` variant for this entry                                                    |
| `hosts`         | boolean  | no       | Override default — include/exclude from `/etc/hosts`                                                       |
| `pf`            | boolean  | no       | Override default — include/exclude from PF firewall rules                                                  |

## Categories

A category exists only to carry a distinct blocking policy:

| Category        | Policy                                                            |
| --------------- | ----------------------------------------------------------------- |
| `adult`         | Blocked **always** — no pause, no exception                       |
| `entertainment` | Blocked according to `WEEKLY_SCHEDULE` (free during pauses)       |
| `other`         | Never blocked (present only for AI-classified known-safe domains) |

## How Blocking Works

Two independent blocking layers:

- **`/etc/hosts`** — Redirects domain to `0.0.0.0`. Works for all apps. Some CDN-backed sites (TikTok, YouTube) may bypass this via IP-based resolution.
- **PF firewall** — Blocks outgoing packets to the domain. Stronger but may affect other sites sharing the same CDN IPs. Set `pf: false` for CDN-heavy sites.

## Expansion Example

Given this entry with defaults `{ includeWww: true, includeMobile: false }`:

```json
{
  "domain": "youtube.com",
  "category": "entertainment",
  "source": "manual",
  "aliases": ["youtu.be"],
  "includeMobile": true,
  "pf": false
}
```

Blocked hostnames generated:

| Hostname          | Source              | hosts | pf  |
| ----------------- | ------------------- | ----- | --- |
| `youtube.com`     | primary domain      | yes   | no  |
| `www.youtube.com` | includeWww default  | yes   | no  |
| `m.youtube.com`   | includeMobile: true | yes   | no  |
| `youtu.be`        | alias               | yes   | no  |
| `www.youtu.be`    | alias + includeWww  | yes   | no  |

## Generated Files

The server (on every change of `domains.json`) and `generate-system-config.ts` (at install time) produce four files:

| File                         | Content (by category)     | Installed to `/etc` when |
| ---------------------------- | ------------------------- | ------------------------ |
| `hosts.blocked`              | `adult` + `entertainment` | mode `blocked`           |
| `hosts.unblocked`            | `adult` only              | mode `unblocked` (pause) |
| `pf.user.conf.template`      | `adult` + `entertainment` | mode `blocked`           |
| `pf.unblocked.conf.template` | `adult` only              | mode `unblocked` (pause) |

These are written to `/usr/local/etc/focusServer/` and copied into `/etc` by `focus-apply.sh`. Adult domains therefore stay blocked even during pause windows.
