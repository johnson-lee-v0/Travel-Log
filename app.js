(() => {
  "use strict";

  const data = window.TRAVEL_LOG_DATA;
  if (!data?.overview || !Array.isArray(data.trips)) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motionDurations = { plane: 6200, shinkansen: 5200, train: 4600, bus: 5000 };
  const tripsById = new Map(data.trips.map((trip) => [trip.id, trip]));
  const airportsById = new Map(data.overview.airports.map((airport) => [airport.id, airport]));
  const overviewFlights = data.overview.flights
    .map((flight, index) => ({
      ...flight,
      index,
      start: airportsById.get(flight.from),
      end: airportsById.get(flight.to),
    }))
    .filter((flight) => flight.start && flight.end);
  const cityLabelPriorities = new Map(
    [
      "toronto",
      "tokyo",
      "montreal",
      "sapporo",
      "osaka",
      "calgary",
      "atlanta",
      "kitakyushu",
      "quebec-city",
      "sendai",
      "cleveland",
      "nagoya",
      "corning",
      "kyoto",
      "saint-sauveur",
    ].map((id, index, items) => [id, items.length - index]),
  );

  const state = {
    viewId: data.overview.id,
    activeLegIndex: 0,
    selectedStopId: null,
    playing: false,
    resumeOnVisible: false,
    overviewRotation: true,
    overviewLabelFrame: null,
    overviewLabelForce: false,
    overviewLabelSignature: "",
    overviewLabelLastUpdateAt: 0,
    overviewLabelView: null,
    overviewPlaneFrame: null,
    overviewPlaneInitFrame: null,
    overviewPlaneInitAttempts: 0,
    overviewPlaneLastPaintAt: 0,
    overviewPlaneStartedAt: null,
    overviewPlaneRuntime: null,
    mapFocus: "all",
    globe: null,
    streetMap: null,
    markerCluster: null,
    routeGroup: null,
    endpointGroup: null,
    motionGroup: null,
    motionMarker: null,
    motionTrail: null,
    motionRoute: null,
    motionLegId: null,
    motionFrame: null,
    motionStartedAt: null,
    motionElapsedMs: 0,
    motionProgress: 0,
    motionBearing: null,
    motionLastPaintAt: 0,
    streetTripId: null,
    markerLayers: new Map(),
    routeLayers: new Map(),
  };

  const elements = {
    app: document.getElementById("app"),
    mapStage: document.getElementById("map-stage"),
    globe: document.getElementById("globe-viz"),
    streetMap: document.getElementById("street-map"),
    fallback: document.getElementById("map-fallback"),
    brandHome: document.getElementById("brand-home"),
    tripTabs: document.getElementById("trip-tabs"),
    tripEyebrow: document.getElementById("trip-eyebrow"),
    tripTitle: document.getElementById("trip-title"),
    tripStatus: document.getElementById("trip-status"),
    tripDescription: document.getElementById("trip-description"),
    transportSection: document.querySelector(".transport-legend"),
    transportHeading: document.getElementById("transport-heading"),
    transportLegend: document.getElementById("transport-legend"),
    mapFocus: document.getElementById("map-focus"),
    mapHeading: document.querySelector(".map-heading"),
    mapEyebrow: document.getElementById("map-eyebrow"),
    mapTitle: document.getElementById("map-title"),
    routeCard: document.getElementById("route-card"),
    routeMode: document.getElementById("route-mode"),
    routeStep: document.getElementById("route-step"),
    routeTitle: document.getElementById("route-title"),
    routeDetail: document.getElementById("route-detail"),
    routeNote: document.getElementById("route-note"),
    routeControls: document.getElementById("route-controls"),
    routeProgress: document.getElementById("route-progress-fill"),
    routePrev: document.getElementById("route-prev"),
    routePlay: document.getElementById("route-play"),
    routePlayIcon: document.getElementById("route-play-icon"),
    routePlayLabel: document.getElementById("route-play-label"),
    routeNext: document.getElementById("route-next"),
    gallery: document.getElementById("gallery"),
    galleryKicker: document.getElementById("gallery-kicker"),
    galleryTitle: document.getElementById("gallery-title"),
    galleryGrid: document.getElementById("gallery-grid"),
    galleryClose: document.getElementById("gallery-close"),
    lightbox: document.getElementById("lightbox"),
    lightboxImage: document.getElementById("lightbox-image"),
    lightboxClose: document.getElementById("lightbox-close"),
  };

  function isOverview() {
    return state.viewId === data.overview.id;
  }

  function currentTrip() {
    return tripsById.get(state.viewId) || null;
  }

  function stopMap(trip = currentTrip()) {
    return new Map((trip?.stops || []).map((stop) => [stop.id, stop]));
  }

  function activeLeg(trip = currentTrip()) {
    return trip?.legs[state.activeLegIndex] || null;
  }

  function modeColor(mode) {
    return data.modes[mode]?.color || "#aab7c5";
  }

  function modeLabel(mode) {
    return data.modes[mode]?.label || "Connection";
  }

  function modeShort(mode) {
    return data.modes[mode]?.short || "•";
  }

  function markerColor(item) {
    if (item.kind === "airport") return "#3388ff";
    if (item.kind === "station") return "#ffc85b";
    return "#68dbb0";
  }

  function markerKindLabel(item) {
    if (item.kind === "airport") return "Airport";
    if (item.kind === "station") return "Train station";
    if (item.kind === "city") return "Visited area";
    return "Saved place";
  }

  function markerPhotoSource(stop) {
    return stop.markerPhoto?.src || stop.photos?.[0]?.preview || null;
  }

  function escapeHtml(value) {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return String(value).replace(/[&<>"']/g, (character) => replacements[character]);
  }

  function globePointTooltip(item) {
    const kind = markerKindLabel(item);
    if (item.kind !== "airport") {
      return (
        '<div class="globe-tooltip"><strong>' +
        escapeHtml(item.name) +
        '</strong> <span class="globe-tooltip__meta">' +
        escapeHtml(kind) +
        "</span></div>"
      );
    }

    const airportName = item.name.split(" · ")[0] || item.name;
    return (
      '<div class="globe-tooltip"><strong>' +
      escapeHtml(airportName) +
      '</strong><span class="globe-tooltip__meta"><b>' +
      escapeHtml(item.code) +
      '</b> <i aria-hidden="true">·</i> <span>Airport</span></span></div>'
    );
  }

  function renderTripTabs() {
    elements.tripTabs.replaceChildren(
      ...data.trips.map((view) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "trip-tab" + (view.id === state.viewId ? " is-active" : "");
        button.textContent = view.shortName;
        button.setAttribute("aria-pressed", String(view.id === state.viewId));
        button.addEventListener("click", () => selectView(view.id));
        return button;
      }),
    );
    keepSelectedControlVisible(elements.tripTabs);
  }

  function keepSelectedControlVisible(container) {
    window.requestAnimationFrame(() => {
      const selected = container.querySelector(".is-active");
      if (!selected || container.scrollWidth <= container.clientWidth) return;
      const selectedLeft = selected.offsetLeft;
      const selectedRight = selectedLeft + selected.offsetWidth;
      const visibleLeft = container.scrollLeft;
      const visibleRight = visibleLeft + container.clientWidth;
      if (selectedLeft < visibleLeft) {
        container.scrollTo({ left: Math.max(0, selectedLeft - 8), behavior: "smooth" });
      } else if (selectedRight > visibleRight) {
        container.scrollTo({
          left: selectedRight - container.clientWidth + 8,
          behavior: "smooth",
        });
      }
    });
  }

  function renderSummary() {
    if (isOverview()) {
      elements.tripEyebrow.textContent = data.overview.eyebrow;
      elements.tripTitle.textContent = data.overview.name;
      elements.tripStatus.textContent = data.overview.status;
      elements.tripDescription.textContent = data.overview.description;
      elements.mapEyebrow.textContent = "Personal travel atlas";
      elements.mapTitle.textContent = "Your journeys, in motion";
      document.title = "Travel Log · Personal Atlas";
      return;
    }

    const trip = currentTrip();
    elements.tripEyebrow.textContent = trip.eyebrow;
    elements.tripTitle.textContent = trip.name;
    elements.tripStatus.textContent = trip.status;
    elements.tripDescription.textContent = trip.description;
    elements.mapEyebrow.textContent = trip.name + " · street map";
    elements.mapTitle.textContent = trip.name;
    document.title = "Travel Log · " + trip.name;
  }

  function legendItem(label, color, type = "marker") {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.style.setProperty("--mode-color", color);
    const swatch = document.createElement("span");
    swatch.className = type === "line" ? "legend-item__line" : "legend-item__dot";
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, document.createTextNode(label));
    return item;
  }

  function renderLegend() {
    const trip = currentTrip();
    if (isOverview() || trip?.showLegend === false) {
      elements.transportSection.hidden = true;
      elements.transportLegend.replaceChildren();
      return;
    }

    elements.transportSection.hidden = false;
    const usedKinds = new Set(trip.stops.map((stop) => stop.kind));
    const usedModes = [...new Set(trip.legs.map((leg) => leg.mode))];
    const items = [];
    if (usedKinds.has("airport")) items.push(legendItem("Airport", markerColor({ kind: "airport" })));
    if (usedKinds.has("place")) items.push(legendItem("Saved place", markerColor({ kind: "place" })));
    if (usedKinds.has("station")) items.push(legendItem("Train station", markerColor({ kind: "station" })));
    usedModes.forEach((mode) => items.push(legendItem(modeLabel(mode), modeColor(mode), "line")));
    elements.transportHeading.textContent = "Trip map";
    elements.transportLegend.replaceChildren(...items);
  }

  function renderMapFocus() {
    if (isOverview()) {
      elements.mapFocus.hidden = true;
      elements.mapFocus.replaceChildren();
      return;
    }

    const trip = currentTrip();
    elements.mapFocus.hidden = false;
    const focusAreas = trip.focusAreas || [];
    const buttons = [];
    const globeButton = document.createElement("button");
    globeButton.type = "button";
    globeButton.className = "map-focus__button map-focus__button--home";
    globeButton.dataset.action = "home";
    globeButton.textContent = "Globe";
    buttons.push(globeButton);
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "map-focus__button" + (state.mapFocus === "all" ? " is-active" : "");
    allButton.dataset.focus = "all";
    allButton.textContent = "All";
    allButton.setAttribute(
      "aria-label",
      trip.legs.length ? "Show the full trip route" : "Show all saved places",
    );
    buttons.push(allButton);

    if (focusAreas.length) {
      focusAreas.forEach((area) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "map-focus__button" + (state.mapFocus === area.id ? " is-active" : "");
        button.dataset.focus = area.id;
        button.textContent = area.label;
        buttons.push(button);
      });
    }
    elements.mapFocus.replaceChildren(...buttons);
    keepSelectedControlVisible(elements.mapFocus);
  }

  function renderRouteCard() {
    if (isOverview()) {
      elements.routeCard.hidden = true;
      return;
    }

    elements.routeCard.hidden = false;
    const trip = currentTrip();
    const stops = stopMap(trip);
    const selectedStop = state.selectedStopId ? stops.get(state.selectedStopId) : null;

    if (selectedStop) {
      const color = markerColor(selectedStop);
      elements.routeCard.style.setProperty("--mode-color", color);
      elements.routeMode.style.setProperty("--mode-color", color);
      elements.routeMode.textContent = markerKindLabel(selectedStop);
      elements.routeStep.textContent = selectedStop.photos.length
        ? selectedStop.photos.length +
          " photo" +
          (selectedStop.photos.length === 1 ? "" : "s")
        : "Saved on this trip";
      elements.routeTitle.textContent = selectedStop.name;
      elements.routeDetail.textContent = selectedStop.summary;
      elements.routeNote.textContent = selectedStop.markerPhoto?.credit
        ? selectedStop.markerPhoto.credit
        : selectedStop.photos.length
          ? "Select this photo marker to reopen its gallery."
          : "Only places from the selected trip are shown.";
      elements.routeControls.hidden = !trip.legs.length;
      elements.routeProgress.style.setProperty("--progress", "0%");
      return;
    }

    const leg = activeLeg(trip);
    if (!leg) {
      const stop = trip.stops[0];
      if (!stop) {
        elements.routeCard.hidden = true;
        return;
      }
      const color = markerColor(stop);
      elements.routeCard.style.setProperty("--mode-color", color);
      elements.routeMode.style.setProperty("--mode-color", color);
      elements.routeMode.textContent = stop.city;
      elements.routeStep.textContent =
        trip.stops.length + " saved place" + (trip.stops.length === 1 ? "" : "s");
      elements.routeTitle.textContent = stop.name;
      elements.routeDetail.textContent = stop.summary;
      elements.routeNote.textContent = "Select a marker or place below to explore it.";
      elements.routeControls.hidden = true;
      elements.routeProgress.style.setProperty("--progress", "0%");
      return;
    }

    const from = stops.get(leg.from);
    const to = stops.get(leg.to);
    const color = modeColor(leg.mode);
    const orderedTransitCount = trip.legs.filter((item) => Number.isInteger(item.order)).length;
    elements.routeCard.style.setProperty("--mode-color", color);
    elements.routeMode.style.setProperty("--mode-color", color);
    elements.routeMode.textContent = modeLabel(leg.mode);
    elements.routeStep.textContent = Number.isInteger(leg.order)
      ? "Transit " + leg.order + " of " + orderedTransitCount
      : modeLabel(leg.mode) + " · local route";
    elements.routeTitle.textContent =
      (from.code || from.name) + " → " + (to.code || to.name);
    elements.routeDetail.textContent = leg.label + ". " + leg.detail;
    elements.routeNote.textContent = trip.routeDraft
      ? "Draft route — exact direction, timing, and visit order are not asserted."
      : "Travel route";
    elements.routeControls.hidden = false;
    const progressStep = Number.isInteger(leg.order) ? leg.order : state.activeLegIndex + 1;
    const progressTotal = Number.isInteger(leg.order) ? orderedTransitCount : trip.legs.length;
    elements.routeProgress.style.setProperty(
      "--progress",
      (progressStep / progressTotal) * 100 + "%",
    );
  }

  function renderPlaybackState() {
    if (isOverview()) {
      elements.routeCard.classList.remove("is-playing");
      return;
    }

    elements.routeCard.classList.toggle("is-playing", state.playing);
    elements.routePlayIcon.textContent = state.playing ? "Ⅱ" : "▶";
    elements.routePlayLabel.textContent = state.playing ? "Pause" : "Play route";
    elements.routePlay.setAttribute(
      "aria-label",
      state.playing ? "Pause route animation" : "Play route animation",
    );
    elements.routeProgress.style.setProperty(
      "--motion-progress",
      String(state.motionProgress),
    );
    state.motionMarker
      ?.getElement()
      ?.classList.toggle("is-moving", state.playing);
  }

  function flightAltitude(flight) {
    const latitudeSpan = Math.abs(flight.start.lat - flight.end.lat);
    const rawLongitudeSpan = Math.abs(flight.start.lng - flight.end.lng);
    const longitudeSpan = Math.min(rawLongitudeSpan, 360 - rawLongitudeSpan);
    const span = Math.hypot(latitudeSpan, longitudeSpan * 0.7);
    return Math.min(0.34, Math.max(0.08, 0.075 + span / 520));
  }

  function longitudeDistance(first, second) {
    return Math.abs((((first - second) % 360) + 540) % 360 - 180);
  }

  function globeDistanceDegrees(first, second) {
    const toRadians = Math.PI / 180;
    const firstLatitude = first.lat * toRadians;
    const secondLatitude = second.lat * toRadians;
    const latitudeDelta = (second.lat - first.lat) * toRadians;
    const longitudeDelta = longitudeDistance(second.lng, first.lng) * toRadians;
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;
    return (2 * Math.asin(Math.min(1, Math.sqrt(haversine)))) / toRadians;
  }

  function updateOverviewCityLabels(force = false) {
    if (!state.globe || !isOverview() || elements.globe.hidden) return;
    const globeBounds = elements.globe.getBoundingClientRect();
    const { width, height } = globeBounds;
    if (width < 1 || height < 1) return;

    const view = state.globe.pointOfView();
    const previousView = state.overviewLabelView;
    if (
      !force &&
      previousView &&
      Math.abs(view.lat - previousView.lat) < 2.25 &&
      longitudeDistance(view.lng, previousView.lng) < 2.25 &&
      Math.abs(view.altitude - previousView.altitude) < 0.04
    ) {
      return;
    }
    state.overviewLabelView = { ...view };

    const compact = width < 600;
    const closeView = view.altitude < 1.05;
    const edgePadding = compact ? 12 : 16;
    const maximumLabels = compact ? (closeView ? 10 : 6) : closeView ? 15 : 10;
    const headingBounds = elements.mapHeading?.getBoundingClientRect();
    const headingExclusion =
      headingBounds?.width && headingBounds?.height
        ? {
            left: headingBounds.left - globeBounds.left - 10,
            top: headingBounds.top - globeBounds.top - 10,
            right: headingBounds.right - globeBounds.left + 10,
            bottom: headingBounds.bottom - globeBounds.top + 10,
          }
        : null;
    const horizon =
      (Math.acos(1 / (1 + Math.max(0.02, view.altitude))) * 180) / Math.PI - 1.5;
    const labelScale = Math.min(1.65, Math.max(0.85, 1.25 / (view.altitude + 0.1)));
    const accepted = [];
    const acceptedPositions = [];
    const cycleOffset =
      Math.floor(performance.now() / 6000) % Math.max(1, data.overview.cities.length);
    const cities = data.overview.cities
      .map((city, index) => ({
        city,
        distance: globeDistanceDegrees(view, city),
        rotatingRank:
          (index - cycleOffset + data.overview.cities.length) % data.overview.cities.length,
      }))
      .filter((entry) => entry.distance <= horizon)
      .sort((first, second) => {
        const distanceBand = Math.floor(first.distance / 1.5) - Math.floor(second.distance / 1.5);
        if (distanceBand) return distanceBand;
        const rotatingRank = first.rotatingRank - second.rotatingRank;
        if (rotatingRank) return rotatingRank;
        return (
          (cityLabelPriorities.get(second.city.id) || 0) -
          (cityLabelPriorities.get(first.city.id) || 0)
        );
      });

    for (const { city } of cities) {
      if (accepted.length >= maximumLabels) break;

      const screen = state.globe.getScreenCoords(city.lat, city.lng, 0.04);
      if (!Number.isFinite(screen?.x) || !Number.isFinite(screen?.y)) continue;
      const halfLabelWidth =
        Math.min(46, 4 + city.name.length * (compact ? 2 : 2.3)) * labelScale;
      const halfLabelHeight = (compact ? 7 : 8) * labelScale;
      if (
        screen.x - halfLabelWidth < edgePadding ||
        screen.x + halfLabelWidth > width - edgePadding ||
        screen.y - halfLabelHeight < edgePadding ||
        screen.y + halfLabelHeight > height - edgePadding
      ) {
        continue;
      }
      if (
        headingExclusion &&
        screen.x + halfLabelWidth > headingExclusion.left &&
        screen.x - halfLabelWidth < headingExclusion.right &&
        screen.y + halfLabelHeight > headingExclusion.top &&
        screen.y - halfLabelHeight < headingExclusion.bottom
      ) {
        continue;
      }
      if (
        acceptedPositions.some(
          (position) =>
            Math.abs(position.x - screen.x) <
              position.halfWidth + halfLabelWidth + (compact ? 5 : 6) &&
            Math.abs(position.y - screen.y) <
              position.halfHeight + halfLabelHeight + 4,
        )
      ) {
        continue;
      }

      accepted.push(city);
      acceptedPositions.push({ ...screen, halfWidth: halfLabelWidth, halfHeight: halfLabelHeight });
    }

    const signature = accepted.map((city) => city.id).join("|");
    if (!force && signature === state.overviewLabelSignature) return;
    state.overviewLabelSignature = signature;
    state.globe.labelsData(accepted);
    elements.globe.dataset.cityLabels = String(accepted.length);
    elements.globe.dataset.cityLabelsTotal = String(data.overview.cities.length);
  }

  function scheduleOverviewCityLabels(force = false) {
    if (force) state.overviewLabelForce = true;
    if (state.overviewLabelFrame !== null) return;
    state.overviewLabelFrame = window.requestAnimationFrame((timestamp) => {
      state.overviewLabelFrame = null;
      const shouldForce = state.overviewLabelForce;
      state.overviewLabelForce = false;
      if (!shouldForce && timestamp - state.overviewLabelLastUpdateAt < 180) return;
      state.overviewLabelLastUpdateAt = timestamp;
      updateOverviewCityLabels(shouldForce);
    });
  }

  function addPlaneTriangle(positions, first, second, third) {
    positions.push(...first, ...second, ...third);
  }

  function addPlaneQuad(positions, first, second, third, fourth) {
    addPlaneTriangle(positions, first, second, third);
    addPlaneTriangle(positions, first, third, fourth);
  }

  function addPlanePrismXZ(positions, outline, bottom, top) {
    for (let index = 1; index < outline.length - 1; index += 1) {
      addPlaneTriangle(
        positions,
        [outline[0][0], top, outline[0][1]],
        [outline[index][0], top, outline[index][1]],
        [outline[index + 1][0], top, outline[index + 1][1]],
      );
      addPlaneTriangle(
        positions,
        [outline[0][0], bottom, outline[0][1]],
        [outline[index + 1][0], bottom, outline[index + 1][1]],
        [outline[index][0], bottom, outline[index][1]],
      );
    }
    outline.forEach((point, index) => {
      const next = outline[(index + 1) % outline.length];
      addPlaneQuad(
        positions,
        [point[0], bottom, point[1]],
        [next[0], bottom, next[1]],
        [next[0], top, next[1]],
        [point[0], top, point[1]],
      );
    });
  }

  function addPlanePrismXY(positions, outline, back, front) {
    for (let index = 1; index < outline.length - 1; index += 1) {
      addPlaneTriangle(
        positions,
        [outline[0][0], outline[0][1], front],
        [outline[index][0], outline[index][1], front],
        [outline[index + 1][0], outline[index + 1][1], front],
      );
      addPlaneTriangle(
        positions,
        [outline[0][0], outline[0][1], back],
        [outline[index + 1][0], outline[index + 1][1], back],
        [outline[index][0], outline[index][1], back],
      );
    }
    outline.forEach((point, index) => {
      const next = outline[(index + 1) % outline.length];
      addPlaneQuad(
        positions,
        [point[0], point[1], back],
        [next[0], next[1], back],
        [next[0], next[1], front],
        [point[0], point[1], front],
      );
    });
  }

  function addPlaneTube(positions, sections, centerY = 0, centerZ = 0, sides = 8) {
    const rings = sections.map((section) =>
      Array.from({ length: sides }, (_, index) => {
        const angle = (index / sides) * Math.PI * 2;
        return [
          section.x,
          centerY + Math.sin(angle) * section.height,
          centerZ + Math.cos(angle) * section.width,
        ];
      }),
    );

    for (let sectionIndex = 0; sectionIndex < rings.length - 1; sectionIndex += 1) {
      for (let sideIndex = 0; sideIndex < sides; sideIndex += 1) {
        const nextSide = (sideIndex + 1) % sides;
        addPlaneQuad(
          positions,
          rings[sectionIndex][sideIndex],
          rings[sectionIndex + 1][sideIndex],
          rings[sectionIndex + 1][nextSide],
          rings[sectionIndex][nextSide],
        );
      }
    }

    const lastSectionIndex = sections.length - 1;
    const firstCenter = [sections[0].x, centerY, centerZ];
    const lastCenter = [sections[lastSectionIndex].x, centerY, centerZ];
    for (let sideIndex = 0; sideIndex < sides; sideIndex += 1) {
      const nextSide = (sideIndex + 1) % sides;
      addPlaneTriangle(positions, firstCenter, rings[0][nextSide], rings[0][sideIndex]);
      addPlaneTriangle(
        positions,
        lastCenter,
        rings[lastSectionIndex][sideIndex],
        rings[lastSectionIndex][nextSide],
      );
    }
  }

  function createOverviewPlaneGeometry(constructors) {
    const positions = [];
    addPlaneTube(positions, [
      { x: 2.55, height: 0.025, width: 0.025 },
      { x: 2.12, height: 0.14, width: 0.12 },
      { x: 1.5, height: 0.2, width: 0.17 },
      { x: -1.6, height: 0.19, width: 0.16 },
      { x: -2.2, height: 0.08, width: 0.07 },
      { x: -2.38, height: 0.035, width: 0.03 },
    ]);
    addPlanePrismXZ(positions, [[0.92, 0.08], [0.12, 1.58], [-0.5, 1.45], [-0.08, 0.1]], -0.055, 0.075);
    addPlanePrismXZ(positions, [[0.92, -0.08], [-0.08, -0.1], [-0.5, -1.45], [0.12, -1.58]], -0.055, 0.075);
    addPlanePrismXZ(positions, [[-1.42, 0.055], [-1.76, 0.72], [-2.14, 0.64], [-1.92, 0.045]], -0.025, 0.075);
    addPlanePrismXZ(positions, [[-1.42, -0.055], [-1.92, -0.045], [-2.14, -0.64], [-1.76, -0.72]], -0.025, 0.075);
    addPlanePrismXY(positions, [[-1.42, 0.08], [-1.8, 0.72], [-2.12, 0.64], [-2.0, 0.08]], -0.055, 0.055);
    const engineSections = [
      { x: 0.62, height: 0.1, width: 0.095 },
      { x: 0.48, height: 0.12, width: 0.11 },
      { x: -0.28, height: 0.11, width: 0.1 },
      { x: -0.46, height: 0.065, width: 0.06 },
    ];
    addPlaneTube(positions, engineSections, -0.14, 0.56, 7);
    addPlaneTube(positions, engineSections, -0.14, -0.56, 7);

    const geometry = constructors.sourceGeometry.clone();
    geometry.setIndex(null);
    Object.keys(geometry.attributes).forEach((attribute) => geometry.deleteAttribute(attribute));
    geometry.clearGroups();
    geometry.morphAttributes = {};
    const vertices = [];
    for (let index = 0; index < positions.length; index += 3) {
      vertices.push(
        new constructors.Vector3(positions[index], positions[index + 1], positions[index + 2]),
      );
    }
    geometry.setFromPoints(vertices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = "Low-poly passenger aircraft";
    return geometry;
  }

  function overviewThreeConstructors(globe) {
    // Reuse Globe.gl's bundled Three.js runtime instead of shipping a second renderer copy.
    let sampleMesh = null;
    globe.scene().traverse((object) => {
      if (!sampleMesh && object.isMesh && object.geometry?.constructor) {
        sampleMesh = object;
      }
    });
    if (!sampleMesh?.constructor) return null;
    return {
      Matrix4: globe.scene().matrixWorld.constructor,
      Mesh: sampleMesh.constructor,
      sourceGeometry: sampleMesh.geometry,
      Vector3: globe.scene().position.constructor,
    };
  }

  function cubicPlanePoint(route, parameter, target) {
    const inverse = 1 - parameter;
    const firstWeight = inverse ** 3;
    const secondWeight = 3 * inverse ** 2 * parameter;
    const thirdWeight = 3 * inverse * parameter ** 2;
    const fourthWeight = parameter ** 3;
    target.set(
      firstWeight * route.p0[0] + secondWeight * route.p1[0] + thirdWeight * route.p2[0] + fourthWeight * route.p3[0],
      firstWeight * route.p0[1] + secondWeight * route.p1[1] + thirdWeight * route.p2[1] + fourthWeight * route.p3[1],
      firstWeight * route.p0[2] + secondWeight * route.p1[2] + thirdWeight * route.p2[2] + fourthWeight * route.p3[2],
    );
    return target;
  }

  function cubicPlaneDirection(route, parameter, target) {
    const inverse = 1 - parameter;
    target.set(
      3 * inverse ** 2 * (route.p1[0] - route.p0[0]) + 6 * inverse * parameter * (route.p2[0] - route.p1[0]) + 3 * parameter ** 2 * (route.p3[0] - route.p2[0]),
      3 * inverse ** 2 * (route.p1[1] - route.p0[1]) + 6 * inverse * parameter * (route.p2[1] - route.p1[1]) + 3 * parameter ** 2 * (route.p3[1] - route.p2[1]),
      3 * inverse ** 2 * (route.p1[2] - route.p0[2]) + 6 * inverse * parameter * (route.p2[2] - route.p1[2]) + 3 * parameter ** 2 * (route.p3[2] - route.p2[2]),
    );
    return target;
  }

  function planeRouteParameter(route, progress) {
    const distances = route.distances;
    let upperIndex = 1;
    while (upperIndex < distances.length && distances[upperIndex] < progress) upperIndex += 1;
    if (upperIndex >= distances.length) return 1;
    const lowerDistance = distances[upperIndex - 1];
    const span = distances[upperIndex] - lowerDistance || 1;
    return (upperIndex - 1 + (progress - lowerDistance) / span) / (distances.length - 1);
  }

  function createOverviewPlaneRoutes(globe, constructors) {
    const radius = globe.getGlobeRadius();
    const scratchPoint = new constructors.Vector3();

    return overviewFlights.map((flight, index) => {
      const startCoordinates = globe.getCoords(flight.start.lat, flight.start.lng, 0);
      const endCoordinates = globe.getCoords(flight.end.lat, flight.end.lng, 0);
      const p0 = [startCoordinates.x, startCoordinates.y, startCoordinates.z];
      const p3 = [endCoordinates.x, endCoordinates.y, endCoordinates.z];
      const startUnit = p0.map((value) => value / radius);
      const endUnit = p3.map((value) => value / radius);
      const angle = Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            startUnit[0] * endUnit[0] +
              startUnit[1] * endUnit[1] +
              startUnit[2] * endUnit[2],
          ),
        ),
      );
      const sineAngle = Math.sin(angle);
      const interpolateUnit = (progress) => {
        if (Math.abs(sineAngle) < 0.00001) {
          const values = startUnit.map(
            (value, component) => value + (endUnit[component] - value) * progress,
          );
          const length = Math.hypot(...values) || 1;
          return values.map((value) => value / length);
        }
        const firstWeight = Math.sin((1 - progress) * angle) / sineAngle;
        const secondWeight = Math.sin(progress * angle) / sineAngle;
        return startUnit.map(
          (value, component) => value * firstWeight + endUnit[component] * secondWeight,
        );
      };
      const controlRadius = radius * (1 + flightAltitude(flight) * 1.5);
      // Globe.gl uses these same quarter-arc cubic controls for elevated flight arcs.
      const p1 = interpolateUnit(0.25).map((value) => value * controlRadius);
      const p2 = interpolateUnit(0.75).map((value) => value * controlRadius);
      const route = {
        flight,
        p0,
        p1,
        p2,
        p3,
        phase: (index * 0.38196601125) % 1,
        cycleMs: Math.min(30000, Math.max(18000, 18000 + angle * 6500)),
        distances: new Float32Array(49),
      };
      let totalDistance = 0;
      let previousX = p0[0];
      let previousY = p0[1];
      let previousZ = p0[2];
      for (let sampleIndex = 1; sampleIndex < route.distances.length; sampleIndex += 1) {
        cubicPlanePoint(route, sampleIndex / (route.distances.length - 1), scratchPoint);
        totalDistance += Math.hypot(
          scratchPoint.x - previousX,
          scratchPoint.y - previousY,
          scratchPoint.z - previousZ,
        );
        route.distances[sampleIndex] = totalDistance;
        previousX = scratchPoint.x;
        previousY = scratchPoint.y;
        previousZ = scratchPoint.z;
      }
      for (let sampleIndex = 1; sampleIndex < route.distances.length; sampleIndex += 1) {
        route.distances[sampleIndex] /= totalDistance || 1;
      }
      return route;
    });
  }

  function initOverviewFlightPlanes() {
    if (!state.globe || state.overviewPlaneRuntime) return;
    if (!isOverview() || document.hidden || elements.globe.hidden) return;
    const constructors = overviewThreeConstructors(state.globe);
    if (!constructors) {
      if (state.overviewPlaneInitAttempts < 180 && state.overviewPlaneInitFrame === null) {
        state.overviewPlaneInitAttempts += 1;
        state.overviewPlaneInitFrame = window.requestAnimationFrame(() => {
          state.overviewPlaneInitFrame = null;
          initOverviewFlightPlanes();
        });
      } else if (state.overviewPlaneInitAttempts >= 180) {
        console.warn("3D aircraft could not access the globe renderer.");
      }
      return;
    }
    state.overviewPlaneInitAttempts = 0;

    const geometry = createOverviewPlaneGeometry(constructors);
    const material = state.globe.globeMaterial().clone();
    material.map = null;
    material.bumpMap = null;
    material.alphaMap = null;
    material.color?.set("#eef9ff");
    material.emissive?.set("#173845");
    if ("emissiveIntensity" in material) material.emissiveIntensity = 0.42;
    material.specular?.set("#d9f6ff");
    if ("shininess" in material) material.shininess = 92;
    material.opacity = 1;
    material.transparent = false;
    material.depthTest = true;
    material.depthWrite = true;
    material.side = 2;
    material.needsUpdate = true;

    const routes = createOverviewPlaneRoutes(state.globe, constructors);
    const planes = routes.map((route) => {
      const plane = new constructors.Mesh(geometry, material);
      plane.name = "Animated 3D flight · " + route.flight.label;
      plane.visible = false;
      plane.renderOrder = 4;
      plane.raycast = () => {};
      state.globe.scene().add(plane);
      return plane;
    });
    state.overviewPlaneRuntime = {
      radius: state.globe.getGlobeRadius(),
      routes,
      planes,
      position: new constructors.Vector3(),
      forward: new constructors.Vector3(),
      radial: new constructors.Vector3(),
      right: new constructors.Vector3(),
      up: new constructors.Vector3(),
      basis: new constructors.Matrix4(),
    };
    elements.globe.dataset.flightModels = String(planes.length);
    startOverviewFlightPlanes();
  }

  function paintOverviewFlightPlanes(timestamp) {
    state.overviewPlaneFrame = null;
    const runtime = state.overviewPlaneRuntime;
    if (!runtime || !isOverview() || document.hidden || elements.globe.hidden) return;

    const compact = elements.globe.clientWidth < 821;
    const frameInterval = compact ? 1000 / 30 : 1000 / 40;
    if (timestamp - state.overviewPlaneLastPaintAt >= frameInterval) {
      state.overviewPlaneLastPaintAt = timestamp;
      if (state.overviewPlaneStartedAt === null) state.overviewPlaneStartedAt = timestamp;
      const elapsed = timestamp - state.overviewPlaneStartedAt;
      const activeWindow = compact ? 0.22 : 0.28;
      const viewAltitude = state.globe.pointOfView().altitude;
      const modelScale =
        Math.min(1.65, Math.max(0.98, 0.82 + viewAltitude * 0.48)) * (compact ? 0.9 : 1);
      let activeModels = 0;

      runtime.routes.forEach((route, index) => {
        const plane = runtime.planes[index];
        const cycleProgress = (elapsed / route.cycleMs + route.phase) % 1;
        if (cycleProgress >= activeWindow) {
          plane.visible = false;
          return;
        }

        const travelProgress = cycleProgress / activeWindow;
        const parameter = planeRouteParameter(route, travelProgress);
        cubicPlanePoint(route, parameter, runtime.position);
        cubicPlaneDirection(route, parameter, runtime.forward).normalize();
        runtime.radial.copy(runtime.position).normalize();
        runtime.right.crossVectors(runtime.forward, runtime.radial);
        if (runtime.right.lengthSq() < 0.000001) {
          plane.visible = false;
          return;
        }
        runtime.right.normalize();
        runtime.up.crossVectors(runtime.right, runtime.forward).normalize();
        runtime.basis.makeBasis(runtime.forward, runtime.up, runtime.right);
        plane.position
          .copy(runtime.position)
          .addScaledVector(runtime.radial, runtime.radius * 0.006);
        plane.quaternion.setFromRotationMatrix(runtime.basis);
        plane.scale.setScalar(modelScale);
        plane.visible = true;
        activeModels += 1;
      });

      if (elements.globe.dataset.activeFlightModels !== String(activeModels)) {
        elements.globe.dataset.activeFlightModels = String(activeModels);
      }
    }

    state.overviewPlaneFrame = window.requestAnimationFrame(paintOverviewFlightPlanes);
  }

  function startOverviewFlightPlanes() {
    if (
      !state.overviewPlaneRuntime ||
      state.overviewPlaneFrame !== null ||
      !isOverview() ||
      document.hidden ||
      elements.globe.hidden
    ) {
      return;
    }
    state.overviewPlaneLastPaintAt = 0;
    state.overviewPlaneFrame = window.requestAnimationFrame(paintOverviewFlightPlanes);
  }

  function stopOverviewFlightPlanes() {
    if (state.overviewPlaneInitFrame !== null) {
      window.cancelAnimationFrame(state.overviewPlaneInitFrame);
      state.overviewPlaneInitFrame = null;
      state.overviewPlaneInitAttempts = 0;
    }
    if (state.overviewPlaneFrame !== null) {
      window.cancelAnimationFrame(state.overviewPlaneFrame);
      state.overviewPlaneFrame = null;
    }
    state.overviewPlaneRuntime?.planes.forEach((plane) => {
      plane.visible = false;
    });
    elements.globe.dataset.activeFlightModels = "0";
  }

  function refreshOverviewGlobe() {
    if (!state.globe) return;
    const points = [...data.overview.cities, ...data.overview.airports].map((item) => ({
      ...item,
      color: markerColor(item),
    }));
    const arcs = overviewFlights.map((flight) => ({
      ...flight,
      altitude: flightAltitude(flight),
      stroke: 0.36,
      color: ["rgba(104,219,176,0.18)", "rgba(104,219,176,0.66)"],
    }));

    state.globe.pointsData(points);
    state.overviewLabelSignature = "";
    state.globe.labelsData([]);
    state.globe.arcsData(arcs);
    state.globe.pathsData([]);
    state.globe.htmlElementsData([]);
    state.globe.ringsData([]);
    scheduleOverviewCityLabels(true);
  }

  function focusGlobe(view, duration = 1050) {
    if (!state.globe || !view) return;
    state.globe.pointOfView(view, reducedMotion ? 0 : duration);
  }

  function handleOverviewPoint(item) {
    if (!isOverview()) return;
    if (item.tripId && tripsById.has(item.tripId)) {
      selectView(item.tripId);
      return;
    }
    focusGlobe({ lat: item.lat, lng: item.lng, altitude: 0.55 });
  }

  function clusterIcon(cluster) {
    const count = cluster.getChildCount();
    return window.L.divIcon({
      className: "trip-cluster",
      html: "<span>" + count + "</span>",
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });
  }

  function stopIcon(stop, selected = false, endpoint = false) {
    const kind = stop.kind === "airport" || stop.kind === "station" ? stop.kind : "place";
    const stateClasses =
      (selected ? " is-selected" : "") + (endpoint ? " is-endpoint" : "");
    const markerPhoto = markerPhotoSource(stop);
    if (markerPhoto) {
      const photoCount = stop.photos?.length || 0;
      const stackedPhoto = photoCount > 1 ? stop.photos[1]?.preview : null;
      const stackMarkup = stackedPhoto
        ? '<span class="trip-photo-marker__stack" aria-hidden="true"><img src="' +
          escapeHtml(stackedPhoto) +
          '" alt="" loading="eager" decoding="async"></span>'
        : "";
      const countMarkup = photoCount > 1
        ? '<span class="trip-photo-marker__count" aria-hidden="true">' + photoCount + "</span>"
        : "";
      return window.L.divIcon({
        className:
          "trip-marker-shell trip-marker-shell--photo" +
          (photoCount > 1 ? " trip-marker-shell--stacked" : ""),
        html:
          '<span class="trip-photo-marker' +
          (photoCount > 1 ? " has-multiple" : "") +
          stateClasses +
          '">' +
          stackMarkup +
          '<span class="trip-photo-marker__frame"><img src="' +
          escapeHtml(markerPhoto) +
          '" alt="" loading="eager" decoding="async"></span>' +
          countMarkup +
          "</span>",
        iconSize: photoCount > 1 ? [66, 63] : [58, 56],
        iconAnchor: [29, 56],
        tooltipAnchor: [0, -50],
      });
    }
    const symbol = kind === "airport" ? "✈" : kind === "station" ? "🚆" : "•";
    return window.L.divIcon({
      className: "trip-marker-shell",
      html:
        '<span class="trip-marker trip-marker--' +
        kind +
        stateClasses +
        '"><span aria-hidden="true">' +
        symbol +
        "</span></span>",
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      tooltipAnchor: [0, -20],
    });
  }

  function routeVehicleMarkup(mode) {
    if (mode === "plane") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 72 40" aria-hidden="true">
          <path class="route-vehicle__body" d="M69 20c0-2.4-3.4-4.2-8.6-4.6l-18.2-1.3L30.5 3h-7.1l5.3 10.2-14.5-1L7.2 6H3.5l2.8 14-2.8 14h3.7l7-6.2 14.5-1L23.4 37h7.1l11.7-11.1 18.2-1.3C65.6 24.2 69 22.4 69 20Z"/>
          <path class="route-vehicle__shade" d="M67.2 21c-1.6 1.6-4 2.5-7.2 2.8l-18.6 1.4L29.8 35.7h-3.9l5.2-10.5-17.6 1.2-6.8 5.8H5.4L7.7 21h59.5Z"/>
          <path class="route-vehicle__highlight" d="M7.7 18.1 5.8 8h1.1l7 6 17.2 1.2-5.2-10.9h3.9l11.6 10.5L60 16.2c3.2.2 5.6 1.1 7.2 2.8Z"/>
          <path class="route-vehicle__accent route-vehicle__accent--plane" d="m6.1 15.1 9 .7v8.4l-9 .7L7.2 20Z"/>
          <path class="route-vehicle__glass" d="M57.8 17.1c4 .3 7 1.3 8.4 2.9-1.4 1.6-4.4 2.6-8.4 2.9Z"/>
        </svg>`;
    }
    if (mode === "shinkansen") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 72 32" aria-hidden="true">
          <path class="route-vehicle__body" d="M6 4h37c10.4 0 20.2 4.5 25.5 12C63.2 23.5 53.4 28 43 28H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"/>
          <path class="route-vehicle__shade" d="M3 16h65.5C63.2 23.5 53.4 28 43 28H6a3 3 0 0 1-3-3Z"/>
          <path class="route-vehicle__highlight" d="M6 6h37c8.3 0 16.3 3.2 21.6 8H6Z"/>
          <path class="route-vehicle__glass" d="M15 8.4h28c6.7 0 12.8 1.9 17.5 5.3H15Z"/>
          <path class="route-vehicle__accent route-vehicle__accent--shinkansen" d="M5 21h39.5c8.3 0 15.8-2.1 21-5.8"/>
        </svg>`;
    }
    if (mode === "bus") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 68 38" aria-hidden="true">
          <path class="route-vehicle__body" d="M8 3h43c7.7 0 13 5.1 13 12v12a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8a5 5 0 0 1 5-5Z"/>
          <path class="route-vehicle__shade" d="M3 21h61v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
          <path class="route-vehicle__highlight" d="M8 5h43c5.9 0 10 3.3 11.1 8H6V8a2 2 0 0 1 2-3Z"/>
          <path class="route-vehicle__glass" d="M9 8h40c5 0 8.8 2.6 10.2 7.2H9Z"/>
          <path class="route-vehicle__accent route-vehicle__accent--bus" d="M4 22h59v5H4Z"/>
          <circle class="route-vehicle__wheel" cx="17" cy="30" r="5"/>
          <circle class="route-vehicle__wheel" cx="52" cy="30" r="5"/>
          <circle class="route-vehicle__wheel-hub" cx="17" cy="30" r="2"/>
          <circle class="route-vehicle__wheel-hub" cx="52" cy="30" r="2"/>
          <circle class="route-vehicle__light" cx="61" cy="18" r="1.4"/>
        </svg>`;
    }
    return `
      <svg class="route-vehicle__svg" viewBox="0 0 64 34" aria-hidden="true">
        <path class="route-vehicle__body" d="M7 3h39c8 0 14 5.3 14 12v4c0 6.7-6 12-14 12H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z"/>
        <path class="route-vehicle__shade" d="M3 18h57v1c0 6.7-6 12-14 12H7a4 4 0 0 1-4-4Z"/>
        <path class="route-vehicle__highlight" d="M7 5h39c6.2 0 10.9 3.5 12.6 8H7Z"/>
        <path class="route-vehicle__glass" d="M12 7.5h33c5.2 0 9.2 2.5 11 6.3H12Z"/>
        <path class="route-vehicle__accent route-vehicle__accent--train" d="M4 21h52.5a13 13 0 0 1-3.2 4H4Z"/>
        <circle class="route-vehicle__light" cx="55.5" cy="14.5" r="1.4"/>
        <circle class="route-vehicle__light" cx="55.5" cy="19.5" r="1.4"/>
      </svg>`;
  }

  function routeVehicleIcon(leg) {
    const mode = ["plane", "shinkansen", "train", "bus"].includes(leg.mode)
      ? leg.mode
      : "train";
    return window.L.divIcon({
      className: "route-vehicle-shell",
      html:
        '<span class="route-vehicle route-vehicle--' + mode + '">' +
        '<span class="route-vehicle__shadow" aria-hidden="true"></span>' +
        '<span class="route-vehicle__bearing"><span class="route-vehicle__model">' +
        routeVehicleMarkup(mode) +
        "</span></span></span>",
      iconSize: [76, 56],
      iconAnchor: [38, 28],
    });
  }

  function initStreetMap() {
    if (state.streetMap) return true;
    if (
      typeof window.L !== "object" ||
      typeof window.L.map !== "function" ||
      typeof window.L.markerClusterGroup !== "function"
    ) {
      showMapFallback();
      return false;
    }

    try {
      const map = window.L.map(elements.streetMap, {
        zoomControl: true,
        attributionControl: false,
        zoomAnimation: !reducedMotion,
        fadeAnimation: !reducedMotion,
        markerZoomAnimation: !reducedMotion,
      });
      window.L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
      window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: window.innerWidth < 821 ? 1 : 2,
        detectRetina: window.devicePixelRatio > 1,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);

      const vehiclePane = map.createPane("travelVehiclePane");
      vehiclePane.style.zIndex = "640";
      vehiclePane.style.pointerEvents = "none";
      const routeGroup = window.L.layerGroup().addTo(map);
      const markerCluster = window.L.markerClusterGroup({
        maxClusterRadius: (zoom) => (zoom >= 14 ? 32 : 44),
        disableClusteringAtZoom: 17,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        removeOutsideVisibleBounds: true,
        chunkedLoading: true,
        animateAddingMarkers: false,
        iconCreateFunction: clusterIcon,
      });
      markerCluster.addTo(map);
      const endpointGroup = window.L.layerGroup().addTo(map);
      const motionGroup = window.L.layerGroup().addTo(map);

      state.streetMap = map;
      state.routeGroup = routeGroup;
      state.markerCluster = markerCluster;
      state.endpointGroup = endpointGroup;
      state.motionGroup = motionGroup;

      map.on("zoomend moveend", () => updateMotionVehicle(state.motionProgress));

      const resizeObserver = new ResizeObserver(() => {
        if (elements.streetMap.hidden) return;
        window.requestAnimationFrame(() => state.streetMap?.invalidateSize({ pan: false }));
      });
      resizeObserver.observe(elements.streetMap);
      return true;
    } catch (error) {
      console.error("Street map initialization failed", error);
      showMapFallback();
      return false;
    }
  }

  function greatCirclePoint(from, to, fraction) {
    const radians = Math.PI / 180;
    const degrees = 180 / Math.PI;
    const lat1 = from.lat * radians;
    const lng1 = from.lng * radians;
    const lat2 = to.lat * radians;
    const lng2 = to.lng * radians;
    const haversine =
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
    const centralAngle = 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
    if (centralAngle < 1e-8) return [from.lat, from.lng];
    const denominator = Math.sin(centralAngle);
    const startWeight = Math.sin((1 - fraction) * centralAngle) / denominator;
    const endWeight = Math.sin(fraction * centralAngle) / denominator;
    const x = startWeight * Math.cos(lat1) * Math.cos(lng1) +
      endWeight * Math.cos(lat2) * Math.cos(lng2);
    const y = startWeight * Math.cos(lat1) * Math.sin(lng1) +
      endWeight * Math.cos(lat2) * Math.sin(lng2);
    const z = startWeight * Math.sin(lat1) + endWeight * Math.sin(lat2);
    return [
      Math.atan2(z, Math.hypot(x, y)) * degrees,
      Math.atan2(y, x) * degrees,
    ];
  }

  function flightCoordinates(from, to) {
    const points = Array.from({ length: 49 }, (_, index) =>
      greatCirclePoint(from, to, index / 48),
    );
    const unwrapped = [points[0]];
    let crossedDateline = false;
    for (let index = 1; index < points.length; index += 1) {
      const previous = unwrapped[index - 1];
      const current = points[index];
      let longitude = current[1];
      while (longitude - previous[1] > 180) {
        longitude -= 360;
        crossedDateline = true;
      }
      while (longitude - previous[1] < -180) {
        longitude += 360;
        crossedDateline = true;
      }
      unwrapped.push([current[0], longitude]);
    }

    if (!crossedDateline) return unwrapped;

    const midpointLongitude =
      (unwrapped[0][1] + unwrapped.at(-1)[1]) / 2;
    const worldShift = midpointLongitude > 90 ? -360 : midpointLongitude < -270 ? 360 : 0;
    return worldShift
      ? unwrapped.map(([latitude, longitude]) => [latitude, longitude + worldShift])
      : unwrapped;
  }

  function legCoordinates(leg, stops) {
    const from = stops.get(leg.from);
    const to = stops.get(leg.to);
    if (leg.mode === "plane") return flightCoordinates(from, to);
    const via = (leg.via || []).map((point) => [point[0], point[1]]);
    return [[from.lat, from.lng], ...via, [to.lat, to.lng]];
  }

  function routeDashArray(mode) {
    const patterns = {
      plane: "15 11",
      shinkansen: "16 7",
      train: "11 7",
      bus: "7 6",
    };
    return patterns[mode] || "9 7";
  }

  function routeStyle(leg, active, dimmed) {
    return {
      color: modeColor(leg.mode),
      weight: active ? 5 : 2.7,
      opacity: dimmed ? 0.2 : active ? 0.96 : 0.52,
      dashArray: routeDashArray(leg.mode),
      dashOffset: "0",
      lineCap: "round",
      lineJoin: "round",
    };
  }

  function renderStreetTrip(trip) {
    if (
      !state.streetMap ||
      !state.markerCluster ||
      !state.routeGroup ||
      !state.endpointGroup ||
      !state.motionGroup
    ) return;
    if (state.streetTripId !== trip.id) {
      state.markerCluster.clearLayers();
      state.routeGroup.clearLayers();
      state.endpointGroup.clearLayers();
      state.motionGroup.clearLayers();
      state.motionMarker = null;
      state.motionTrail = null;
      state.motionRoute = null;
      state.motionLegId = null;
      state.markerLayers.clear();
      state.routeLayers.clear();
      state.streetTripId = trip.id;

      const markers = trip.stops.map((stop) => {
        const marker = window.L.marker([stop.lat, stop.lng], {
          icon: stopIcon(stop),
          keyboard: true,
          riseOnHover: true,
          title: stop.name,
          alt: stop.name,
        });
        const tooltip = document.createElement("span");
        tooltip.textContent = stop.name;
        marker.bindTooltip(tooltip, {
          className: "map-tooltip",
          direction: "top",
          opacity: 1,
        });
        marker.on("click", () => selectStop(stop.id));
        marker.options.travelVisualState = "default";
        state.markerLayers.set(stop.id, marker);
        return marker;
      });
      state.markerCluster.addLayers(markers);

      const stops = stopMap(trip);
      trip.legs.forEach((leg, index) => {
        const active = index === state.activeLegIndex && !state.selectedStopId;
        const coordinates = legCoordinates(leg, stops);
        const polyline = window.L.polyline(
          coordinates,
          {
            ...routeStyle(leg, active, false),
            className:
              "trip-route trip-route--" +
              leg.mode +
              (active ? " is-active" : ""),
            interactive: true,
          },
        ).addTo(state.routeGroup);
        const tooltip = document.createElement("span");
        tooltip.textContent = modeLabel(leg.mode) + " · " + leg.label;
        polyline.bindTooltip(tooltip, {
          className: "map-tooltip",
          sticky: true,
          opacity: 1,
        });
        polyline.on("click", () => setActiveLeg(index));
        polyline.options.travelCoordinates = coordinates;
        state.routeLayers.set(leg.id, polyline);
      });
    }
    updateStreetStyles();
  }

  function motionDuration(leg = activeLeg()) {
    return motionDurations[leg?.mode] || 4800;
  }

  function clearMotionLayers(forgetRoute = true) {
    state.motionGroup?.clearLayers();
    state.motionMarker = null;
    state.motionTrail = null;
    if (forgetRoute) {
      state.motionRoute = null;
      state.motionLegId = null;
      state.motionBearing = null;
    }
  }

  function resetMotionProgress() {
    state.motionStartedAt = null;
    state.motionElapsedMs = 0;
    state.motionProgress = 0;
    state.motionBearing = null;
    state.motionLastPaintAt = 0;
    elements.routeProgress.style.setProperty("--motion-progress", "0");
  }

  function buildMotionRoute(leg, stops) {
    const cachedCoordinates = state.routeLayers.get(leg.id)?.options.travelCoordinates;
    const coordinates = cachedCoordinates || legCoordinates(leg, stops);
    const points = [];
    coordinates.forEach((coordinate) => {
      const point = [Number(coordinate[0]), Number(coordinate[1])];
      if (!points.length) {
        points.push(point);
        return;
      }
      const previous = points.at(-1);
      const distance = window.L.latLng(previous).distanceTo(window.L.latLng(point));
      if (distance < 0.5) points[points.length - 1] = point;
      else points.push(point);
    });
    if (points.length < 2) return null;

    const cumulative = [0];
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(
        cumulative[index - 1] +
        window.L.latLng(points[index - 1]).distanceTo(window.L.latLng(points[index])),
      );
    }
    const total = cumulative.at(-1);
    return total > 0 ? { points, cumulative, total } : null;
  }

  function sampleMotionRoute(route, progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    const eased = clamped * clamped * (3 - 2 * clamped);
    const target = route.total * eased;
    let low = 1;
    let high = route.cumulative.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (route.cumulative[middle] < target) low = middle + 1;
      else high = middle;
    }
    const endIndex = low;
    const startIndex = Math.max(0, endIndex - 1);
    const segmentStartDistance = route.cumulative[startIndex];
    const segmentLength = Math.max(
      0.0001,
      route.cumulative[endIndex] - segmentStartDistance,
    );
    const ratio = Math.max(0, Math.min(1, (target - segmentStartDistance) / segmentLength));
    const start = route.points[startIndex];
    const end = route.points[endIndex];
    const latlng = [
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
    ];
    return {
      latlng,
      trail: [...route.points.slice(0, endIndex), latlng],
    };
  }

  function motionBearing(route, progress) {
    if (!state.streetMap?._loaded) return state.motionBearing ?? 0;
    const step = progress < 0.08 || progress > 0.92 ? 0.08 : 0.018;
    const fromProgress = progress >= 1 - step ? Math.max(0, progress - step) : progress;
    const toProgress = progress >= 1 - step ? progress : Math.min(1, progress + step);
    const fromPoint = sampleMotionRoute(route, fromProgress).latlng;
    const toPoint = sampleMotionRoute(route, toProgress).latlng;
    const fromPixel = state.streetMap.latLngToLayerPoint(fromPoint);
    const toPixel = state.streetMap.latLngToLayerPoint(toPoint);
    if (fromPixel.equals(toPixel)) return state.motionBearing ?? 0;
    const nextBearing = Math.atan2(toPixel.y - fromPixel.y, toPixel.x - fromPixel.x) * 180 / Math.PI;
    if (state.motionBearing === null) {
      state.motionBearing = nextBearing;
      return nextBearing;
    }
    const difference = ((nextBearing - state.motionBearing + 540) % 360) - 180;
    state.motionBearing += difference * 0.32;
    return state.motionBearing;
  }

  function vehiclePose(mode, bearing) {
    if (mode === "plane") return { angle: bearing, direction: 1 };
    const normalizedBearing = ((bearing + 540) % 360) - 180;
    const keepUpright = Math.abs(normalizedBearing) > 90;
    return {
      angle: keepUpright
        ? normalizedBearing + (normalizedBearing > 0 ? -180 : 180)
        : normalizedBearing,
      direction: keepUpright ? -1 : 1,
    };
  }

  function updateMotionVehicle(progress = state.motionProgress) {
    if (!state.motionMarker || !state.motionRoute) return;
    const displayProgress = Math.max(0, Math.min(1, progress));
    const sample = sampleMotionRoute(state.motionRoute, displayProgress);
    state.motionMarker.setLatLng(sample.latlng);
    if (state.motionTrail) {
      const trail = sample.trail.length > 1 ? sample.trail : [sample.latlng, sample.latlng];
      state.motionTrail.setLatLngs(trail);
      state.motionTrail.bringToFront();
    }

    const element = state.motionMarker.getElement();
    if (element) {
      const pose = vehiclePose(
        activeLeg()?.mode,
        motionBearing(state.motionRoute, displayProgress),
      );
      element.style.setProperty("--vehicle-angle", pose.angle + "deg");
      element.style.setProperty("--vehicle-direction", String(pose.direction));
      element.classList.toggle("is-moving", state.playing);
    }
    elements.routeProgress.style.setProperty(
      "--motion-progress",
      String(Math.max(0, Math.min(1, progress))),
    );
  }

  function syncMotionVehicle(leg) {
    if (!state.motionGroup || state.selectedStopId || !leg) {
      clearMotionLayers(false);
      return;
    }

    if (state.motionLegId !== leg.id || !state.motionRoute) {
      clearMotionLayers();
      state.motionLegId = leg.id;
      state.motionRoute = buildMotionRoute(leg, stopMap());
    }
    if (!state.motionRoute) return;

    if (!state.motionMarker || !state.motionTrail) {
      const start = state.motionRoute.points[0];
      state.motionTrail = window.L.polyline([start, start], {
        color: modeColor(leg.mode),
        weight: 6.5,
        opacity: 0.94,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
        className: "trip-route-progress trip-route-progress--" + leg.mode,
      }).addTo(state.motionGroup);
      state.motionMarker = window.L.marker(start, {
        icon: routeVehicleIcon(leg),
        pane: "travelVehiclePane",
        interactive: false,
        keyboard: false,
        title: modeLabel(leg.mode) + " travelling along the active route",
      }).addTo(state.motionGroup);
      window.requestAnimationFrame(() => updateMotionVehicle(state.motionProgress));
    }
    updateMotionVehicle(state.motionProgress);
  }

  function updateStreetStyles() {
    const trip = currentTrip();
    if (!trip || state.streetTripId !== trip.id) return;
    const leg = activeLeg(trip);

    trip.stops.forEach((stop) => {
      const marker = state.markerLayers.get(stop.id);
      if (!marker) return;
      const selected = state.selectedStopId === stop.id;
      const visualState = selected ? "selected" : "default";
      if (marker.options.travelVisualState !== visualState) {
        marker.setIcon(stopIcon(stop, selected));
        marker.options.travelVisualState = visualState;
      }
    });

    state.endpointGroup?.clearLayers();
    if (!state.selectedStopId && leg && state.endpointGroup) {
      const stops = stopMap(trip);
      const coordinates = legCoordinates(leg, stops);
      const endpoints = [
        { role: "Start", stop: stops.get(leg.from), coordinates: coordinates[0] },
        { role: "End", stop: stops.get(leg.to), coordinates: coordinates.at(-1) },
      ];
      endpoints.forEach((endpoint) => {
        const marker = window.L.marker(endpoint.coordinates, {
          icon: stopIcon(endpoint.stop, false, true),
          keyboard: true,
          riseOnHover: true,
          title: endpoint.role + ": " + endpoint.stop.name,
          alt: endpoint.role + ": " + endpoint.stop.name,
          zIndexOffset: 1200,
        });
        marker.bindTooltip(
          endpoint.role + " · " + (endpoint.stop.code || endpoint.stop.name),
          {
            className: "map-tooltip map-tooltip--endpoint",
            direction: "top",
            opacity: 1,
            permanent: true,
          },
        );
        marker.on("click", () => selectStop(endpoint.stop.id));
        marker.addTo(state.endpointGroup);
      });
    }

    trip.legs.forEach((item, index) => {
      const layer = state.routeLayers.get(item.id);
      if (!layer) return;
      const active = index === state.activeLegIndex && !state.selectedStopId;
      layer.setStyle(routeStyle(item, active, Boolean(state.selectedStopId)));
      const path = layer.getElement();
      path?.classList.toggle("is-active", active);
      path?.classList.toggle("is-playing", active && state.playing);
      if (active) layer.bringToFront();
    });
    syncMotionVehicle(!state.selectedStopId ? leg : null);
  }

  function mapPadding() {
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    return mobile
      ? { paddingTopLeft: [22, 64], paddingBottomRight: [22, 165] }
      : { paddingTopLeft: [32, 72], paddingBottomRight: [32, 220] };
  }

  function fitTripBounds(trip, animate = true) {
    if (!state.streetMap || !trip.stops.length) return;
    if (trip.stops.length === 1) {
      state.streetMap.flyTo(
        [trip.stops[0].lat, trip.stops[0].lng],
        13,
        { animate: animate && !reducedMotion, duration: 0.9 },
      );
      return;
    }
    const bounds = window.L.latLngBounds(trip.stops.map((stop) => [stop.lat, stop.lng]));
    state.streetMap.flyToBounds(bounds, {
      ...mapPadding(),
      maxZoom: 12,
      animate: animate && !reducedMotion,
      duration: 1,
    });
  }

  function focusLeg(leg = activeLeg(), animate = true) {
    const trip = currentTrip();
    if (!state.streetMap || !trip || !leg) return;
    const stops = stopMap(trip);
    const coordinates = legCoordinates(leg, stops);
    const bounds = window.L.latLngBounds(coordinates);
    const from = stops.get(leg.from);
    const to = stops.get(leg.to);
    const latitudeSpan = Math.abs(from.lat - to.lat);
    const rawLongitudeSpan = Math.abs(from.lng - to.lng);
    const longitudeSpan =
      Math.min(rawLongitudeSpan, 360 - rawLongitudeSpan) *
      Math.cos((((from.lat + to.lat) / 2) * Math.PI) / 180);
    const span = Math.hypot(latitudeSpan, longitudeSpan);
    let maxZoom = 9;
    if (leg.mode === "plane") maxZoom = 8;
    else if (span < 0.025) maxZoom = 17;
    else if (span < 0.12) maxZoom = 15;
    else if (span < 0.55) maxZoom = 12;
    state.streetMap.flyToBounds(bounds, {
      ...mapPadding(),
      maxZoom,
      animate: animate && !reducedMotion,
      duration: 0.95,
    });
  }

  function focusStop(stop) {
    if (!state.streetMap) return;
    const marker = state.markerLayers.get(stop.id);
    const zoom = stop.kind === "airport" ? 14 : 16;
    const focus = () => {
      state.streetMap.flyTo([stop.lat, stop.lng], Math.max(state.streetMap.getZoom(), zoom), {
        animate: !reducedMotion,
        duration: 0.8,
      });
    };
    if (marker && state.markerCluster) {
      state.markerCluster.zoomToShowLayer(marker, focus);
    } else {
      focus();
    }
  }

  function focusMapArea(focus) {
    const trip = currentTrip();
    if (!trip || !state.streetMap) return;
    stopPlayback();
    state.selectedStopId = null;
    state.mapFocus = focus;
    renderMapFocus();
    renderRouteCard();
    updateStreetStyles();

    if (focus === "all") {
      fitTripBounds(trip);
      return;
    }
    const area = trip.focusAreas?.find((item) => item.id === focus);
    if (!area) return;
    state.streetMap.flyTo([area.lat, area.lng], area.zoom, {
      animate: !reducedMotion,
      duration: 0.95,
    });
  }

  function applyOverviewRotation() {
    if (!state.globe) return;
    state.globe.controls().autoRotate =
      isOverview() && state.overviewRotation && !document.hidden;
    state.globe.controls().autoRotateSpeed = 0.32;
  }

  function activateMapView(options = {}) {
    const focusInitial = Boolean(options.focusInitial);
    elements.fallback.hidden = true;

    if (isOverview()) {
      elements.app.classList.add("is-overview");
      elements.app.classList.remove("is-trip");
      elements.mapStage.classList.add("is-overview");
      elements.mapStage.classList.remove("is-trip");
      elements.globe.hidden = false;
      elements.globe.removeAttribute("aria-hidden");
      elements.streetMap.hidden = true;
      elements.streetMap.setAttribute("aria-hidden", "true");
      state.streetMap?.stop();
      state.globe?.resumeAnimation();
      refreshOverviewGlobe();
      applyOverviewRotation();
      initOverviewFlightPlanes();
      startOverviewFlightPlanes();
      if (focusInitial) focusGlobe(data.overview.initialView, 1250);
      return;
    }

    const trip = currentTrip();
    elements.app.classList.remove("is-overview");
    elements.app.classList.add("is-trip");
    elements.mapStage.classList.remove("is-overview");
    elements.mapStage.classList.add("is-trip");
    elements.globe.hidden = true;
    elements.globe.setAttribute("aria-hidden", "true");
    elements.streetMap.hidden = false;
    elements.streetMap.removeAttribute("aria-hidden");
    if (state.globe) {
      state.globe.controls().autoRotate = false;
      state.globe.pauseAnimation();
    }
    stopOverviewFlightPlanes();
    if (!initStreetMap()) return;
    renderStreetTrip(trip);
    window.requestAnimationFrame(() => {
      state.streetMap.invalidateSize({ pan: false });
      if (focusInitial) {
        if (trip.legs.length) focusLeg(activeLeg(trip), false);
        else fitTripBounds(trip, false);
      }
      window.requestAnimationFrame(() => updateMotionVehicle(state.motionProgress));
    });
  }

  function selectView(viewId) {
    if (viewId !== data.overview.id && !tripsById.has(viewId)) return;
    if (viewId === state.viewId) return;
    stopPlayback({ refresh: false });
    resetMotionProgress();
    clearMotionLayers();
    state.viewId = viewId;
    state.selectedStopId = null;
    state.mapFocus = "all";

    if (isOverview()) {
      state.overviewRotation = true;
    } else {
      const trip = currentTrip();
      state.activeLegIndex = Math.max(
        0,
        trip.legs.findIndex((leg) => leg.id === trip.defaultLegId),
      );
      state.mapFocus = trip.legs.length ? "" : "all";
    }
    renderAll({ focusInitial: true });
  }

  function setActiveLeg(index, options = {}) {
    const trip = currentTrip();
    if (!trip?.legs.length) return;
    if (!options.keepPlaying) stopPlayback({ refresh: false });
    state.activeLegIndex = (index + trip.legs.length) % trip.legs.length;
    resetMotionProgress();
    state.selectedStopId = null;
    state.mapFocus = "";
    renderMapFocus();
    renderRouteCard();
    renderPlaybackState();
    updateStreetStyles();
    focusLeg();
    if (state.playing) requestMotionFrame();
  }

  function selectStop(stopId) {
    const trip = currentTrip();
    const stop = stopMap(trip).get(stopId);
    if (!trip || !stop) return;
    stopPlayback();
    if (state.selectedStopId === stopId && stop.photos.length) {
      openGallery(stop);
      return;
    }
    state.selectedStopId = stopId;
    state.mapFocus = "";
    renderMapFocus();
    renderRouteCard();
    renderPlaybackState();
    updateStreetStyles();
    focusStop(stop);
    if (markerPhotoSource(stop) && stop.photos.length) openGallery(stop);
  }

  function requestMotionFrame() {
    if (!state.playing || state.motionFrame !== null) return;
    state.motionFrame = window.requestAnimationFrame(runMotionFrame);
  }

  function runMotionFrame(timestamp) {
    state.motionFrame = null;
    if (!state.playing) return;
    const leg = activeLeg();
    if (!leg || !state.motionRoute) {
      stopPlayback();
      return;
    }
    if (state.motionStartedAt === null) {
      state.motionStartedAt = timestamp - state.motionElapsedMs;
    }

    const duration = motionDuration(leg);
    state.motionElapsedMs = Math.min(duration, timestamp - state.motionStartedAt);
    state.motionProgress = Math.min(1, state.motionElapsedMs / duration);
    const frameInterval = window.innerWidth < 821 ? 1000 / 30 : 1000 / 60;
    if (
      state.motionProgress >= 1 ||
      timestamp - state.motionLastPaintAt >= frameInterval
    ) {
      state.motionLastPaintAt = timestamp;
      updateMotionVehicle(state.motionProgress);
    }

    if (state.motionProgress >= 1) {
      setActiveLeg(state.activeLegIndex + 1, { keepPlaying: true });
      requestMotionFrame();
      return;
    }
    requestMotionFrame();
  }

  function startPlayback() {
    const trip = currentTrip();
    if (!trip?.legs.length) return;
    state.selectedStopId = null;
    state.playing = true;
    renderMapFocus();
    renderRouteCard();
    renderPlaybackState();
    updateStreetStyles();
    focusLeg();
    requestMotionFrame();
  }

  function stopPlayback(options = {}) {
    if (state.playing && state.motionStartedAt !== null) {
      const duration = motionDuration();
      state.motionElapsedMs = Math.min(duration, performance.now() - state.motionStartedAt);
      state.motionProgress = Math.min(1, state.motionElapsedMs / duration);
      updateMotionVehicle(state.motionProgress);
    }
    state.playing = false;
    if (state.motionFrame !== null) window.cancelAnimationFrame(state.motionFrame);
    state.motionFrame = null;
    state.motionStartedAt = null;
    renderPlaybackState();
    if (options.refresh !== false) updateStreetStyles();
  }

  function togglePrimaryAnimation() {
    if (isOverview()) return;
    if (state.playing) stopPlayback();
    else startPlayback();
  }

  function openGallery(stop) {
    if (!stop.photos.length) return;
    stopPlayback();
    elements.galleryKicker.textContent = currentTrip().name + " · " + stop.city;
    elements.galleryTitle.textContent = stop.name;
    elements.galleryGrid.replaceChildren(
      ...stop.photos.map((photo, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gallery__image-button is-loading";
        button.setAttribute("aria-label", "Open " + stop.name + " photo " + (index + 1));
        button.addEventListener("click", () =>
          openLightbox(photo.full, photo.preview, stop.name + " photo " + (index + 1)),
        );
        const image = document.createElement("img");
        image.alt = stop.name + " photo " + (index + 1);
        image.loading = index < 4 ? "eager" : "lazy";
        image.decoding = "async";
        if (index < 4) image.fetchPriority = "high";
        image.width = 480;
        image.height = 480;
        image.addEventListener(
          "load",
          () => button.classList.remove("is-loading"),
          { once: true },
        );
        image.addEventListener(
          "error",
          () => {
            button.classList.remove("is-loading");
            button.classList.add("is-error");
          },
          { once: true },
        );
        image.src = photo.preview;
        button.append(image);
        return button;
      }),
    );
    elements.gallery.hidden = false;
    elements.galleryClose.focus();
  }

  function closeGallery() {
    elements.gallery.hidden = true;
    elements.galleryGrid.replaceChildren();
  }

  function openLightbox(src, preview, alt) {
    elements.lightbox.classList.add("is-loading");
    elements.lightbox.classList.remove("has-error");
    elements.lightbox.setAttribute("aria-busy", "true");
    elements.lightbox.style.setProperty(
      "--lightbox-preview",
      "url(" + JSON.stringify(preview) + ")",
    );
    elements.lightboxImage.alt = alt;
    elements.lightboxImage.onload = () => {
      elements.lightbox.classList.remove("is-loading");
      elements.lightbox.setAttribute("aria-busy", "false");
    };
    elements.lightboxImage.onerror = () => {
      elements.lightbox.classList.remove("is-loading");
      elements.lightbox.classList.add("has-error");
      elements.lightbox.setAttribute("aria-busy", "false");
    };
    elements.lightbox.hidden = false;
    elements.lightboxImage.src = src;
    elements.lightboxClose.focus();
  }

  function closeLightbox() {
    elements.lightbox.hidden = true;
    elements.lightbox.classList.remove("is-loading", "has-error");
    elements.lightbox.removeAttribute("aria-busy");
    elements.lightbox.style.removeProperty("--lightbox-preview");
    elements.lightboxImage.onload = null;
    elements.lightboxImage.onerror = null;
    elements.lightboxImage.src = "";
    elements.lightboxImage.alt = "";
  }

  function renderAll(options = {}) {
    renderTripTabs();
    renderSummary();
    renderLegend();
    renderMapFocus();
    renderRouteCard();
    renderPlaybackState();
    activateMapView(options);
  }

  function showMapFallback() {
    elements.fallback.hidden = false;
  }

  function initGlobe() {
    if (typeof window.Globe !== "function") {
      showMapFallback();
      return;
    }

    try {
      const globe = window.Globe()(elements.globe)
        .globeImageUrl("./trip_images/globe/earth-night.jpg")
        .backgroundColor("rgba(0,0,0,0)")
        .showAtmosphere(true)
        .atmosphereColor("#3b9fbc")
        .atmosphereAltitude(0.12)
        .pointsData([])
        .pointLat("lat")
        .pointLng("lng")
        .pointColor("color")
        .pointAltitude((item) => (item.kind === "airport" ? 0.05 : 0.025))
        .pointRadius((item) => (item.kind === "airport" ? 0.18 : 0.085))
        .pointResolution(8)
        .pointsMerge(false)
        .pointLabel(globePointTooltip)
        .onPointClick(handleOverviewPoint)
        .labelsData([])
        .labelLat("lat")
        .labelLng("lng")
        .labelText("name")
        .labelSize(() => (elements.globe.clientWidth < 600 ? 0.68 : 0.78))
        .labelIncludeDot(false)
        .labelDotRadius(0)
        .labelAltitude(0.04)
        .labelColor(() => "rgba(232,241,248,0.86)")
        .labelResolution(2)
        .labelLabel(() => "")
        .labelsTransitionDuration(reducedMotion ? 0 : 180)
        .arcsData([])
        .arcStartLat((flight) => flight.start.lat)
        .arcStartLng((flight) => flight.start.lng)
        .arcEndLat((flight) => flight.end.lat)
        .arcEndLng((flight) => flight.end.lng)
        .arcColor("color")
        .arcAltitude("altitude")
        .arcStroke("stroke")
        .arcCurveResolution(32)
        .arcDashLength(() => (reducedMotion ? 1 : 0.18))
        .arcDashGap(() => (reducedMotion ? 0 : 0.14))
        .arcDashAnimateTime(() => (reducedMotion ? 0 : 4600))
        .arcsTransitionDuration(0)
        .ringsData([])
        .ringLat("lat")
        .ringLng("lng")
        .ringColor((airport) => [airport.color, "rgba(51,136,255,0)"])
        .ringMaxRadius(1.5)
        .ringPropagationSpeed(reducedMotion ? 0 : 0.55)
        .ringRepeatPeriod(reducedMotion ? 0 : 2300)
        .lineHoverPrecision(0.35)
        .pointerEventsFilter((object) => object.__globeObjType !== "label")
        .onZoom(() => scheduleOverviewCityLabels());

      state.globe = globe;
      globe.controls().enableDamping = true;
      globe.controls().dampingFactor = 0.08;
      globe.controls().minDistance = 112;
      globe.controls().maxDistance = 720;
      globe.controls().autoRotateSpeed = 0.32;
      globe.renderer().setPixelRatio(
        Math.min(window.devicePixelRatio || 1, window.innerWidth < 821 ? 1.25 : 1.55),
      );

      const resize = () => {
        const { width, height } = elements.globe.getBoundingClientRect();
        if (width > 0 && height > 0) {
          globe.width(width).height(height);
          globe.renderer().setPixelRatio(
            Math.min(window.devicePixelRatio || 1, width < 821 ? 1.25 : 1.55),
          );
          scheduleOverviewCityLabels(true);
        }
      };
      const resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(resize));
      resizeObserver.observe(elements.globe);
      resize();

      const canvas = elements.globe.querySelector("canvas");
      canvas?.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        stopPlayback();
        stopOverviewFlightPlanes();
        showMapFallback();
      });

      refreshOverviewGlobe();
      initOverviewFlightPlanes();
      startOverviewFlightPlanes();
      applyOverviewRotation();
      globe.onGlobeReady(() => {
        focusGlobe(data.overview.initialView, 0);
        initOverviewFlightPlanes();
        startOverviewFlightPlanes();
        applyOverviewRotation();
        scheduleOverviewCityLabels(true);
      });
      focusGlobe(data.overview.initialView, 0);
    } catch (error) {
      console.error("Travel globe initialization failed", error);
      showMapFallback();
    }
  }

  elements.brandHome.addEventListener("click", () => selectView(data.overview.id));
  elements.routePrev.addEventListener("click", () => setActiveLeg(state.activeLegIndex - 1));
  elements.routeNext.addEventListener("click", () => setActiveLeg(state.activeLegIndex + 1));
  elements.routePlay.addEventListener("click", togglePrimaryAnimation);
  elements.galleryClose.addEventListener("click", closeGallery);
  elements.lightboxClose.addEventListener("click", closeLightbox);
  elements.lightbox.addEventListener("click", (event) => {
    if (event.target === elements.lightbox) closeLightbox();
  });

  elements.mapFocus.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "home") {
      selectView(data.overview.id);
      return;
    }
    if (button.dataset.focus) focusMapArea(button.dataset.focus);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!elements.lightbox.hidden) closeLightbox();
      else if (!elements.gallery.hidden) closeGallery();
      else if (!isOverview() && state.selectedStopId) {
        state.selectedStopId = null;
        renderRouteCard();
        updateStreetStyles();
      }
      return;
    }
    if (!elements.gallery.hidden || !elements.lightbox.hidden) return;
    if (!isOverview() && event.key === "ArrowRight") setActiveLeg(state.activeLegIndex + 1);
    if (!isOverview() && event.key === "ArrowLeft") setActiveLeg(state.activeLegIndex - 1);
    if (!isOverview() && event.key === " ") {
      event.preventDefault();
      togglePrimaryAnimation();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      state.resumeOnVisible = state.playing;
      stopPlayback();
      stopOverviewFlightPlanes();
      state.globe?.pauseAnimation();
      return;
    }
    if (isOverview()) {
      state.globe?.resumeAnimation();
      applyOverviewRotation();
      initOverviewFlightPlanes();
      startOverviewFlightPlanes();
      scheduleOverviewCityLabels(true);
    }
    if (state.resumeOnVisible && !isOverview()) startPlayback();
    state.resumeOnVisible = false;
  });

  renderAll();
  initGlobe();
})();
