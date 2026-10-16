-- Comptes supprimés depuis « Comptes et rôles » : seule l'identité (sub) est gardée, pour qu'une nouvelle connexion ne
-- recrée pas le compte avec le rôle « admin » transporté par l'IdP. Le compte revient « en attente », décision
-- d'administrateur posée (accounts.decided_at), et la ligne d'ici est alors effacée.
CREATE TABLE accounts_removed (
  sub        TEXT PRIMARY KEY,
  removed_at INTEGER NOT NULL
);
