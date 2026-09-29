CREATE TABLE hidro.estacao (
  id INTEGER PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(80) DEFAULT 'sem nome' NOT NULL,
  ativo BOOLEAN DEFAULT true,
  criado TIMESTAMP DEFAULT now(),
  CONSTRAINT ck_nome CHECK (length(nome) > 2),
  CHECK (id > 0)
);
CREATE TABLE geo.municipio (
  uf CHAR(2),
  cod INTEGER,
  nome VARCHAR(60),
  PRIMARY KEY (uf, cod),
  UNIQUE (uf, nome)
);
CREATE TABLE hidro.medicao (
  id BIGINT,
  estacao_id INTEGER NOT NULL,
  uf CHAR(2),
  cod INTEGER,
  valor NUMERIC(10,2) DEFAULT 0,
  CONSTRAINT pk_medicao PRIMARY KEY (id),
  CONSTRAINT uq_medicao UNIQUE (estacao_id, valor),
  CONSTRAINT fk_med_est FOREIGN KEY (estacao_id) REFERENCES hidro.estacao (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  FOREIGN KEY (uf, cod) REFERENCES geo.municipio (uf, cod) ON DELETE SET NULL
);
CREATE TABLE avulsa (
  id INTEGER,
  ref INTEGER,
  x INTEGER,
  FOREIGN KEY (ref) REFERENCES avulsa (id) ON UPDATE CASCADE
);
ALTER TABLE avulsa ADD CONSTRAINT pk_avulsa PRIMARY KEY (id);
ALTER TABLE avulsa ADD CONSTRAINT uq_avulsa_x UNIQUE (x);
