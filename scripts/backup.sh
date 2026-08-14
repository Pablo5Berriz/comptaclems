#!/bin/bash
# scripts/backup.sh

set -e

# Configuration
BACKUP_ROOT="/backups/comptaclems"
DB_BACKUP_DIR="$BACKUP_ROOT/database"
FILES_BACKUP_DIR="$BACKUP_ROOT/files"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)

# Création des dossiers
mkdir -p "$DB_BACKUP_DIR" "$FILES_BACKUP_DIR"

# Backup PostgreSQL
echo "📦 Backup de la base de données..."
PGPASSWORD="$PGPASSWORD" pg_dump \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    -F c \
    -f "$DB_BACKUP_DIR/comptaclems_db_$DATE.dump"

# Backup des fichiers uploadés
echo "📦 Backup des fichiers..."
tar -czf "$FILES_BACKUP_DIR/comptaclems_files_$DATE.tar.gz" \
    -C /opt/comptaclems/apps/api/uploads \
    .

# Backup du .env
cp /opt/comptaclems/.env "$BACKUP_ROOT/env_backup_$DATE"

# Compression du backup DB (déjà en format custom)
gzip "$DB_BACKUP_DIR/comptaclems_db_$DATE.dump"

# Nettoyage des vieux backups
echo "🧹 Nettoyage des backups de plus de $RETENTION_DAYS jours..."
find "$DB_BACKUP_DIR" -name "*.dump.gz" -mtime +$RETENTION_DAYS -delete
find "$FILES_BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_ROOT" -name "env_backup_*" -mtime +$RETENTION_DAYS -delete

# Vérification de l'intégrité
echo "🔍 Vérification des backups..."
if [ -f "$DB_BACKUP_DIR/comptaclems_db_$DATE.dump.gz" ]; then
    echo "✅ Backup base de données OK"
else
    echo "❌ Échec backup base de données"
    exit 1
fi

# Log du backup
echo "[$DATE] Backup terminé avec succès" >> "$BACKUP_ROOT/backup.log"