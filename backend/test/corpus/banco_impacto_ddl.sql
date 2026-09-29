-- 1) schema
CREATE SCHEMA IF NOT EXISTS impactos;

-- 2) formulários / origem dos dados
CREATE TABLE impactos.tb_impactos_seca (
  codigo BIGSERIAL PRIMARY KEY,
  municipio_codigo INTEGER NOT NULL,  -- código IBGE de 7 dígitos; futuro: FK para adm.tb_municipio
  data_referencia DATE NOT NULL,
  data_insercao TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  CONSTRAINT uq_impacto_municipio_data UNIQUE (municipio_codigo, data_referencia)
);
CREATE TABLE impactos.tb_registro_qualidade (
  codigo BIGSERIAL PRIMARY KEY,
  descricao VARCHAR(120) NOT NULL UNIQUE
);
-- tabela com a tradução dos valores de percepção de seca
CREATE TABLE impactos.tb_descricao_percepcao_seca (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);
CREATE TABLE impactos.tb_descricao_qnt_chuva (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);
CREATE TABLE impactos.tb_descricao_dt_chuva (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);
CREATE TABLE impactos.tb_descricao_de_chuva (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);
-- (As tabelas de descrição acima já foram definidas; evita duplicação)
CREATE TABLE impactos.tb_descricao_sit_cultura (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);
CREATE TABLE impactos.tb_descricao_acesso_agua (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);
CREATE TABLE impactos.tb_descricao_restricoes_agua (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);
CREATE TABLE impactos.tb_descricao_cultura (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);
CREATE TABLE impactos.tb_registro (
  codigo BIGSERIAL PRIMARY KEY,
  impacto_codigo BIGINT NOT NULL REFERENCES impactos.tb_impactos_seca(codigo) ON DELETE CASCADE,
  percepcao_seca SMALLINT REFERENCES impactos.tb_descricao_percepcao_seca(codigo),
  qnt_chuva SMALLINT REFERENCES impactos.tb_descricao_qnt_chuva(codigo),
  dt_chuva SMALLINT REFERENCES impactos.tb_descricao_dt_chuva(codigo),
  de_chuva SMALLINT REFERENCES impactos.tb_descricao_de_chuva(codigo),
  sit_cultura SMALLINT REFERENCES impactos.tb_descricao_sit_cultura(codigo),
  acesso_agua SMALLINT REFERENCES impactos.tb_descricao_acesso_agua(codigo),
  observacao TEXT,
  qualidade_dados SMALLINT NOT NULL, -- 0 = Sem Problemas; 1 = Ausência de dados / inconsistências; 9 = Dados ruins, inconsistências evidentes
  criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_registro_impacto UNIQUE (impacto_codigo)  -- um registro por entrada de tb_impactos_seca
);

CREATE TABLE impactos.tb_registro_cultura (
  codigo BIGSERIAL PRIMARY KEY,
  registro_codigo BIGINT NOT NULL REFERENCES impactos.tb_registro(codigo) ON DELETE CASCADE,
  cultura_codigo SMALLINT NOT NULL REFERENCES impactos.tb_descricao_cultura(codigo) ON DELETE CASCADE,
  CONSTRAINT uq_registro_cultura UNIQUE (registro_codigo, cultura_codigo)  -- sem culturas duplicadas por registro
);

CREATE TABLE impactos.tb_registro_outras_culturas (
  codigo BIGSERIAL PRIMARY KEY,
  registro_codigo BIGINT NOT NULL REFERENCES impactos.tb_registro(codigo) ON DELETE CASCADE,
  descricao TEXT NOT NULL
);

-- Trigger to prevent antagonistic choices for tipos_culturas:
-- if a registro has the special code for 'nao_informacao' (expected -1), it must be the only cultura for that registro.
CREATE OR REPLACE FUNCTION impactos.fn_check_culturas_exclusive() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  nao_info_code SMALLINT := -1;
  exists_other INTEGER;
BEGIN
  -- Inserting/Updating a cultura for a registro
  IF (NEW.cultura_codigo = nao_info_code) THEN
    -- ensure there is no other cultura for this registro
    SELECT 1 INTO exists_other FROM impactos.tb_registro_cultura rc WHERE rc.registro_codigo = NEW.registro_codigo AND rc.cultura_codigo IS DISTINCT FROM nao_info_code LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Cannot add ''nao_informacao'' cultura when other culturas exist for registro %', NEW.registro_codigo;
    END IF;
  ELSE
    -- ensure there is no existing 'nao_informacao' for this registro
    SELECT 1 INTO exists_other FROM impactos.tb_registro_cultura rc WHERE rc.registro_codigo = NEW.registro_codigo AND rc.cultura_codigo = nao_info_code LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Cannot add other cultura when ''nao_informacao'' is present for registro %', NEW.registro_codigo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_culturas_exclusive
