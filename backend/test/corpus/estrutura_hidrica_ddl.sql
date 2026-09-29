-- =============================================================================
-- DDL — Módulo Estrutura Hídrica
-- Schema: db_sit_estrutura_hidrica
-- =============================================================================

BEGIN;

-- ── Lookup: validação ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_status_validacao
(
    codigo    smallint                    NOT NULL,
    descricao character varying(50)       NOT NULL,
    CONSTRAINT tb_status_validacao_pkey PRIMARY KEY (codigo)
);

-- ── Lookup: justificativa ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_justificativa_aplicavel
(
    codigo    smallint               NOT NULL,
    descricao character varying(50)  NOT NULL,
    CONSTRAINT tb_justificativa_aplicavel_pkey PRIMARY KEY (codigo)
);

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_justificativa
(
    codigo           serial                      NOT NULL,
    descricao        character varying(255)      NOT NULL,
    aplicavel_a_codigo smallint                  NOT NULL,
    ativo            boolean                     NOT NULL DEFAULT true,
    CONSTRAINT tb_justificativa_pkey PRIMARY KEY (codigo)
);

-- ── Entidade de validação (usada por geom, históricos) ────────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_validacao
(
    codigo                    bigserial               NOT NULL,
    status_validacao_codigo   smallint                NOT NULL DEFAULT 0,
    validador_usuario_codigo  integer,
    data_validacao            timestamp without time zone,
    justificativa_codigo      integer,
    detalhes                  text,
    CONSTRAINT tb_validacao_pkey PRIMARY KEY (codigo)
);

-- ── Lookup: tipo de estrutura, jurisdição ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_estrutura_tipo
(
    codigo    serial                  NOT NULL,
    nome      character varying(100)  NOT NULL,
    descricao text,
    CONSTRAINT tb_estrutura_tipo_pkey PRIMARY KEY (codigo)
);

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_estrutura_jurisdicao
(
    codigo    serial                  NOT NULL,
    descricao character varying(100)  NOT NULL,
    CONSTRAINT tb_estrutura_jurisdicao_pkey PRIMARY KEY (codigo)
);

-- ── Atributos e regras por tipo × fonte ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_atributo
(
    codigo          serial                  NOT NULL,
    nome            character varying(255)  NOT NULL,
    descricao       text,
    unidade_medicao character varying(50),
    CONSTRAINT tb_atributo_pkey PRIMARY KEY (codigo)
);

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_fonte
(
    codigo             serial                  NOT NULL,
    instituicao_codigo integer                 NOT NULL,
    nome               character varying(200),
    descricao          text,
    CONSTRAINT tb_fonte_pkey PRIMARY KEY (codigo)
);

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_estrutura_atributos_por_tipo_e_fonte
(
    codigo               bigserial  NOT NULL,
    tipo_estrutura_codigo integer   NOT NULL,
    atributo_codigo      integer    NOT NULL,
    fonte_codigo         integer    NOT NULL,
    obrigatorio          boolean    DEFAULT false,
    CONSTRAINT tb_estrutura_atributos_por_tipo_e_fonte_pkey PRIMARY KEY (codigo)
);

-- ── Sistema (hierarquia de sistemas hídricos) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_sistema
(
    codigo             bigserial               NOT NULL,
    nome               character varying(255)  NOT NULL,
    descricao          text,
    ativo              boolean                 NOT NULL DEFAULT true,
    sistema_pai_codigo bigint,
    data_insercao      timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tb_sistema_pkey PRIMARY KEY (codigo)
);

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_sistema_historico
(
    codigo          bigserial                   NOT NULL,
    sistema_codigo  bigint                      NOT NULL,
    campo           character varying(100)      NOT NULL,
    valor           text,
    usuario_codigo  integer,
    data_insercao   timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validacao_codigo bigint,
    CONSTRAINT tb_sistema_historico_pkey PRIMARY KEY (codigo)
);

-- ── Estrutura hídrica canônica ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_estrutura_hidrica
(
    codigo                bigserial                   NOT NULL,
    tipo_estrutura_codigo integer                     NOT NULL,
    sistema_codigo        bigint,
    data_insercao         timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tb_estrutura_hidrica_pkey PRIMARY KEY (codigo)
);

-- ── Geometria (standalone — compartilhável entre fontes) ──────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_estrutura_geom
(
    codigo           bigserial                   NOT NULL,
    usuario_codigo   integer,
    data_insercao    timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    geom             geometry                    NOT NULL,
    validacao_codigo bigint,
    CONSTRAINT tb_estrutura_geom_pkey PRIMARY KEY (codigo)
);

