-- Funcionalidades contratadas por licença (GassFlow!: cada funcionalidade de cada
-- módulo — BPM, Fiscal, Financeiro, Envios — é vendida separadamente).
-- codigo = 'modulo.funcionalidade' (ex.: 'bpm.produtos'); o catálogo fica em
-- src/lib/modulos.js, então funcionalidades novas não exigem migração.

CREATE TABLE IF NOT EXISTS licenca_funcionalidades (
  licenca_id  BIGINT UNSIGNED NOT NULL,
  codigo      VARCHAR(60)     NOT NULL,
  criado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (licenca_id, codigo),
  CONSTRAINT fk_funcionalidade_licenca FOREIGN KEY (licenca_id)
    REFERENCES licencas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
