CREATE TABLE "user" (
    id integer PRIMARY KEY,
    "order" varchar(10) NOT NULL,
    "select" integer,
    camelCaseCol text,
    snake_case_col text,
    "with space" text,
    UPPER_COL integer UNIQUE,
    "group_id" integer
);
CREATE TABLE user_group_role (
    id integer PRIMARY KEY,
    user_id integer REFERENCES "user" (id),
    group_id integer NOT NULL REFERENCES "user" (id),
    owner integer REFERENCES "user" (id)
);
CREATE TABLE tb_1_sem_letras_2 (id_ integer PRIMARY KEY, _x integer);
