#!/usr/bin/env bash
# ==========================================================================
# Remise à zéro de la base de staging
# ==========================================================================
# Vide toutes les données applicatives du Postgres de /opt/nkamva/staging, et
# ne laisse debout que **les paramètres de la plateforme et deux Super-admins**.
#
#   SSH_HOST=… SSH_USER=… bash scripts/purge-staging.sh              # dit ce qu'il ferait
#   SSH_HOST=… SSH_USER=… bash scripts/purge-staging.sh --ecrire     # le fait
#
# À ne pas confondre avec les deux scripts voisins :
#   · `export-vers-staging.sh` **remplace** la base du serveur par celle de la
#     dev — schéma compris. Celui-ci ne touche jamais au schéma.
#   · `prisma/seed.ts` purge *tout* puis reconstruit un jeu de démonstration.
#     Celui-ci ne reconstruit rien : il laisse une plateforme vide mais
#     administrable, ce qu'aucun des deux autres ne sait produire.
#
# Six choix structurent ce script, et chacun corrige un piège rencontré :
#
#   1. `docker run` reçoit `-i` partout où du SQL arrive par l'entrée standard.
#      Sans lui, psql se connecte, ne lit rien, et **sort avec le code 0** : la
#      purge n'a pas lieu et le script continue comme si de rien n'était. C'est
#      l'erreur la plus coûteuse ici, parce qu'elle est silencieuse dans le bon
#      sens — on croit avoir détruit, on n'a rien fait. Les comptages de
#      l'étape 6 sont là pour que ce cas ne puisse plus passer inaperçu.
#
#   2. La liste des tables à vider vient du catalogue Postgres, jamais d'une
#      constante recopiée — même raison que `prisma/seed/reset.ts` : un modèle
#      ajouté au schéma est purgé sans que personne ait à y penser. Ce qui est
#      énuméré, c'est l'inverse : les tables **préservées**, qui sont peu
#      nombreuses et qui, elles, relèvent d'une décision.
#
#   3. Le `TRUNCATE … CASCADE` ne peut pas emporter la configuration. On
#      pourrait le craindre, puisque `users` est vidée et que les tables de
#      configuration portent des `updatedById` / `createdById`. Mais **aucune
#      clé étrangère** ne part de ces quatre tables : le schéma Prisma les
#      déclare en `String?` sans champ de relation. CASCADE ne se propage que
#      vers les tables qui *référencent* la table vidée — il n'a donc aucun
#      chemin vers elles.
#
#   4. Le revers du même constat : ces identifiants deviennent orphelins, et
#      **rien ne le signale** — ni la base, ni Prisma, ni `/admin/parametres`,
#      qui n'affiche pas l'auteur d'un réglage. L'étape 5 les repointe sur le
#      Super-admin conservé, et le prouve en comptant ce qui reste pendant.
#      Ces colonnes sont en `text`, pas en `uuid` : un `declare ref uuid` échoue
#      sur « operator does not exist: text = uuid ».
#
#   5. La purge et le repointage tiennent chacun dans **une transaction qui se
#      vérifie avant de valider**. Un `TRUNCATE` est transactionnel en
#      PostgreSQL : si le garde-fou lève, rien n'est perdu.
#
#   6. Les blocs distants sont des heredocs QUOTÉS : rien ne s'y substitue
#      localement, et les valeurs dont ils ont besoin arrivent en arguments
#      positionnels. Un heredoc non quoté obligerait à échapper chaque `$` —
#      illisible, et une seule omission ferait exécuter localement ce qui était
#      écrit pour le serveur.
#
# Ce que ce script NE fait PAS : il ne supprime aucun fichier du seau S3. Les
# pièces jointes, documents de candidature et ressources téléversées survivent
# à la purge — leurs lignes disparaissent, leurs octets restent. C'est assumé :
# le seau du staging est celui de la production (voir la note du dépôt sur
# `AWS_BUCKET_NAME`), et aucun script d'exploitation n'a à y effacer quoi que
# ce soit.
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
APP_CONTAINER="${APP_CONTAINER:-staging-app}"

# Les tables que la purge épargne. Les quatre dernières sont *les paramètres de
# la plateforme* : réglages système, grille tarifaire, remises, taux de change.
# `_prisma_migrations` n'est pas une donnée applicative — la vider ferait
# rejouer 42 migrations sur des tables déjà là.
#
# Séparées par des virgules, et non par des espaces : `ssh` ne transporte pas
# les frontières d'arguments. Il concatène tout en une chaîne que le shell
# distant re-découpe, si bien qu'une valeur à espaces arrive en plusieurs
# arguments positionnels et décale tous les suivants. Le premier jet de ce
# script est tombé dedans : `$4` ne valait que `_prisma_migrations`, et les
# quatre tables de paramètres partaient à la purge.
PRESERVEES="_prisma_migrations,settings,platform_tariffs,platform_discounts,fx_rates"

