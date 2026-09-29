-- Conceitual: identificador composto (PK com duas colunas) e FK composta.
CREATE TABLE cultura (
    safra INTEGER NOT NULL,
    codigo VARCHAR(10) NOT NULL,
    nome VARCHAR(60),
    PRIMARY KEY (safra, codigo)
);
CREATE TABLE colheita (
    id SERIAL PRIMARY KEY,
    safra INTEGER NOT NULL,
    cultura_codigo VARCHAR(10) NOT NULL,
    toneladas NUMERIC(10,2),
    FOREIGN KEY (safra, cultura_codigo) REFERENCES cultura (safra, codigo)
);
ALTER TABLE colheita ADD CONSTRAINT uq_colheita UNIQUE (safra, cultura_codigo, toneladas);
