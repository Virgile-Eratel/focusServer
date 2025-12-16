# focusServer

Bloque totalement une liste de sites définit sur des periodes définit. 

## Mise en place
1. Installer et démarrer
```bash
sudo ./scripts/install.sh
```

## Blocklist (sites bloqués)

La liste des sites à bloquer est définie dans `config/domains.json`.

- Les fichiers générés sur la machine:
- `/usr/local/etc/focus/hosts.blocked`
- `/usr/local/etc/focus/pf.user.conf.template`
- `/usr/local/etc/focus/domains.json`
- `/usr/local/etc/focus/hosts.unblocked`

### Mettre à jour la blocklist (sans uninstall/install)

1. Modifie `config/domains.json`
2. Applique les changements:

```bash
sudo ./scripts/update-blocklist.sh
```

## Suppression
1. Désinstaller
```bash
sudo ./scripts/uninstall.sh
```

## Pour un fonctionnement optimal

**Désactiver le "DNS Sécurisé" dans le navigateur**
<br>
Pour que la configuration ne soit pas bypass par le navigateur sur certains sites

- **Chrome / Brave :**
    1. Paramètres > Confidentialité et sécurité > Sécurité.
    2. **Désactive** "Utiliser un DNS sécurisé" / "Use secure DNS"
        
- **Firefox :** Paramètres > Général > Paramètres Réseau > Activer DNS via HTTPS (Désactiver).
