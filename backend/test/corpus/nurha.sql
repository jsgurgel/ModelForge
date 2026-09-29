-- ============================================================
-- SCHEMAS
-- ============================================================

CREATE SCHEMA IF NOT EXISTS nurha_adm;
CREATE SCHEMA IF NOT EXISTS nurha_geo;

-- ============================================================
-- TABELAS ADMINISTRATIVAS
-- ============================================================

-- UF
CREATE TABLE nurha_adm.tb_uf (
    codigo SERIAL PRIMARY KEY,
    nome VARCHAR NOT NULL,
    sigla VARCHAR(2) NOT NULL UNIQUE
);
COMMENT ON TABLE nurha_adm.tb_uf IS 'Tabela de Unidades da Federação.';
COMMENT ON COLUMN nurha_adm.tb_uf.codigo IS 'Chave primária da UF.';
COMMENT ON COLUMN nurha_adm.tb_uf.nome IS 'Nome da Unidade da Federação.';
COMMENT ON COLUMN nurha_adm.tb_uf.sigla IS 'Sigla da Unidade da Federação.';

-- Município
CREATE TABLE nurha_adm.tb_municipio (
    codigo SERIAL PRIMARY KEY,
    nome VARCHAR NOT NULL,
    cd_ibge INTEGER NOT NULL UNIQUE,
    uf_codigo INTEGER NOT NULL,
    CONSTRAINT fk_municipio_uf FOREIGN KEY (uf_codigo)
        REFERENCES nurha_adm.tb_uf (codigo)
);
COMMENT ON TABLE nurha_adm.tb_municipio IS 'Tabela de municípios com código IBGE.';
COMMENT ON COLUMN nurha_adm.tb_municipio.codigo IS 'Chave primária do município.';
COMMENT ON COLUMN nurha_adm.tb_municipio.nome IS 'Nome do município.';
COMMENT ON COLUMN nurha_adm.tb_municipio.cd_ibge IS 'Código IBGE do município.';
COMMENT ON COLUMN nurha_adm.tb_municipio.uf_codigo IS 'Chave estrangeira para a UF.';

-- Bacia Hidrográfica
CREATE TABLE nurha_adm.tb_bacia (
    codigo SERIAL PRIMARY KEY,
    nome VARCHAR NOT NULL UNIQUE
);
COMMENT ON TABLE nurha_adm.tb_bacia IS 'Tabela de bacias hidrográficas.';
COMMENT ON COLUMN nurha_adm.tb_bacia.codigo IS 'Chave primária da bacia.';
COMMENT ON COLUMN nurha_adm.tb_bacia.nome IS 'Nome da bacia hidrográfica.';

-- Versão dos metadados
CREATE TABLE nurha_adm.tb_versao_metadados (
    codigo SERIAL PRIMARY KEY,
    instituicao_fonte_codigo INTEGER NOT NULL,
    descricao VARCHAR NOT NULL,
    escala_produto INTEGER NOT NULL,
    link_acesso VARCHAR NOT NULL,
    ano INTEGER NOT NULL
);
COMMENT ON TABLE nurha_adm.tb_versao_metadados IS
'Tabela que armazena as versões de metadados para controle histórico das camadas.';


-- ============================================================
-- TABELAS GEOGRÁFICAS (nurha_geo)
-- ============================================================

-- 1. Espelhos d'água (Polygon)
CREATE TABLE nurha_geo.tb_espelhos (
    codigo SERIAL PRIMARY KEY,
    nome VARCHAR,
    bacia_codigo INTEGER NOT NULL,
    municipio_codigo INTEGER NOT NULL,
    area_ha NUMERIC(12,2),
    ano INTEGER NOT NULL,
    versao_codigo INTEGER NOT NULL,
    geom GEOMETRY(POLYGON, 4326) NOT NULL,

    FOREIGN KEY (bacia_codigo) REFERENCES nurha_adm.tb_bacia(codigo),
    FOREIGN KEY (municipio_codigo) REFERENCES nurha_adm.tb_municipio(codigo),
    FOREIGN KEY (versao_codigo) REFERENCES nurha_adm.tb_versao_metadados(codigo)
);
COMMENT ON TABLE nurha_geo.tb_espelhos IS 'Espelhos d’água mapeados.';

-- 2. Aquicultura (Polygon)
CREATE TABLE nurha_geo.tb_aquicultura (
    codigo SERIAL PRIMARY KEY,
    bacia_codigo INTEGER NOT NULL,
    municipio_codigo INTEGER NOT NULL,
    area_ha NUMERIC(12,2),
    ano INTEGER NOT NULL,
    versao_codigo INTEGER NOT NULL,
    geom GEOMETRY(POLYGON, 4326) NOT NULL,

    FOREIGN KEY (bacia_codigo) REFERENCES nurha_adm.tb_bacia(codigo),
    FOREIGN KEY (municipio_codigo) REFERENCES nurha_adm.tb_municipio(codigo),
    FOREIGN KEY (versao_codigo) REFERENCES nurha_adm.tb_versao_metadados(codigo)
);
COMMENT ON TABLE nurha_geo.tb_aquicultura IS 'Áreas de aquicultura.';

