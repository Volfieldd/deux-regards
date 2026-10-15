-- Mots-clés d'une photo : pour la recherche sur le site (avec titre, légende, lieu, ville, série, photographe), et
-- affichés sur la page de la photo si le réglage le demande (Site public). Séparés par des virgules.
ALTER TABLE photos ADD COLUMN keywords TEXT NOT NULL DEFAULT '';
