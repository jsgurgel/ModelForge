CREATE TABLE lugar (
    id serial PRIMARY KEY,
    nome text,
    geom geometry(Point,4326),
    area GEOGRAPHY(MultiPolygon, 4674) NOT NULL,
    qualquer geometry(Geometry,4326),
    sem_srid geometry(Polygon),
    puro geometry,
    zpt GEOMETRY(PointZ),
    ponto point,
    tam varchar(80),
    preco numeric(10,2)
);
