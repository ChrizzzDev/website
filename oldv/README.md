# The V Programming Language Website

https://vlang.io

The redesigned site at https://new.vlang.io now lives at the repository root.
See the [current README](../README.md) for local setup, demo media, content
checks, and deployment.

*note: You can't run this site locally, because of proprietary backend, but you can preview the html file `preview.html` for styling css.*

## How To Contribute

There are various way you can contribute to this project. Refactoring writings, updating css, Adding Language support etc. We will cover them one by one.

### Styling the website

There is `app.css` file which is the main stylesheet. Use `preview.html` to view the rendered html file. This will help you style the website.

### Adding Language

Use the `english.tr` as a reference to add your translation to this project.

## Veb application and traffic statistics

The application at the repository root uses the reusable sibling `~/code/traffic`
module. It can run locally without PostgreSQL; visit tracking and `/stats228`
are disabled unless `VLANG_DB_CONNINFO` is set. To enable them, use a libpq
connection string, for example:

```sh
VLANG_DB_CONNINFO='host=127.0.0.1 dbname=eul user=postgres' \
  v -old-compiler -path "$(dirname "$PWD")|@vlib|@vmodules" run .
```

The one-time migration utility copies event `112` (the legacy vlang.io
homepage event) for today and the preceding 29 days into the new `visits`
table. It leaves the legacy table unchanged, classifies bots with the same
library used by the live tracker, and refuses to run if the `vlang.io`
namespace already contains rows:

```sh
VLANG_DB_CONNINFO='host=127.0.0.1 dbname=eul user=postgres' \
  v -old-compiler -path "$(dirname "$PWD")|@vlib|@vmodules" run \
  tools/migrate_legacy_traffic
```
