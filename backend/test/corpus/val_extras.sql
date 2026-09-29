-- Corpus do validador Lógico: casos que o importador pode ou nao preservar.
CREATE TABLE tabela_vazia ();

CREATE TABLE Duplicada (
    id integer PRIMARY KEY
);
CREATE TABLE DUPLICADA (
    id integer PRIMARY KEY
);
CREATE TABLE app1.Duplicada (
    id integer PRIMARY KEY
);

CREATE TABLE tipos_faltando (
    id integer PRIMARY KEY,
    sem_tipo,
    outra
);

CREATE TABLE check_vazio (
    id integer PRIMARY KEY,
    v integer,
    CHECK ()
);

-- varios grupos duplicados: a ordem do relatorio segue a tabela hash simulada
CREATE TABLE s1.alfa (id integer PRIMARY KEY);
CREATE TABLE s2.alfa (id integer PRIMARY KEY);
CREATE TABLE s1.beta (id integer PRIMARY KEY);
CREATE TABLE s2.beta (id integer PRIMARY KEY);
CREATE TABLE s1.gama (id integer PRIMARY KEY);
CREATE TABLE s2.gama (id integer PRIMARY KEY);
CREATE TABLE s1.delta (id integer PRIMARY KEY);
CREATE TABLE s2.delta (id integer PRIMARY KEY);
CREATE TABLE s1.epsilon (id integer PRIMARY KEY);
CREATE TABLE s2.epsilon (id integer PRIMARY KEY);
CREATE TABLE s1.zeta (id integer PRIMARY KEY);
CREATE TABLE s2.zeta (id integer PRIMARY KEY);
CREATE TABLE s1.eta (id integer PRIMARY KEY);
CREATE TABLE s2.eta (id integer PRIMARY KEY);
CREATE TABLE s1.teta (id integer PRIMARY KEY);
CREATE TABLE s2.teta (id integer PRIMARY KEY);
CREATE TABLE s1.iota (id integer PRIMARY KEY);
CREATE TABLE s2.iota (id integer PRIMARY KEY);
CREATE TABLE s1.kappa (id integer PRIMARY KEY);
CREATE TABLE s2.kappa (id integer PRIMARY KEY);
CREATE TABLE s1.lambda (id integer PRIMARY KEY);
CREATE TABLE s2.lambda (id integer PRIMARY KEY);
CREATE TABLE s1.Mu (id integer PRIMARY KEY);
CREATE TABLE s2.Mu (id integer PRIMARY KEY);
CREATE TABLE s1.Nu (id integer PRIMARY KEY);
CREATE TABLE s2.Nu (id integer PRIMARY KEY);
CREATE TABLE s1.xi (id integer PRIMARY KEY);
CREATE TABLE s2.xi (id integer PRIMARY KEY);
CREATE TABLE s1.omicron (id integer PRIMARY KEY);
CREATE TABLE s2.omicron (id integer PRIMARY KEY);
CREATE TABLE s1.pi (id integer PRIMARY KEY);
CREATE TABLE s2.pi (id integer PRIMARY KEY);
CREATE TABLE s1.ro (id integer PRIMARY KEY);
CREATE TABLE s2.ro (id integer PRIMARY KEY);
CREATE TABLE s1.sigma (id integer PRIMARY KEY);
CREATE TABLE s2.sigma (id integer PRIMARY KEY);
CREATE TABLE s1.tau (id integer PRIMARY KEY);
CREATE TABLE s2.tau (id integer PRIMARY KEY);
CREATE TABLE s1.upsilon (id integer PRIMARY KEY);
CREATE TABLE s2.upsilon (id integer PRIMARY KEY);
