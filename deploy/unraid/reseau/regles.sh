#!/bin/bash
# Règles de l'hôte pour les réseaux de Nicephos (registre des briques de la Vigie, BV-10 « forcer le passage » et BV-11 ;
# décisions D24 et D25). À lancer par le greffon « User Scripts » d'Unraid au démarrage de la grappe (après Docker). Les
# règles visent des sous-réseaux et des adresses fixes, pas des interfaces : un « Compose Up » qui recrée les réseaux ne
# les défait pas ; un redémarrage du service Docker peut le faire (le battement horaire le dit à la Vigie). Guide pas à
# pas : README.md (même dossier).
#
#   regles.sh [--env FICHIER]              pose (ou remet) les règles ; relancé, il ne double rien
#   regles.sh --afficher [--env FICHIER]   imprime ce qui serait posé, sans rien toucher (aucun droit nécessaire)
#   regles.sh --retirer                    retire tout ce que ce script a posé
#   regles.sh --battement                  écrit dans le journal système l'état des règles (à lancer chaque heure) :
#                                          la Vigie y lit que les règles sont en place, et qu'elle n'est pas aveugle
#   regles.sh --rsyslog [--env FICHIER]    installe la configuration de rsyslog qui range ces lignes dans
#                                          NICEPHOS_DIR/reseau/hote/hote.log (monté en lecture seule dans la Vigie)
#
# Ce qui est posé (table filter, chaînes à soi, appelées en tête de DOCKER-USER et d'INPUT) :
#   - réponses des connexions déjà acceptées : laissées passer ;
#   - flux voulus entre conteneurs (BV-11) : tunnel → site:3000 et console de la Vigie:4200 ; site → réception de la
#     Vigie:4100 et traducteur:5000 ; site → mandataire de sortie:3128 ;
#   - tout autre paquet entre deux adresses des réseaux de Nicephos : rejeté et journalisé (« NICEPHOS-FLUX ») ;
#   - toute nouvelle connexion d'un de ces réseaux vers l'hôte : rejetée et journalisée (« NICEPHOS-FLUX ») ;
#   - sorties hors de ces réseaux : permises au tunnel, à la Vigie et au traducteur (modèles au premier lancement) ;
#     pour tout autre conteneur de la pile (le site, la sauvegarde), rejetées et journalisées (« NICEPHOS-SORTIE ») :
#     le site ne sort que par le mandataire, qui est sur un réseau à part ;
#   - journal limité en débit (20 lignes par minute, rafales de 40) : un conteneur qui insiste ne remplit pas le disque.
# Rien d'autre n'est touché : ni les règles de Docker, ni celles d'autres conteneurs de l'hôte (seules les adresses des
# réseaux de Nicephos sont visées).
set -euo pipefail

IPT=${IPTABLES:-iptables}
IPT_RESTORE=${IPTABLES_RESTORE:-iptables-restore}
LOGGER=${LOGGER:-logger}
RSYSLOG_CONF=${RSYSLOG_CONF:-/etc/rsyslog.d/nicephos-reseau.conf}
ROTATION=${ROTATION:-/usr/local/sbin/nicephos-reseau-rotation}
ENV_DEFAUT=/boot/config/plugins/compose.manager/projects/nicephos/.env
VERSION=2

mode=appliquer
env_file=
while [ $# -gt 0 ]; do
  case "$1" in
    --afficher) mode=afficher ;;
    --retirer) mode=retirer ;;
    --battement) mode=battement ;;
    --rsyslog) mode=rsyslog ;;
    --appliquer) mode=appliquer ;;
    --env) shift; env_file=${1:-} ;;
    -h|--aide) sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "regles.sh : option inconnue : $1 (voir --aide)" >&2; exit 2 ;;
  esac
  shift
done

