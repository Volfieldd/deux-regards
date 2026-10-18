-- Console de la Vigie, phase D3c : message d'une action (fait, ou refusé avec la raison et le champ en cause), montré à la
-- page suivante puis effacé (formulaire envoyé, puis redirection : la page rechargée ne renvoie jamais l'action).
ALTER TABLE console_sessions ADD COLUMN message TEXT;
