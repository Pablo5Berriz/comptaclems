#!/bin/bash
# scripts/healthcheck.sh

# Configuration
API_URL="http://localhost:4000/api/health"
WEBHOOK_URL="https://hooks.slack.com/services/votre/webhook"  
THRESHOLD=3
FAIL_COUNT=0

check_health() {
    response=$(curl -s -w "%{http_code}" "$API_URL")
    http_code="${response: -3}"
    body="${response%???}"
    
    if [ "$http_code" -eq 200 ]; then
        if echo "$body" | grep -q "ok"; then
            echo "✅ API saine"
            return 0
        fi
    fi
    
    echo "❌ API en erreur (HTTP $http_code)"
    return 1
}

check_disk_space() {
    usage=$(df -h /opt/comptaclems | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$usage" -gt 90 ]; then
        echo "⚠️  Espace disque critique: $usage%"
        return 1
    fi
    return 0
}

check_memory() {
    total=$(free -m | awk 'NR==2 {print $2}')
    used=$(free -m | awk 'NR==2 {print $3}')
    usage=$((used * 100 / total))
    
    if [ "$usage" -gt 90 ]; then
        echo "⚠️  Mémoire critique: $usage%"
        return 1
    fi
    return 0
}

# Exécution des checks
health_ok=false
disk_ok=false
mem_ok=false

check_health && health_ok=true
check_disk_space && disk_ok=true
check_memory && mem_ok=true

# Alerte si problème
if [ "$health_ok" = false ] || [ "$disk_ok" = false ] || [ "$mem_ok" = false ]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
    
    if [ "$FAIL_COUNT" -ge "$THRESHOLD" ]; then
        message="🚨 Alerte ComptaClems - Problèmes détectés:\n"
        [ "$health_ok" = false ] && message="$message- API hors ligne\n"
        [ "$disk_ok" = false ] && message="$message- Espace disque faible\n"
        [ "$mem_ok" = false ] && message="$message- Mémoire faible\n"
        
        echo -e "$message"
        # Envoyer alerte (email, slack, etc.)
        # curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"$message\"}" "$WEBHOOK_URL"
    fi
else
    FAIL_COUNT=0
fi

exit 0