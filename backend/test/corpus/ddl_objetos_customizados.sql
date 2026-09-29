CREATE SCHEMA hidro;
CREATE DOMAIN hidro.dom_uf AS CHAR(2) DEFAULT 'CE' NOT NULL CHECK (VALUE IN ('CE','PI'));
CREATE DOMAIN dom_simples AS INTEGER;
CREATE TYPE hidro.situacao AS ENUM ('ativa', 'inativa', 'it''s');
CREATE TYPE cor AS ENUM ('vermelho', 'verde');
CREATE SEQUENCE hidro.seq_est START WITH 100 INCREMENT BY 5 MINVALUE 1 MAXVALUE 9999 CYCLE;
CREATE SEQUENCE seq_simples;
CREATE TABLE hidro.estacao (
  id INTEGER PRIMARY KEY DEFAULT nextval('hidro.seq_est'),
  uf hidro.dom_uf,
  sit hidro.situacao
);
CREATE VIEW hidro.vw_est AS SELECT id, uf FROM hidro.estacao;
CREATE MATERIALIZED VIEW vw_resumo AS SELECT count(*) AS total FROM hidro.estacao;
CREATE OR REPLACE FUNCTION hidro.media(p_ini date, p_fim date) RETURNS numeric(10,2) AS $$
BEGIN
  RETURN 1;
END;
$$ LANGUAGE plpgsql;
CREATE FUNCTION g() RETURNS text AS $corpo$
BEGIN
  EXECUTE $$ select 1 $$;
  RETURN 'x';
END;
$corpo$ LANGUAGE plpgsql;
CREATE PROCEDURE limpar(p_dias integer) AS $$ BEGIN END; $$ LANGUAGE plpgsql;