BEFORE INSERT OR UPDATE ON impactos.tb_registro_cultura
FOR EACH ROW EXECUTE FUNCTION impactos.fn_check_culturas_exclusive();

-- Comentário de documentação: municipio_codigo pode conter códigos IBGE reais (7 dígitos)
-- ou pseudo-códigos no intervalo 5390001-5390035, reservados para as 35 Regiões
-- Administrativas (RAs) do Distrito Federal, que possui apenas 1 município IBGE
-- (5300108 - Brasília). Esses pseudo-códigos existem em adm.tb_municipio com uf_codigo=53.
COMMENT ON COLUMN impactos.tb_impactos_seca.municipio_codigo IS
  'Código IBGE do município (7 dígitos). Exceção: Distrito Federal usa pseudo-códigos '
  '5390001–5390035 para identificar individualmente cada uma das 35 Regiões Administrativas '
  '(RAs), já que o DF possui apenas 1 município IBGE (5300108). Esses pseudo-códigos estão '
  'cadastrados em adm.tb_municipio com uf_codigo = 53.';

CREATE INDEX IF NOT EXISTS idx_impacto_municipio ON impactos.tb_impactos_seca(municipio_codigo);
CREATE INDEX IF NOT EXISTS idx_impacto_data ON impactos.tb_impactos_seca(data_referencia);
-- uq_impacto_municipio_data já serve como índice composto (municipio_codigo, data_referencia)
-- uq_registro_impacto já serve como índice em tb_registro(impacto_codigo)
-- uq_registro_cultura já serve como índice composto (registro_codigo, cultura_codigo)
CREATE INDEX IF NOT EXISTS idx_outras_culturas_registro ON impactos.tb_registro_outras_culturas(registro_codigo);
-- uq_registro_impacto_atividade já cobre (registro_codigo, impacto_codigo)
-- uq_registro_restricao_agua já cobre (registro_codigo, restricao_codigo)

-- Tabelas para normalizar impactos agropecuários (multi-select)
CREATE TABLE impactos.tb_descricao_impactos_agropecuaria (
  codigo SMALLINT PRIMARY KEY,
  codigo_alpha VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT NOT NULL UNIQUE
);

CREATE TABLE impactos.tb_registro_impacto_atividade (
  codigo BIGSERIAL PRIMARY KEY,
  registro_codigo BIGINT NOT NULL REFERENCES impactos.tb_registro(codigo) ON DELETE CASCADE,
  impacto_codigo SMALLINT NOT NULL REFERENCES impactos.tb_descricao_impactos_agropecuaria(codigo) ON DELETE CASCADE,
  UNIQUE(registro_codigo, impacto_codigo)
);


-- =============================================================================
-- COMENTÁRIOS DE DOCUMENTAÇÃO
-- Gerados com base no Formulário Mínimo Padrão de Observação de Impactos
-- Decorrentes de Secas (formulario_impacto_secas.html).
-- =============================================================================

-- ── Schema ────────────────────────────────────────────────────────────────────
COMMENT ON SCHEMA impactos IS
  'Schema que armazena os dados coletados pelo Formulário Mínimo Padrão de '
  'Observação de Impactos Decorrentes de Secas, incluindo tabelas de domínio, '
  'registros de observação e tabelas de junção para campos multi-seleção.';

-- ── tb_impactos_seca ──────────────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_impactos_seca IS
  'Cabeçalho de cada envio de formulário. Representa uma observação de impacto '
  'de seca para um município (ou Região Administrativa do DF) em um determinado '
  'mês/ano de referência. A combinação (municipio_codigo, data_referencia) é única.';

COMMENT ON COLUMN impactos.tb_impactos_seca.codigo IS
  'Chave primária surrogate gerada automaticamente.';
-- COMMENT ON COLUMN impactos.tb_impactos_seca.municipio_codigo já existe abaixo (mantido).
COMMENT ON COLUMN impactos.tb_impactos_seca.data_referencia IS
  'Primeiro dia do mês de observação (ex.: 2024-03-01 para março/2024). '
  'Derivado dos campos "Mês de Observação" e "Ano de Observação" do formulário.';
