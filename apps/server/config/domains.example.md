# domains.json — Reference

Configuration file listing domains to block. Used by `generate-system-config.ts` to produce `/etc/hosts` entries and PF firewall rules.

## Schema

```json
{
  "version": 1,
  "defaults": { ... },
  "entries": [ ... ]
}
```

## Defaults

Applied to every entry unless overridden at entry level.

| Field           | Type    | Default | Description                                                |
| --------------- | ------- | ------- | ---------------------------------------------------------- |
| `includeWww`    | boolean | `true`  | Auto-add `www.{domain}` variant                            |
| `includeMobile` | boolean | `false` | Auto-add `m.{domain}` variant                              |
| `hosts`         | boolean | `true`  | Block via `/etc/hosts` (`0.0.0.0 domain`)                  |
| `pf`            | boolean | `true`  | Block via PF firewall (`block return out quick to domain`) |

## Entry Fields

| Field           | Type     | Required | Description                                                                                               |
| --------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `domain`        | string   | yes      | Primary domain to block (e.g. `instagram.com`)                                                            |
| `tags`          | string[] | no       | Categories for grouping in generated config (e.g. `["social"]`)                                           |
| `aliases`       | string[] | no       | Additional domains to block alongside primary (e.g. `["youtu.be"]`). `includeWww` applies to aliases too. |
| `includeWww`    | boolean  | no       | Override default — add/skip `www.` variant for this entry                                                 |
| `includeMobile` | boolean  | no       | Override default — add/skip `m.` variant for this entry                                                   |
| `hosts`         | boolean  | no       | Override default — include/exclude from `/etc/hosts`                                                      |
| `pf`            | boolean  | no       | Override default — include/exclude from PF firewall rules                                                 |

## How Blocking Works

Two independent blocking layers:

- **`/etc/hosts`** — Redirects domain to `0.0.0.0`. Works for all apps. Some CDN-backed sites (TikTok, YouTube) may bypass this via IP-based resolution.
- **PF firewall** — Blocks outgoing packets to the domain. Stronger but may affect other sites sharing the same CDN IPs. Set `pf: false` for CDN-heavy sites.

## Expansion Example

Given this entry with defaults `{ includeWww: true, includeMobile: false }`:

```json
{
  "domain": "youtube.com",
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

Running `generate-system-config.ts` produces:

| File                    | Content                             |
| ----------------------- | ----------------------------------- |
| `hosts.blocked`         | `/etc/hosts` format, grouped by tag |
| `pf.user.conf.template` | PF firewall rules, grouped by tag   |

These are deployed to `/usr/local/etc/focus/` by `install.sh`.
