#!/usr/bin/env bash
# ==========================================================================
# Export de la base de développement vers la base du serveur de staging
# ==========================================================================
# Recopie les données du Supabase de dev dans le Postgres de /opt/nkamva/staging.
# C'est un REMPLACEMENT : la base du serveur est vidée puis réécrite.
#
#   SSH_HOST=… SSH_USER=… bash scripts/export-vers-staging.sh
#
# Quatre choix structurent ce script, et chacun corrige un piège :
#
#   1. Le dump vise DIRECT_URL (5432), jamais DATABASE_URL (6543). Le port 6543
#      est le pooler pgbouncer en mode transaction : pg_dump y échoue, parce
#      qu'il a besoin d'une session stable pour tenir son instantané.
#
#   2. `_prisma_migrations` est INCLUSE, et c'est délibéré. Le réflexe est de
#      préserver le journal du serveur ; il est faux ici. Un remplacement
#      complet installe le schéma de la dev : le journal doit décrire ce
#      schéma-là, pas celui d'avant. Le 9 août 2026, le staging était resté à 27
#      migrations — déploiement en échec sur DIRECT_URL — quand la dev en portait
#      30 ; lui laisser son journal aurait fait rejouer trois migrations sur des
#      tables déjà créées par le restore.
#      La règle : le journal suit toujours le schéma, jamais la machine.
#
#   3. pg_dump et pg_restore tournent dans postgres:17-alpine. Supabase est en
#      17.6 : un client plus ancien refuse le dump ("server version mismatch").
#      Le serveur, lui, n'a pas besoin d'être en 17 — pg_restore écrit vers une
#      version antérieure sans difficulté.
#
#   4. Les blocs distants sont des heredocs QUOTÉS : rien ne s'y substitue
#      localement, et les quelques valeurs dont ils ont besoin arrivent en
#      arguments positionnels. Un heredoc non quoté obligerait à échapper chaque
#      `$` — illisible, et une seule omission ferait exécuter localement ce qui
#      était écrit pour le serveur.
#
# Ce que ce script NE fait PAS : il ne transporte aucun fichier. Les lignes
# importées portent des clés S3 ; les ressources ne s'afficheront sur le staging
# que si son seau est bien celui où la dev a écrit.
# ==========================================================================
set -euo pipefail

# Message sans apostrophe ni parenthèse : bash analyse les quotes à l'intérieur
# de ${var:?message}, et une apostrophe y ouvre une chaîne jamais refermée.
: "${SSH_HOST:?renseignez SSH_HOST - hote du serveur de staging}"
: "${SSH_USER:?renseignez SSH_USER}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/nkamva_deploy}"
REMOTE_DIR="${REMOTE_DIR:-/opt/nkamva/staging}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
# Nommé, jamais deviné : le serveur héberge aussi /opt/nkamva/production, et un
# `docker network ls | grep internal` finirait tôt ou tard par désigner sa base.
NETWORK="${NETWORK:-staging_internal}"

WORK="$(mktemp -d)"
DUMP="$WORK/nkamva-dev.dump"
trap 'rm -rf "$WORK"' EXIT

# `bash -s -- a b c` : le script arrive par l'entrée standard, les arguments
# suivent le `--` et se lisent en $1, $2, $3 côté serveur.
remote() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" bash -s -- "$@"; }

# --- 1. Dump de la dev ----------------------------------------------------
# --no-owner / --no-privileges : les rôles de Supabase (postgres, anon,
# authenticated…) n'existent pas sur le serveur ; sans ces drapeaux, chaque
# GRANT et chaque ALTER OWNER ferait échouer la restauration.
echo "==> dump de la base de dev"
DIRECT=$(grep -E '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')
docker run --rm -i "$PG_IMAGE" pg_dump \
  --format=custom --no-owner --no-privileges --schema=public \
  "$DIRECT" > "$DUMP"
echo "    $(du -h "$DUMP" | cut -f1)"