COMMENT ON COLUMN impactos.tb_impactos_seca.data_insercao IS
  'Timestamp de inserção da linha no banco, preenchido automaticamente via DEFAULT now().';

-- ── tb_registro_qualidade ─────────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_registro_qualidade IS
  'Domínio das classificações de qualidade dos dados de um registro. '
  'Valores esperados: "0 - Sem Problemas", "1 - Ausência de dados / inconsistências", '
  '"9 - Dados ruins, inconsistências evidentes".';

COMMENT ON COLUMN impactos.tb_registro_qualidade.codigo IS
  'Chave primária surrogate.';
COMMENT ON COLUMN impactos.tb_registro_qualidade.descricao IS
  'Descrição legível da classificação de qualidade (única).';

-- ── tb_descricao_percepcao_seca ───────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_percepcao_seca IS
  'Domínio da pergunta 1 do formulário: "Considerando o quadro de seca na sua '
  'região, comparado com o mês anterior, você diria que:". '
  'Valores: 1=melhora, 2=piora, 3=nao_alteracao, 4=nao_seca, -1=nao_opinar.';

COMMENT ON COLUMN impactos.tb_descricao_percepcao_seca.codigo IS
  'Código numérico. -1 = "Não sei opinar" (valor especial de ausência de informação).';
COMMENT ON COLUMN impactos.tb_descricao_percepcao_seca.codigo_alpha IS
  'Valor string usado pelo formulário HTML (atributo value do <option>). '
  'Ex.: "melhora", "piora", "nao_alteracao", "nao_seca", "nao_opinar".';
COMMENT ON COLUMN impactos.tb_descricao_percepcao_seca.descricao IS
  'Rótulo legível exibido no formulário. Ex.: "Houve melhora", "Houve piora".';

-- ── tb_descricao_qnt_chuva ────────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_qnt_chuva IS
  'Domínio da pergunta 2a do formulário: "Quanto à quantidade de chuva observada". '
  'Valores: 0=nao_choveu, 1=pouca_chuva, 2=razoavel, 3=muita_chuva, -1=nao_avaliar.';

COMMENT ON COLUMN impactos.tb_descricao_qnt_chuva.codigo IS
  'Código numérico. 0 = "Não choveu"; -1 = "Não sei avaliar".';
COMMENT ON COLUMN impactos.tb_descricao_qnt_chuva.codigo_alpha IS
  'Valor string do formulário. Ex.: "nao_choveu", "pouca_chuva", "razoavel", '
  '"muita_chuva", "nao_avaliar".';
COMMENT ON COLUMN impactos.tb_descricao_qnt_chuva.descricao IS
  'Rótulo legível. Ex.: "Pouca chuva", "Razoável", "Muita chuva".';

-- ── tb_descricao_dt_chuva ─────────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_dt_chuva IS
  'Domínio da pergunta 2b do formulário: "Quanto à distribuição temporal da chuva". '
  'Valores: 0=nao_choveu, 1=poucos_dias, 2=maior_parte_mes, -1=nao_avaliar.';

COMMENT ON COLUMN impactos.tb_descricao_dt_chuva.codigo IS
  'Código numérico. 0 = "Não choveu"; -1 = "Não sei avaliar".';
COMMENT ON COLUMN impactos.tb_descricao_dt_chuva.codigo_alpha IS
  'Valor string do formulário. Ex.: "nao_choveu", "poucos_dias", "maior_parte_mes", "nao_avaliar".';
COMMENT ON COLUMN impactos.tb_descricao_dt_chuva.descricao IS
  'Rótulo legível. Ex.: "Choveu em poucos dias", "Choveu na maior parte do mês".';

-- ── tb_descricao_de_chuva ─────────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_de_chuva IS
  'Domínio da pergunta 2c do formulário: "Quanto à distribuição espacial da chuva". '
  'Valores: 0=nao_choveu, 1=isolada, 2=abrangente, -1=nao_avaliar.';

COMMENT ON COLUMN impactos.tb_descricao_de_chuva.codigo IS
  'Código numérico. 0 = "Não choveu"; -1 = "Não sei avaliar".';
COMMENT ON COLUMN impactos.tb_descricao_de_chuva.codigo_alpha IS
  'Valor string do formulário. Ex.: "nao_choveu", "isolada", "abrangente", "nao_avaliar".';
