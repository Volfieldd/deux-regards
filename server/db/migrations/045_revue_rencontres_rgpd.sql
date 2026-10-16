-- Revue du 16 octobre 2026 (rencontres et RGPD).
-- photo_seen_at : dernière purge où une photo concernait encore la rencontre (liée, ou de sa sortie). Un accord ou un
-- refus est gardé tant qu'une photo existe, puis 5 ans : les 5 ans partent de là, et non plus de la dernière
-- modification de la rencontre (l'accord disparaissait le soir même de la suppression de la dernière photo).
ALTER TABLE encounters ADD COLUMN photo_seen_at INTEGER;
-- Dates impossibles (2025-02-30, 2026-00-10) acceptées autrefois par la page /bonjour et la fiche : elles cassaient
-- les Sorties et la fiche de la rencontre. date() de SQLite les rejette (NULL) ou les décale : vidées.
UPDATE encounters SET met_on = '' WHERE met_on <> '' AND (date(met_on) IS NULL OR date(met_on) <> met_on);
UPDATE encounters SET session_day = NULL WHERE session_day IS NOT NULL AND session_day <> '' AND (date(session_day) IS NULL OR date(session_day) <> session_day);
