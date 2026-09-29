CREATE SCHEMA app;
CREATE TYPE app.status AS ENUM ('ativo', 'inativo', 'it''s pending');
CREATE TYPE app.par AS (a integer, b text);
CREATE TYPE app.faixa AS RANGE (subtype = int4);
CREATE DOMAIN app.cpf AS varchar(14) NOT NULL DEFAULT '000.000.000-00' CHECK (VALUE ~ '^[0-9.-]+$');
CREATE DOMAIN positivo integer CHECK (VALUE > 0);
CREATE SEQUENCE IF NOT EXISTS app.seq_usuario INCREMENT BY 5 START WITH 100 MINVALUE 1 MAXVALUE 99999 CYCLE;
CREATE SEQUENCE seq_simples;
CREATE SEQUENCE seq_neg INCREMENT -1 NO MINVALUE NO MAXVALUE NO CYCLE;

CREATE TABLE app.usuario (
    id integer PRIMARY KEY,
    nome text NOT NULL,
    situacao app.status DEFAULT 'ativo'
);

CREATE TABLE app.perfil (
    id integer PRIMARY KEY,
    usuario_id integer REFERENCES app.usuario (id)
);

CREATE VIEW app.v_usuario AS SELECT id, nome FROM app.usuario WHERE situacao = 'ativo';
CREATE OR REPLACE VIEW v_perfil AS
  SELECT p.id, u.nome
    FROM app.perfil p
    JOIN app.usuario u ON u.id = p.usuario_id;
CREATE MATERIALIZED VIEW app.mv_resumo AS SELECT count(*) AS total FROM app.usuario;
CREATE VIEW sem_as SELECT 1;

CREATE OR REPLACE FUNCTION app.soma(a integer, b numeric(10,2) DEFAULT 0)
RETURNS numeric AS $$
DECLARE
  r numeric;
BEGIN
  -- comentario no corpo; com ponto e virgula
  r := a + b; /* outro */
  ALTER TABLE app.usuario ADD CONSTRAINT nao_deve_criar CHECK (id > 0);
  RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION app.trg_audit() RETURNS trigger AS $body$
BEGIN
  INSERT INTO log VALUES (NEW.id);
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

CREATE PROCEDURE app.limpar(IN dias integer)
LANGUAGE sql
AS $$
  DELETE FROM app.usuario WHERE id < dias;
$$;

CREATE FUNCTION app.velha() RETURNS integer AS 'select 1' LANGUAGE sql;

CREATE TRIGGER trg_usuario_audit AFTER INSERT OR UPDATE OF nome ON app.usuario
  FOR EACH ROW WHEN (NEW.nome IS NOT NULL) EXECUTE FUNCTION app.trg_audit();
CREATE TRIGGER trg_stmt BEFORE DELETE ON app.perfil FOR EACH STATEMENT EXECUTE PROCEDURE app.limpar(1);
CREATE CONSTRAINT TRIGGER trg_c AFTER INSERT ON app.perfil DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.trg_audit();
CREATE TRIGGER trg_orfao BEFORE INSERT ON nao_existe EXECUTE FUNCTION f();
CREATE TRIGGER trg_ruim ON usuario;

CREATE INDEX idx_usuario_nome ON app.usuario (nome);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_usuario_lower ON app.usuario USING btree (lower(nome), id DESC NULLS LAST);
CREATE INDEX ON app.perfil (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX idx_fantasma ON fantasma (a);
CREATE INDEX idx_expr ON app.usuario ((id * 2));
CREATE INDEX idx_ruim;
CREATE RULE r AS ON UPDATE TO app.usuario DO INSTEAD NOTHING;