COMMENT ON COLUMN impactos.tb_descricao_de_chuva.descricao IS
  'Rótulo legível. Ex.: "Choveu de forma isolada, em poucas localidades da região (ou município)".';

-- ── tb_descricao_sit_cultura ──────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_sit_cultura IS
  'Domínio da pergunta 3 do formulário: "Sobre as culturas de sequeiro, como você '
  'caracterizaria a situação dos principais cultivos na sua região?". '
  'Valores: 1=nao_epoca_plantio, 2=plantio_atrasado, 3=nenhuma_perda, '
  '4=algumas_perdas, 5=grandes_perdas, 6=provavel_perdas, -1=nao_informacao.';

COMMENT ON COLUMN impactos.tb_descricao_sit_cultura.codigo IS
  'Código numérico. -1 = "Não tenho essa informação".';
COMMENT ON COLUMN impactos.tb_descricao_sit_cultura.codigo_alpha IS
  'Valor string do formulário. Ex.: "nao_epoca_plantio", "plantio_atrasado", '
  '"nenhuma_perda", "algumas_perdas", "grandes_perdas", "provavel_perdas", "nao_informacao".';
COMMENT ON COLUMN impactos.tb_descricao_sit_cultura.descricao IS
  'Rótulo legível. Ex.: "Algumas perdas foram registradas", "Grandes perdas foram registradas".';

-- ── tb_descricao_acesso_agua ──────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_acesso_agua IS
  'Domínio da pergunta 6 do formulário: "Como você avaliaria a situação do acesso '
  'à água para consumo humano e animal na sua região?". '
  'Valores: 1=niveis_acima_normalidade, 2=niveis_normais, 3=niveis_decrescentes, '
  '4=niveis_baixos, 5=niveis_criticamente_baixos, 6=sistemas_hidricos_colapso, -1=nao_informacao.';

COMMENT ON COLUMN impactos.tb_descricao_acesso_agua.codigo IS
  'Código numérico. -1 = "Não tenho essa informação". Ordem crescente de severidade hídrica.';
COMMENT ON COLUMN impactos.tb_descricao_acesso_agua.codigo_alpha IS
  'Valor string do formulário. Ex.: "niveis_normais", "niveis_baixos", '
  '"niveis_criticamente_baixos", "sistemas_hidricos_colapso".';
COMMENT ON COLUMN impactos.tb_descricao_acesso_agua.descricao IS
  'Rótulo legível. Ex.: "Níveis baixos", "Sistemas hídricos em colapso".';

-- ── tb_descricao_restricoes_agua ──────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_restricoes_agua IS
  'Domínio da pergunta 7 do formulário: "Relate as restrições de uso da água, '
  'em decorrência da seca, presentes na sua região" (múltipla escolha). '
  '0=sem_restricoes (exclusivo), -1=nao_informacao (exclusivo). '
  'Demais valores representam restrições combinadas (1-14).';

COMMENT ON COLUMN impactos.tb_descricao_restricoes_agua.codigo IS
  'Código numérico. 0 = "Sem restrições" (exclusivo); -1 = "Não tenho essa informação" (exclusivo). '
  'Valores 1–14 são restrições que podem ser combinadas para o mesmo registro.';
COMMENT ON COLUMN impactos.tb_descricao_restricoes_agua.codigo_alpha IS
  'Valor string do formulário. Ex.: "sem_restricoes", "dificuldade_captacao_agua", '
  '"racionamento_rodizio_abastecimento_publico", "navegacao_gravemente_comprometida".';
COMMENT ON COLUMN impactos.tb_descricao_restricoes_agua.descricao IS
  'Rótulo legível. Ex.: "Dificuldade na captação de água", '
  '"Escassez crítica de água (para uso humano ou dessedentação animal)".';

-- ── tb_descricao_cultura ──────────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_cultura IS
  'Domínio da pergunta 4 do formulário: "Indique qual ou quais tipos de culturas '
  'de sequeiro mais afetadas" (múltipla escolha). '
  '-1=nao_informacao (exclusivo). Valores 1–7: culturas predefinidas; 8=outra. '
  'Quando código 8 ("outra") é selecionado, os textos livres são armazenados em '
  'tb_registro_outras_culturas.';

COMMENT ON COLUMN impactos.tb_descricao_cultura.codigo IS
  'Código numérico. -1 = "Não tenho essa informação" (exclusivo com demais). '
  '8 = "Outra" (texto livre registrado em tb_registro_outras_culturas).';
