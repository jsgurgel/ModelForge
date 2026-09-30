# ModelForge

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

![ModelForge](ModelForge.png)

**From concept to database, in the browser.** ModelForge is a web application for designing data models, converting
between abstraction levels and talking to real databases, all in the same screen. The front-end is **React + Vite**,
the back-end is **NestJS**, both written in TypeScript.

Author: **Jairo dos Santos Gurgel** (jsgurgel@hotmail.com).

> Esta é a versão resumida em inglês. Para a documentação completa (variáveis de ambiente, API, Docker, CLI),
> veja o [README.md](README.md) em português.

## What it does

- **Draws**: seven diagram types (Conceptual, Logical, NoSQL, Flow, Activity, WBS and Free-form) in tabs, with a shape
  palette, properties Inspector, alignment guides, undo/redo, zoom, minimap and auto-layout. Exports to PNG, JPG, BMP,
  SVG and PDF.
- **Converts**: Conceptual ⇄ Logical (with dialogs that let you resolve ambiguous cases), and generates DDL, ORM code
  (JPA, SQLAlchemy, Prisma), HTML documentation and a data dictionary. Also validates the model and imports DDL.
- **Connects**: PostgreSQL, MySQL, SQL Server, SQLite and MongoDB. Imports existing schemas, drag tables onto the
  diagram, generates migration scripts and runs SQL. The **SQL Studio** offers query tabs, catalog-based autocomplete,
  history and export (CSV, JSON, SQL, Markdown, HTML). Saved passwords are encrypted.
- **Automates**: a CLI validates models and generates DDL/documentation without opening the UI, and the WBS diagram
  has a script console.
- **Stores**: its own JSON files (`.mfd.json` and `.mfp.json` bundle) or server-side save. API access can be protected
  by a token.

Generator, converter and importer quality is verified by tests that compare output against reference fixtures in
`backend/test`.

## Running it

Node **22.5+** (SQLite support uses `node:sqlite`; without it only the SQLite connection is unavailable). Docker uses
Node 26.

```bash
# terminal 1
cd backend && npm install && npm run start:dev     # http://127.0.0.1:3000/api
# terminal 2
cd frontend && npm install && npm run dev          # http://localhost:5173 (Vite proxies /api to :3000)
```

Tests: `npm test` in `backend/` (jest) and `npx vitest run` in `frontend/`; `npx tsc --noEmit -p .` in both.

## Docker

```bash
cp .env.example .env             # optional: set API_TOKEN etc.
docker compose up --build        # front at http://localhost:5173, back at http://127.0.0.1:3100
```

## Security model

Single-user, local by default: the backend opens network connections to whatever host the user enters, runs SQL, and
stores saved connections in a file shared by anyone who reaches the API. Without `API_TOKEN`, anyone who reaches the
port can do this. See the [full security section](README.md#segurança-e-modelo-de-uso) (in Portuguese) before exposing
it beyond your local machine.

## License

Licensed under **GNU AGPL-3.0-or-later**; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Authorship attribution
("Created by Jairo dos Santos Gurgel" / "Based on ModelForge") must be kept. Anyone who modifies and makes the
software available, including as a web service, must release the source of their modifications under the same
license and state that the version was modified.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
