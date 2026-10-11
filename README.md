# Transit screen

A client-side departure board for digital signage. It shows real-time departures
from a few nearby stops, grouped by destination, using the
[Transitous](https://transitous.org) API. The whole configuration is in the URL.

## Usage

Serve the directory with any static web server (ES modules don't load from `file://`):

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/>. With no stops configured you get the setup page:
search for stops, define destination groups, and copy the screen link. Add
`setup` to any screen URL (`?setup&s=…`) to edit it again.

For a short address, use *Download …json* on the setup page and put the file
next to `index.html`, e.g. as `hubland.json`. Then point the signage player at
`?config=hubland`. See [Config files](#config-files).

The screen refreshes data every 30 s and the countdowns every 5 s. Rows that
don't fit are left off, so it never scrolls. If the API can't be reached, the
last known departures stay up with a warning, and the page reloads itself once
a night.

## URL parameters

| Parameter | Meaning |
| --- | --- |
| `config=Name` | Load the settings from `Name.json`, see [Config files](#config-files). |
| `s=ID\|Label\|Walk` | A stop (repeatable). `Label` replaces the stop name, `Walk` (minutes) hides buses you can't reach anymore. Both optional. |
| `g=Heading\|Rule\|Rule…` | A destination group (repeatable), shown as one column. |
| `other=Heading` | Show departures that match no group under this heading. Hidden if not set. |
| `title=Text` | Title in the header. Defaults to the stop labels. |
| `strip=Prefix` | Remove this prefix from stop names and destinations (repeatable), e.g. `Würzburg`. |
| `qr` or `qr=URL` | Show a QR code in the top right corner (the clock moves to the center), linking to this screen or to `URL` (shorter links give coarser, easier to scan codes). |
| `lang=de\|en` | Interface language, defaults to the browser's. |
| `scale=1.2` | Text size factor. |
| `horizon=120` | Only show departures within this many minutes. |
| `refresh=30` | Data refresh interval in seconds. |
| `n=40` | Departures fetched per stop. |

A rule is `lines:destination`:

- `lines` is a comma-separated list of line names; empty or `*` means any line.
- `destination` is matched as a substring of the headsign or the final stop.
  Case and accents are ignored.
- `14` alone means all departures of line 14.

A departure joins every group that has a matching rule. Without any `g`, all
departures are shown in one column.

## Example: Hubland, Würzburg

```
?title=Hubland Campus&lang=de&strip=Würzburg&strip=Wü
&s=de-DELFI_de:09663:33:0:11
&s=de-DELFI_de:09663:246:0:11
&s=de-DELFI_de:09663:308:0:11|Phil. Fak.
&g=City/Bahnhof|:Hauptbahnhof
&g=Frauenland/Sanderau|10:Sanderring|34:Heidingsfeld
&g=Gerbrunn|14:Gerbrunn|34:Grombühl
```

(Joined into a single line.)

## Config files

`?config=hubland` loads `hubland.json` from the directory of `index.html`. Only
lowercase letters, digits and dashes are allowed in the name. The file holds the
same settings as the URL:

```json
{
  "title": "Hubland Campus",
  "lang": "de",
  "strip": ["Würzburg", "Wü"],
  "stops": [
    { "id": "de-DELFI_de:09663:33:0:11" },
    { "id": "de-DELFI_de:09663:308:0:11", "label": "Phil. Fak.", "walk": 3 }
  ],
  "groups": [
    { "heading": "City/Bahnhof", "rules": [{ "lines": [], "headsign": "Hauptbahnhof" }] },
    { "heading": "Gerbrunn", "rules": [{ "lines": ["14"], "headsign": "Gerbrunn" }] }
  ],
  "qr": ""
}
```

Missing keys take their defaults, and an empty `lines` list means any line.
Other URL parameters override the file, so `?config=hubland&scale=1.4` enlarges
the text on one display only. The file is fetched again whenever the screen
loads, at least once a night, so edits reach all screens without touching the
players.

`?setup&config=hubland` opens the file in the setup page. The address stays short
until you change something; then it switches to the full screen link, and
*Download hubland.json* saves the changed file for upload.

## Data and attribution

Departures come from [Transitous](https://transitous.org), a community-run,
best-effort service. Follow its [API usage terms](https://transitous.org/api/)
when you deploy this:

- Non-commercial use only, and keep the load light (the defaults fetch each
  stop every 30 s). Ask the Transitous team before running many screens.
- The screen footer and the setup page link to the
  [data sources](https://transitous.org/sources/) and credit
  [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
  Keep these visible.
- Browsers can't set a `User-Agent`, so Transitous identifies the app by the
  `Referer` header. Requests send only the origin of your site, not the screen
  configuration, so make sure that site carries contact information.

## License

MIT, see [LICENSE](LICENSE).

## Development

`vendor/` contains Kazuhiko Arase's MIT-licensed
[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator).

Pure logic lives in `lib.js` and is tested with Node's built-in test runner:

```sh
node --test
```
