#!/usr/bin/env bash
# ==========================================================================
# Test de restauration d'une sauvegarde : plan d'action, action 0.3
# ==========================================================================
# « Fait quand : une restauration réussie sur l'environnement de test. » Une
# sauvegarde jamais restaurée n'est qu'une hypothèse.
#
#   bash scripts/restauration-test.sh /var/backups/nkamva/nkamva-production-20261120-031500.dump
#   bash scripts/restauration-test.sh            # le dump le plus récent de $BACKUP_DIR
#
# Le dump est restauré dans un Postgres **jetable** (conteneur temporaire, sans
# port publié, retiré à la fin). Aucune base existante n'est touchée. Le
# script compte ensuite les lignes des tables qui portent l'argent et les
# comptes, et échoue si l'une d'elles manque.
# ==========================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/nkamva}"
DUMP="${1:-$(ls -1t "$BACKUP_DIR"/nkamva-*.dump 2>/dev/null | head -n1 || true)}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Aucun dump trouvé (${DUMP:-$BACKUP_DIR})" >&2
  exit 1
fi

PG_IMAGE="postgres:17-alpine"
NAME="nkamva-restauration-test-$$"
cleanup() { docker stop "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[restauration] dump : $DUMP"
# `--rm` : le conteneur disparaît de lui-même à l'arrêt.
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=restore \
  -v "$(cd "$(dirname "$DUMP")" && pwd):/backup:ro" "$PG_IMAGE" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -d restore >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ] || { echo "[restauration] ÉCHEC : le Postgres jetable n'a pas démarré" >&2; exit 1; }
# pg_isready répond pendant l'initialisation : on attend que la base existe.
for _ in $(seq 1 30); do
  docker exec "$NAME" psql -U postgres -d restore -Atc 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done

docker exec "$NAME" pg_restore --no-owner --no-privileges -U postgres -d restore "/backup/$(basename "$DUMP")"

fail=0
for table in users trainer_profiles purchases wallets payouts disputes _prisma_migrations; do
  count="$(docker exec "$NAME" psql -U postgres -d restore -Atc "SELECT count(*) FROM \"$table\"" 2>/dev/null || echo ABSENTE)"
  printf '  %-20s %s\n' "$table" "$count"
  [ "$count" = "ABSENTE" ] && fail=1
done
balance="$(docker exec "$NAME" psql -U postgres -d restore -Atc 'SELECT coalesce(sum(balance),0) FROM wallets')"
echo "  somme des soldes formateurs : $balance FCFA"
last="$(docker exec "$NAME" psql -U postgres -d restore -Atc 'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 1')"
echo "  dernière migration : $last"

if [ "$fail" -ne 0 ]; then
  echo "[restauration] ÉCHEC : une table attendue manque" >&2
  exit 1
fi
echo "[restauration] réussie"
