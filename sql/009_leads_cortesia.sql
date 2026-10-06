-- Cortesia de implantação no "Possível cliente".
-- Instalação do GassFlow! SEM chave configurada usa alguns dias de cortesia
-- (contados no Protheus) e avisa o servidor 1x por dia mandando o período:
-- body.cortesia = { desde: 'AAAA-MM-DD', fim: 'AAAA-MM-DD' }. Guardamos as
-- datas (não "dias restantes", que mudam todo dia) e o painel calcula quanto
-- falta. Quando a instalação passa a mandar uma chave, os campos voltam a NULL.

ALTER TABLE leads
  ADD COLUMN cortesia_desde DATE NULL AFTER versao_app,
  ADD COLUMN cortesia_fim   DATE NULL AFTER cortesia_desde,
  ADD KEY idx_cortesia_fim (cortesia_fim);
