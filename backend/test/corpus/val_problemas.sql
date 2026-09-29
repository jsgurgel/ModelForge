-- Corpus do validador Lógico: cada bloco dispara um tipo de problema.

-- sem chave primaria
CREATE TABLE sem_pk (
    id integer NOT NULL,
    nome varchar(50)
);

-- campo duplicado (case-insensitive)
CREATE TABLE campo_dup (
    id integer PRIMARY KEY,
    Nome varchar(50),
    NOME varchar(60)
);

-- nome de identificador acima de 63 caracteres (tabela e campo)
CREATE TABLE tabela_com_um_nome_absurdamente_longo_que_ultrapassa_o_limite_do_postgres_63 (
    id integer PRIMARY KEY,
    coluna_com_um_nome_absurdamente_longo_que_ultrapassa_o_limite_do_postgres_63 integer
);

-- ciclo direto A <-> B
CREATE TABLE ciclo_a (
    id integer PRIMARY KEY,
    b_id integer
);
CREATE TABLE ciclo_b (
    id integer PRIMARY KEY,
    a_id integer REFERENCES ciclo_a (id)
);
ALTER TABLE ciclo_a ADD CONSTRAINT fk_a_b FOREIGN KEY (b_id) REFERENCES ciclo_b (id);

-- ciclo em cadeia X -> Y -> Z -> X
CREATE TABLE ciclo_x (
    id integer PRIMARY KEY,
    z_id integer
);
CREATE TABLE ciclo_y (
    id integer PRIMARY KEY,
    x_id integer REFERENCES ciclo_x (id)
);
CREATE TABLE ciclo_z (
    id integer PRIMARY KEY,
    y_id integer REFERENCES ciclo_y (id)
);
ALTER TABLE ciclo_x ADD CONSTRAINT fk_x_z FOREIGN KEY (z_id) REFERENCES ciclo_z (id);

-- auto-referencia: legitima, nao deve ser reportada
CREATE TABLE hierarquia (
    id integer PRIMARY KEY,
    pai_id integer REFERENCES hierarquia (id)
);

-- particionamento
CREATE TABLE part_sem_chave (
    id integer,
    dia date,
    PRIMARY KEY (id)
) PARTITION BY RANGE ();

CREATE TABLE part_estrategia_invalida (
    id integer,
    dia date,
    PRIMARY KEY (id, dia)
) PARTITION BY FOO (dia);

CREATE TABLE part_pk_incompleta (
    id integer,
    dia date,
    regiao text,
    PRIMARY KEY (id),
    UNIQUE (id, dia)
) PARTITION BY RANGE (dia, regiao);

CREATE TABLE part_ok (
    id integer,
    dia date,
    PRIMARY KEY (id, dia)
) PARTITION BY RANGE (dia);

CREATE TABLE part_ok_2024 PARTITION OF part_ok FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE part_ok_default PARTITION OF part_ok DEFAULT;

-- particao que tambem declara PARTITION BY (subparticionamento)
CREATE TABLE part_ok_2025 PARTITION OF part_ok FOR VALUES FROM ('2025-01-01') TO ('2026-01-01') PARTITION BY LIST (id);

-- heranca legada (INHERITS): sem PK propria e sem colunas
CREATE TABLE filha_herdada () INHERITS (sem_pk);

-- colunas espaciais
CREATE TABLE espacial (
    id integer PRIMARY KEY,
    geom_sem_srid geometry,
    geom_com_subtipo geometry(Point),
    geom_com_srid geometry(Polygon, 4326),
    geog geography
);
