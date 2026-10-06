-- Licença light (GassFlow!): o app esconde do menu/painéis o que não foi
-- contratado (licenca_funcionalidades), em vez de mostrar com cadeado.
--   0 → completa: o não contratado aparece com 🔒 ("Não contratado") — vitrine
--   1 → light:    o cliente só enxerga o que comprou

ALTER TABLE licencas
  ADD COLUMN light TINYINT(1) NOT NULL DEFAULT 0 AFTER plano;