ECRIRE=0
GARDER_NOMINATIVES=0
for arg in "$@"; do
  case "$arg" in
    --ecrire) ECRIRE=1 ;;
    # Une remise `TRAINER` vise un formateur nommé, qui ne survit pas à la
    # purge. Par défaut elle part avec lui ; ce drapeau la garde, au prix d'un
    # `trainerId` qui ne désigne plus personne.
    --garder-remises-nominatives) GARDER_NOMINATIVES=1 ;;
    *) echo "argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

# --- Garde-fou : jamais la production ------------------------------------
# Les deux piles vivent sur la même machine. Ce script détruit des données sans
# les reconstruire : viser la mauvaise coûterait bien plus cher qu'un import
# raté. Le refus est sec et sans dérogation — purger la production, si le jour
# vient, se décide autrement que par une variable d'environnement.
case "$REMOTE_DIR$NETWORK$APP_CONTAINER" in
  *production*|*prod_*)
    echo "✗ Ce script est réservé au staging, et la cible mentionne la production." >&2
    echo "  REMOTE_DIR=$REMOTE_DIR  NETWORK=$NETWORK  APP_CONTAINER=$APP_CONTAINER" >&2
    exit 1 ;;
esac

remote() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" bash -s -- "$@"; }

# --- 1. État actuel -------------------------------------------------------
# Toujours affiché, y compris en mode « dis-moi ce que tu ferais ». Le nom de la
# base est vérifié côté serveur : un REMOTE_DIR correct dont le `.env` pointe
# ailleurs est exactement le genre d'erreur que le garde-fou ci-dessus ne voit
# pas passer.
echo "==> état actuel de la cible"
remote "$REMOTE_DIR" "$PG_IMAGE" "$NETWORK" "$PRESERVEES" <<'REMOTE'
set -euo pipefail
DIR=$1; IMG=$2; NET=$3; GARDEES=$4
cd "$DIR"
PGURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
run() { docker run --rm -i --network "$NET" "$IMG" psql "$PGURL" "$@"; }

BASE=$(run -tAc 'select current_database()' </dev/null | tr -d '[:space:]')
echo "    base : $BASE"
case "$BASE" in
  *staging*) ;;
  *) echo "✗ la base « $BASE » ne ressemble pas à une base de staging." >&2; exit 1 ;;
esac

# La liste préservée passe en tableau SQL. Le `tr` refait le découpage que les
# virgules ont protégé du transport par ssh.
LISTE=$(printf "'%s'," $(printf '%s' "$GARDEES" | tr ',' ' ') | sed 's/,$//')
run <<SQL
select tablename,
       (select n_live_tup from pg_stat_user_tables s
         where s.schemaname='public' and s.relname=t.tablename) as lignes_estimees,
       case when tablename in ($LISTE) then 'préservée' else 'à vider' end as sort
  from pg_tables t
 where schemaname='public'
   and (tablename in ($LISTE)
        or (select n_live_tup from pg_stat_user_tables s
             where s.schemaname='public' and s.relname=t.tablename) > 0)
 order by sort, tablename;
SQL
REMOTE

if [ "$ECRIRE" -ne 1 ]; then
  cat <<EOF

Rien n'a été touché. Ce qui serait fait avec --ecrire :

  · sauvegarde complète de $REMOTE_DIR (pg_dump), gardée sur le serveur
  · arrêt de l'applicatif, la base restant debout
  · vidage de toutes les tables sauf : ${PRESERVEES//,/ }
$( [ "$GARDER_NOMINATIVES" -eq 1 ] || echo "  · suppression des remises nominatives (kind = TRAINER)" )
  · recréation des deux Super-admins par scripts/bootstrap-admins.mjs
  · repointage des références de la configuration sur le premier d'entre eux

Relancez avec --ecrire pour l'exécuter.
EOF
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)

# --- 2. Sauvegarde --------------------------------------------------------
# Avant de détruire, on emporte de quoi revenir. Le dump reste sur le serveur :
# il n'a aucune raison de transiter par cette machine.
echo "==> sauvegarde avant purge"
remote "$REMOTE_DIR" "$PG_IMAGE" "$NETWORK" "$STAMP" <<'REMOTE'
set -euo pipefail
DIR=$1; IMG=$2; NET=$3; STAMP=$4
cd "$DIR"
PGURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
docker run --rm --network "$NET" "$IMG" \
  pg_dump --format=custom --no-owner --no-privileges "$PGURL" \
  > "$DIR/backup-avant-purge-$STAMP.dump"
