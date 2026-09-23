-- Plano da licença: full (perpétua), anual, mensal.
-- Para "full" sem data de fim, a licença nunca expira.

ALTER TABLE licencas
  ADD COLUMN plano ENUM('full', 'anual', 'mensal') NOT NULL DEFAULT 'anual' AFTER cliente_cnpj,
  MODIFY COLUMN fim DATE NULL;
