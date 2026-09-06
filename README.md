# Travel Log

A static, mobile-first travel map designed to run directly on GitHub Pages.

The default home state is an auto-rotating globe. Airport markers are blue and
visited city names provide lightweight geographic context. Detailed saved
places and local transport appear only after a trip is selected. The overview
is intentionally not a tab: select the Johnson's travel log brand on desktop or
the Globe control on a trip map to return to it.

The Japan 2026 section contains confirmed places across Tokyo, Sendai, Sapporo,
Osaka, Kyoto, Nagoya, and the Kitakyushu group from the shared Google Maps list.
Its visible route layer is limited to train, Shinkansen, bus, and plane travel.
The numbered transit itinerary follows the confirmed travel order, including
the Tokyo, Nagoya, Kyushu, Sendai, and Sapporo local-transit legs. Bundled route
geometry follows real rail and road alignments without waiting for a live
routing API.
Its street map uses marker clustering so dense city stops remain usable on
phones. Route shapes are stored with the site, so the map does not wait for a
live routing service while a visitor is using it. Photo-preview markers open
their trip gallery directly. Any stop with photos automatically uses its first
preview on the map, so new Japan cities only need to follow the same folder and
photo-data convention. Trip photos are stored as metadata-free WebP originals,
with 320-pixel square marker previews and aspect-preserving 640/960-pixel
display versions; source JPEGs are removed after conversion.

Gallery tiles preserve portrait and landscape proportions, while the
full-screen viewer keeps the complete original image visible over its
already-cached preview backdrop. A city story labels the exact place and photo
count represented by its cover, with a separate action for browsing every
photo from that city. Selected-place details stay in the sidebar; the floating
map card is reserved for active route playback.
Quebec archive photos use individual map markers at their recorded locations;
photos sharing one address remain grouped in a stacked marker.

Route playback places one shaded low-poly plane, Shinkansen, local-train, bus, or car
model on the active path. The vehicle follows the same bundled coordinates as
the visible route, rotates with its direction of travel, preserves its position
when paused, and updates at a mobile-friendly frame rate without downloading a
3D engine or model package.

## Project structure

- `index.html` — accessible page structure and GitHub Pages entry point
- `styles.css` — responsive layout, globe/street-map overlays, markers, and galleries
- `data.js` — canonical overview, flights, trips, places, photos, and transport legs
- `app.js` — global globe, trip street maps, clustering, route playback, and galleries
- `trip_routes/Japan_2026/rail-shapes.js` — simplified offline Shinkansen and local-train geometry
- `trip_routes/Quebec_2026/route-shapes.js` — direction-specific Montréal and Saint-Sauveur driving geometry
- `trip_routes/Quebec_2025/route-shapes.js` — simplified offline VIA Rail and intercity-bus geometry
- `trip_images/<Trip>/<city>/` — optimized full-display trip photos organized for future cities
- `trip_images/previews/<Trip>/<city>/` — lightweight square map-marker previews
- `trip_images/display/{640,960}/<Trip>/<city>/` — responsive, aspect-preserving gallery and sidebar images
- `trip_images/photo-sizes.js` — generated intrinsic dimensions used to reserve each photo's layout space
- `trip_images/globe/` — shared map imagery, including the optimized globe texture
- `scripts/build-photo-displays.py` — regenerates responsive display photos and the size manifest from `data.js`

## Local preview

Serve the repository root with any static HTTP server. For example:

```sh
python3 -m http.server 8766
```

Then open `http://127.0.0.1:8766/`.

## Photo derivatives

After adding a full WebP photo to `data.js`, regenerate the responsive gallery
and sidebar copies with:

```sh
python3 scripts/build-photo-displays.py
```

The script keeps marker previews separate, preserves each photo's orientation
and aspect ratio, and updates `trip_images/photo-sizes.js` so galleries do not
shift while images load.

## GitHub Pages

The site requires no build step and contains no server-side code. Configure
GitHub Pages to deploy from the repository root on the desired branch.

The globe uses a pinned Globe.gl release and a local optimized texture.
Street-level trip views use pinned Leaflet and Leaflet.markercluster releases
with standard OpenStreetMap tiles and visible attribution.

## Transit geometry

Japan 2026 route shapes are simplified, locally bundled derivatives of these
direction-specific OpenStreetMap public-transport relations:

- Intercity Shinkansen: [Nozomi Tokyo → Hakata](https://www.openstreetmap.org/relation/9807034) and [Yamabiko Tokyo → Morioka](https://www.openstreetmap.org/relation/12439068)
- Tokyo airport rail: [Keikyu Airport Line](https://www.openstreetmap.org/relation/9499448), [Keikyu Main Line](https://www.openstreetmap.org/relation/1994313), and [JR Tokaido Main Line](https://www.openstreetmap.org/relation/11680902)
- Nagoya: [Higashiyama Line](https://www.openstreetmap.org/relation/421984)
- Kyushu: [Yufu service](https://www.openstreetmap.org/relation/10141535) for the Yufuin no Mori alignment and [Sonic Oita → Hakata](https://www.openstreetmap.org/relation/10138179)
- Kyoto → Osaka: [JR Kyoto Line](https://www.openstreetmap.org/relation/11808754)
- Sendai: [JR Senseki Line](https://www.openstreetmap.org/relation/1862832) and [JR Senzan Line](https://www.openstreetmap.org/relation/12467356)
- Sapporo: [Rapid Airport](https://www.openstreetmap.org/relation/11250851)

The two Kyushu bus legs use simplified road geometry derived from the
OpenStreetMap-powered OSRM route service. All bundled shapes are simplified so
the corridors stay responsive on mobile.

Quebec 2025 uses a simplified slice of the
[VIA Rail Corridor relation](https://www.openstreetmap.org/relation/8222333)
between Montréal and Québec City. Its return bus follows simplified road
geometry derived from the OpenStreetMap-powered OSRM route service.

Quebec 2026 uses separate outbound and return driving shapes derived with
[OSRM](https://project-osrm.org/) from OpenStreetMap data. The locally stored
geometry follows A-136, A-15, A-40, Autoroute des Laurentides, and each
direction’s Montréal one-way streets without making live routing requests.

The route data is available under the Open Database License; see
[OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright).
