-- Conceitual: mesma estrutura, cardinalidades escolhidas pela diretiva @card (1:1, 1:N, N:N, 0:1).
-- @respostas 1,0,0,0,0,0,0,1,1
-- @respostas 0,1,1,1,1,1,1,-1
-- @card fk_perfil_pes 11 11
-- @card fk_end_pes 01 1n
-- @card fk_ped_pes 11 0n
-- @card fk_item_ped 0n 0n
CREATE TABLE pessoa (id INTEGER PRIMARY KEY, nome VARCHAR(100) NOT NULL);
CREATE TABLE perfil (
    id INTEGER PRIMARY KEY,
    bio TEXT,
    pessoa_id INTEGER NOT NULL,
    CONSTRAINT fk_perfil_pes FOREIGN KEY (pessoa_id) REFERENCES pessoa(id)
);
CREATE TABLE endereco (
    id INTEGER PRIMARY KEY,
    rua VARCHAR(120),
    pessoa_id INTEGER,
    CONSTRAINT fk_end_pes FOREIGN KEY (pessoa_id) REFERENCES pessoa(id)
);
CREATE TABLE pedido (
    id INTEGER PRIMARY KEY,
    total NUMERIC(12,2),
    pessoa_id INTEGER NOT NULL,
    CONSTRAINT fk_ped_pes FOREIGN KEY (pessoa_id) REFERENCES pessoa(id)
);
CREATE TABLE item (
    id INTEGER PRIMARY KEY,
    descricao VARCHAR(80),
    pedido_id INTEGER,
    CONSTRAINT fk_item_ped FOREIGN KEY (pedido_id) REFERENCES pedido(id)
);
