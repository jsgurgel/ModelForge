-- Conceitual: 1:N simples, atributos identificadores e tipos comuns.
-- @respostas 1,0,0
-- @respostas 0,0,-1
-- @respostas 1,1,0
CREATE TABLE estacao (
    id INTEGER PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6)
);
CREATE TABLE medicao (
    id INTEGER PRIMARY KEY,
    estacao_id INTEGER NOT NULL REFERENCES estacao(id),
    valor NUMERIC(10,2) NOT NULL,
    instante TIMESTAMP NOT NULL
);
COMMENT ON TABLE estacao IS 'Estacoes de coleta';
COMMENT ON COLUMN estacao.nome IS 'Nome oficial da estacao';
