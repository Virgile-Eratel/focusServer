#!/bin/bash
set -u

#
# uninstall.sh
# Nettoie toute l'installation de focusServer.
# 1. Arrête le service Node automatique.
# 2. Rétablit /etc/hosts et /etc/pf.conf par défaut.
# 3. Supprime les droits sudo.
#

if [[ "$EUID" -ne 0 ]]; then
  echo "❌ Ce script doit être lancé avec sudo."
  echo "   Exemple : sudo ./scripts/uninstall.sh"
  exit 1
fi

# Récupérer l'utilisateur réel (pour trouver le LaunchAgent)
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER")

echo "🗑️  Désinstallation de focusServer pour l'utilisateur : $REAL_USER"

# ==============================================================================
# 1. Nettoyage du Firewall (PF)
# ==============================================================================
echo "🔥 [1/6] Nettoyage de la configuration PF..."

if [[ -f "/etc/pf.conf" ]]; then
    # Backup de sécurité avant modification
    cp /etc/pf.conf /etc/pf.conf.uninstall-backup
    
    # Suppression des lignes contenant "user-block" ou "focusServer"
    sed -i '' '/focusServer/d' /etc/pf.conf
    sed -i '' '/anchor "user-block"/d' /etc/pf.conf
    
    echo "   -> Références supprimées dans /etc/pf.conf"
else
    echo "⚠️  /etc/pf.conf introuvable."
fi

rm -f /etc/pf.user.conf
echo "   -> /etc/pf.user.conf supprimé"

# Rechargement de PF pour nettoyer la mémoire
pfctl -f /etc/pf.conf 2>/dev/null || true
pfctl -a user-block -F all 2>/dev/null || true
# Kill des états persistants éventuels
pfctl -k 0.0.0.0/0 -k 0.0.0.0/0 2>/dev/null || true

echo "   -> Firewall rechargé et nettoyé"


# ==============================================================================
# 2. Restauration de /etc/hosts
# ==============================================================================
echo "📄 [2/6] Restauration du fichier /etc/hosts..."

cat <<EOF > /etc/hosts
##
# Host Database
#
# localhost is used to configure the loopback interface
# when the system is booting.  Do not change this entry.
##
127.0.0.1   localhost
255.255.255.255 broadcasthost
::1             localhost
EOF

echo "   -> /etc/hosts remis à zéro"

# Flush DNS
dscacheutil -flushcache 2>/dev/null
killall -HUP mDNSResponder 2>/dev/null
echo "   -> Cache DNS vidé"


# ==============================================================================
# 3. Suppression des fichiers du projet installés
# ==============================================================================
echo "🧹 [3/6] Suppression des fichiers binaires..."

rm -f /usr/local/bin/focus-apply.sh
echo "   -> Script binaire supprimé"

# Nouveau layout: tout dans /usr/local/etc/focus
rm -f /usr/local/etc/focus/hosts.blocked
rm -f /usr/local/etc/focus/hosts.unblocked
rm -f /usr/local/etc/focus/pf.user.conf.template
rm -f /usr/local/etc/focus/domains.json
rmdir /usr/local/etc/focus 2>/dev/null || true

# Legacy cleanup (anciens emplacements)
rm -f /usr/local/etc/hosts.blocked
rm -f /usr/local/etc/hosts.unblocked
rm -f /usr/local/etc/pf.user.conf.template

echo "   -> Fichiers de configuration supprimés"


# ==============================================================================
# 4. Suppression des droits Sudoers
# ==============================================================================
echo "🔑 [4/6] Suppression des droits sudo..."

if [[ -f "/etc/sudoers.d/focus-server" ]]; then
    rm -f "/etc/sudoers.d/focus-server"
    echo "   -> Fichier sudoers supprimé"
else
    echo "   -> Pas de fichier sudoers trouvé"
fi

# ==============================================================================
# 5. Désactivation du Service Automatique (Launchd)
# ==============================================================================
echo "🤖 [5/6] Arrêt du service automatique..."

APP_LABEL="com.focus.server"
PLIST_PATH="$REAL_HOME/Library/LaunchAgents/${APP_LABEL}.plist"

if [[ -f "$PLIST_PATH" ]]; then
    # Arrêt du service (en tant qu'utilisateur réel)
    sudo -u "$REAL_USER" launchctl unload "$PLIST_PATH" 2>/dev/null || true
    
    # Suppression du fichier .plist
    rm -f "$PLIST_PATH"
    echo "   -> Service arrêté et fichier .plist supprimé"
else
    echo "   -> Pas de service automatique trouvé."
fi


# ==============================================================================
# 6. Nettoyage des Logs
# ==============================================================================
echo "📜 [6/6] Suppression des logs..."

rm -f /var/log/focus-apply.log
rm -f /tmp/focus-server.out.log
rm -f /tmp/focus-server.err.log

echo "   -> Tous les logs supprimés"

echo
echo "✅ Désinstallation terminée."