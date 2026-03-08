# focusServer

Bloqueur de sites web pour macOS. Un serveur Node.js applique des règles de blocage via le firewall PF et `/etc/hosts`, avec une extension Chrome pour le suivi et la gestion des domaines.

macOS website blocker. A Node.js server enforces blocking rules via the PF firewall and `/etc/hosts`, with a Chrome extension for status monitoring and domain management.

---

## Architecture

```
apps/server       — Serveur Express (API REST, port 5959)
apps/extension    — Extension Chrome MV3 (popup + service worker)
packages/shared   — Types TypeScript partagés
packages/api-client — Client HTTP pour l'API serveur
```

## Installation du serveur / Server Installation

### Prérequis / Prerequisites

- macOS
- Node.js
- pnpm (`npm install -g pnpm`)

### 1. Cloner et installer les dépendances / Clone and install dependencies

```bash
git clone <repo-url> && cd focusServer
pnpm install
```

### 2. Configurer les domaines / Configure domains

Créer le fichier de configuration à partir du template :
Create the config file from the template:

```bash
cp apps/server/config/domains.example.json apps/server/config/domains.json
```

Modifier `apps/server/config/domains.json` avec les domaines à bloquer.
Edit `apps/server/config/domains.json` with the domains to block.

### 3. Build

```bash
pnpm build:server
```

### 4. Installer le daemon système / Install the system daemon

```bash
chmod +x apps/server/scripts/*.sh
sudo apps/server/scripts/install.sh
```

Cela installe le daemon launchd, les règles firewall et la configuration sudoers.
This installs the launchd daemon, firewall rules and sudoers configuration.

**Fichiers générés / Generated files:**

| Chemin / Path                                | Description                                                   |
| -------------------------------------------- | ------------------------------------------------------------- |
| `/usr/local/etc/focus/hosts.blocked`         | Fichier hosts en mode bloqué / Hosts file in blocked mode     |
| `/usr/local/etc/focus/hosts.unblocked`       | Fichier hosts en mode débloqué / Hosts file in unblocked mode |
| `/usr/local/etc/focus/pf.user.conf.template` | Template de configuration PF / PF config template             |
| `/usr/local/etc/focus/domains.json`          | Copie de la liste de domaines / Domain list copy              |
| `/usr/local/bin/focus-apply.sh`              | Script d'application du mode / Mode apply script              |

## Installation de l'extension Chrome / Chrome Extension Installation

L'extension n'est pas publiée sur le Chrome Web Store. Il faut l'installer manuellement en mode développeur.
The extension is not published on the Chrome Web Store. It must be installed manually in developer mode.

### 1. Build l'extension / Build the extension

```bash
pnpm build:extension
```

### 2. Charger dans Chrome / Load in Chrome

1. Ouvrir `chrome://extensions/` dans Chrome
2. Activer le **Mode développeur** (toggle en haut à droite) / Enable **Developer mode** (top-right toggle)
3. Cliquer **Charger l'extension non empaquetée** / Click **Load unpacked**
4. Sélectionner le dossier `apps/extension/` / Select the `apps/extension/` folder

L'extension se connecte au serveur local (`http://localhost:5959`) pour afficher le statut de blocage et gérer les domaines.
The extension connects to the local server (`http://localhost:5959`) to display blocking status and manage domains.

## Mettre à jour la blocklist / Update the blocklist

```bash
# Modifier apps/server/config/domains.json puis :
# Edit apps/server/config/domains.json then:
sudo apps/server/scripts/update-blocklist.sh
```

## Désinstallation / Uninstall

```bash
sudo apps/server/scripts/uninstall.sh
```

## Configuration du navigateur / Browser Configuration

**Désactiver le DNS sécurisé / Disable Secure DNS**

Pour que le blocage ne soit pas contourné par le navigateur :
To prevent the browser from bypassing the blocking:

- **Chrome / Brave :** Paramètres > Confidentialité et sécurité > Sécurité > Désactiver "Utiliser un DNS sécurisé" / Settings > Privacy and security > Security > Disable "Use secure DNS"
- **Firefox :** Paramètres > Général > Paramètres réseau > Désactiver DNS via HTTPS / Settings > General > Network Settings > Disable DNS over HTTPS

## Développement / Development

```bash
pnpm dev:server        # Build shared + serveur en watch mode
pnpm build             # Build tous les packages / Build all packages
pnpm format            # Formater avec Prettier / Format with Prettier
pnpm test:server       # Tests du serveur / Server tests
```
