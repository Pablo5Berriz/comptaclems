#!/bin/bash
# scripts/deploy.sh

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Déploiement de ComptaClems - $(date)${NC}"

# Vérification des prérequis
command -v node >/dev/null 2>&1 || { echo -e "${RED}❌ Node.js requis${NC}" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}❌ npm requis${NC}" >&2; exit 1; }
command -v pm2 >/dev/null 2>&1 || { echo -e "${RED}❌ PM2 requis (npm install -g pm2)${NC}" >&2; exit 1; }

# Variables
APP_DIR="/opt/comptaclems"
BACKUP_DIR="/backups/comptaclems/pre-deploy"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup avant déploiement
echo -e "${YELLOW}📦 Création d'un backup...${NC}"
mkdir -p "$BACKUP_DIR"
if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$BACKUP_DIR/.env.$TIMESTAMP"
    echo "✅ Backup .env créé"
fi

# Pull des dernières modifications
echo -e "${YELLOW}📥 Mise à jour du code...${NC}"
cd "$APP_DIR"
git fetch --all
git reset --hard origin/main

# Installation des dépendances
echo -e "${YELLOW}📦 Installation des dépendances...${NC}"
cd apps/api
npm ci --production

# Vérification de la configuration
echo -e "${YELLOW}🔍 Vérification de la configuration...${NC}"
node -e "require('./server.js')" &
SERVER_PID=$!
sleep 3
kill $SERVER_PID 2>/dev/null || true

# Vérification des variables d'environnement
if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${RED}❌ Fichier .env manquant${NC}"
    exit 1
fi

# Rechargement avec PM2
echo -e "${YELLOW}🔄 Rechargement de l'application...${NC}"
pm2 reload ecosystem.config.js --env production

# Vérification du statut
sleep 5
if pm2 show comptaclems-api | grep -q "online"; then
    echo -e "${GREEN}✅ Application démarrée avec succès${NC}"
else
    echo -e "${RED}❌ Échec du démarrage${NC}"
    pm2 logs comptaclems-api --lines 50
    exit 1
fi

# Test health check
echo -e "${YELLOW}🏥 Test de l'API...${NC}"
if curl -s http://localhost:4000/api/health | grep -q "ok"; then
    echo -e "${GREEN}✅ API fonctionnelle${NC}"
else
    echo -e "${RED}❌ API non fonctionnelle${NC}"
    exit 1
fi

# Sauvegarde de la config PM2
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp /home/$(whoami)

echo -e "${GREEN}🎉 Déploiement terminé avec succès !${NC}"