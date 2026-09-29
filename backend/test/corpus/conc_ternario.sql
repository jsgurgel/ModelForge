-- Conceitual: relacionamento ternario criado pela diretiva @rel (nome, e pares "card entidade").
-- @respostas 0,0
-- @rel Fornece 1n fornecedor 0n produto 1n projeto
-- @attrrel Fornece quantidade INTEGER
CREATE TABLE fornecedor (id INTEGER PRIMARY KEY, nome VARCHAR(80) NOT NULL);
CREATE TABLE produto (id INTEGER PRIMARY KEY, nome VARCHAR(80) NOT NULL);
CREATE TABLE projeto (id INTEGER PRIMARY KEY, titulo VARCHAR(80) NOT NULL);