# Réglages : ceux de compose.yaml par défaut, remplacés par ceux du .env de la pile. Le .env n'est JAMAIS exécuté (il
# contient des secrets et du texte libre) : seules les lignes des clés attendues sont lues, puis vérifiées.
NET_SUBNET=172.29.42.0/24
TUNNEL_IP=172.29.42.10
VIGIE_CONSOLE_IP=172.29.42.20
SITE_IP=172.29.42.30
TRADUCTION_IP=172.29.42.40
VIGIE_NET_SUBNET=172.29.43.0/24
VIGIE_INGEST_IP=172.29.43.10
SORTIE_NET_SUBNET=172.29.44.0/24
SORTIE_IP=172.29.44.10
NICEPHOS_DIR=
RESEAU_DIR=
CLES="NET_SUBNET TUNNEL_IP VIGIE_CONSOLE_IP SITE_IP TRADUCTION_IP VIGIE_NET_SUBNET VIGIE_INGEST_IP SORTIE_NET_SUBNET SORTIE_IP NICEPHOS_DIR RESEAU_DIR"
if [ -z "$env_file" ] && [ -f "$ENV_DEFAUT" ]; then env_file=$ENV_DEFAUT; fi
if [ -n "$env_file" ]; then
  [ -r "$env_file" ] || { echo "regles.sh : $env_file illisible" >&2; exit 2; }
  for cle in $CLES; do
    ligne=$(grep -E "^[[:space:]]*${cle}=" "$env_file" | tail -n 1 || true)
    [ -n "$ligne" ] || continue
    val=${ligne#*=}
    val=${val%%#*}
    val=$(printf '%s' "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")
    [ -n "$val" ] && printf -v "$cle" '%s' "$val"
  done
fi

ip_ok() { [[ "$1" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] && for o in "${BASH_REMATCH[@]:1}"; do [ "$o" -le 255 ] || return 1; done; }
net_ok() { [[ "$1" =~ ^([0-9.]+)/([0-9]{1,2})$ ]] && ip_ok "${BASH_REMATCH[1]}" && [ "${BASH_REMATCH[2]}" -ge 8 ] && [ "${BASH_REMATCH[2]}" -le 30 ]; }
for c in NET_SUBNET VIGIE_NET_SUBNET SORTIE_NET_SUBNET; do net_ok "${!c}" || { echo "regles.sh : $c invalide (${!c}) : sous-réseau attendu, ex. 172.29.42.0/24" >&2; exit 2; }; done
for c in TUNNEL_IP VIGIE_CONSOLE_IP SITE_IP TRADUCTION_IP VIGIE_INGEST_IP SORTIE_IP; do ip_ok "${!c}" || { echo "regles.sh : $c invalide (${!c}) : adresse IPv4 attendue" >&2; exit 2; }; done
if [ -z "$RESEAU_DIR" ] && [ -n "$NICEPHOS_DIR" ]; then RESEAU_DIR=$NICEPHOS_DIR/reseau; fi
if [ -n "$RESEAU_DIR" ] && ! [[ "$RESEAU_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]]; then echo "regles.sh : dossier invalide ($RESEAU_DIR)" >&2; exit 2; fi

NETS="$NET_SUBNET $VIGIE_NET_SUBNET $SORTIE_NET_SUBNET"
LIMITE="-m limit --limit 20/min --limit-burst 40"
CHAINES="NICEPHOS NICEPHOS-HOTE NICEPHOS-VERS NICEPHOS-FLUX NICEPHOS-SORTIE"

# Les règles, au format d'iptables-restore : les chaînes déclarées sont remises à zéro puis remplies d'un seul coup
# (--noflush : rien d'autre de la table n'est touché ; jamais d'instant où la moitié des règles manque).
regles() {
  cat <<EOF
*filter
:NICEPHOS - [0:0]
:NICEPHOS-HOTE - [0:0]
:NICEPHOS-VERS - [0:0]
:NICEPHOS-FLUX - [0:0]
:NICEPHOS-SORTIE - [0:0]
-A NICEPHOS -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
-A NICEPHOS -s $TUNNEL_IP/32 -d $SITE_IP/32 -p tcp -m tcp --dport 3000 -j RETURN
-A NICEPHOS -s $TUNNEL_IP/32 -d $VIGIE_CONSOLE_IP/32 -p tcp -m tcp --dport 4200 -j RETURN
-A NICEPHOS -s $VIGIE_NET_SUBNET -d $VIGIE_INGEST_IP/32 -p tcp -m tcp --dport 4100 -j RETURN
-A NICEPHOS -s $SITE_IP/32 -d $TRADUCTION_IP/32 -p tcp -m tcp --dport 5000 -j RETURN
-A NICEPHOS -s $SORTIE_NET_SUBNET -d $SORTIE_IP/32 -p tcp -m tcp --dport 3128 -j RETURN
EOF
  echo "-A NICEPHOS-HOTE -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN"
  for s in $NETS; do echo "-A NICEPHOS-HOTE -s $s -j NICEPHOS-FLUX"; done
  for d in $NETS; do echo "-A NICEPHOS -d $d -j NICEPHOS-VERS"; done
  for s in $TUNNEL_IP $VIGIE_CONSOLE_IP $TRADUCTION_IP; do echo "-A NICEPHOS -s $s/32 -j RETURN"; done
  for s in $NETS; do echo "-A NICEPHOS -s $s -j NICEPHOS-SORTIE"; done
  for s in $NETS; do echo "-A NICEPHOS-VERS -s $s -j NICEPHOS-FLUX"; done
  cat <<EOF
-A NICEPHOS-FLUX $LIMITE -j LOG --log-prefix "NICEPHOS-FLUX " --log-level 4
-A NICEPHOS-FLUX -j REJECT --reject-with icmp-port-unreachable
-A NICEPHOS-SORTIE $LIMITE -j LOG --log-prefix "NICEPHOS-SORTIE " --log-level 4
-A NICEPHOS-SORTIE -j REJECT --reject-with icmp-port-unreachable
COMMIT
EOF
}
attendues() { regles | grep -c '^-A NICEPHOS'; }
compter() {
  local c n=0 x
  for c in $CHAINES; do
    x=$($IPT -S "$c" 2>/dev/null | grep -c "^-A $c " || true)
    n=$((n + x))
  done
  echo "$n"
}
en_tete() {
  local premiere
  premiere=$($IPT -S "$1" 2>/dev/null | grep "^-A $1 " | head -n 1 || true)
  [ "$premiere" = "-A $1 -j $2" ]
}
poser_en_tete() {
  local transition="nicephos-$2-transition"
  # Le crochet de transition garde la frontière fermée pendant le remplacement. Si la pose définitive échoue, il reste
  # en tête et l'application suivante le remplacera ; aucun échec intermédiaire n'ouvre donc le chemin filtré.
  $IPT -I "$1" 1 -m comment --comment "$transition" -j "$2"
  while $IPT -C "$1" -j "$2" 2>/dev/null; do $IPT -D "$1" -j "$2"; done
  $IPT -I "$1" 1 -j "$2"
  while $IPT -C "$1" -m comment --comment "$transition" -j "$2" 2>/dev/null; do
    $IPT -D "$1" -m comment --comment "$transition" -j "$2"
  done
}

rsyslog_conf() {
  cat <<EOF
# Nicephos (deploy/unraid/reseau/regles.sh --rsyslog) : rejets du pare-feu (noyau, préfixes NICEPHOS-) et battements des
# règles (programme nicephos-reseau), venus de CETTE machine seulement (jamais d'un émetteur distant), rangés à part
# pour la Vigie, qui les lit en lecture seule. 10 Mo au plus, puis renommé en hote.log.1.
if (\$inputname == "imklog" and \$msg contains "NICEPHOS-") or (\$inputname == "imuxsock" and \$programname == "nicephos-reseau") then {
  action(type="omfile" file="$RESEAU_DIR/hote/hote.log" template="RSYSLOG_FileFormat" fileCreateMode="0644" dirCreateMode="0755"
         rotation.sizeLimit="10485760" rotation.sizeLimitCommand="$ROTATION")
  stop
}
EOF
}

case "$mode" in
  afficher)
    echo "# Réseaux : nicephos $NET_SUBNET, réception de la Vigie $VIGIE_NET_SUBNET, sortie $SORTIE_NET_SUBNET"
    echo "# Adresses : tunnel $TUNNEL_IP, console $VIGIE_CONSOLE_IP, site $SITE_IP, traducteur $TRADUCTION_IP, réception $VIGIE_INGEST_IP, mandataire $SORTIE_IP"
    echo "# $IPT_RESTORE --noflush <<'FIN'"
    regles
    echo "# FIN"
    echo "# puis, en tête : $IPT -I DOCKER-USER 1 -j NICEPHOS"
    echo "# et, en tête : $IPT -I INPUT 1 -j NICEPHOS-HOTE"
    if [ -n "$RESEAU_DIR" ]; then echo "# Configuration de rsyslog (--rsyslog) : $RSYSLOG_CONF"; rsyslog_conf | sed 's/^/# | /'; fi
    ;;
  appliquer)
    $IPT -S DOCKER-USER >/dev/null 2>&1 || { echo "regles.sh : chaîne DOCKER-USER absente (Docker est-il démarré ?)" >&2; exit 1; }
    $IPT -S INPUT >/dev/null 2>&1 || { echo "regles.sh : chaîne INPUT absente" >&2; exit 1; }
    regles | $IPT_RESTORE --noflush
    poser_en_tete DOCKER-USER NICEPHOS
    poser_en_tete INPUT NICEPHOS-HOTE
    echo "Règles de Nicephos posées ($(attendues) dans leurs chaînes), appelées en tête de DOCKER-USER et d'INPUT."
    ;;
  retirer)
    while $IPT -C DOCKER-USER -j NICEPHOS 2>/dev/null; do $IPT -D DOCKER-USER -j NICEPHOS; done
    while $IPT -C DOCKER-USER -m comment --comment nicephos-NICEPHOS-transition -j NICEPHOS 2>/dev/null; do $IPT -D DOCKER-USER -m comment --comment nicephos-NICEPHOS-transition -j NICEPHOS; done
    while $IPT -C INPUT -j NICEPHOS-HOTE 2>/dev/null; do $IPT -D INPUT -j NICEPHOS-HOTE; done
    while $IPT -C INPUT -m comment --comment nicephos-NICEPHOS-HOTE-transition -j NICEPHOS-HOTE 2>/dev/null; do $IPT -D INPUT -m comment --comment nicephos-NICEPHOS-HOTE-transition -j NICEPHOS-HOTE; done
    for c in $CHAINES; do $IPT -F "$c" 2>/dev/null || true; done
    for c in $CHAINES; do $IPT -X "$c" 2>/dev/null || true; done
    echo "Règles de Nicephos retirées."
    ;;
  battement)
    # « ok » : les deux appels en tête et toutes les règles sont présents ; sinon « absentes » ou « incompletes ».
    n=$(compter)
    if ! en_tete DOCKER-USER NICEPHOS || ! en_tete INPUT NICEPHOS-HOTE; then etat=absentes
    elif [ "$n" != "$(attendues)" ]; then etat=incompletes
    else etat=ok; fi
    $LOGGER -t nicephos-reseau "NICEPHOS-BATTEMENT etat=$etat regles=$n attendues=$(attendues) version=$VERSION"
    echo "Battement écrit : etat=$etat"
    ;;
  rsyslog)
    [ -n "$RESEAU_DIR" ] || { echo "regles.sh : NICEPHOS_DIR (ou RESEAU_DIR) introuvable dans le .env : où écrire le journal ?" >&2; exit 2; }
    mkdir -p "$RESEAU_DIR/hote"
    chmod 755 "$RESEAU_DIR" "$RESEAU_DIR/hote"
    printf '#!/bin/sh\n# Rotation du journal réseau de Nicephos (appelée par rsyslog à 10 Mo).\nmv -f "%s/hote/hote.log" "%s/hote/hote.log.1"\n' "$RESEAU_DIR" "$RESEAU_DIR" > "$ROTATION"
    chmod 755 "$ROTATION"
    rsyslog_conf > "$RSYSLOG_CONF"
    if [ -x /etc/rc.d/rc.rsyslogd ]; then /etc/rc.d/rc.rsyslogd restart >/dev/null          # Unraid
    elif command -v systemctl >/dev/null 2>&1; then systemctl restart rsyslog                # instance de test (Debian, Ubuntu)
    else echo "Relancez rsyslog pour prendre $RSYSLOG_CONF." >&2; fi
    echo "rsyslog : lignes NICEPHOS- rangées dans $RESEAU_DIR/hote/hote.log"
    ;;
esac
