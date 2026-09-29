-- Script de teste do importador: Postgres basico
/* comentario de bloco
   com varias linhas; e ponto e virgula */
SET client_encoding = 'UTF8';
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS hidro;

CREATE TABLE IF NOT EXISTS hidro.estacao (
    id SERIAL PRIMARY KEY,
    codigo varchar(20) NOT NULL UNIQUE, -- comentario no fim da linha
    nome character varying(120) COLLATE pg_catalog."default" NOT NULL DEFAULT 'sem informação',
    "Nome ""Fantasia""" text,
    criado_em timestamp without time zone DEFAULT now(),
    ativo boolean NOT NULL DEFAULT true,
    valor numeric(10,2) DEFAULT 0.00,
    obs text DEFAULT 'it''s; ok'
);

CREATE TABLE hidro."medicao" (
    id bigserial,
    estacao_id integer NOT NULL REFERENCES hidro.estacao(id) ON DELETE CASCADE ON UPDATE NO ACTION,
    data date NOT NULL,
    valor double precision,
    CONSTRAINT medicao_pk PRIMARY KEY (id, data),
    CONSTRAINT valor_pos CHECK (valor >= 0 AND (valor < 1000 OR valor IN (5000, 6000)))
);

CREATE TABLE "hidro"."posto" (
    id int,
    estacao_id int,
    nome text,
    PRIMARY KEY (id),
    FOREIGN KEY (estacao_id) REFERENCES hidro.estacao (id),
    UNIQUE (nome),
    CHECK (char_length(nome) > 2)
);

ALTER TABLE ONLY hidro.posto ADD CONSTRAINT posto_nome_uk UNIQUE (nome, estacao_id);
ALTER TABLE hidro.medicao ADD CONSTRAINT medicao_estacao_fk FOREIGN KEY (estacao_id) REFERENCES hidro.estacao (id);
ALTER TABLE IF EXISTS hidro.estacao ADD CONSTRAINT estacao_ck CHECK (codigo <> '');
ALTER TABLE hidro.estacao ADD COLUMN extra integer;
ALTER TABLE hidro.inexistente ADD PRIMARY KEY (id);

COMMENT ON TABLE hidro.estacao IS 'Estacoes de ' 'monitoramento';
COMMENT ON COLUMN hidro.estacao.codigo IS 'Codigo da estacao (unico)';
COMMENT ON COLUMN hidro.estacao.naoexiste IS 'x';
COMMENT ON TABLE hidro.fantasma IS 'y';
COMMENT ON COLUMN hidro.fantasma.a IS 'y';
COMMENT ON INDEX foo IS 'ignorado';
INSERT INTO hidro.estacao (codigo) VALUES ('A;B');
GRANT ALL ON hidro.estacao TO public;
CREATE RULE r1 AS ON INSERT TO hidro.estacao DO NOTHING;
