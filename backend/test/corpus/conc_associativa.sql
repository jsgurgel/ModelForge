-- Conceitual: entidade associativa (relacionamento promovido) com atributos proprios e ligada a outra entidade.
-- @rel Aloca 0n funcionario 0n projeto
-- @associativa Aloca
-- @attrrel Aloca horas INTEGER
CREATE TABLE funcionario (id INTEGER PRIMARY KEY, nome VARCHAR(80) NOT NULL);
CREATE TABLE projeto (id INTEGER PRIMARY KEY, titulo VARCHAR(80) NOT NULL);