COMMENT ON COLUMN impactos.tb_descricao_cultura.codigo_alpha IS
  'Valor string do formulário. Ex.: "arroz", "feijao", "milho", "soja", "outra", "nao_informacao".';
COMMENT ON COLUMN impactos.tb_descricao_cultura.descricao IS
  'Rótulo legível. Ex.: "Arroz", "Cana-de-açúcar", "Feijão", "Milho", "Soja", "Trigo".';

-- ── tb_descricao_impactos_agropecuaria ────────────────────────────────────────
COMMENT ON TABLE impactos.tb_descricao_impactos_agropecuaria IS
  'Domínio da pergunta 5 do formulário: "Assinale os impactos na atividade '
  'agropecuária, em decorrência das secas" (múltipla escolha). '
  '0=sem_impactos (exclusivo), -1=nao_informacao (exclusivo). '
  'Valores 1–9 são impactos que podem ser combinados para o mesmo registro.';

COMMENT ON COLUMN impactos.tb_descricao_impactos_agropecuaria.codigo IS
  'Código numérico. 0 = "Não há impactos" (exclusivo); -1 = "Não tenho essa informação" (exclusivo). '
  'Valores 1–9 são impactos combinados por registro.';
COMMENT ON COLUMN impactos.tb_descricao_impactos_agropecuaria.codigo_alpha IS
  'Valor string do formulário. Ex.: "sem_impactos", "perda_qualidade_forragem", '
  '"morte_gado", "mortandade_peixes", "proibicao_queima_controlada".';
COMMENT ON COLUMN impactos.tb_descricao_impactos_agropecuaria.descricao IS
  'Rótulo legível. Ex.: "Perda da qualidade da forragem", "Redução da produção leiteira", '
  '"Grave insegurança alimentar em comunidades rurais".';

-- ── tb_registro ───────────────────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_registro IS
  'Linha principal de respostas de cada formulário preenchido. Há exatamente '
  'um registro por entrada de tb_impactos_seca (constraint uq_registro_impacto). '
  'Armazena as respostas de seleção única (percepcao_seca, chuvas, sit_cultura, '
  'acesso_agua) e o texto livre de observações. Respostas de múltipla escolha '
  'ficam em tabelas de junção: tb_registro_cultura, tb_registro_impacto_atividade '
  'e tb_registro_restricao_agua.';

COMMENT ON COLUMN impactos.tb_registro.codigo IS
  'Chave primária surrogate.';
COMMENT ON COLUMN impactos.tb_registro.impacto_codigo IS
  'FK para tb_impactos_seca. Identifica o cabeçalho (município + período) ao qual '
  'este registro pertence.';
COMMENT ON COLUMN impactos.tb_registro.percepcao_seca IS
  'Resposta da pergunta 1: percepção da seca comparada ao mês anterior. '
  'FK para tb_descricao_percepcao_seca. '
  'Ex.: 1=melhora, 2=piora, 4=nao_seca, -1=nao_opinar.';
COMMENT ON COLUMN impactos.tb_registro.qnt_chuva IS
  'Resposta da pergunta 2a: quantidade de chuva observada no mês. '
  'FK para tb_descricao_qnt_chuva. '
  'Ex.: 0=nao_choveu, 1=pouca_chuva, 3=muita_chuva.';
COMMENT ON COLUMN impactos.tb_registro.dt_chuva IS
  'Resposta da pergunta 2b: distribuição temporal da chuva. '
  'FK para tb_descricao_dt_chuva. '
  'Ex.: 0=nao_choveu, 1=poucos_dias, 2=maior_parte_mes.';
COMMENT ON COLUMN impactos.tb_registro.de_chuva IS
  'Resposta da pergunta 2c: distribuição espacial da chuva. '
  'FK para tb_descricao_de_chuva. '
  'Ex.: 0=nao_choveu, 1=isolada, 2=abrangente.';
COMMENT ON COLUMN impactos.tb_registro.sit_cultura IS
  'Resposta da pergunta 3: situação das culturas de sequeiro. '
  'FK para tb_descricao_sit_cultura. '
  'Ex.: 3=nenhuma_perda, 4=algumas_perdas, 5=grandes_perdas.';
