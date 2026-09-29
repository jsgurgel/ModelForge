CREATE TABLE produto (
    id integer PRIMARY KEY,
    sku varchar(20) NOT NULL UNIQUE,
    nome varchar(100) NOT NULL DEFAULT 'sem nome',
    descricao text,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamp NOT NULL DEFAULT now(),
    preco numeric(10,2) DEFAULT 0,
    a integer,
    b integer,
    UNIQUE (a, b)
);
CREATE TABLE sem_pk (x integer, y text);
