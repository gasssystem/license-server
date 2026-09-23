-- Possíveis clientes (leads).
-- Todo CNPJ que chega em POST /api/v1/licencas/validar é registrado aqui:
-- é uma empresa que já tem o GassFlow! BPM instalado e tentou validar uma licença.
-- Serve para prospecção — inclusive CNPJs que ainda não têm licença ou não estão
-- cobertos pela chave que informaram.

CREATE TABLE IF NOT EXISTS leads (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cnpj              VARCHAR(18)     NOT NULL,               -- 00.000.000/0000-00
  razao_social      VARCHAR(180)    NULL,                   -- preenchido à mão no admin
  chave_informada   VARCHAR(29)     NULL,                   -- última chave que este CNPJ tentou
  ultimo_status     VARCHAR(30)     NULL,                   -- veredito da última validação
  ultimo_coberto    TINYINT(1)      NULL,                   -- a chave informada cobria este CNPJ?
  instancia         VARCHAR(160)    NULL,
  versao_app        VARCHAR(40)     NULL,
  ip                VARCHAR(45)     NULL,
  situacao          ENUM('novo','em_contato','cliente','descartado') NOT NULL DEFAULT 'novo',
  observacao        VARCHAR(500)    NULL,
  total_consultas   INT UNSIGNED    NOT NULL DEFAULT 1,
  primeira_consulta DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_consulta   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cnpj (cnpj),
  KEY idx_situacao (situacao),
  KEY idx_ultima_consulta (ultima_consulta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
