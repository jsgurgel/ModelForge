CREATE TABLE pedido (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    total numeric(12,2),
    PRIMARY KEY (id)
);
CREATE TABLE cliente (id serial PRIMARY KEY, nome varchar(100) NOT NULL);
CREATE TABLE item_pedido (
    pedido_id integer NOT NULL,
    produto_codigo bigint NOT NULL,
    quantidade smallint NOT NULL,
    preco decimal(10),
    PRIMARY KEY (pedido_id, produto_codigo),
    UNIQUE (pedido_id, quantidade),
    FOREIGN KEY (pedido_id) REFERENCES pedido (id)
);