CREATE INDEX IF NOT EXISTS idx_estrutura_geom
    ON db_sit_estrutura_hidrica.tb_estrutura_geom USING GIST (geom);

-- ── Registro por fonte (mesma estrutura pode ter N fontes) ────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_estrutura_hidrica_fonte
(
    codigo         bigserial                   NOT NULL,
    estrutura_codigo bigint                    NOT NULL,
    geom_codigo    bigint,
    fonte_codigo   integer                     NOT NULL,
    codigo_origem  character varying(255),
    nome           character varying(255),
    jurisd_codigo  integer,
    data_criacao   date,
    data_insercao  timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tb_estrutura_hidrica_fonte_pkey PRIMARY KEY (codigo)
);

-- ── Histórico de atributos por fonte ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS db_sit_estrutura_hidrica.tb_estrutura_fonte_historico
(
    codigo                bigserial                   NOT NULL,
    estrutura_fonte_codigo bigint                     NOT NULL,
    atributo_tipo_fonte   bigint                      NOT NULL,
    valor                 text                        NOT NULL,
    usuario_codigo        integer,
    data_insercao         timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validacao_codigo      bigint,
    CONSTRAINT tb_estrutura_fonte_historico_pkey PRIMARY KEY (codigo)
);

-- ── Foreign Keys ──────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_justificativa
    ADD CONSTRAINT fk_justificativa_aplicavel FOREIGN KEY (aplicavel_a_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_justificativa_aplicavel (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_validacao
    ADD CONSTRAINT fk_validacao_status FOREIGN KEY (status_validacao_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_status_validacao (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_validacao
    ADD CONSTRAINT fk_validacao_justificativa FOREIGN KEY (justificativa_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_justificativa (codigo)
    ON UPDATE NO ACTION ON DELETE SET NULL;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_atributos_por_tipo_e_fonte
    ADD CONSTRAINT fk_eta_tipo FOREIGN KEY (tipo_estrutura_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_estrutura_tipo (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_atributos_por_tipo_e_fonte
    ADD CONSTRAINT fk_eta_atributo FOREIGN KEY (atributo_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_atributo (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_atributos_por_tipo_e_fonte
    ADD CONSTRAINT fk_eta_fonte FOREIGN KEY (fonte_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_fonte (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_sistema
    ADD CONSTRAINT fk_sistema_pai FOREIGN KEY (sistema_pai_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_sistema (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_sistema_historico
    ADD CONSTRAINT fk_sistema_historico FOREIGN KEY (sistema_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_sistema (codigo)
    ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_sistema_historico
    ADD CONSTRAINT fk_sistema_historico_validacao FOREIGN KEY (validacao_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_validacao (codigo)
    ON UPDATE NO ACTION ON DELETE SET NULL;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_hidrica
    ADD CONSTRAINT fk_estrutura_tipo FOREIGN KEY (tipo_estrutura_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_estrutura_tipo (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_hidrica
    ADD CONSTRAINT fk_estrutura_sistema FOREIGN KEY (sistema_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_sistema (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_geom
    ADD CONSTRAINT fk_estrutura_geom_validacao FOREIGN KEY (validacao_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_validacao (codigo)
    ON UPDATE NO ACTION ON DELETE SET NULL;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_hidrica_fonte
    ADD CONSTRAINT fk_estrutura_fonte_estrutura FOREIGN KEY (estrutura_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_estrutura_hidrica (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_hidrica_fonte
    ADD CONSTRAINT fk_estrutura_fonte_geom FOREIGN KEY (geom_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_estrutura_geom (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_hidrica_fonte
    ADD CONSTRAINT fk_estrutura_fonte_fonte FOREIGN KEY (fonte_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_fonte (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_hidrica_fonte
    ADD CONSTRAINT fk_estrutura_fonte_jurisdicao FOREIGN KEY (jurisd_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_estrutura_jurisdicao (codigo)
    ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_fonte_historico
    ADD CONSTRAINT fk_historico_fonte FOREIGN KEY (estrutura_fonte_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_estrutura_hidrica_fonte (codigo)
    ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_fonte_historico
    ADD CONSTRAINT fk_historico_atributo_tipo_fonte FOREIGN KEY (atributo_tipo_fonte)
    REFERENCES db_sit_estrutura_hidrica.tb_estrutura_atributos_por_tipo_e_fonte (codigo)
    ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE IF EXISTS db_sit_estrutura_hidrica.tb_estrutura_fonte_historico
    ADD CONSTRAINT fk_historico_validacao FOREIGN KEY (validacao_codigo)
    REFERENCES db_sit_estrutura_hidrica.tb_validacao (codigo)
    ON UPDATE NO ACTION ON DELETE SET NULL;

END;
