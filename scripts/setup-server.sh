#!/bin/bash
# =============================================================================
#  setup-server.sh — Installation complète ComptaClems sur conteneur Proxmox
#  Exécuter UNE SEULE FOIS en root sur le conteneur LXC (Debian/Ubuntu)
#  Usage : bash setup-server.sh
# =============================================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

# ── Vérifier root ──────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Ce script doit être exécuté en root (sudo bash setup-server.sh)"

# ── Variables ─────────────────────────────────────────────────────────────────
APP_DIR="/opt/comptaclems"
APP_USER="comptaclems"
NODE_VERSION="20"
DOMAIN="comptaclems.com"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🚀 Setup ComptaClems — $(date)${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""

# ── 1. Mise à jour système ─────────────────────────────────────────────────────
info "Mise à jour des paquets système..."
apt-get update -qq && apt-get upgrade -y -qq
success "Système à jour"

# ── 2. Dépendances système ─────────────────────────────────────────────────────
info "Installation des dépendances système..."
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib ufw fail2ban logrotate
success "Dépendances installées"

# ── 3. Node.js via nvm ────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  info "Installation de Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
  success "Node.js $(node -v) installé"
else
  success "Node.js $(node -v) déjà installé"
fi

# ── 4. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installation de PM2..."
  npm install -g pm2
  success "PM2 installé"
else
  success "PM2 $(pm2 -v) déjà installé"
fi

# ── 5. Utilisateur applicatif ─────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  info "Création de l'utilisateur $APP_USER..."
  useradd -r -m -s /bin/bash "$APP_USER"
  success "Utilisateur $APP_USER créé"
else
  success "Utilisateur $APP_USER existe déjà"
fi

# ── 6. Répertoire de l'application ────────────────────────────────────────────
info "Création du répertoire $APP_DIR..."
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/uploads"
mkdir -p "$APP_DIR/uploads/tax-documents"
mkdir -p "$APP_DIR/uploads/admin-documents"
mkdir -p /var/log/pm2/comptaclems
mkdir -p /backups/comptaclems

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" /var/log/pm2/comptaclems
success "Répertoires créés"

# ── 7. PostgreSQL ─────────────────────────────────────────────────────────────
info "Configuration PostgreSQL..."
systemctl enable postgresql
systemctl start postgresql

# Vérifier si la base existe déjà
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='comptaclems'" 2>/dev/null || echo "")

if [[ -z "$DB_EXISTS" ]]; then
  info "Création de la base de données et de l'utilisateur..."
  # Générer un mot de passe sécurisé
  DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)

  sudo -u postgres psql <<EOF
CREATE USER comptaclems WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE comptaclems OWNER comptaclems;
GRANT ALL PRIVILEGES ON DATABASE comptaclems TO comptaclems;
\c comptaclems
CREATE SCHEMA IF NOT EXISTS comptaclems AUTHORIZATION comptaclems;
EOF

  echo "$DB_PASSWORD" > /root/.pg_comptaclems_password
  chmod 600 /root/.pg_comptaclems_password
  warn "⚠️  Mot de passe PostgreSQL sauvegardé dans /root/.pg_comptaclems_password"
  success "Base de données créée (mot de passe: $DB_PASSWORD)"
else
  success "Base de données comptaclems existe déjà"
  DB_PASSWORD=$(cat /root/.pg_comptaclems_password 2>/dev/null || echo "VOIR_VOTRE_DOTENV")
fi

# ── 8. UFW Firewall ───────────────────────────────────────────────────────────
info "Configuration du pare-feu..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw allow 5432/tcp   # PostgreSQL (si accès externe nécessaire)
ufw --force enable
success "Pare-feu configuré"

# ── 9. Fail2ban ───────────────────────────────────────────────────────────────
info "Configuration fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban
success "Fail2ban actif"

# ── 10. Nginx ─────────────────────────────────────────────────────────────────
info "Configuration nginx..."
systemctl enable nginx

# Créer la config nginx (sera complétée par le script deploy)
cat > /etc/nginx/sites-available/comptaclems <<'NGINXEOF'
server {
    listen 80;
    server_name comptaclems.com www.comptaclems.com;

    # Redirection www -> sans www
    if ($host = www.comptaclems.com) {
        return 301 https://comptaclems.com$request_uri;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
        client_max_body_size 20M;
    }

    # Fichiers statiques en cache long
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/comptaclems /etc/nginx/sites-enabled/comptaclems
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
success "Nginx configuré"

# ── 11. Logrotate ─────────────────────────────────────────────────────────────
cat > /etc/logrotate.d/comptaclems <<'LOGEOF'
/var/log/pm2/comptaclems/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
LOGEOF
success "Logrotate configuré"

# ── 12. Résumé ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Installation terminée !${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Prochaines étapes :${NC}"
echo "  1. Copier les fichiers avec :  bash deploy-from-local.sh"
echo "  2. Éditer le .env :            nano $APP_DIR/.env"
echo "  3. Lancer l'appli :            bash $APP_DIR/scripts/start-app.sh"
echo "  4. SSL Let's Encrypt :         certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
[[ -f /root/.pg_comptaclems_password ]] && \
  echo -e "${YELLOW}  Mot de passe PostgreSQL :     $(cat /root/.pg_comptaclems_password)${NC}"
echo ""