ls -lh "$DIR/backup-avant-purge-$STAMP.dump"
REMOTE

# --- 3. Purge -------------------------------------------------------------
# L'applicatif est arrêté le temps de l'opération : une requête qui arrive entre
# le TRUNCATE et le rétablissement des comptes lit une plateforme sans
# administrateur. La base, elle, doit rester debout — c'est la cible.
echo "==> arrêt de l'applicatif, puis purge"
remote "$REMOTE_DIR" "$PG_IMAGE" "$NETWORK" "$PRESERVEES" "$GARDER_NOMINATIVES" <<'REMOTE'
set -euo pipefail
DIR=$1; IMG=$2; NET=$3; GARDEES=$4; GARDER_NOM=$5
cd "$DIR"
PGURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')

docker compose stop app

LISTE=$(printf "'%s'," $(printf '%s' "$GARDEES" | tr ',' ' ') | sed 's/,$//')
SUPPR_NOMINATIVES="delete from platform_discounts where kind = 'TRAINER';"
[ "$GARDER_NOM" -eq 1 ] && SUPPR_NOMINATIVES="-- remises nominatives conservées sur demande"

# `-i` : sans lui, psql ne lirait rien et sortirait en succès.
# ON_ERROR_STOP : sans lui, un garde-fou qui lève laisserait le COMMIT suivant
# s'exécuter quand même.
docker run --rm -i --network "$NET" "$IMG" psql "$PGURL" -v ON_ERROR_STOP=1 <<SQL
begin;

do \$\$
declare liste text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into liste
    from pg_tables
   where schemaname = 'public'
     and tablename not in ($LISTE);

  execute format('truncate table %s restart identity cascade', liste);
  raise notice 'tables vidées : %', liste;
end \$\$;

$SUPPR_NOMINATIVES

-- Le garde-fou. Il vérifie les deux sens : que la configuration a survécu, et
-- que la purge a bien eu lieu. Le second cas n'est pas théorique — c'est
-- exactement ce que produit un docker run sans -i.
do \$\$
declare n_conf int; n_usr int;
begin
  select (select count(*) from settings) + (select count(*) from platform_tariffs)
    into n_conf;
  select count(*) into n_usr from users;
  if n_conf = 0 then
    raise exception 'configuration perdue : la purge a mordu sur les paramètres';
  end if;
  if n_usr <> 0 then
    raise exception 'la purge n a pas vidé users (% lignes) - le SQL a-t-il été lu ?', n_usr;
  end if;
end \$\$;

commit;
SQL
REMOTE