STAMP=$(date +%Y%m%d-%H%M%S)

# --- 2. Sauvegarde de la cible -------------------------------------------
# Avant d'écraser, on emporte de quoi revenir. Le dump de secours reste sur le
# serveur : il n'a aucune raison de transiter par cette machine.
echo "==> sauvegarde de la base du serveur (avant écrasement)"
remote "$REMOTE_DIR" "$STAMP" "$PG_IMAGE" "$NETWORK" <<'REMOTE'
set -euo pipefail
DIR=$1; STAMP=$2; IMG=$3; NET=$4
cd "$DIR"
PGURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
docker run --rm --network "$NET" -e PGURL="$PGURL" "$IMG" \
  pg_dump --format=custom --no-owner --no-privileges "$PGURL" \
  > "$DIR/backup-avant-import-$STAMP.dump"
ls -lh "$DIR/backup-avant-import-$STAMP.dump"
REMOTE

# --- 3. Transfert ---------------------------------------------------------
echo "==> transfert du dump"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$DUMP" "$SSH_USER@$SSH_HOST:$REMOTE_DIR/import.dump"

# --- 4. Restauration ------------------------------------------------------
# L'applicatif est arrêté le temps de la bascule : une requête qui arrive entre
# le DROP et le CREATE d'une table lit une base à moitié démontée. Le service
# de base de données, lui, doit rester debout — c'est la cible.
echo "==> restauration (remplacement complet)"
remote "$REMOTE_DIR" "$STAMP" "$PG_IMAGE" "$NETWORK" <<'REMOTE'
set -euo pipefail
DIR=$1; IMG=$3; NET=$4
cd "$DIR"
PGURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
# Dans le réseau docker, l'hôte de DATABASE_URL est le nom du service compose.
DBSVC=$(printf '%s' "$PGURL" | sed -E 's#.*@([^:/]+).*#\1#')

for svc in $(docker compose ps --services); do
  [ "$svc" = "$DBSVC" ] && continue
  docker compose stop "$svc" || true
done

# --clean --if-exists : chaque objet est supprimé avant d'être recréé, et une
# base déjà vide ne fait pas échouer le premier passage. pg_restore sort en
# erreur sur les DROP d'objets absents : la vérification de l'étape 5 fait foi,
# pas ce code de sortie.
docker run --rm --network "$NET" -v "$DIR/import.dump:/import.dump:ro" "$IMG" \
  pg_restore --clean --if-exists --no-owner --no-privileges \
    --dbname="$PGURL" /import.dump || true

docker compose up -d
rm -f "$DIR/import.dump"
REMOTE

# --- 5. Vérification ------------------------------------------------------
# Un restore « sans erreur » ne prouve rien : on recompte des lignes, et on
# vérifie que le journal importé décrit bien le schéma qui vient d'être posé.
echo "==> vérification"
remote "$REMOTE_DIR" "$STAMP" "$PG_IMAGE" "$NETWORK" <<'REMOTE'
set -euo pipefail
DIR=$1; IMG=$3; NET=$4
cd "$DIR"
PGURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
run() { docker run --rm --network "$NET" "$IMG" psql "$PGURL" "$@"; }
run -c "select relname, n_live_tup from pg_stat_user_tables where schemaname='public' and n_live_tup > 0 order by n_live_tup desc limit 12;"
echo "--- migrations enregistrées (doit valoir autant que prisma/migrations) ---"
run -tAc "select count(*) from _prisma_migrations"
REMOTE

cat <<EOF

Terminé. Sauvegarde de secours sur le serveur :
  $REMOTE_DIR/backup-avant-import-$STAMP.dump

Pour revenir en arrière, depuis $REMOTE_DIR :
  docker run --rm --network staging_internal \\
    -v \$(pwd)/backup-avant-import-$STAMP.dump:/b.dump:ro postgres:17-alpine \\
    pg_restore --clean --if-exists --no-owner \\
      --dbname="\$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" /b.dump
EOF
