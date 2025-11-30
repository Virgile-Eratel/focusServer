# focusServer


## Mise en place
1. Lancer le script d'installation en sudo
```bash
sudo ./scripts/install.sh
```

## Suppression
1. Lancer le script de désinstallation en sudo
```bash
sudo ./scripts/uninstall.sh
```

## Routes

Le serveur expose plusieurs endpoints pour gérer le mode focus. Par défaut, le serveur écoute sur le port 5050 (configurable via la variable d'environnement `PORT`).

### GET `/health`

Vérifie que le serveur est en cours d'exécution.

**Exemple :**
```bash
curl -X GET http://localhost:3000/health
```

**Réponse :**
```json
{
  "status": "ok"
}
```

### GET `/status`

Récupère l'état actuel du système de focus.

**Exemple :**
```bash
curl -X GET http://localhost:3000/status
```

**Réponse :**
```json
{
  "mode": "blocked",
  "manualPauseUntil": null,
  "isScheduledPause": false,
  "time": "14:30:00"
}
```

**Champs :**
- `mode` : État actuel (`"blocked"`, `"unblocked"` ou `"unknown"`)
- `manualPauseUntil` : Heure de fin de la pause manuelle (format HH:mm:ss) ou `null`
- `isScheduledPause` : Indique si on est actuellement dans une pause planifiée
- `time` : Heure actuelle (format HH:mm:ss)

### POST `/pause`

Démarre une pause manuelle pour une durée spécifiée.

**Exemple :**
```bash
curl -X POST http://localhost:3000/pause \
  -H "Content-Type: application/json" \
  -d '{"durationMinutes": 15}'
```

**Paramètres (optionnels) :**
- `durationMinutes` : Durée de la pause en minutes (par défaut : 15)

**Réponse :**
```json
{
  "status": "paused",
  "manualPauseUntil": "14:45:00"
}
```

### POST `/resume`

Annule la pause manuelle en cours et reprend le mode focus.

**Exemple :**
```bash
curl -X POST http://localhost:3000/resume
```

**Réponse :**
```json
{
  "status": "resumed",
  "manualPauseUntil": null
}
```




## Pour un fonctionnement optimal

**Désactiver le "DNS Sécurisé" dans le navigateur**
<br>
Pour que la configuration ne soit pas bypass par le navigateur sur certains sites

- **Chrome / Brave :**
    1. Paramètres > Confidentialité et sécurité > Sécurité.
    2. **Désactive** "Utiliser un DNS sécurisé" / "Use secure DNS"
        
- **Firefox :** Paramètres > Général > Paramètres Réseau > Activer DNS via HTTPS (Désactiver).
