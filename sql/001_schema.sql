-- Servidor de licenças do GassFlow! BPM — schema inicial.
-- Rodar com: npm run migrate  (ou aplicar manualmente no MySQL da TurboCloud).

CREATE TABLE IF NOT EXISTS licencas (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  chave            CHAR(29)        NOT NULL,               -- DCF-XXXXX-XXXXX-XXXXX-XXXXX
  cliente_nome     VARCHAR(180)    NOT NULL,               -- razão social
  cliente_cnpj     VARCHAR(18)     NOT NULL,               -- 00.000.000/0000-00
  status           ENUM('ativa','suspensa','cancelada') NOT NULL DEFAULT 'ativa',
  inicio           DATE            NOT NULL,
  fim              DATE            NOT NULL,               -- data de expiração (inclusive)
  tolerancia_dias  SMALLINT UNSIGNED NOT NULL DEFAULT 7,   -- dias de uso após expirar antes de bloquear
  observacao       VARCHAR(500)    NULL,
  criado_em        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chave (chave),
  KEY idx_cnpj (cliente_cnpj),
  KEY idx_status_fim (status, fim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cada instalação do GassFlow! que valida a licença deixa um registro aqui
-- (útil para saber onde a licença está sendo usada e o último "check-in").
CREATE TABLE IF NOT EXISTS licenca_ativacoes (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  licenca_id       BIGINT UNSIGNED NOT NULL,
  instancia        VARCHAR(160)    NOT NULL,               -- id da instalação (ex: CNPJ+empresa+filial)
  versao_app       VARCHAR(40)     NULL,
  ip               VARCHAR(45)     NULL,
  primeiro_check   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_check     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_checks     INT UNSIGNED    NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_licenca_instancia (licenca_id, instancia),
  KEY idx_ultimo_check (ultimo_check),
  CONSTRAINT fk_ativacao_licenca FOREIGN KEY (licenca_id)
    REFERENCES licencas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
