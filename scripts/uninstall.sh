#!/bin/bash
set -u # On continue même s'il y a des petites erreurs, pour forcer le nettoyage

#
# uninstall.sh
# Nettoie toute l'installation de focusServer.
# Rétablit /etc/hosts et /etc/pf.conf par défaut.
#

if [[ "$EUID" -ne 0 ]]; then
  echo "❌ Ce script doit être lancé avec sudo."
  echo "   Exemple : sudo ./scripts/uninstall.sh"
  exit 1
fi

echo "🗑️  Désinstallation de focusServer..."

# ==============================================================================
# 1. Nettoyage du Firewall (PF)
# ==============================================================================
echo "🔥 Nettoyage de la configuration PF..."

# Suppression de l'anchor dans /etc/pf.conf
# On cherche les lignes ajoutées par install.sh et on les supprime
if [[ -f "/etc/pf.conf" ]]; then
    # Backup de sécurité avant modification
    cp /etc/pf.conf /etc/pf.conf.uninstall-backup
    
    # Suppression des lignes contenant "user-block" ou "focusServer"
    # sed -i '' est la syntaxe macOS pour l'édition sur place
    sed -i '' '/focusServer/d' /etc/pf.conf
    sed -i '' '/anchor "user-block"/d' /etc/pf.conf
    
    echo "   -> Références supprimées dans /etc/pf.conf (Backup: /etc/pf.conf.uninstall-backup)"
else
    echo "⚠️  /etc/pf.conf introuvable."
fi

# Suppression du fichier de règles utilisateur actif
rm -f /etc/pf.user.conf
echo "   -> /etc/pf.user.conf supprimé"

# Rechargement de PF pour nettoyer la mémoire
# On recharge la config principale (qui n'a plus l'anchor)
pfctl -f /etc/pf.conf 2>/dev/null || true

# On vide l'anchor spécifique si elle est encore en mémoire
pfctl -a user-block -F all 2>/dev/null || true

echo "   -> Firewall rechargé et nettoyé"


# ==============================================================================
# 2. Restauration de /etc/hosts
# ==============================================================================
echo "📄 Restauration du fichier /etc/hosts par défaut..."

cat <<EOF > /etc/hosts
##
# Host Database
#
# localhost is used to configure the loopback interface
# when the system is booting.  Do not change this entry.
##
127.0.0.1	localhost
255.255.255.255	broadcasthost
::1             localhost
EOF

echo "   -> /etc/hosts remis à zéro"

# Flush DNS pour oublier les anciens blocages
dscacheutil -flushcache 2>/dev/null
killall -HUP mDNSResponder 2>/dev/null
echo "   -> Cache DNS vidé"


# ==============================================================================
# 3. Suppression des fichiers du projet installés
# ==============================================================================
echo "🧹 Suppression des fichiers..."

rm -f /usr/local/bin/focus-apply.sh
echo "   -> Script binaire supprimé"

rm -f /usr/local/etc/hosts.blocked
rm -f /usr/local/etc/hosts.unblocked
rm -f /usr/local/etc/pf.user.conf.template
# suppr si vide
rmdir /usr/local/etc 2>/dev/null || true
echo "   -> Fichiers de configuration supprimés"


# ==============================================================================
# 4. Suppression des droits Sudoers
# ==============================================================================
echo "🔑 Suppression des droits sudo automatiques..."

if [[ -f "/etc/sudoers.d/focus-server" ]]; then
    rm -f "/etc/sudoers.d/focus-server"
    echo "   -> Fichier sudoers supprimé"
else
    echo "   -> Pas de fichier sudoers trouvé"
fi

# ==============================================================================
# 5. Nettoyage des Logs
# ==============================================================================
rm -f /var/log/focus-apply.log
echo "   -> Logs supprimés"

echo
echo "✅ Désinstallation terminée."