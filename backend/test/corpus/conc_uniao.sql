-- Conceitual: uniao de entidades (categoria) com entidade resultante.
-- @respostas 0,1,1,1,1
-- @respostas 0,0,0,-1
-- @uniao proprietario pessoa,empresa
CREATE TABLE pessoa (cpf VARCHAR(11) PRIMARY KEY, nome VARCHAR(80));
CREATE TABLE empresa (cnpj VARCHAR(14) PRIMARY KEY, razao VARCHAR(80));
CREATE TABLE proprietario (codigo INTEGER PRIMARY KEY);
