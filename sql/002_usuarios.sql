-- Usuários habilitados a acessar a área de gerenciamento de licenças.

CREATE TABLE IF NOT EXISTS usuarios (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(160)    NOT NULL,
  email         VARCHAR(190)    NOT NULL,
  senha_hash    VARCHAR(255)    NOT NULL,             -- scrypt$<salt-b64>$<hash-b64>
  ativo         TINYINT(1)      NOT NULL DEFAULT 1,
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ultimo_login  DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