COMMENT ON COLUMN impactos.tb_registro.acesso_agua IS
  'Resposta da pergunta 6: situação do acesso à água para consumo humano e animal. '
  'FK para tb_descricao_acesso_agua. '
  'Ex.: 2=niveis_normais, 4=niveis_baixos, 6=sistemas_hidricos_colapso.';
COMMENT ON COLUMN impactos.tb_registro.observacao IS
  'Texto livre da seção "Observações" do formulário (máx. 1000 caracteres). '
  'Campo opcional para detalhar os impactos observados na região.';
COMMENT ON COLUMN impactos.tb_registro.qualidade_dados IS
  'Classificação de qualidade atribuída pelo ETL. '
  '0 = Sem problemas; 1 = Ausência de dados / inconsistências; '
  '9 = Dados ruins, inconsistências evidentes.';
COMMENT ON COLUMN impactos.tb_registro.criado_em IS
  'Timestamp de inserção da linha, preenchido automaticamente via DEFAULT now().';

-- ── tb_registro_cultura ───────────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_registro_cultura IS
  'Tabela de junção N:N entre tb_registro e tb_descricao_cultura. '
  'Normaliza a resposta de múltipla escolha da pergunta 4: tipos de culturas '
  'de sequeiro mais afetadas. O código -1 (nao_informacao) é exclusivo com '
  'quaisquer outros valores (enforced pelo trigger trg_check_culturas_exclusive).';

COMMENT ON COLUMN impactos.tb_registro_cultura.codigo IS
  'Chave primária surrogate.';
COMMENT ON COLUMN impactos.tb_registro_cultura.registro_codigo IS
  'FK para tb_registro.';
COMMENT ON COLUMN impactos.tb_registro_cultura.cultura_codigo IS
  'FK para tb_descricao_cultura. '
  'Código -1 = "Não tenho essa informação" (exclusivo). '
  'Código 8 = "Outra" (textos livres em tb_registro_outras_culturas).';

-- ── tb_registro_outras_culturas ───────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_registro_outras_culturas IS
  'Armazena os textos livres digitados pelo observador quando seleciona "Outra" '
  'na pergunta 4 (tipos de culturas). Cada linha é uma cultura não predefinida. '
  'Um registro pode ter múltiplas entradas nesta tabela.';

COMMENT ON COLUMN impactos.tb_registro_outras_culturas.codigo IS
  'Chave primária surrogate.';
COMMENT ON COLUMN impactos.tb_registro_outras_culturas.registro_codigo IS
  'FK para tb_registro.';
COMMENT ON COLUMN impactos.tb_registro_outras_culturas.descricao IS
  'Texto livre informado pelo observador. Exemplo: "mandioca", "algodão". '
  'O formulário rejeita vírgulas e pontos; o ETL normaliza para minúsculas.';

-- ── tb_registro_impacto_atividade ─────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_registro_impacto_atividade IS
  'Tabela de junção N:N entre tb_registro e tb_descricao_impactos_agropecuaria. '
  'Normaliza a resposta de múltipla escolha da pergunta 5: impactos na atividade '
  'agropecuária. Os códigos 0 (sem_impactos) e -1 (nao_informacao) são exclusivos '
  'entre si e com demais impactos (enforced pelo trigger trg_check_impactos_exclusive).';

COMMENT ON COLUMN impactos.tb_registro_impacto_atividade.codigo IS
  'Chave primária surrogate.';
COMMENT ON COLUMN impactos.tb_registro_impacto_atividade.registro_codigo IS
  'FK para tb_registro.';
COMMENT ON COLUMN impactos.tb_registro_impacto_atividade.impacto_codigo IS
  'FK para tb_descricao_impactos_agropecuaria. '
  '0 = "Não há impactos" (exclusivo); -1 = "Não tenho essa informação" (exclusivo). '
  'Ex.: 1=perda_qualidade_forragem, 4=morte_gado, 9=proibicao_queima_controlada.';

-- ── tb_registro_restricao_agua ────────────────────────────────────────────────
COMMENT ON TABLE impactos.tb_registro_restricao_agua IS
  'Tabela de junção N:N entre tb_registro e tb_descricao_restricoes_agua. '
  'Normaliza a resposta de múltipla escolha da pergunta 7: restrições de uso '
  'da água. Os códigos 0 (sem_restricoes) e -1 (nao_informacao) são exclusivos '
  'entre si e com demais restrições (enforced pelo trigger trg_check_restricoes_exclusive).';