# --- 4. Super-admins ------------------------------------------------------
# `bootstrap-admins.mjs` est écrit en .mjs précisément pour tourner dans l'image
# de production, qui n'embarque ni bun ni tsx. Il ne réécrit jamais le mot de
# passe d'un compte existant ; ici les comptes viennent de disparaître, ils sont
# donc créés, et le mot de passe est bien posé.
#
# BOOTSTRAP_ADMIN_PASSWORD voyage en base64, pour la même raison que la liste
# des tables : ssh ne préserve pas les frontières d'arguments, et un mot de
# passe à espaces arriverait découpé — ou pire, ses métacaractères seraient
# interprétés par le shell distant. L'encodage en fait un mot unique et inerte.
# Le sentinelle `-` tient la place quand il n'y en a pas : un argument vide
# disparaîtrait du transport et décalerait les suivants.
#
# Il reste visible d'un `ps` sur le serveur le temps de l'appel, base64 n'étant
# pas un chiffrement. Pour un secret qui doit durer, posez-le dans le .env du
# serveur plutôt que de le passer ici.
echo "==> redémarrage et recréation des Super-admins"
MDP_B64='-'
if [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  MDP_B64=$(printf '%s' "$BOOTSTRAP_ADMIN_PASSWORD" | base64 | tr -d '\n')
fi
remote "$REMOTE_DIR" "$APP_CONTAINER" "$MDP_B64" <<'REMOTE'
set -euo pipefail
DIR=$1; APP=$2; MDP_B64=$3
cd "$DIR"
docker compose up -d --wait
if [ "$MDP_B64" != '-' ]; then
  MDP=$(printf '%s' "$MDP_B64" | base64 -d)
  docker exec -e BOOTSTRAP_ADMIN_PASSWORD="$MDP" "$APP" node scripts/bootstrap-admins.mjs
else
  docker exec "$APP" node scripts/bootstrap-admins.mjs
fi
REMOTE

# --- 5. Recollage des références -----------------------------------------
echo "==> repointage des références de la configuration"
remote "$REMOTE_DIR" "$PG_IMAGE" "$NETWORK" <<'REMOTE'
set -euo pipefail
DIR=$1; IMG=$2; NET=$3
cd "$DIR"
PGURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')

docker run --rm -i --network "$NET" "$IMG" psql "$PGURL" -v ON_ERROR_STOP=1 <<'SQL'
begin;

-- `text`, pas `uuid` : Prisma mappe String @default(uuid()) en text, et un
-- `declare ref uuid` échoue ici sur « operator does not exist: text = uuid ».
do $$
declare ref text;
begin
  -- Le plus ancien des Super-admins : `bootstrap-admins.mjs` les crée dans
  -- l'ordre de sa constante SUPER_ADMINS, et c'est le premier de cette liste.
  select id into strict ref
    from users
   where role = 'ADMIN' and "adminRole" = 'SUPER_ADMIN' and "deletedAt" is null
   order by "createdAt", email
   limit 1;

  update settings           set "updatedById" = ref where "updatedById" is distinct from ref;
  update platform_tariffs   set "createdById" = ref where "createdById" is distinct from ref;
  update platform_discounts set "createdById" = ref where "createdById" is distinct from ref;
  update fx_rates           set "updatedById" = ref where "updatedById" is distinct from ref;
end $$;

-- Aucune clé étrangère ne garde ces colonnes : la preuve doit être explicite.
do $$
declare n int;
begin
  select count(*) into n from (
    select "updatedById" as id from settings
    union all select "createdById" from platform_tariffs
    union all select "createdById" from platform_discounts
    union all select "updatedById" from fx_rates
  ) r
  where r.id is not null
    and not exists (select 1 from users u where u.id = r.id);
  if n > 0 then raise exception 'il reste % référence(s) orpheline(s)', n; end if;
end $$;

commit;
SQL
REMOTE

# --- 6. Vérification ------------------------------------------------------
# Un enchaînement « sans erreur » ne prouve rien : on recompte, et on montre les
# comptes rétablis. `migrate status` ferme la dernière question — le schéma n'a
# pas bougé, et les migrations décrivent toujours ce qui est en base.
echo "==> vérification"
remote "$REMOTE_DIR" "$PG_IMAGE" "$NETWORK" <<'REMOTE'
set -euo pipefail
DIR=$1; IMG=$2; NET=$3
cd "$DIR"
PGURL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
run() { docker run --rm -i --network "$NET" "$IMG" psql "$PGURL" "$@"; }

echo "--- comptes restants ---"
run -c 'select email, "fullName", "adminRole", ("passwordHash" is not null) as mot_de_passe from users order by "createdAt";' </dev/null

echo "--- tables encore peuplées ---"
# Un comptage réel, pas les estimations de pg_stat : TRUNCATE les laisse
# périmées, et elles afficheraient encore les effectifs d'avant.
SQL=$(run -tAc "select string_agg(format('select %L as t, count(*) as n from %I', tablename, tablename), ' union all ') from pg_tables where schemaname='public';" </dev/null)
run -c "select * from ($SQL) x where n > 0 order by n desc, t;" </dev/null

echo "--- schéma ---"
if [ -d "$DIR/prisma" ]; then
  docker run --rm --network "$NET" \
    -e DATABASE_URL="$PGURL" -e DIRECT_URL="$PGURL" \
    -v "$DIR/prisma:/prisma" node:22-alpine \
    npx --yes prisma@6 migrate status --schema=/prisma/schema.prisma 2>&1 | grep -Ev '^npm notice' || true
else
  echo "    (pas de $DIR/prisma sur le serveur - contrôle du schéma sauté)"
fi
REMOTE

cat <<EOF

Terminé. Sauvegarde de secours sur le serveur :
  $REMOTE_DIR/backup-avant-purge-$STAMP.dump

Pour revenir en arrière, depuis $REMOTE_DIR :
  docker compose stop app
  docker run --rm --network $NETWORK \\
    -v \$(pwd)/backup-avant-purge-$STAMP.dump:/b.dump:ro $PG_IMAGE \\
    pg_restore --clean --if-exists --no-owner \\
      --dbname="\$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\"')" /b.dump
  docker compose up -d
EOF
