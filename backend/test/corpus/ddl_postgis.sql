CREATE TABLE estacao (
  id INTEGER PRIMARY KEY,
  geom geometry(Point,4326),
  area geometry(Polygon),
  local geography(Point,4674),
  bruta geometry,
  linha geometry NOT NULL DEFAULT NULL
);
