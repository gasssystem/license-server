-- Produto da licença: o mesmo servidor passa a licenciar mais de um produto da Gass System.
--   gassflow_bpm → GassFlow! BPM   (chave DCF-...; todas as licenças existentes)
--   bpo_fopag    → BPO FOPAG GASS  (chave FPG-...)
-- VARCHAR (e não ENUM) para incluir produtos novos só no código, sem migração.

ALTER TABLE licencas
  ADD COLUMN produto VARCHAR(30) NOT NULL DEFAULT 'gassflow_bpm' AFTER chave,
  ADD KEY idx_produto (produto);
