-- Conceitual: especializacao total exclusiva e parcial nao exclusiva.
-- @respostas 0,1,1,1,1,1,1,0,2
-- @respostas 1,1,1,1,1,1,1,1,1
-- @respostas 0,0,0,0,0,0,0,2,-1
-- @esp pessoa total pessoa_fisica,pessoa_juridica
-- @esp veiculo parcial carro
CREATE TABLE pessoa (id INTEGER PRIMARY KEY, nome VARCHAR(100) NOT NULL);
CREATE TABLE pessoa_fisica (cpf VARCHAR(11), nascimento DATE);
CREATE TABLE pessoa_juridica (cnpj VARCHAR(14), razao VARCHAR(100));
CREATE TABLE veiculo (placa VARCHAR(8) PRIMARY KEY, marca VARCHAR(30));
CREATE TABLE carro (portas INTEGER);
