CREATE TABLE estacao (
  id INTEGER PRIMARY KEY,
  nome VARCHAR(80),
  cidade VARCHAR(80),
  ativo BOOLEAN
);
CREATE INDEX idx_estacao_nome ON estacao (nome);
CREATE UNIQUE INDEX uq_estacao_nome_cidade ON estacao (nome, cidade);
CREATE INDEX ON estacao USING hash (cidade);
CREATE INDEX idx_ativas ON estacao USING btree (nome) WHERE ativo = true;
CREATE INDEX estacao_lower ON estacao (cidade, nome);
CREATE FUNCTION auditar() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_aud AFTER INSERT OR DELETE ON estacao FOR EACH ROW EXECUTE FUNCTION auditar();
CREATE TRIGGER BEFORE UPDATE ON estacao FOR EACH STATEMENT EXECUTE FUNCTION auditar();
CREATE TRIGGER trg_cond BEFORE UPDATE ON estacao FOR EACH ROW WHEN (OLD.nome IS DISTINCT FROM NEW.nome) EXECUTE FUNCTION auditar();
