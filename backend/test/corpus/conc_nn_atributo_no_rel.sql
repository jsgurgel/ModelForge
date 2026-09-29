-- Conceitual: N:N com atributo no relacionamento (movido para a tabela associativa).
-- @respostas 1
-- @respostas 0,1,0
-- @rel Matricula 0n aluno 1n disciplina
-- @attrrel Matricula nota NUMERIC(4,2)
-- @attrrel Matricula semestre VARCHAR(6)
CREATE TABLE aluno (id INTEGER PRIMARY KEY, nome VARCHAR(80) NOT NULL);
CREATE TABLE disciplina (id INTEGER PRIMARY KEY, nome VARCHAR(80) NOT NULL);
