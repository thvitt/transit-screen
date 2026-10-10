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

For a short address, use *Download shortcut file* on the setup page. It saves a
small HTML file that redirects to the full screen link. Put it on any web
server, e.g. as `hubland.html` next to `index.html`, and point the signage
player at that instead.

The screen refreshes data every 30 s and the countdowns every 5 s. Rows that
don't fit are left off, so it never scrolls. If the API can't be reached, the
last known departures stay up with a warning, and the page reloads itself once
a night.

## URL parameters

| Parameter | Meaning |
| --- | --- |
| `s=ID\|Label\|Walk` | A stop (repeatable). `Label` replaces the stop name, `Walk` (minutes) hides buses you can't reach anymore. Both optional. |
| `g=Heading\|Rule\|Rule…` | A destination group (repeatable), shown as one column. |
| `other=Heading` | Show departures that match no group under this heading. Hidden if not set. |
| `title=Text` | Title in the header. Defaults to the stop labels. |
| `strip=Prefix` | Remove this prefix from stop names and destinations (repeatable), e.g. `Würzburg`. |
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

## Development

Pure logic lives in `lib.js` and is tested with Node's built-in test runner:

```sh
node --test
```