COMMENT ON COLUMN impactos.tb_registro_restricao_agua.codigo IS
  'Chave primária surrogate.';
COMMENT ON COLUMN impactos.tb_registro_restricao_agua.registro_codigo IS
  'FK para tb_registro.';
COMMENT ON COLUMN impactos.tb_registro_restricao_agua.restricao_codigo IS
  'FK para tb_descricao_restricoes_agua. '
  '0 = "Sem restrições" (exclusivo); -1 = "Não tenho essa informação" (exclusivo). '
  'Ex.: 4=racionamento_rodizio_abastecimento_publico, 7=escassez_agua_uso_humano, '
  '13=navegacao_parcialmente_comprometida.';


-- #################################################################### --
-- Trigger to prevent antagonistic choices for impactos_agropecuaria:
-- 'sem_impactos' (0) and 'nao_informacao' (-1) must be exclusive with other impactos for the same registro.
CREATE OR REPLACE FUNCTION impactos.fn_check_impactos_exclusive() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sem_code SMALLINT := 0;
  nao_info_code SMALLINT := -1;
  exists_other INTEGER;
BEGIN
  IF (NEW.impacto_codigo = sem_code OR NEW.impacto_codigo = nao_info_code) THEN
    -- ensure there is no other impacto for this registro
    SELECT 1 INTO exists_other FROM impactos.tb_registro_impacto_atividade ri WHERE ri.registro_codigo = NEW.registro_codigo AND ri.impacto_codigo IS DISTINCT FROM NEW.impacto_codigo LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Cannot add exclusive impacto when other impactos exist for registro %', NEW.registro_codigo;
    END IF;
  ELSE
    -- ensure there is no existing sem/nao_info for this registro
    SELECT 1 INTO exists_other FROM impactos.tb_registro_impacto_atividade ri WHERE ri.registro_codigo = NEW.registro_codigo AND (ri.impacto_codigo = sem_code OR ri.impacto_codigo = nao_info_code) LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Cannot add other impacto when exclusive impacto (sem_impactos/nao_informacao) is present for registro %', NEW.registro_codigo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_impactos_exclusive
BEFORE INSERT OR UPDATE ON impactos.tb_registro_impacto_atividade
FOR EACH ROW EXECUTE FUNCTION impactos.fn_check_impactos_exclusive();

-- Tabela de junção registro <-> restricoes de uso da água (multi-select)
CREATE TABLE impactos.tb_registro_restricao_agua (
  codigo BIGSERIAL PRIMARY KEY,
  registro_codigo BIGINT NOT NULL REFERENCES impactos.tb_registro(codigo) ON DELETE CASCADE,
  restricao_codigo SMALLINT NOT NULL REFERENCES impactos.tb_descricao_restricoes_agua(codigo) ON DELETE CASCADE,
  UNIQUE(registro_codigo, restricao_codigo)
);

-- Trigger to prevent antagonistic choices for restricoes_uso_agua:
-- 'sem_restricoes' (0) and 'nao_informacao' (-1) must be exclusive with other restricoes for the same registro.
CREATE OR REPLACE FUNCTION impactos.fn_check_restricoes_exclusive() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sem_code SMALLINT := 0;
  nao_info_code SMALLINT := -1;
  exists_other INTEGER;
BEGIN
  IF (NEW.restricao_codigo = sem_code OR NEW.restricao_codigo = nao_info_code) THEN
    -- ensure there is no other restricao for this registro
    SELECT 1 INTO exists_other FROM impactos.tb_registro_restricao_agua rr WHERE rr.registro_codigo = NEW.registro_codigo AND rr.restricao_codigo IS DISTINCT FROM NEW.restricao_codigo LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Cannot add exclusive restricao when other restricoes exist for registro %', NEW.registro_codigo;
    END IF;
  ELSE
    -- ensure there is no existing sem/nao_info for this registro
    SELECT 1 INTO exists_other FROM impactos.tb_registro_restricao_agua rr WHERE rr.registro_codigo = NEW.registro_codigo AND (rr.restricao_codigo = sem_code OR rr.restricao_codigo = nao_info_code) LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Cannot add other restricao when exclusive restricao (sem_restricoes/nao_informacao) is present for registro %', NEW.registro_codigo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_restricoes_exclusive
BEFORE INSERT OR UPDATE ON impactos.tb_registro_restricao_agua
FOR EACH ROW EXECUTE FUNCTION impactos.fn_check_restricoes_exclusive();

