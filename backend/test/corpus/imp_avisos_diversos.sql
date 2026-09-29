CREATE TABLE t_as AS SELECT (1);
CREATE TEMPORARY TABLE tmp1 (id int PRIMARY KEY, nome text);
CREATE TABLE ok1 (
  id int PRIMARY KEY,
  "coluna com espaco" int,
  `crase` int,
  [colchete] int,
  soum,
  tipo_composto double precision NOT NULL DEFAULT (1 + 2),
  ts timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  jsonb_col jsonb DEFAULT '{"a": [1, 2]}'::jsonb,
  arr integer[] DEFAULT '{}',
  ident int GENERATED ALWAYS AS IDENTITY,
  gen int GENERATED ALWAYS AS (id * 2) STORED
);
CREATE TABLE ok1 (id int);
CREATE TABLE OK1 (dup int);
COMMENT ON COLUMN ok1.id IS 'com ''aspas'' e; ponto e virgula';
COMMENT ON COLUMN ok1.id IS sem_aspas;
COMMENT ON TABLE ok1 IS NULL;
COMMENT ON TABLE ok1 IS 'ultimo';
