#!/bin/bash
# =============================================================================
#  deploy-from-local.sh — Déploie depuis ta machine Windows vers le serveur
#  Exécuter depuis le dossier du projet sur ta machine :
#  bash scripts/deploy-from-local.sh
#
#  Prérequis : avoir rsync installé (WSL ou Git Bash)
#  Configurer SERVER_IP et SERVER_USER ci-dessous avant de lancer
# =============================================================================

# ─── CONFIGURATION ─────────────────────────────────────────────────────────
SERVER_IP="TON_IP_PROXMOX"        # Ex: 192.168.1.50 ou IP publique
SERVER_USER="root"                # ou ton user sudo
SERVER_PATH="/opt/comptaclems"
SSH_KEY="~/.ssh/id_rsa"           # Ta clé SSH (laisser vide si mot de passe)
# ───────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

[[ "$SERVER_IP" == "TON_IP_PROXMOX" ]] && {
  echo -e "${RED}❌ Configure SERVER_IP dans ce script avant de lancer.${NC}"
  exit 1
}

SSH_OPTS="-o StrictHostKeyChecking=no"
[[ -n "$SSH_KEY" ]] && SSH_OPTS="$SSH_OPTS -i $SSH_KEY"

echo -e "${YELLOW}🚀 Déploiement vers $SERVER_USER@$SERVER_IP:$SERVER_PATH${NC}"
echo ""

# ── Sync du code (exclu .env, node_modules, uploads) ─────────────────────────
echo -e "${YELLOW}📤 Synchronisation du code...${NC}"
rsync -az --delete \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='apps/api/node_modules/' \
  --exclude='uploads/' \
  --exclude='.git/' \
  --exclude='*.log' \
  -e "ssh $SSH_OPTS" \
  ./ "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"

echo -e "${GREEN}✅ Code synchronisé${NC}"

# ── Copier le .env de production s'il existe ──────────────────────────────────
if [[ -f ".env.production" ]]; then
  echo -e "${YELLOW}📋 Copie du .env.production...${NC}"
  scp $SSH_OPTS .env.production "$SERVER_USER@$SERVER_IP:$SERVER_PATH/.env"
  echo -e "${GREEN}✅ .env.production copié${NC}"
else
  echo -e "${YELLOW}⚠️  Aucun .env.production trouvé — utilisation du .env existant sur le serveur.${NC}"
fi

# ── Démarrer / Recharger l'appli sur le serveur ───────────────────────────────
echo -e "${YELLOW}🔄 Redémarrage de l'application...${NC}"
ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" "bash $SERVER_PATH/scripts/start-app.sh"

echo ""
echo -e "${GREEN}🎉 Déploiement terminé ! Site : https://comptaclems.com${NC}"
