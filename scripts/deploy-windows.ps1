# =============================================================================
#  deploy-windows.ps1 — Déploiement ComptaClems depuis Windows vers Proxmox
#  Exécuter depuis PowerShell (en tant qu'admin si besoin) :
#  cd "C:\chemin\vers\ComptaClems\comptaclems"
#  .\scripts\deploy-windows.ps1
#
#  Prérequis : OpenSSH installé sur Windows (intégré depuis Win10 1809)
# =============================================================================

# ─── CONFIGURATION — À MODIFIER AVANT DE LANCER ────────────────────────────
$SERVER_IP   = "TON_IP_OU_DOMAINE"   # Ex: 192.168.1.50 ou comptaclems.com
$SERVER_USER = "root"                # Utilisateur SSH du conteneur
$SERVER_PATH = "/opt/comptaclems"    # Chemin de l'appli sur le serveur
$SSH_KEY     = ""                    # Chemin clé SSH, ex: "$env:USERPROFILE\.ssh\id_rsa" (vide = mot de passe)
# ────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🚀 Déploiement ComptaClems vers $SERVER_IP" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Vérifier la config ────────────────────────────────────────────────────────
if ($SERVER_IP -eq "TON_IP_OU_DOMAINE") {
    Write-Host "❌ Configure SERVER_IP dans ce script avant de lancer." -ForegroundColor Red
    exit 1
}

# ── Construire les options SSH ────────────────────────────────────────────────
$sshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10")
if ($SSH_KEY -ne "") { $sshOpts += @("-i", $SSH_KEY) }
$sshTarget = "${SERVER_USER}@${SERVER_IP}"

# ── 1. Créer le ZIP du projet ─────────────────────────────────────────────────
Write-Host "📦 Création de l'archive du projet..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\comptaclems-deploy-$(Get-Date -Format 'yyyyMMdd_HHmmss').zip"

# Dossiers et fichiers à exclure
$exclude = @('.git', 'node_modules', 'uploads', '.env', '*.log', 'dist')

# Collecter les fichiers à inclure
$projectRoot = Get-Location
$filesToZip  = Get-ChildItem -Recurse -File | Where-Object {
    $relative = $_.FullName.Substring($projectRoot.Path.Length + 1)
    $skip = $false
    foreach ($ex in $exclude) {
        if ($relative -like "*$ex*") { $skip = $true; break }
    }
    -not $skip
}

Compress-Archive -Path $filesToZip.FullName -DestinationPath $zipPath -Force
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "✅ Archive créée : $zipSize MB" -ForegroundColor Green

# ── 2. Envoyer le ZIP sur le serveur ─────────────────────────────────────────
Write-Host "📤 Envoi de l'archive sur le serveur..." -ForegroundColor Yellow
$remoteZip = "/tmp/comptaclems-deploy.zip"
& scp @sshOpts $zipPath "${sshTarget}:${remoteZip}"
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Échec SCP" -ForegroundColor Red; exit 1 }
Write-Host "✅ Archive envoyée" -ForegroundColor Green

# ── 3. Exécuter le script de mise à jour sur le serveur ──────────────────────
Write-Host "🔄 Mise à jour et redémarrage sur le serveur..." -ForegroundColor Yellow
$remoteCmd = @"
set -e
echo '📂 Extraction de l archive...'
apt-get install -y -qq unzip 2>/dev/null || true
mkdir -p $SERVER_PATH
cd $SERVER_PATH

# Sauvegarder .env avant écrasement
[ -f .env ] && cp .env /tmp/.env.backup

# Extraire (écrase tout sauf .env et uploads)
unzip -o $remoteZip -d $SERVER_PATH -x '*.env' 'uploads/*' > /dev/null

# Restaurer .env
[ -f /tmp/.env.backup ] && cp /tmp/.env.backup .env

echo '📦 Installation des dépendances Node.js...'
cd $SERVER_PATH/apps/api
npm ci --omit=dev --silent

echo '🗄️  Application des migrations SQL...'
source <(grep -E '^(PGHOST|PGPORT|PGDATABASE|PGUSER|PGPASSWORD)=' $SERVER_PATH/.env 2>/dev/null || true)
export PGPASSWORD
PSQL_CMD="psql -h \${PGHOST:-localhost} -p \${PGPORT:-5432} -U \${PGUSER:-comptaclems} -d \${PGDATABASE:-comptaclems}"
\$PSQL_CMD -f $SERVER_PATH/apps/api/src/scripts/migration.sql    2>&1 | grep -v 'already exists' || true
\$PSQL_CMD -f $SERVER_PATH/apps/api/src/scripts/migration_v2.sql 2>&1 | grep -v 'already exists' || true

echo '🔧 Ajout des variables Interac manquantes dans .env...'
ENV_FILE="$SERVER_PATH/.env"
grep -q 'INTERAC_EMAIL'    "\$ENV_FILE" || echo 'INTERAC_EMAIL=comptaclems@gmail.com'    >> "\$ENV_FILE"
grep -q 'INTERAC_QUESTION' "\$ENV_FILE" || echo 'INTERAC_QUESTION=Nom du cabinet comptable ?' >> "\$ENV_FILE"
grep -q 'INTERAC_REPONSE'  "\$ENV_FILE" || echo 'INTERAC_REPONSE=ComptaClems'            >> "\$ENV_FILE"

echo '🔄 Rechargement PM2...'
cd $SERVER_PATH
if pm2 list 2>/dev/null | grep -q 'comptaclems-api'; then
    pm2 reload apps/api/ecosystem.config.js --env production
else
    pm2 start apps/api/ecosystem.config.js --env production
fi
pm2 save

sleep 3
echo '🏥 Vérification...'
if curl -sf http://localhost:4000/api/health | grep -q 'ok'; then
    echo '✅ API opérationnelle !'
    pm2 status
else
    echo '❌ Problème - logs PM2:'
    pm2 logs comptaclems-api --lines 20 --nostream
    exit 1
fi

rm -f $remoteZip
echo '🎉 Mise à jour terminée avec succès !'
"@

& ssh @sshOpts $sshTarget $remoteCmd
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Échec de la mise à jour serveur" -ForegroundColor Red; exit 1 }

# ── Nettoyage local ───────────────────────────────────────────────────────────
Remove-Item $zipPath -Force

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   🎉 Déploiement réussi !                        ║" -ForegroundColor Green
Write-Host "║   🌐 https://comptaclems.com                     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
