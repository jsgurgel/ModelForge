-- Conceitual: auto-relacionamento (FK para a propria tabela) e cardinalidades (0,1)/(0,n).
-- @respostas 0,1,1
-- @respostas 1,0,0
-- @card fk_pai 01 0n
CREATE TABLE categoria (
    id INTEGER PRIMARY KEY,
    nome VARCHAR(60) NOT NULL,
    pai_id INTEGER,
    CONSTRAINT fk_pai FOREIGN KEY (pai_id) REFERENCES categoria(id)
);
CREATE TABLE produto (
    id INTEGER PRIMARY KEY,
    nome VARCHAR(60) NOT NULL,
    categoria_id INTEGER NOT NULL REFERENCES categoria(id)
);
