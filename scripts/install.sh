#!/bin/bash
set -euo pipefail

#
# install.sh
# Installe l'environnement focusServer sans activer le blocage.
# Automatise les droits sudo pour le serveur.
#

if [[ "$EUID" -ne 0 ]]; then
  echo "❌ Lancez ce script avec sudo :"
  echo "   sudo ./scripts/install.sh"
  exit 1
fi

# Récupérer l'utilisateur réel (celui qui a lancé sudo) pour les droits
REAL_USER="${SUDO_USER:-$USER}"

echo "🔧 Installation de focusServer pour l'utilisateur : $REAL_USER"

# Chemins
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_CONFIG="$REPO_DIR/config"
SRC_SCRIPTS="$REPO_DIR/scripts"

DEST_CONFIG_DIR="/usr/local/etc"
DEST_BIN_DIR="/usr/local/bin"

# ==============================================================================
# 1. Installation des fichiers de configuration
# ==============================================================================
echo "📂 Mise en place des fichiers config dans $DEST_CONFIG_DIR..."
mkdir -p "$DEST_CONFIG_DIR"

# On utilise 'install' pour copier ET mettre les droits
# Mode 644 pour les fichiers texte
install -m 644 "$SRC_CONFIG/hosts.blocked"       "$DEST_CONFIG_DIR/hosts.blocked"
install -m 644 "$SRC_CONFIG/hosts.unblocked"     "$DEST_CONFIG_DIR/hosts.unblocked"
install -m 644 "$SRC_CONFIG/pf.user.conf.template" "$DEST_CONFIG_DIR/pf.user.conf.template"

# ==============================================================================
# 2. Installation du script de contrôle (Moteur)
# ==============================================================================
echo "⚙️  Installation du script moteur..."
# Mode 755 (exécutable)
install -m 755 "$SRC_SCRIPTS/focus-apply.sh" "$DEST_BIN_DIR/focus-apply.sh"

# ==============================================================================
# 3. Configuration du Firewall macOS (PF)
# ==============================================================================
PF_CONF="/etc/pf.conf"
PF_ANCHOR_TEXT='anchor "user-block"'
PF_LOAD_TEXT='load anchor "user-block" from "/etc/pf.user.conf"'

# Backup de sécurité
if [[ ! -f "$PF_CONF.backup-focus" ]]; then
    cp "$PF_CONF" "$PF_CONF.backup-focus"
fi

# Injection de l'anchor si absente
if ! grep -q "$PF_ANCHOR_TEXT" "$PF_CONF"; then
    echo "🔌 Raccordement au Firewall macOS (ajout anchor)..."
    # On ajoute les lignes à la fin de pf.conf
    printf "\n# focusServer\n%s\n%s\n" "$PF_ANCHOR_TEXT" "$PF_LOAD_TEXT" >> "$PF_CONF"
else
    echo "✅ Firewall déjà configuré."
fi

# Initialisation en mode DÉBLOQUÉ (sécurité)
# On crée un fichier pf.user.conf vide ou avec des règles passives pour commencer
echo "🛡  Initialisation du firewall en mode passif..."
# On vide le fichier cible pour être sûr de ne rien bloquer à l'install
: > /etc/pf.user.conf 

# Rechargement de la conf PF pour prendre en compte l'anchor
pfctl -f "$PF_CONF" 2>/dev/null || echo "⚠️ Note: pfctl a émis un avertissement, normal si pf.user.conf est vide."
pfctl -E 2>/dev/null || true # S'assure que PF est activé

# ==============================================================================
# 4. Automatisation des droits Sudo (Le "Zéro Commande" magique)
# ==============================================================================
echo "🔑 Configuration des droits sudo automatiques..."

SUDOERS_FILE="/etc/sudoers.d/focus-server"

# On écrit la règle qui autorise l'utilisateur à lancer focus-apply.sh sans mot de passe
echo "$REAL_USER ALL=(root) NOPASSWD: $DEST_BIN_DIR/focus-apply.sh" > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE" # Droits stricts obligatoires pour sudoers

echo "✅ Droits accordés. Le serveur Node pourra piloter le blocage sans password."

echo
echo "✨ Installation terminée avec succès !"
echo "   - Les fichiers sont en place."
echo "   - Le firewall est prêt (mais inactif pour l'instant)."
echo "   - Tu peux lancer ton serveur Node maintenant."