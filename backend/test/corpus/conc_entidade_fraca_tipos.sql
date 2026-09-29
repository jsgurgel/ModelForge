-- Conceitual: entidade fraca (linha dupla), varios tipos de dados e nomes com caixa mista.
-- @fraca fk_dep_func Funcionario
CREATE TABLE Funcionario (
    Matricula INTEGER PRIMARY KEY,
    Nome VARCHAR(100) NOT NULL,
    Salario NUMERIC(10,2),
    Admissao DATE,
    Ativo BOOLEAN,
    Foto BYTEA,
    Ficha JSONB,
    Ponto GEOMETRY(Point,4326)
);
CREATE TABLE Dependente (
    Seq INTEGER,
    Matricula INTEGER NOT NULL,
    Nome VARCHAR(100),
    CONSTRAINT fk_dep_func FOREIGN KEY (Matricula) REFERENCES Funcionario(Matricula),
    PRIMARY KEY (Matricula, Seq)
);
