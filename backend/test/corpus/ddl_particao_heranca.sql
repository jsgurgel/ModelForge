CREATE TABLE medicao_2024 PARTITION OF medicao FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE medicao_resto PARTITION OF medicao DEFAULT;
CREATE TABLE medicao (
  id INTEGER,
  data_hora TIMESTAMP NOT NULL,
  valor NUMERIC(10,2)
) PARTITION BY RANGE (data_hora);
CREATE TABLE estacao_auto (sensor VARCHAR(40)) INHERITS (estacao);
CREATE TABLE estacao (id INTEGER PRIMARY KEY, nome VARCHAR(50));
CREATE TABLE lista (id INTEGER, pais CHAR(2)) PARTITION BY LIST (pais);
CREATE TABLE hash_t (id INTEGER) PARTITION BY HASH (id);
CREATE INDEX idx_medicao_dh ON medicao (data_hora);
