#!/bin/bash
set -euo pipefail

#
# focus-apply.sh
# Applique l'état "blocked" / "unblocked" :
#  - gère /etc/hosts
#  - gère /etc/pf.user.conf via template
#  - recharge PF proprement
#  - flush DNS
#

LOG="/var/log/focus-apply.log"

# Chemins des hosts
BLOCKED="/usr/local/etc/hosts.blocked"
UNBLOCKED="/usr/local/etc/hosts.unblocked"
TARGET="/etc/hosts"

# PF
PF_TEMPLATE="/usr/local/etc/pf.user.conf.template"
PF_USER_CONF="/etc/pf.user.conf"
PF_CONF="/etc/pf.conf"

log() {
  local now
  now="$(date +%Y-%m-%dT%H:%M:%S%z)"
  echo "$now - $1" >> "$LOG"
}

log "focus-apply start | args: $*"

# ===== ARGUMENT =====
MODE="${1:-}"

if [[ "$MODE" != "blocked" && "$MODE" != "unblocked" ]]; then
  log "ERROR invalid argument: $MODE"
  echo "Usage: sudo focus-apply.sh [blocked|unblocked]"
  exit 1
fi

# ===== APPLY HOSTS =====
if [[ "$MODE" = "blocked" ]]; then
  log "Applying BLOCKED hosts"
  cp "$BLOCKED" "$TARGET"
else
  log "Applying UNBLOCKED hosts"
  cp "$UNBLOCKED" "$TARGET"
fi

# ===== APPLY PF RULES =====

if [[ "$MODE" = "blocked" ]]; then
  log "Applying PF rules from template"
  cp "$PF_TEMPLATE" "$PF_USER_CONF"
else
  log "Clearing PF rules (mode unblocked)"
  echo "# empty pf.user.conf (unblocked mode)" > "$PF_USER_CONF"
fi

# ===== RELOAD PF =====
log "Reloading PF (/etc/pf.conf)"

# syntax check
if ! pfctl -nf "$PF_CONF" 2>/dev/null; then
  log "ERROR: pf.conf syntax invalid"
  exit 1
fi

# apply
pfctl -f "$PF_CONF" 2>/dev/null \
  && log "PF reloaded successfully" \
  || log "WARNING: PF reload returned an error"

# ===== FLUSH DNS =====
log "Flushing DNS"
dscacheutil -flushcache 2>/dev/null || true
killall -HUP mDNSResponder 2>/dev/null || true

log "focus-apply DONE (mode=$MODE)"
exit 0