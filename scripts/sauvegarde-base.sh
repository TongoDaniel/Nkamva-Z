#!/usr/bin/env bash
# ==========================================================================
# Sauvegarde automatique de la base : plan d'action, action 0.3
# ==========================================================================
# Prérequis du lancement (modèle v1.1) : la base contient les soldes des
# formateurs. Ce script tourne sur le serveur, chaque nuit, par cron :
#
#   15 3 * * * ENV_DIR=/opt/nkamva/production bash /opt/nkamva/production/scripts/sauvegarde-base.sh >> /var/log/nkamva-sauvegarde.log 2>&1
#
# Ce qu'il fait, dans l'ordre :
#   1. lit DATABASE_URL dans $ENV_DIR/.env (jamais en argument : il finirait
#      dans l'historique du shell et dans `ps`) ;
#   2. `pg_dump` au format personnalisé (compressé, restaurable table par
#      table), dans un conteneur postgres:17-alpine branché sur le réseau
#      interne de l'environnement ;
#   3. vérifie le fichier avec `pg_restore --list` : un dump illisible est un
#      échec, pas une sauvegarde ;
#   4. si BACKUP_PASSPHRASE est posée, chiffre la copie (AES-256, PBKDF2) ; si
#      BACKUP_S3_BUCKET est posé, l'envoie hors du serveur (R2 ou tout S3) ;
#   5. garde $RETENTION_DAYS jours de dumps en local, retire les plus anciens ;
#   6. en cas d'échec, prévient ERROR_ALERT_WEBHOOK_URL s'il est posé.
#
# Variables (toutes optionnelles, lues aussi dans $ENV_DIR/.env) :
#   ENV_DIR            dossier de l'environnement (défaut : /opt/nkamva/production)
#   DOCKER_NETWORK     réseau Docker de la base (défaut : <nom du dossier>_internal ;
#                      « host » pour une base sur la machine)
#   BACKUP_DIR         dossier local des dumps (défaut : /var/backups/nkamva)
#   RETENTION_DAYS     jours gardés en local (défaut : 14)
#   BACKUP_PASSPHRASE  phrase de chiffrement de la copie hors serveur
#   BACKUP_S3_BUCKET   seau de destination (ex. nkamva-sauvegardes)
#   AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
#   ERROR_ALERT_WEBHOOK_URL  alerte en cas d'échec
# ==========================================================================
set -euo pipefail

ENV_DIR="${ENV_DIR:-/opt/nkamva/production}"
ENV_FILE="$ENV_DIR/.env"

# Lit une clé du .env sans l'exécuter (un .env n'est pas un script).
env_get() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

DB_URL="${DATABASE_URL:-$(env_get DATABASE_URL)}"
DOCKER_NETWORK="${DOCKER_NETWORK:-$(basename "$ENV_DIR")_internal}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/nkamva}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-$(env_get BACKUP_PASSPHRASE)}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-$(env_get BACKUP_S3_BUCKET)}"
WEBHOOK="${ERROR_ALERT_WEBHOOK_URL:-$(env_get ERROR_ALERT_WEBHOOK_URL)}"
PG_IMAGE="postgres:17-alpine"

alert() {
  echo "[sauvegarde] ÉCHEC : $1" >&2
  if [ -n "$WEBHOOK" ]; then
    curl -fsS -m 10 -H 'Content-Type: application/json' \
      -d "{\"text\":\"NKAMVA · sauvegarde de la base en échec : $1\"}" "$WEBHOOK" >/dev/null || true
  fi
}
trap 'alert "ligne $LINENO"' ERR

[ -n "$DB_URL" ] || { alert "DATABASE_URL introuvable dans $ENV_FILE"; exit 1; }
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
NAME="nkamva-$(basename "$ENV_DIR")-$STAMP.dump"

echo "[sauvegarde] $(date -u +%FT%TZ) début, réseau $DOCKER_NETWORK"
docker run --rm --network "$DOCKER_NETWORK" \
  --user "$(id -u):$(id -g)" \
  -e DB_URL="$DB_URL" \
  -v "$BACKUP_DIR:/backup" \
  "$PG_IMAGE" sh -c 'pg_dump --format=custom --no-owner --no-privileges --file="/backup/'"$NAME"'" "$DB_URL"'

# Un dump qu'on ne sait pas relire n'est pas une sauvegarde.
TABLES="$(docker run --rm -v "$BACKUP_DIR:/backup:ro" "$PG_IMAGE" pg_restore --list "/backup/$NAME" | grep -c ' TABLE DATA ' || true)"
[ "${TABLES:-0}" -gt 0 ] || { alert "dump $NAME illisible ou vide"; exit 1; }
chmod 600 "$BACKUP_DIR/$NAME"
SIZE="$(du -h "$BACKUP_DIR/$NAME" | cut -f1)"
echo "[sauvegarde] $NAME : $SIZE, $TABLES tables"

# Copie hors du serveur : une sauvegarde sur la même machine ne protège pas
# d'une panne de la machine.
if [ -n "$BACKUP_S3_BUCKET" ]; then
  UPLOAD="$NAME"
  if [ -n "$BACKUP_PASSPHRASE" ]; then
    docker run --rm --user "$(id -u):$(id -g)" -e PASS="$BACKUP_PASSPHRASE" -v "$BACKUP_DIR:/backup" alpine/openssl:3.3.2 \
      enc -aes-256-cbc -pbkdf2 -salt -pass env:PASS -in "/backup/$NAME" -out "/backup/$NAME.enc"
    UPLOAD="$NAME.enc"
  fi
  docker run --rm -v "$BACKUP_DIR:/backup:ro" \
    -e AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$(env_get AWS_ACCESS_KEY_ID)}" \
    -e AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$(env_get AWS_SECRET_ACCESS_KEY)}" \
    -e AWS_DEFAULT_REGION="${AWS_REGION:-$(env_get AWS_REGION)}" \
    amazon/aws-cli:2.17.0 s3 cp "/backup/$UPLOAD" "s3://$BACKUP_S3_BUCKET/base/$UPLOAD" \
    --endpoint-url "${AWS_ENDPOINT_URL:-$(env_get AWS_ENDPOINT_URL)}" --only-show-errors
  # La copie chiffrée n'a servi qu'à l'envoi : le dump en clair reste en local.
  if [ "$UPLOAD" != "$NAME" ]; then unlink "$BACKUP_DIR/$UPLOAD"; fi
  echo "[sauvegarde] copie envoyée : s3://$BACKUP_S3_BUCKET/base/$UPLOAD"
fi

# Rotation locale : on ne retire que nos propres dumps, au-delà de la durée.
find "$BACKUP_DIR" -maxdepth 1 -name 'nkamva-*.dump' -type f -mtime +"$RETENTION_DAYS" -print | while read -r old; do
  unlink "$old"
  echo "[sauvegarde] retiré : $old"
done
echo "[sauvegarde] $(date -u +%FT%TZ) terminé"
