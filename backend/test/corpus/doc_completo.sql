-- Corpus da documentacao HTML: exercita todas as secoes.

CREATE SCHEMA app;

CREATE TYPE app.status_pedido AS ENUM ('novo', 'pago', E'enviado', 'cancelado');
CREATE TYPE cor AS ENUM ('vermelho', 'verde');
CREATE DOMAIN app.cpf AS varchar(11) NOT NULL DEFAULT '00000000000' CHECK (length(VALUE) = 11);
CREATE DOMAIN positivo AS integer;

CREATE SEQUENCE app.seq_pedido INCREMENT BY 2 START WITH 100 MINVALUE 1 MAXVALUE 100000 CYCLE;
CREATE SEQUENCE seq_simples;

CREATE TABLE app.cliente (
    id integer NOT NULL,
    nome varchar(80) NOT NULL DEFAULT 'sem <nome> & "aspas"',
    email varchar(120) UNIQUE,
    idade integer,
    localizacao geometry(Point, 4326),
    area geometry,
    CONSTRAINT pk_cliente PRIMARY KEY (id),
    CONSTRAINT ck_idade CHECK (idade >= 0 AND idade < 150),
    CHECK (nome <> '')
);

CREATE TABLE app.pedido (
    id bigint NOT NULL,
    cliente_id integer NOT NULL,
    status varchar(20) DEFAULT 'novo',
    total numeric(12,2),
    CONSTRAINT pk_pedido PRIMARY KEY (id),
    CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES app.cliente (id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CHECK (total >= 0)
);

CREATE TABLE app.item (
    pedido_id bigint NOT NULL,
    numero integer NOT NULL,
    produto varchar(60),
    PRIMARY KEY (pedido_id, numero),
    FOREIGN KEY (pedido_id) REFERENCES app.pedido (id)
);

CREATE TABLE app.log_evento (
    id integer,
    dia date NOT NULL,
    PRIMARY KEY (id, dia)
) PARTITION BY RANGE (dia);

CREATE TABLE app.log_evento_2024 PARTITION OF app.log_evento FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE auditoria_base (
    id integer PRIMARY KEY,
    quando timestamp
);
CREATE TABLE auditoria_pedido (
    pedido_id integer
) INHERITS (auditoria_base);

CREATE INDEX idx_cliente_nome ON app.cliente (nome);
CREATE UNIQUE INDEX ON app.cliente (email, nome);
CREATE INDEX idx_cliente_area ON app.cliente USING gist (area);
CREATE INDEX idx_pedido_parcial ON app.pedido (status, total) WHERE status <> 'cancelado';

CREATE OR REPLACE FUNCTION app.fn_auditar() RETURNS trigger AS $$
BEGIN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION app.soma(a integer, b integer) RETURNS integer AS $$
    SELECT a + b;
$$ LANGUAGE sql;

CREATE PROCEDURE app.limpar(dias integer) AS $$
BEGIN
    DELETE FROM app.log_evento WHERE dia < now() - dias * interval '1 day';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cliente_aud BEFORE INSERT OR UPDATE ON app.cliente
    FOR EACH ROW EXECUTE FUNCTION app.fn_auditar();
CREATE TRIGGER trg_pedido_aud AFTER DELETE ON app.pedido
    FOR EACH STATEMENT EXECUTE FUNCTION app.fn_auditar();
CREATE TRIGGER trg_pedido_cond AFTER UPDATE ON app.pedido
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION app.fn_auditar();

CREATE VIEW app.v_pedidos_pagos AS
    SELECT p.id, c.nome FROM app.pedido p JOIN app.cliente c ON c.id = p.cliente_id WHERE p.status = 'pago';

CREATE MATERIALIZED VIEW app.mv_total_cliente AS
    SELECT cliente_id, sum(total) AS total FROM app.pedido GROUP BY cliente_id;

CREATE VIEW v_sem_schema AS SELECT 1 AS um;
