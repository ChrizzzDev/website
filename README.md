# The V Programming Language Website

https://vlang.io

The redesigned site at https://new.vlang.io lives in [`website2_v`](website2_v/README.md).
See its README for local setup, demo media, content checks, and deployment.

*note: You can't run this site locally, because of proprietary backend, but you can preview the html file `preview.html` for styling css.*

## How To Contribute

There are various way you can contribute to this project. Refactoring writings, updating css, Adding Language support etc. We will cover them one by one.

### Styling the website

There is `app.css` file which is the main stylesheet. Use `preview.html` to view the rendered html file. This will help you style the website.

### Adding Language

Use the `english.tr` as a reference to add your translation to this project.

## Veb application and traffic statistics

The application in `website2_v` uses the reusable sibling `~/code/traffic`
module. It records privacy-conscious homepage visits in PostgreSQL and serves
the dashboard at `/stats228`. Set `VLANG_DB_CONNINFO` to a libpq connection
string before starting the server, for example:

```sh
VLANG_DB_CONNINFO='host=127.0.0.1 dbname=eul user=postgres' \
  v -old-compiler -path "$(dirname "$PWD")|@vlib|@vmodules" run website2_v
```

The one-time migration utility copies event `112` (the legacy vlang.io
homepage event) for today and the preceding 29 days into the new `visits`
table. It leaves the legacy table unchanged, classifies bots with the same
library used by the live tracker, and refuses to run if the `vlang.io`
namespace already contains rows:

```sh
VLANG_DB_CONNINFO='host=127.0.0.1 dbname=eul user=postgres' \
  v -old-compiler -path "$(dirname "$PWD")|@vlib|@vmodules" run \
  website2_v/tools/migrate_legacy_traffic
```
