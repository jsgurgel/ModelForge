CREATE TABLE pais (
    id integer PRIMARY KEY,
    sigla char(2) UNIQUE,
    nome text
);
CREATE TABLE estado (
    id smallint PRIMARY KEY,
    pais_id bigint REFERENCES pais (id),
    sigla varchar(2) NOT NULL REFERENCES pais (sigla),
    pai_id integer REFERENCES estado (id)
);
CREATE TABLE cidade (
    estado_id integer NOT NULL,
    pais_id integer NOT NULL,
    codigo integer NOT NULL,
    nome text,
    PRIMARY KEY (estado_id, codigo),
    CONSTRAINT fk_cid_est FOREIGN KEY (estado_id) REFERENCES estado (id),
    CONSTRAINT fk_cid_pais FOREIGN KEY (pais_id) REFERENCES pais (id) ON DELETE SET NULL,
    CONSTRAINT fk_cid_fantasma FOREIGN KEY (pais_id) REFERENCES fantasma (id),
    CONSTRAINT fk_cid_col FOREIGN KEY (pais_id) REFERENCES pais (naoexiste),
    CONSTRAINT fk_cid_local FOREIGN KEY (naoexiste) REFERENCES pais (id)
);
CREATE TABLE bairro (
    cidade_estado integer,
    cidade_codigo integer,
    nome text,
    FOREIGN KEY (cidade_estado, cidade_codigo) REFERENCES cidade (estado_id, codigo),
    FOREIGN KEY (cidade_estado) REFERENCES cidade (estado_id, codigo)
);
CREATE TABLE semchave (a integer, b integer);
CREATE TABLE ref_semchave (
    x integer REFERENCES semchave (a),
    y integer,
    CONSTRAINT fk_mal FOREIGN KEY y REFERENCES semchave (a)
);
CREATE TABLE ck (
    id int,
    txt text,
    CONSTRAINT ck_txt CHECK (txt IN ('a', 'b)')),
    CHECK (),
    CONSTRAINT ck_mal CHECK,
    CONSTRAINT sem_tipo EXCLUDE USING gist (id WITH =),
    LIKE outra
);
CREATE TABLE ordem_alter (id int);
ALTER TABLE ordem_alter ADD PRIMARY KEY (id);
ALTER TABLE ordem_alter ADD CONSTRAINT o_u UNIQUE (id);
ALTER TABLE ordem_alter ADD CONSTRAINT o_fk FOREIGN KEY (id) REFERENCES pais (id);
ALTER TABLE ordem_alter ADD FOREIGN KEY (id);
ALTER TABLE ordem_alter ADD CHECK (id > 0);
ALTER TABLE ordem_alter ADD CHECK;
ALTER TABLE ordem_alter DROP COLUMN x;
ALTER TABLE ordem_alter ALTER COLUMN id SET NOT NULL;
ALTER TABLE ordem_alter ADD CONSTRAINT o_ex EXCLUDE (id WITH =);
