#!/bin/bash
# =============================================================================
#  start-app.sh — Démarre ComptaClems avec PM2 (à lancer après deploy)
#  Exécuter sur le serveur : bash /opt/comptaclems/scripts/start-app.sh
# =============================================================================
set -e

APP_DIR="/opt/comptaclems"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}📦 Installation des dépendances Node.js...${NC}"
cd "$APP_DIR/apps/api"
npm ci --omit=dev

echo -e "${YELLOW}🗄️  Application de la migration SQL...${NC}"
# Lire les variables DB depuis .env
source <(grep -E '^(PGHOST|PGPORT|PGDATABASE|PGUSER|PGPASSWORD)=' "$APP_DIR/.env")
export PGPASSWORD="$PGPASSWORD"

psql -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-comptaclems}" \
     -d "${PGDATABASE:-comptaclems}" \
     -f "$APP_DIR/apps/api/src/scripts/migration.sql" 2>&1 | grep -v "^$" | grep -v "already exists" || true

psql -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-comptaclems}" \
     -d "${PGDATABASE:-comptaclems}" \
     -f "$APP_DIR/apps/api/src/scripts/migration_v2.sql" 2>&1 | grep -v "^$" | grep -v "already exists" || true

echo -e "${GREEN}✅ Migration appliquée${NC}"

echo -e "${YELLOW}🔄 Démarrage / Rechargement PM2...${NC}"
cd "$APP_DIR"

if pm2 list | grep -q "comptaclems-api"; then
  pm2 reload apps/api/ecosystem.config.js --env production
  echo -e "${GREEN}✅ Application rechargée${NC}"
else
  pm2 start apps/api/ecosystem.config.js --env production
  echo -e "${GREEN}✅ Application démarrée${NC}"
fi

# Sauvegarder la liste PM2 pour redémarrage auto
pm2 save

# Configurer le démarrage automatique
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash || true

sleep 3
echo -e "${YELLOW}🏥 Vérification santé...${NC}"
if curl -sf http://localhost:4000/api/health | grep -q '"status":"ok"'; then
  echo -e "${GREEN}✅ API opérationnelle sur http://localhost:4000${NC}"
else
  echo -e "${RED}❌ L'API ne répond pas. Logs :${NC}"
  pm2 logs comptaclems-api --lines 30 --nostream
  exit 1
fi

echo ""
echo -e "${GREEN}🎉 ComptaClems est en ligne !${NC}"
pm2 status
