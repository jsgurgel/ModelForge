CREATE TABLE aluno (id_aluno integer PRIMARY KEY, nome_completo varchar(80) NOT NULL, email varchar(120) UNIQUE);
CREATE TABLE curso (id_curso integer PRIMARY KEY, titulo text NOT NULL);
CREATE TABLE matricula (
    aluno_id integer NOT NULL REFERENCES aluno (id_aluno),
    curso_id integer NOT NULL REFERENCES curso (id_curso),
    data_matricula date,
    nota real,
    PRIMARY KEY (aluno_id, curso_id)
);
CREATE TABLE tutor (
    id integer PRIMARY KEY,
    aluno integer REFERENCES aluno (id_aluno),
    mentor_principal integer REFERENCES aluno (id_aluno)
);
