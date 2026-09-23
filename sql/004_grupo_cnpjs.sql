-- Grupo de CNPJs cobertos por uma licença.
-- Uma empresa pode contratar o GassFlow! BPM para todo o grupo econômico:
-- a licença tem 1 CNPJ contratante (licencas.cliente_cnpj) + N empresas do grupo.
-- Um CNPJ é "coberto" pela licença se for o contratante OU estiver nesta tabela.

CREATE TABLE IF NOT EXISTS licenca_cnpjs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  licenca_id    BIGINT UNSIGNED NOT NULL,
  cnpj          VARCHAR(18)     NOT NULL,               -- 00.000.000/0000-00
  razao_social  VARCHAR(180)    NULL,
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_licenca_cnpj (licenca_id, cnpj),
  KEY idx_cnpj (cnpj),
  CONSTRAINT fk_grupo_licenca FOREIGN KEY (licenca_id)
    REFERENCES licencas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
