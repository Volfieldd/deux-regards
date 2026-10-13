-- Site en trois langues : traductions facultatives (vide = repli sur une autre langue, voir server/i18n.js).
ALTER TABLE photos ADD COLUMN title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN title_de TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN legend_en TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN legend_de TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN place_en TEXT NOT NULL DEFAULT '';
ALTER TABLE photos ADD COLUMN place_de TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN name_en TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN name_de TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN bio_en TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN bio_de TEXT NOT NULL DEFAULT '';
