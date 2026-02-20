#!/bin/bash
set -euo pipefail

#
# focus-apply.sh
# Applique l'état "blocked" / "unblocked"
#

LOG="/var/log/focus-apply.log"

# Chemins des hosts
FOCUS_DIR="/usr/local/etc/focus"
BLOCKED="$FOCUS_DIR/hosts.blocked"
UNBLOCKED="$FOCUS_DIR/hosts.unblocked"
TARGET="/etc/hosts"

# PF
PF_TEMPLATE="$FOCUS_DIR/pf.user.conf.template"
PF_USER_CONF="/etc/pf.user.conf"
PF_CONF="/etc/pf.conf"
ANCHOR_NAME="user-block"

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
  echo "ERROR: Invalid mode '$MODE'. Expected 'blocked' or 'unblocked'" >&2
  exit 1
fi

# ===== APPLY HOSTS =====
# Note : Ceci écrase /etc/hosts. Assurez-vous que les fichiers sources contiennent localhost.
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
  # On laisse le fichier mais on le vide (ou juste un commentaire)
  echo "# empty pf.user.conf (unblocked mode)" > "$PF_USER_CONF"
fi

# ===== RELOAD PF =====
log "Configuring PF..."

# 1. S'assurer que PF est activé (-E : Enable if not already enabled)
# On ignore l'erreur si c'est déjà activé ou impossible (pour ne pas crash le script)
/sbin/pfctl -E 2>/dev/null || true

# 2. Recharger l'anchor spécifique (Plus rapide et ne touche pas au reste du système)
# Syntax check de l'anchor seule
if /sbin/pfctl -a "$ANCHOR_NAME" -nf "$PF_USER_CONF"; then
    log "Reloading specific anchor: $ANCHOR_NAME"
    /sbin/pfctl -a "$ANCHOR_NAME" -f "$PF_USER_CONF" 2>/dev/null
else
    # Fallback : Si l'anchor n'est pas chargée, on recharge tout le fichier principal
    log "Anchor reload failed or not loaded. Reloading full /etc/pf.conf"
    /sbin/pfctl -f "$PF_CONF" 2>/dev/null
fi

# ===== FLUSH DNS =====
log "Flushing DNS caches"
/usr/bin/dscacheutil -flushcache 2>/dev/null || true
/usr/bin/killall -HUP mDNSResponder 2>/dev/null || true

log "Killing active states..."
/sbin/pfctl -k 0.0.0.0/0 -k 0.0.0.0/0 2>/dev/null || true
/sbin/pfctl -k ::/0 -k ::/0 2>/dev/null || true

log "focus-apply DONE (mode=$MODE)"
exit 0