-- 3. Cicatrizes de queimadas (Polygon)
CREATE TABLE nurha_geo.tb_cicatrizes_queimadas (
    codigo SERIAL PRIMARY KEY,
    bacia_codigo INTEGER NOT NULL,
    municipio_codigo INTEGER NOT NULL,
    area_ha NUMERIC(12,2),
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    versao_codigo INTEGER NOT NULL,
    geom GEOMETRY(POLYGON, 4326) NOT NULL,

    FOREIGN KEY (bacia_codigo) REFERENCES nurha_adm.tb_bacia(codigo),
    FOREIGN KEY (municipio_codigo) REFERENCES nurha_adm.tb_municipio(codigo),
    FOREIGN KEY (versao_codigo) REFERENCES nurha_adm.tb_versao_metadados(codigo)
);
COMMENT ON TABLE nurha_geo.tb_cicatrizes_queimadas IS 'Cicatrizes de queimadas mapeadas.';

-- 4. Edificações (Point)
CREATE TABLE nurha_geo.tb_edificacoes (
    codigo SERIAL PRIMARY KEY,
    bacia_codigo INTEGER NOT NULL,
    municipio_codigo INTEGER NOT NULL,
    cisterna BOOLEAN DEFAULT FALSE,
    ano INTEGER NOT NULL,
    versao_codigo INTEGER NOT NULL,
    geom GEOMETRY(POINT, 4326) NOT NULL,

    FOREIGN KEY (bacia_codigo) REFERENCES nurha_adm.tb_bacia(codigo),
    FOREIGN KEY (municipio_codigo) REFERENCES nurha_adm.tb_municipio(codigo),
    FOREIGN KEY (versao_codigo) REFERENCES nurha_adm.tb_versao_metadados(codigo)
);
COMMENT ON TABLE nurha_geo.tb_edificacoes IS 'Edificações mapeadas, podendo conter cisternas.';

-- 5. Caixas d'água (Point)
CREATE TABLE nurha_geo.tb_caixas_agua (
    codigo SERIAL PRIMARY KEY,
    bacia_codigo INTEGER NOT NULL,
    municipio_codigo INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    versao_codigo INTEGER NOT NULL,
    geom GEOMETRY(POINT, 4326) NOT NULL,

    FOREIGN KEY (bacia_codigo) REFERENCES nurha_adm.tb_bacia(codigo),
    FOREIGN KEY (municipio_codigo) REFERENCES nurha_adm.tb_municipio(codigo),
    FOREIGN KEY (versao_codigo) REFERENCES nurha_adm.tb_versao_metadados(codigo)
);
COMMENT ON TABLE nurha_geo.tb_caixas_agua IS 'Caixas d’água identificadas no território.';

-- 6. Áreas irrigadas (Polygon)
CREATE TABLE nurha_geo.tb_areas_irrigadas (
    codigo SERIAL PRIMARY KEY,
    bacia_codigo INTEGER NOT NULL,
    municipio_codigo INTEGER NOT NULL,
    area_ha NUMERIC(12,2),
    ano INTEGER NOT NULL,
    versao_codigo INTEGER NOT NULL,
    geom GEOMETRY(POLYGON, 4326) NOT NULL,

    FOREIGN KEY (bacia_codigo) REFERENCES nurha_adm.tb_bacia(codigo),
    FOREIGN KEY (municipio_codigo) REFERENCES nurha_adm.tb_municipio(codigo),
    FOREIGN KEY (versao_codigo) REFERENCES nurha_adm.tb_versao_metadados(codigo)
);
COMMENT ON TABLE nurha_geo.tb_areas_irrigadas IS 'Áreas irrigadas mapeadas.';

-- 7. Barragens (MultiLineString)
CREATE TABLE nurha_geo.tb_barragens (
    codigo SERIAL PRIMARY KEY,
    bacia_codigo INTEGER NOT NULL,
    municipio_codigo INTEGER NOT NULL,
    comp_m NUMERIC(12,2),
    ano INTEGER NOT NULL,
    versao_codigo INTEGER NOT NULL,
    geom GEOMETRY(MULTILINESTRING, 4326) NOT NULL,

    FOREIGN KEY (bacia_codigo) REFERENCES nurha_adm.tb_bacia(codigo),
    FOREIGN KEY (municipio_codigo) REFERENCES nurha_adm.tb_municipio(codigo),
    FOREIGN KEY (versao_codigo) REFERENCES nurha_adm.tb_versao_metadados(codigo)
);
COMMENT ON TABLE nurha_geo.tb_barragens IS 'Barragens mapeadas como feições lineares.';
