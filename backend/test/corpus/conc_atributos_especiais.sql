-- Conceitual: atributos multivalorado, composto, opcional, atributos ocultos e acentos nos nomes.
-- @respostas 0,0,0,0
-- @respostas 1,0,-1
-- @respostas 0,0,1,0
-- @attr cliente telefone multi 1 n
-- @attr cliente endereço composto rua,cidade
-- @attr cliente apelido opcional
-- @ocultos cliente observações_internas TEXT|flag_legado BOOLEAN
CREATE TABLE cliente (id INTEGER PRIMARY KEY, nome VARCHAR(80) NOT NULL);
COMMENT ON COLUMN cliente.nome IS 'Nome completo do cliente';
