CREATE TABLE medida (
    id bigint NOT NULL,
    dt date NOT NULL,
    valor numeric,
    PRIMARY KEY (id, dt)
) PARTITION BY RANGE (dt);

CREATE TABLE medida_2024 PARTITION OF medida FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE IF NOT EXISTS public.medida_2025 PARTITION OF public.medida
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01') PARTITION BY HASH (id);
CREATE TABLE medida_default PARTITION OF medida DEFAULT;
CREATE TABLE medida_semlimite PARTITION OF medida;
CREATE TABLE lista (
    id int,
    pais text
) PARTITION BY LIST (pais);
CREATE TABLE lista_br PARTITION OF lista FOR VALUES IN ('BR', 'PT');

CREATE TABLE pessoa (id serial PRIMARY KEY, nome text);
CREATE TABLE cidadao (cpf text) INHERITS (pessoa);
CREATE TABLE multi (x int) INHERITS (pessoa, cidadao);
CREATE TABLE sch.filho (y int) INHERITS (sch.pai);
