# Dump estilo MySQL
DROP TABLE IF EXISTS `cliente`;
CREATE TABLE `cliente` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `saldo` decimal(10,2) NOT NULL DEFAULT '0.00',
  `tipo` enum('a','b') DEFAULT 'a',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_nome` (`nome`),
  INDEX idx_tipo (`tipo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `pedido` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente_id` int NOT NULL,
  `total` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_pedido_cliente` FOREIGN KEY (`cliente_id`) REFERENCES `cliente` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `item` (
  `pedido_id` int NOT NULL,
  `seq` smallint NOT NULL,
  `produto` varchar(50),
  PRIMARY KEY (`pedido_id`,`seq`),
  CONSTRAINT `fk_item_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedido` (`id`)
);

CREATE INDEX `idx_pedido_total` ON `pedido` (`total`);
CREATE UNIQUE INDEX uq_item_produto ON item (`produto`, `seq`) USING BTREE;
