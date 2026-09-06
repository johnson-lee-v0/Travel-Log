(() => {
  "use strict";

  const data = window.TRAVEL_LOG_DATA;
  if (!data?.overview || !Array.isArray(data.trips)) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motionTiming = {
    plane: { minimum: 8000, maximum: 12000, metersPerMillisecond: 100 },
    shinkansen: { minimum: 8000, maximum: 15000, metersPerMillisecond: 70 },
    train: { minimum: 9000, maximum: 16000, metersPerMillisecond: 18 },
    bus: { minimum: 9000, maximum: 16000, metersPerMillisecond: 10 },
    car: { minimum: 9000, maximum: 16000, metersPerMillisecond: 12 },
  };
  const adaptiveMotionPacing = {
    plane: {
      nearDistance: 50000,
      farDistance: 260000,
      cruiseMultiplier: 2.1,
      minimumDuration: 6000,
    },
    shinkansen: {
      nearDistance: 2500,
      farDistance: 28000,
      cruiseMultiplier: 1.65,
      minimumDuration: 7000,
    },
  };
  const endpointDwellDurationMs = reducedMotion ? 900 : 1800;
  const routeCameraIntroHoldMs = reducedMotion ? 80 : 280;
  const tripMapRevealDurationMs = reducedMotion ? 0 : 360;
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
    selectedAreaId: "all",
    storyExpanded: false,
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
    overviewGlobeFailed: false,
    overviewGlobeReady: false,
    overviewAspect: 0,
    overviewLayoutKey: "",
    overviewResizeToken: 0,
    pendingViewId: null,
    viewTransitionTimer: null,
    viewRevealTimer: null,
    viewRevealCleanup: null,
    viewTransitionToken: 0,
    mapFocus: "all",
    globe: null,
    streetMap: null,
    streetTiles: null,
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
    motionResumeTimer: null,
    motionCameraWaitCleanup: null,
    motionResumeToken: 0,
    motionCameraPhase: "idle",
    endpointDwelling: false,
    endpointDwellTimer: null,
    endpointDwellToken: 0,
    endpointDwellDeadlineAt: 0,
    endpointDwellRemainingMs: 0,
    playbackCompleted: false,
    cameraPreparing: false,
    streetTripId: null,
    markerLayers: new Map(),
    routeLayers: new Map(),
    galleryPhotos: [],
    galleryStopName: "",
    galleryReturnFocus: null,
    lightboxIndex: -1,
    lightboxReturnFocus: null,
    lightboxLoadToken: 0,
    lightboxLoader: null,
    lightboxSwipe: null,
    lightboxSuppressClickUntil: 0,
  };

  const elements = {
    app: document.getElementById("app"),
    mapStage: document.getElementById("map-stage"),
    globe: document.getElementById("globe-viz"),
    streetMap: document.getElementById("street-map"),
    fallback: document.getElementById("map-fallback"),
    brandHome: document.getElementById("brand-home"),
    tripTabs: document.getElementById("trip-tabs"),
    cityNavigation: document.getElementById("city-navigation"),
    cityList: document.getElementById("city-list"),
    cityStory: document.getElementById("city-story"),
    cityStoryToggle: document.getElementById("city-story-toggle"),
    cityStoryToggleImage: document.getElementById("city-story-toggle-image"),
    cityStoryToggleKicker: document.getElementById("city-story-toggle-kicker"),
    cityStoryToggleTitle: document.getElementById("city-story-toggle-title"),
    cityStoryMedia: document.getElementById("city-story-media"),
    cityStoryImage: document.getElementById("city-story-image"),
    cityStoryKicker: document.getElementById("city-story-kicker"),
    cityStoryTitle: document.getElementById("city-story-title"),
    cityStoryNote: document.getElementById("city-story-note"),
    cityStoryStats: document.getElementById("city-story-stats"),
    cityStoryPlay: document.getElementById("city-story-play"),
    mapFocus: document.getElementById("map-focus"),
    cityPlay: document.getElementById("city-play"),
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
    lightboxTitle: document.getElementById("lightbox-title"),
    lightboxStage: document.getElementById("lightbox-stage"),
    lightboxImage: document.getElementById("lightbox-image"),
    lightboxClose: document.getElementById("lightbox-close"),
    lightboxPrevious: document.getElementById("lightbox-previous"),
    lightboxNext: document.getElementById("lightbox-next"),
    lightboxCount: document.getElementById("lightbox-count"),
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
    if (item.kind === "bus-station") return "#b794f6";
    if (item.kind === "parking") return "#24282c";
    if (item.kind === "restaurant") return "#f28c5c";
    return "#68dbb0";
  }

  function markerKindLabel(item) {
    if (item.kind === "airport") return "Airport";
    if (item.kind === "station") return "Train station";
    if (item.kind === "bus-station") return "Bus terminal";
    if (item.kind === "parking") return "Parking";
    if (item.kind === "restaurant") return "Restaurant";
    if (item.kind === "city") return "Visited area";
    return "Saved place";
  }

  function markerPhotoSource(stop) {
    return stop?.markerPhoto?.src || stop?.photos?.[0]?.preview || null;
  }

  function photoDisplaySource(photo, width = 960) {
    if (!photo) return "";
    if (width <= 640 && photo.gallery640) return photo.gallery640;
    if (photo.gallery960) return photo.gallery960;
    const full = photo.full || photo.preview || "";
    const match = full.match(/^\.\/trip_images\/(?!previews\/|display\/)(.+)\.[^/.]+$/i);
    return match
      ? "./trip_images/display/" + (width <= 640 ? "640" : "960") + "/" + match[1] + ".webp"
      : full;
  }

  function photoDimensions(photo) {
    const dimensions = window.TRAVEL_LOG_PHOTO_SIZES?.[photo?.full];
    return {
      width: photo?.width || dimensions?.width || 4,
      height: photo?.height || dimensions?.height || 3,
    };
  }

  function stopForTripCover(trip) {
    const stops = stopMap(trip);
    const configured = stops.get(trip?.coverStopId);
    if (configured?.photos?.length) return configured;
    return trip?.stops.find((stop) => !stop.routeOnly && stop.photos?.length) || null;
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

  function globeCityLabelElement(city) {
    const label = document.createElement("span");
    label.className = "globe-city-label";
    label.textContent = city.name;
    label.setAttribute("aria-hidden", "true");
    return label;
  }

  function renderTripTabs() {
    const focusedViewId = elements.tripTabs.contains(document.activeElement)
      ? document.activeElement.dataset.viewId
      : null;
    elements.tripTabs.replaceChildren(
      ...data.trips.map((view) => {
        const pending = view.id === state.pendingViewId;
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "trip-tab" +
          (view.id === state.viewId ? " is-active" : "") +
          (pending ? " is-pending" : "");
        const coverStop = stopForTripCover(view);
        const thumbnail = document.createElement("img");
        thumbnail.className = "trip-tab__image";
        thumbnail.src = markerPhotoSource(coverStop) || "";
        thumbnail.alt = "";
        thumbnail.width = 52;
        thumbnail.height = 52;
        thumbnail.loading = "eager";
        thumbnail.decoding = "async";
        const copy = document.createElement("span");
        copy.className = "trip-tab__copy";
        const name = document.createElement("strong");
        name.textContent = view.shortName;
        const meta = document.createElement("span");
        meta.textContent = view.status || view.year || "Trip";
        copy.append(name, meta);
        button.append(thumbnail, copy);
        button.dataset.viewId = view.id;
        button.setAttribute("aria-pressed", String(view.id === state.viewId));
        if (pending) button.setAttribute("aria-busy", "true");
        button.addEventListener("click", () => selectView(view.id));
        return button;
      }),
    );
    if (state.pendingViewId) elements.tripTabs.setAttribute("aria-busy", "true");
    else elements.tripTabs.removeAttribute("aria-busy");
    if (focusedViewId) {
      const focusedButton = [...elements.tripTabs.children].find(
        (button) => button.dataset.viewId === focusedViewId,
      );
      focusWithoutScroll(focusedButton);
    }
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
      elements.mapEyebrow.textContent = "";
      elements.mapTitle.textContent = "Johnson’s travel log";
      document.title = "Johnson’s travel log";
      return;
    }

    const trip = currentTrip();
    elements.mapEyebrow.textContent = trip.name + " · street map";
    elements.mapTitle.textContent = trip.name;
    document.title = trip.name + " · Johnson’s travel log";
  }

  function areaStops(area, trip = currentTrip()) {
    if (!area || !trip) return [];
    const city = area.stopCity || area.label;
    return trip.stops.filter((stop) => !stop.routeOnly && stop.city === city);
  }

  function areaForStop(stop, trip = currentTrip()) {
    if (!stop || !trip) return null;
    return trip.focusAreas?.find(
      (area) => (area.stopCity || area.label) === stop.city,
    ) || null;
  }

  function renderCityNavigation() {
    if (isOverview()) {
      elements.cityNavigation.hidden = true;
      elements.cityList.replaceChildren();
      return;
    }

    const trip = currentTrip();
    const areas = trip.focusAreas || [];
    if (!areas.length) {
      elements.cityNavigation.hidden = true;
      elements.cityList.replaceChildren();
      return;
    }

    const focusedAreaId = elements.cityList.contains(document.activeElement)
      ? document.activeElement.dataset.focus
      : null;
    elements.cityNavigation.hidden = false;
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className =
      "city-list__button" + (state.selectedAreaId === "all" ? " is-active" : "");
    allButton.dataset.focus = "all";
    allButton.setAttribute("aria-pressed", String(state.selectedAreaId === "all"));
    const allLabel = document.createElement("span");
    allLabel.textContent = "All destinations";
    const allCount = document.createElement("small");
    allCount.textContent = areas.length + (areas.length === 1 ? " city" : " cities");
    allButton.append(allLabel, allCount);

    const areaButtons = areas.map((area) => {
      const stops = areaStops(area, trip);
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "city-list__button" + (state.selectedAreaId === area.id ? " is-active" : "");
      button.dataset.focus = area.id;
      button.setAttribute("aria-pressed", String(state.selectedAreaId === area.id));
      const label = document.createElement("span");
      label.textContent = area.label;
      const count = document.createElement("small");
      count.textContent = stops.length + (stops.length === 1 ? " place" : " places");
      button.append(label, count);
      return button;
    });
    elements.cityList.replaceChildren(allButton, ...areaButtons);
    if (focusedAreaId) {
      focusWithoutScroll(
        [...elements.cityList.children].find(
          (button) => button.dataset.focus === focusedAreaId,
        ),
      );
    }
  }

  function setStoryPhoto(image, photo, options = {}) {
    if (!image || !photo) return;
    const dimensions = photoDimensions(photo);
    image.width = dimensions.width;
    image.height = dimensions.height;
    image.alt = options.alt || "";
    if (options.previewOnly) {
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.src = photo.preview || photoDisplaySource(photo, 640);
      return;
    }
    const source640 = photoDisplaySource(photo, 640);
    const source960 = photoDisplaySource(photo, 960);
    image.srcset = source640 + " 640w, " + source960 + " 960w";
    image.sizes = "(max-width: 1024px) calc(100vw - 32px), 340px";
    image.src = source640;
  }

  function formatStoryStats(placeCount, photoCount) {
    const places = placeCount + (placeCount === 1 ? " place" : " places");
    const photos = photoCount + (photoCount === 1 ? " photo" : " photos");
    return places + " · " + photos;
  }

  function renderCityStory() {
    if (isOverview()) {
      elements.cityStory.hidden = true;
      return;
    }

    const trip = currentTrip();
    const stops = stopMap(trip);
    const selectedStop = state.selectedStopId ? stops.get(state.selectedStopId) : null;
    const selectedArea = trip.focusAreas?.find((area) => area.id === state.selectedAreaId) || null;
    const areaPlaces = selectedArea ? areaStops(selectedArea, trip) : [];
    const heroStop = selectedStop?.photos?.length
      ? selectedStop
      : selectedArea
        ? stops.get(selectedArea.heroStopId)
        : stopForTripCover(trip);
    const heroPhotoIndex = selectedStop
      ? 0
      : selectedArea?.heroPhotoIndex || 0;
    const heroPhoto = heroStop?.photos?.[heroPhotoIndex] || heroStop?.photos?.[0] || null;
    const visibleStops = trip.stops.filter((stop) => !stop.routeOnly);
    const photoCount = selectedStop
      ? selectedStop.photos.length
      : selectedArea
        ? areaPlaces.reduce((count, stop) => count + (stop.photos?.length || 0), 0)
        : visibleStops.reduce((count, stop) => count + (stop.photos?.length || 0), 0);
    const placeCount = selectedStop ? 1 : selectedArea ? areaPlaces.length : visibleStops.length;
    const title = selectedStop?.name || selectedArea?.label || trip.name;
    const kicker = selectedStop
      ? selectedStop.city + " · " + trip.name
      : selectedArea
        ? trip.name
        : trip.status;
    const note = selectedStop?.summary || selectedArea?.note || trip.description;
    const startIndex = selectedArea
      ? focusAreaStartLegIndex(selectedArea, trip)
      : Math.max(0, trip.legs.findIndex((leg) => leg.id === trip.defaultLegId));

    elements.cityStory.hidden = false;
    elements.cityStory.classList.toggle("is-expanded", state.storyExpanded);
    elements.cityStory.classList.toggle("is-trip-overview", !selectedStop && !selectedArea);
    elements.cityStory.classList.toggle("has-photo", Boolean(heroPhoto && heroStop));
    elements.cityStoryToggle.setAttribute("aria-expanded", String(state.storyExpanded));
    elements.cityStoryToggleKicker.textContent = selectedStop
      ? selectedStop.city
      : selectedArea
        ? trip.name
        : trip.status || trip.year || "Trip";
    elements.cityStoryToggleTitle.textContent = title;
    elements.cityStoryKicker.textContent = kicker;
    elements.cityStoryTitle.textContent = title;
    elements.cityStoryNote.textContent = note || "";
    elements.cityStoryNote.hidden = !note;
    elements.cityStoryStats.textContent = formatStoryStats(placeCount, photoCount);

    if (heroPhoto && heroStop) {
      setStoryPhoto(elements.cityStoryToggleImage, heroPhoto, { previewOnly: true });
      setStoryPhoto(elements.cityStoryImage, heroPhoto, { alt: heroStop.name });
      elements.cityStoryToggleImage.hidden = false;
      elements.cityStoryMedia.hidden = false;
      elements.cityStoryMedia.dataset.stopId = heroStop.id;
      elements.cityStoryMedia.setAttribute("aria-label", "Open photos from " + heroStop.name);
    } else {
      elements.cityStoryToggleImage.hidden = true;
      elements.cityStoryMedia.hidden = true;
      elements.cityStoryMedia.removeAttribute("data-stop-id");
      elements.cityStoryMedia.removeAttribute("aria-label");
      elements.cityStoryImage.removeAttribute("src");
      elements.cityStoryImage.removeAttribute("srcset");
    }

    if (trip.legs.length && startIndex >= 0) {
      elements.cityStoryPlay.hidden = false;
      elements.cityStoryPlay.dataset.legIndex = String(startIndex);
      elements.cityStoryPlay.textContent = selectedArea
        ? "Play from " + selectedArea.label
        : "Play trip from the beginning";
    } else {
      elements.cityStoryPlay.hidden = true;
      delete elements.cityStoryPlay.dataset.legIndex;
    }
  }

  function focusAreaStartLegIndex(area, trip = currentTrip()) {
    if (!area || !trip?.legs.length) return -1;
    if (area.startLegId) {
      const configuredIndex = trip.legs.findIndex((leg) => leg.id === area.startLegId);
      if (configuredIndex >= 0) return configuredIndex;
    }
    const stops = stopMap(trip);
    const city = area.stopCity || area.label;
    return trip.legs.findIndex((leg) => stops.get(leg.from)?.city === city);
  }

  function renderMapFocus() {
    if (isOverview()) {
      elements.mapFocus.hidden = true;
      elements.mapFocus.replaceChildren();
      elements.cityPlay.hidden = true;
      return;
    }

    const trip = currentTrip();
    const focusedControl = elements.mapFocus.contains(document.activeElement)
      ? {
          action: document.activeElement.dataset.action,
          focus: document.activeElement.dataset.focus,
        }
      : null;
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
    allButton.setAttribute("aria-label", "Show all destinations");
    allButton.setAttribute("aria-pressed", String(state.mapFocus === "all"));
    buttons.push(allButton);

    if (focusAreas.length) {
      focusAreas.forEach((area) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "map-focus__button" + (state.mapFocus === area.id ? " is-active" : "");
        button.dataset.focus = area.id;
        button.setAttribute("aria-pressed", String(state.mapFocus === area.id));
        button.textContent = area.label;
        buttons.push(button);
      });
    }
    elements.mapFocus.replaceChildren(...buttons);
    if (focusedControl) {
      focusWithoutScroll(
        [...elements.mapFocus.children].find(
          (button) =>
            (focusedControl.action && button.dataset.action === focusedControl.action) ||
            (focusedControl.focus && button.dataset.focus === focusedControl.focus),
        ),
      );
    }
    keepSelectedControlVisible(elements.mapFocus);

    const area = focusAreas.find((item) => item.id === state.mapFocus);
    const startIndex = area
      ? focusAreaStartLegIndex(area, trip)
      : state.mapFocus === "all"
        ? Math.max(0, trip.legs.findIndex((leg) => leg.id === trip.defaultLegId))
        : -1;
    if ((area || state.mapFocus === "all") && startIndex >= 0 && trip.legs.length) {
      elements.cityPlay.hidden = false;
      elements.cityPlay.dataset.legIndex = String(startIndex);
      const label = area ? "Play from " + area.label : "Play full trip";
      elements.cityPlay.textContent = "▶ " + label;
      elements.cityPlay.setAttribute("aria-label", label);
    } else {
      elements.cityPlay.hidden = true;
      delete elements.cityPlay.dataset.legIndex;
      elements.cityPlay.removeAttribute("aria-label");
    }
  }

  function renderRouteCard() {
    if (isOverview()) {
      elements.routeCard.hidden = true;
      return;
    }

    if (state.mapFocus && !state.selectedStopId) {
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
      elements.routeMode.style.removeProperty("--mode-text-color");
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
      elements.routeMode.style.removeProperty("--mode-text-color");
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
    elements.routeMode.style.setProperty(
      "--mode-text-color",
      leg.mode === "shinkansen" ? "#8eb9f5" : color,
    );
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
      elements.routeCard.classList.remove("is-at-endpoint");
      elements.mapStage.classList.remove("is-playing-route");
      return;
    }

    const arrivalPending =
      state.motionProgress >= 1 &&
      state.motionCameraPhase === "arrival" &&
      !state.endpointDwelling &&
      !state.playbackCompleted;
    const atEndpoint =
      state.motionProgress >= 1 &&
      (state.endpointDwelling || state.playbackCompleted);
    const moving = state.playing && !state.cameraPreparing && !atEndpoint;
    const canResume =
      (state.motionProgress > 0 && state.motionProgress < 1) ||
      state.endpointDwelling ||
      arrivalPending;
    elements.routeCard.classList.toggle("is-playing", state.playing);
    elements.routeCard.classList.toggle("is-at-endpoint", atEndpoint);
    elements.mapStage.classList.toggle("is-playing-route", state.playing);
    elements.routePlayIcon.textContent = state.playing ? "Ⅱ" : "▶";
    let playLabel = "Play route";
    let playAriaLabel = "Play route animation";
    if (state.playbackCompleted) {
      playLabel = "Replay trip";
      playAriaLabel = "Replay trip from the beginning";
    } else if (state.endpointDwelling) {
      playLabel = state.playing ? "Pause at stop" : "Continue route";
      playAriaLabel = state.playing
        ? "Pause at route endpoint"
        : "Continue to next route";
    } else if (state.playing) {
      playLabel = "Pause";
      playAriaLabel = "Pause route animation";
    } else if (canResume) {
      playLabel = "Resume";
      playAriaLabel = "Resume route animation";
    }
    elements.routePlayLabel.textContent = playLabel;
    elements.routePlay.setAttribute("aria-label", playAriaLabel);
    if (!state.selectedStopId) {
      if (state.playbackCompleted) {
        elements.routeNote.textContent = "Trip complete — replay when ready.";
      } else if (state.endpointDwelling) {
        elements.routeNote.textContent = state.playing
          ? "Arrived — tap the map to pause here."
          : "Arrived — continue when ready.";
      } else if (state.playing) {
        elements.routeNote.textContent = "Tap the map to pause.";
      } else if (canResume) {
        elements.routeNote.textContent = "Paused — resume when ready.";
      } else {
        elements.routeNote.textContent = currentTrip()?.routeDraft
          ? "Draft route — exact direction, timing, and visit order are not asserted."
          : "Travel route";
      }
    }
    elements.routeProgress.style.setProperty(
      "--motion-progress",
      String(state.motionProgress),
    );
    state.motionMarker
      ?.getElement()
      ?.classList.toggle("is-moving", moving);
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
    const maximumLabels = compact ? (closeView ? 9 : 5) : closeView ? 15 : 10;
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
    state.globe.labelsData([]);
    state.globe.htmlElementsData(accepted);
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
    let scene = null;
    try {
      scene = globe.scene();
    } catch {
      return null;
    }
    if (!scene) return null;
    let sampleMesh = null;
    scene.traverse((object) => {
      if (!sampleMesh && object.isMesh && object.geometry?.constructor) {
        sampleMesh = object;
      }
    });
    if (!sampleMesh?.constructor) return null;
    return {
      Matrix4: scene.matrixWorld.constructor,
      Mesh: sampleMesh.constructor,
      sourceGeometry: sampleMesh.geometry,
      Vector3: scene.position.constructor,
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
    if (
      !isOverview() ||
      document.hidden ||
      elements.globe.hidden
    ) return;
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
    material.emissiveMap = null;
    material.bumpMap = null;
    material.alphaMap = null;
    material.color?.set("#f2eee6");
    material.emissive?.set("#1a2420");
    if ("emissiveIntensity" in material) material.emissiveIntensity = 0.16;
    material.specular?.set("#c4cec5");
    if ("shininess" in material) material.shininess = 24;
    material.opacity = 1;
    material.transparent = false;
    material.wireframe = false;
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
    if (
      reducedMotion ||
      !runtime ||
      !isOverview() ||
      document.hidden ||
      elements.globe.hidden
    ) return;

    const compact = elements.globe.clientWidth < 1025;
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
      !state.overviewGlobeReady ||
      !state.overviewPlaneRuntime ||
      state.overviewPlaneFrame !== null ||
      !isOverview() ||
      reducedMotion ||
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
    const points = [
      // Visited cities remain as decluttered labels without the green cylinder markers.
      // ...data.overview.cities,
      ...data.overview.airports,
    ].map((item) => ({
      ...item,
      color: markerColor(item),
    }));
    const arcs = overviewFlights.map((flight) => ({
      ...flight,
      altitude: flightAltitude(flight),
      stroke: 0.36,
      color: ["rgba(166,176,186,0.08)", "rgba(166,176,186,0.38)"],
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

  function overviewInitialView() {
    const initial = data.overview.initialView;
    const { width, height } = elements.globe.getBoundingClientRect();
    if (!(width > 0 && height > 0)) return { ...initial };
    if (width >= height) {
      return {
        ...initial,
        altitude: Math.max(initial.altitude, 1.82),
      };
    }
    const aspect = Math.max(0.45, Math.min(1, width / height));
    return {
      ...initial,
      altitude: Math.max(
        1.82,
        Math.min(4.2, ((1 + initial.altitude) * 1.04) / aspect - 1),
      ),
    };
  }

  function styleOverviewGlobe(globe) {
    const material = globe?.globeMaterial?.();
    if (!material) return;
    material.color?.set("#eef1eb");
    material.emissive?.set("#071b18");
    material.emissiveMap = null;
    if ("emissiveIntensity" in material) material.emissiveIntensity = 0.16;
    material.specular?.set("#49615a");
    if ("shininess" in material) material.shininess = 20;
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.wireframe = false;
    material.needsUpdate = true;
  }

  function focusGlobe(view, duration = 1050) {
    if (!state.globe || !view) return;
    state.globe.pointOfView(view, reducedMotion ? 0 : duration);
  }

  function tripEntryTransitionDuration() {
    if (reducedMotion) return 0;
    return elements.globe.clientWidth < 1025 ? 760 : 900;
  }

  function scheduleTripMapReveal(tripId, token) {
    if (reducedMotion || !state.streetMap) {
      elements.globe.hidden = true;
      elements.mapStage.classList.remove(
        "is-trip-reveal-preparing",
        "is-trip-revealing",
      );
      return;
    }

    if (state.viewRevealCleanup) state.viewRevealCleanup();
    if (state.viewRevealTimer !== null) {
      window.clearTimeout(state.viewRevealTimer);
      state.viewRevealTimer = null;
    }

    const tiles = state.streetTiles;
    let settled = false;
    let fallbackTimer = null;
    const cleanup = () => {
      tiles?.off("load", beginReveal);
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (state.viewRevealCleanup === cleanup) state.viewRevealCleanup = null;
    };
    const finishReveal = () => {
      if (
        token !== state.viewTransitionToken ||
        state.viewId !== tripId
      ) return;
      elements.globe.hidden = true;
      elements.globe.setAttribute("aria-hidden", "true");
      elements.mapStage.classList.remove("is-trip-revealing");
      state.viewRevealTimer = null;
    };
    function beginReveal() {
      if (settled) return;
      settled = true;
      cleanup();
      if (
        token !== state.viewTransitionToken ||
        state.viewId !== tripId
      ) return;
      elements.globe.setAttribute("aria-hidden", "true");
      elements.streetMap.removeAttribute("aria-hidden");
      elements.mapStage.classList.remove("is-trip-reveal-preparing");
      elements.mapStage.classList.add("is-trip-revealing");
      state.viewRevealTimer = window.setTimeout(
        finishReveal,
        tripMapRevealDurationMs,
      );
    }

    state.viewRevealCleanup = cleanup;
    window.requestAnimationFrame(() => {
      if (
        token !== state.viewTransitionToken ||
        state.viewId !== tripId
      ) {
        cleanup();
        return;
      }
      if (!tiles?.isLoading?.()) {
        beginReveal();
        return;
      }
      tiles.once("load", beginReveal);
      fallbackTimer = window.setTimeout(
        beginReveal,
        window.innerWidth < 1025 ? 700 : 480,
      );
    });
  }

  function cancelViewTransition(options = {}) {
    const restoreOverview = options.restoreOverview !== false;
    const refreshTabs = options.refreshTabs !== false;
    const hadPendingView = Boolean(state.pendingViewId);
    state.viewTransitionToken += 1;
    if (state.viewTransitionTimer !== null) {
      window.clearTimeout(state.viewTransitionTimer);
      state.viewTransitionTimer = null;
    }
    if (state.viewRevealCleanup) state.viewRevealCleanup();
    if (state.viewRevealTimer !== null) {
      window.clearTimeout(state.viewRevealTimer);
      state.viewRevealTimer = null;
    }
    state.pendingViewId = null;
    elements.app.classList.remove("is-view-transitioning");
    elements.mapStage.classList.remove(
      "is-entering-trip",
      "is-trip-reveal-preparing",
      "is-trip-revealing",
    );
    elements.mapStage.removeAttribute("data-entry-target");
    if (state.globe) state.globe.controls().enabled = true;
    if (!isOverview()) {
      elements.globe.hidden = true;
      elements.globe.setAttribute("aria-hidden", "true");
      elements.streetMap.removeAttribute("aria-hidden");
    } else if (restoreOverview) {
      state.overviewRotation = true;
      state.globe?.resumeAnimation();
      applyOverviewRotation();
      initOverviewFlightPlanes();
      startOverviewFlightPlanes();
    }
    if (refreshTabs && hadPendingView) renderTripTabs();
  }

  function finishTripEntryTransition(viewId, token) {
    if (
      token !== state.viewTransitionToken ||
      state.pendingViewId !== viewId ||
      !isOverview()
    ) return;
    if (state.viewTransitionTimer !== null) {
      window.clearTimeout(state.viewTransitionTimer);
      state.viewTransitionTimer = null;
    }
    state.pendingViewId = null;
    elements.app.classList.remove("is-view-transitioning");
    elements.mapStage.classList.remove("is-entering-trip");
    elements.mapStage.removeAttribute("data-entry-target");
    if (state.globe) state.globe.controls().enabled = true;
    commitView(viewId, {
      focusInitial: true,
      fromGlobeTransition: true,
      transitionToken: token,
    });
  }

  function beginTripEntryTransition(viewId) {
    const trip = tripsById.get(viewId);
    if (!trip) return;
    if (state.pendingViewId === viewId) return;

    const canAnimateGlobe = Boolean(
      !reducedMotion &&
      state.globe &&
      state.overviewGlobeReady &&
      !state.overviewGlobeFailed,
    );
    cancelViewTransition({ restoreOverview: false });
    if (!canAnimateGlobe) {
      commitView(viewId, { focusInitial: true });
      return;
    }

    if (!isOverview()) commitView(data.overview.id, { focusInitial: false });

    state.pendingViewId = viewId;
    state.overviewRotation = false;
    elements.app.classList.add("is-view-transitioning");
    elements.mapStage.classList.add("is-entering-trip");
    elements.mapStage.dataset.entryTarget = trip.entryView.label;
    renderTripTabs();
    applyOverviewRotation();
    state.globe.controls().enabled = false;

    const duration = tripEntryTransitionDuration();
    const token = state.viewTransitionToken;
    focusGlobe(
      {
        lat: trip.entryView.lat,
        lng: trip.entryView.lng,
        altitude: trip.entryView.globeAltitude,
      },
      duration,
    );
    state.viewTransitionTimer = window.setTimeout(() => {
      state.viewTransitionTimer = null;
      window.requestAnimationFrame(() => finishTripEntryTransition(viewId, token));
    }, duration + 60);
  }

  function handleOverviewPoint(item) {
    if (!isOverview() || state.pendingViewId) return;
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
    const kind =
      stop.kind === "airport" ||
      stop.kind === "station" ||
      stop.kind === "bus-station" ||
      stop.kind === "parking" ||
      stop.kind === "restaurant"
        ? stop.kind
        : "place";
    const stateClasses =
      (selected ? " is-selected" : "") + (endpoint ? " is-endpoint" : "");
    const markerTag = kind === "restaurant" && stop.overrated === true
      ? '<span class="trip-marker__tag" aria-hidden="true">Overrated</span>'
      : "";
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
          markerTag +
          "</span>",
        iconSize: photoCount > 1 ? [66, 63] : [58, 56],
        iconAnchor: [29, 56],
        tooltipAnchor: [0, -50],
      });
    }
    const symbol =
      kind === "airport"
        ? "✈"
        : kind === "station"
          ? "🚆"
          : kind === "bus-station"
            ? "🚌"
            : kind === "parking"
              ? "P"
            : kind === "restaurant"
              ? "🍴"
              : "•";
    return window.L.divIcon({
      className: "trip-marker-shell",
      html:
        '<span class="trip-marker-wrap">' +
        '<span class="trip-marker trip-marker--' +
        kind +
        stateClasses +
        '"><span aria-hidden="true">' +
        symbol +
        "</span></span>" +
        markerTag +
        "</span>",
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      tooltipAnchor: [0, -20],
    });
  }

  function routeVehicleMarkup(mode, model) {
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
    if (model === "n700s") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 88 34" aria-hidden="true">
          <path class="route-vehicle__body" d="M6 7.5h41c10.9 0 20.3 2.1 27.4 6.1 5.3 3 9 5.7 11 8-3.4 3.4-8.7 5.8-15.9 7.4-5.9 1.3-13.1 2-21.5 2H6a3 3 0 0 1-3-3V10.5a3 3 0 0 1 3-3Z"/>
          <path class="route-vehicle__shade" d="M3 25.6h47.6c12.5 0 22.9-1.6 31.4-4.9 1.5.4 2.6.7 3.4.9-3.4 3.4-8.7 5.8-15.9 7.4-5.9 1.3-13.1 2-21.5 2H6a3 3 0 0 1-3-3Z"/>
          <path class="route-vehicle__highlight" d="M6 9.1h41c9.7 0 18.2 1.8 24.9 5.2l-4 1.6c-5.6-2.2-12.6-3.3-20.9-3.3H6Z"/>
          <path class="route-vehicle__glass" d="M56.2 11.6c6.8.8 12.7 2.7 17.8 5.6l-6.5 2.2c-3.9-1.8-8.2-3-13-3.6Z"/>
          <g class="route-vehicle__windows">
            <rect x="11" y="12.4" width="7.5" height="4.2" rx="1.3"/>
            <rect x="21" y="12.4" width="7.5" height="4.2" rx="1.3"/>
            <rect x="31" y="12.4" width="7.5" height="4.2" rx="1.3"/>
            <rect x="41" y="12.4" width="7.5" height="4.2" rx="1.3"/>
          </g>
          <path class="route-vehicle__door" d="M49.8 12.1v13.3M47.9 12.1h3.8"/>
          <path class="route-vehicle__accent route-vehicle__accent--shinkansen" d="M4.5 24.4h46c11.9 0 21.8-1.7 30-5"/>
          <path class="route-vehicle__undercarriage" d="M14 30h35.5c5.2 0 10-.4 14.5-1.2l-2.4 3H16.5Z"/>
          <ellipse class="route-vehicle__light route-vehicle__light--shinkansen" cx="80.2" cy="21.1" rx="2.2" ry="1"/>
        </svg>`;
    }
    if (mode === "shinkansen") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 88 34" aria-hidden="true">
          <path class="route-vehicle__body" d="M6 7.5h41c10.9 0 20.3 2.1 27.4 6.1 5.3 3 9 5.7 11 8-3.4 3.4-8.7 5.8-15.9 7.4-5.9 1.3-13.1 2-21.5 2H6a3 3 0 0 1-3-3V10.5a3 3 0 0 1 3-3Z"/>
          <path class="route-vehicle__shade" d="M3 25.6h47.6c12.5 0 22.9-1.6 31.4-4.9 1.5.4 2.6.7 3.4.9-3.4 3.4-8.7 5.8-15.9 7.4-5.9 1.3-13.1 2-21.5 2H6a3 3 0 0 1-3-3Z"/>
          <path class="route-vehicle__highlight" d="M6 9.1h41c9.7 0 18.2 1.8 24.9 5.2l-4 1.6c-5.6-2.2-12.6-3.3-20.9-3.3H6Z"/>
          <path class="route-vehicle__glass" d="M56.2 11.6c6.8.8 12.7 2.7 17.8 5.6l-6.5 2.2c-3.9-1.8-8.2-3-13-3.6Z"/>
          <g class="route-vehicle__windows">
            <rect x="11" y="12.4" width="7.5" height="4.2" rx="1.3"/>
            <rect x="21" y="12.4" width="7.5" height="4.2" rx="1.3"/>
            <rect x="31" y="12.4" width="7.5" height="4.2" rx="1.3"/>
            <rect x="41" y="12.4" width="7.5" height="4.2" rx="1.3"/>
          </g>
          <path class="route-vehicle__door" d="M49.8 12.1v13.3"/>
          <path class="route-vehicle__accent route-vehicle__accent--shinkansen" d="M4.5 24.4h46c11.9 0 21.8-1.7 30-5"/>
          <path class="route-vehicle__undercarriage" d="M14 30h35.5c5.2 0 10-.4 14.5-1.2l-2.4 3H16.5Z"/>
          <ellipse class="route-vehicle__light route-vehicle__light--shinkansen" cx="80.2" cy="21.1" rx="2.2" ry="1"/>
        </svg>`;
    }
    if (model === "yufuin-no-mori") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 82 38" aria-hidden="true">
          <path class="route-vehicle__body" d="M6 5h49c10.3 0 18.2 5.4 21.2 14.5L75 29c-.4 3.2-3.1 5.5-6.3 5.5H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"/>
          <path class="route-vehicle__shade" d="M3 25.3h72.8L75 29c-.4 3.2-3.1 5.5-6.3 5.5H6a3 3 0 0 1-3-3Z"/>
          <path class="route-vehicle__highlight" d="M7 7h47.5c7.6 0 14 3.4 17.5 9.2l-3.5 1.2c-3.2-4.1-8.3-6.3-14.7-6.3H7Z"/>
          <path class="route-vehicle__glass" d="M55.1 8.2c8.2.5 14.6 4.8 18 11.9L71.5 23H55.1Z"/>
          <g class="route-vehicle__windows route-vehicle__windows--yufuin">
            <rect x="10" y="9.3" width="8.2" height="9.5" rx="1.5"/>
            <rect x="20.6" y="9.3" width="8.2" height="9.5" rx="1.5"/>
            <rect x="31.2" y="9.3" width="8.2" height="9.5" rx="1.5"/>
            <rect x="41.8" y="9.3" width="8.2" height="9.5" rx="1.5"/>
          </g>
          <path class="route-vehicle__accent route-vehicle__accent--yufuin" d="M4.5 24.6h64.2c2.8 0 5.1-.5 6.8-1.4"/>
          <path class="route-vehicle__door route-vehicle__door--yufuin" d="M50.8 9v18.5M48.8 9h4"/>
          <circle class="route-vehicle__crest" cx="47.7" cy="23" r="2.1"/>
          <path class="route-vehicle__undercarriage" d="M14 32.5h49l-2.1 2.5H16Z"/>
          <circle class="route-vehicle__light route-vehicle__light--yufuin" cx="72.3" cy="25.2" r="1.35"/>
          <circle class="route-vehicle__light route-vehicle__light--yufuin" cx="69.2" cy="28.4" r="1.15"/>
        </svg>`;
    }
    if (model === "via-venture") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 100 40" aria-hidden="true">
          <path class="route-vehicle__body route-vehicle__via-coach" d="M4 7h43v25H4a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z"/>
          <path class="route-vehicle__via-coach-band" d="M2 11h45v12H2Z"/>
          <path class="route-vehicle__via-coach-shade" d="M2 24h45v8H4a3 3 0 0 1-3-3Z"/>
          <path class="route-vehicle__via-yellow route-vehicle__via-roof-ribbon" d="M4 7h43v4H2v-1a3 3 0 0 1 2-3Z"/>
          <g class="route-vehicle__via-coach-windows">
            <rect x="6" y="13.2" width="7.2" height="6.3" rx="1"/>
            <rect x="16" y="13.2" width="7.2" height="6.3" rx="1"/>
            <rect x="26" y="13.2" width="7.2" height="6.3" rx="1"/>
            <rect x="36" y="13.2" width="7.2" height="6.3" rx="1"/>
          </g>
          <path class="route-vehicle__via-coupler" d="M47 18h4v8h-4Z"/>
          <path class="route-vehicle__body route-vehicle__via-locomotive" d="M50 7h28c7.1 0 12 3.1 14.8 9.4l4.8 3.7c1.1.8 1.5 2.1 1.1 3.4L97 29.2c-.7 2.3-2.8 3.8-5.1 3.8H50Z"/>
          <path class="route-vehicle__via-locomotive-shade" d="M50 26.5h48l-1 2.7c-.7 2.3-2.8 3.8-5.1 3.8H50Z"/>
          <path class="route-vehicle__via-yellow route-vehicle__via-slashes" d="M54 10h6.5L52 24h-2v-7.5Zm9 0h6.5L61 24h-6.5Zm9 0h7.2L71 24h-7.2Z"/>
          <path class="route-vehicle__via-windshield" d="M83 10.5c4.1 1.2 7.3 4 9.4 8.4l2.3 1.8-10.2 1.4-5-8Z"/>
          <path class="route-vehicle__via-maple" d="m78 20.5 1.4 2.8 2.8-.9-1.3 2.8 2.3 1.2-3 .4.3 3h-5l.3-3-3-.4 2.3-1.2-1.3-2.8 2.8.9Z"/>
          <path class="route-vehicle__door" d="M81.8 9.7v18"/>
          <path class="route-vehicle__undercarriage route-vehicle__undercarriage--via" d="M8 32h29l-2.5 3H11Zm50 0h29l-2.5 3H61Z"/>
          <path class="route-vehicle__via-pilot" d="m87 32.5 9-2.6 2.2 4.1-10 2Z"/>
          <circle class="route-vehicle__light route-vehicle__light--via" cx="95" cy="23.8" r="1.25"/>
        </svg>`;
    }
    if (model === "honda-civic-black") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 98 38" aria-hidden="true">
          <circle class="route-vehicle__wheel route-vehicle__wheel--car" cx="24.6" cy="29.2" r="5.5"/>
          <circle class="route-vehicle__wheel route-vehicle__wheel--car" cx="73.6" cy="29.2" r="5.5"/>
          <circle class="route-vehicle__wheel-hub route-vehicle__wheel-hub--car" cx="24.6" cy="29.2" r="2.45"/>
          <circle class="route-vehicle__wheel-hub route-vehicle__wheel-hub--car" cx="73.6" cy="29.2" r="2.45"/>
          <g class="route-vehicle__civic-body" transform="translate(5.88 0) scale(.88 1)">
            <path class="route-vehicle__body" d="M3.5 27.2v-3.6c0-2.1 1.5-3.9 3.6-4.3l10.8-2 10.6-8.6c3.4-2.8 7.7-4.2 12.2-4.2h12c5 0 9.5 1.6 13.5 4.8l7.2 5.6 14.9 2c3.8.5 6.2 2.8 6.2 6.3v3.6c0 1.3-1.1 2.4-2.4 2.4h-9.2c-.5-3.3-4-5.8-8.3-5.8s-7.8 2.5-8.3 5.8H29.6c-.5-3.3-4-5.8-8.3-5.8s-7.8 2.5-8.3 5.8H5.9c-1.3 0-2.4-.8-2.4-2Z"/>
            <path class="route-vehicle__glass route-vehicle__glass--car" d="M27.6 16.1 33 9.8c2.1-2.2 4.8-3.3 8-3.3h4.8v9.6Zm20.6-9.6h4.3c4.4 0 8.4 1.4 11.9 4.2l6.5 5.4H48.2Z"/>
            <path class="route-vehicle__highlight" d="M7.8 19.8 26.5 17.2h43.8l17.8 1.7M29 9.1c3.3-3.1 7.2-4.6 11.7-4.6h12c5 0 9.5 1.6 13.5 4.8"/>
            <path class="route-vehicle__door route-vehicle__door--car" d="M47 17v11.2m22.8-11-1.3 10.7M27.2 17.7l-1 10.2"/>
            <path class="route-vehicle__civic-sill" d="M30.5 26.8h35.1"/>
            <path class="route-vehicle__civic-mirror" d="M67.6 14.4h7.1l-1.3 2.5h-6.2Z"/>
            <path class="route-vehicle__civic-grille" d="m90 22.1 5.8.8-.3 3.7-7.1.8Z"/>
            <path class="route-vehicle__light route-vehicle__light--car" d="m87.6 17.5 6.4 1.2-1.5 2.1-5.8-1Z"/>
            <path class="route-vehicle__civic-tail" d="M3.8 20h5.6l2.5 1.9-7.8.4Z"/>
          </g>
        </svg>`;
    }
    if (mode === "car") {
      return `
        <svg class="route-vehicle__svg" viewBox="0 0 72 36" aria-hidden="true">
          <path class="route-vehicle__body" d="M8 13.5h8.5l7.1-8.2h24.8c3.2 0 5.9 1.2 8 3.5l5.2 4.7h2.8c2.9 0 5.2 2.3 5.2 5.2v7.8H3.5v-7.8c0-2.9 1.6-5.2 4.5-5.2Z"/>
          <path class="route-vehicle__shade" d="M3.5 22h65.1v4.5H3.5Z"/>
          <path class="route-vehicle__highlight" d="M9 14.9h50.3l2.3 2.2H7.4c.3-1 1-1.8 1.6-2.2Z"/>
          <path class="route-vehicle__glass route-vehicle__glass--car" d="M20.5 13.2 26.3 7h9.2v6.2Zm17.5 0V7h9.8c2 0 3.8.7 5.3 2.1l4.4 4.1Z"/>
          <path class="route-vehicle__accent route-vehicle__accent--car" d="M8 20.1h53.8v2.1H8Z"/>
          <path class="route-vehicle__door route-vehicle__door--car" d="M36.7 7.2v17.2M58.1 14v10.4"/>
          <circle class="route-vehicle__wheel route-vehicle__wheel--car" cx="17" cy="27" r="4.7"/>
          <circle class="route-vehicle__wheel route-vehicle__wheel--car" cx="56.5" cy="27" r="4.7"/>
          <circle class="route-vehicle__wheel-hub route-vehicle__wheel-hub--car" cx="17" cy="27" r="1.8"/>
          <circle class="route-vehicle__wheel-hub route-vehicle__wheel-hub--car" cx="56.5" cy="27" r="1.8"/>
          <circle class="route-vehicle__light route-vehicle__light--car" cx="66.2" cy="18.6" r="1.4"/>
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
    const mode = ["plane", "shinkansen", "train", "bus", "car"].includes(leg.mode)
      ? leg.mode
      : "train";
    const hasSupportedModel =
      (mode === "shinkansen" && leg.vehicleModel === "n700s") ||
      (
        mode === "train" &&
        ["yufuin-no-mori", "via-venture"].includes(leg.vehicleModel)
      ) ||
      (mode === "car" && leg.vehicleModel === "honda-civic-black");
    const model = hasSupportedModel ? leg.vehicleModel : mode;
    return window.L.divIcon({
      className: "route-vehicle-shell",
      html:
        '<span class="route-vehicle route-vehicle--' +
        mode +
        " route-vehicle--" +
        model +
        '">' +
        '<span class="route-vehicle__bearing"><span class="route-vehicle__model">' +
        routeVehicleMarkup(mode, model) +
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
      const compactMap = window.matchMedia("(max-width: 1024px)").matches;
      const map = window.L.map(elements.streetMap, {
        zoomControl: true,
        attributionControl: false,
        zoomAnimation: !reducedMotion,
        fadeAnimation: !reducedMotion && !compactMap,
        markerZoomAnimation: !reducedMotion && !compactMap,
      });
      window.L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
      const streetTiles = window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "quiet-map-tile",
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: compactMap ? 2 : 3,
        detectRetina: !compactMap && window.devicePixelRatio > 1,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);

      const vehiclePane = map.createPane("travelVehiclePane");
      vehiclePane.style.zIndex = "640";
      vehiclePane.style.pointerEvents = "none";
      const routeGroup = window.L.layerGroup().addTo(map);
      const markerRevealZoom = 18;
      const markerCluster = window.L.markerClusterGroup({
        maxClusterRadius: (zoom) => (zoom >= 14 ? 32 : 44),
        disableClusteringAtZoom: markerRevealZoom,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: false,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true,
        chunkedLoading: true,
        animate: !compactMap,
        animateAddingMarkers: false,
        iconCreateFunction: clusterIcon,
      });
      markerCluster.on("clusterclick", (event) => {
        pausePlaybackForMapInteraction();
        if (map.getZoom() < markerRevealZoom - 1) return;
        const revealZoom = Math.min(markerRevealZoom, map.getMaxZoom());
        if (revealZoom <= map.getZoom()) return;
        map.flyTo(event.layer.getLatLng(), revealZoom, {
          animate: !reducedMotion,
          duration: 0.45,
        });
      });
      markerCluster.addTo(map);
      const endpointGroup = window.L.layerGroup().addTo(map);
      const motionGroup = window.L.layerGroup().addTo(map);

      state.streetMap = map;
      state.streetTiles = streetTiles;
      state.routeGroup = routeGroup;
      state.markerCluster = markerCluster;
      state.endpointGroup = endpointGroup;
      state.motionGroup = motionGroup;

      const mapContainer = map.getContainer();
      const pauseForMovingMapGesture = () => {
        pausePlaybackForMapInteraction();
      };
      const pauseForMapTap = (event) => {
        if (!state.playing) return;
        const target = event.originalEvent?.target;
        const interactiveTarget =
          target instanceof Element &&
          target.closest(
            ".leaflet-control, .leaflet-marker-icon, .leaflet-interactive, " +
              ".leaflet-tooltip, a, button, input, select, textarea",
          );
        if (!interactiveTarget) pausePlaybackForMapInteraction();
      };
      const pauseForMapControl = (event) => {
        const target = event.target;
        if (
          state.playing &&
          target instanceof Element &&
          target.closest(".leaflet-control-zoom a")
        ) pausePlaybackForMapInteraction();
      };
      const onMultiTouchStart = (event) => {
        if (event.touches.length < 2) return;
        pausePlaybackForMapInteraction();
      };
      const cleanupMapGestures = () => {
        map.off("click", pauseForMapTap);
        mapContainer.removeEventListener("wheel", pauseForMovingMapGesture);
        mapContainer.removeEventListener("touchstart", onMultiTouchStart);
        mapContainer.removeEventListener("click", pauseForMapControl, true);
      };

      map.on("zoomend moveend", () => updateMotionVehicle(state.motionProgress));
      map.on("click", pauseForMapTap);
      map.on("dragstart boxzoomstart dblclick", pauseForMovingMapGesture);
      map.once("unload", cleanupMapGestures);
      mapContainer.addEventListener("wheel", pauseForMovingMapGesture, {
        passive: true,
      });
      mapContainer.addEventListener("touchstart", onMultiTouchStart, {
        passive: true,
      });
      mapContainer.addEventListener("click", pauseForMapControl, true);

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
      car: "6 5",
    };
    return patterns[mode] || "9 7";
  }

  function routeStyle(leg, active, dimmed) {
    const configuredOpacity = Number(leg.routeOpacity);
    const hasConfiguredOpacity = Number.isFinite(configuredOpacity);
    const opacity = hasConfiguredOpacity
      ? dimmed
        ? Math.min(configuredOpacity * 0.35, 0.12)
        : configuredOpacity
      : leg.mode === "plane"
        ? dimmed
          ? 0.1
          : active
            ? 0.58
            : 0.28
        : dimmed
          ? 0.2
          : active
            ? 0.96
            : 0.52;
    return {
      color: leg.routeColor || modeColor(leg.mode),
      weight: active ? 5 : 2.7,
      opacity,
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

      const markers = trip.stops.filter((stop) => !stop.routeOnly).map((stop) => {
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
        marker.on("click", () => selectStop(stop.id, marker.getElement()));
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
        polyline.on("click", () => {
          if (index === state.activeLegIndex && state.playing) {
            pausePlaybackForMapInteraction();
            return;
          }
          setActiveLeg(index);
        });
        polyline.options.travelCoordinates = coordinates;
        state.routeLayers.set(leg.id, polyline);
      });
    }
    updateStreetStyles();
  }

  function motionDuration(leg = activeLeg(), route = state.motionRoute) {
    const timing = motionTiming[leg?.mode] || {
      minimum: 9000,
      maximum: 16000,
      metersPerMillisecond: 16,
    };
    if (!route?.total) return timing.minimum;
    const baseDuration = Math.min(
      timing.maximum,
      Math.max(
        timing.minimum,
        timing.minimum + route.total / timing.metersPerMillisecond,
      ),
    );
    const pacing = adaptiveMotionPacing[leg?.mode];
    const pacedDuration = pacing && route.paceRatio
      ? Math.max(
          pacing.minimumDuration,
          baseDuration * route.paceRatio,
        )
      : baseDuration;
    return Math.max(
      pacedDuration,
      Number(leg?.playback?.minimumDurationMs) || 0,
    );
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

  function cancelEndpointDwell(options = {}) {
    state.endpointDwellToken += 1;
    if (
      options.preserveRemaining &&
      state.endpointDwelling &&
      state.endpointDwellDeadlineAt > 0
    ) {
      state.endpointDwellRemainingMs = Math.max(
        0,
        state.endpointDwellDeadlineAt - performance.now(),
      );
    }
    if (state.endpointDwellTimer !== null) {
      window.clearTimeout(state.endpointDwellTimer);
      state.endpointDwellTimer = null;
    }
    state.endpointDwellDeadlineAt = 0;
    if (options.reset) {
      state.endpointDwelling = false;
      state.endpointDwellRemainingMs = 0;
    }
  }

  function armEndpointDwell(duration = state.endpointDwellRemainingMs) {
    const leg = activeLeg();
    if (!state.playing || !state.endpointDwelling || !leg) return;
    cancelEndpointDwell();
    const delay = Math.max(0, Number(duration) || 0);
    const token = state.endpointDwellToken;
    const legId = leg.id;
    state.endpointDwellRemainingMs = delay;
    state.endpointDwellDeadlineAt = performance.now() + delay;
    state.endpointDwellTimer = window.setTimeout(() => {
      if (
        token !== state.endpointDwellToken ||
        !state.playing ||
        !state.endpointDwelling ||
        activeLeg()?.id !== legId
      ) return;
      state.endpointDwellTimer = null;
      state.endpointDwellDeadlineAt = 0;
      state.endpointDwellRemainingMs = 0;
      const trip = currentTrip();
      const isFinalLeg = state.activeLegIndex === trip.legs.length - 1;
      if (isFinalLeg) {
        state.endpointDwelling = false;
        state.playing = false;
        state.playbackCompleted = true;
        state.motionStartedAt = null;
        renderRouteCard();
        renderPlaybackState();
        updateStreetStyles();
        return;
      }
      state.endpointDwelling = false;
      setActiveLeg(state.activeLegIndex + 1, { keepPlaying: true });
    }, delay);
  }

  function beginEndpointDwell(leg, duration) {
    state.motionElapsedMs = duration;
    state.motionProgress = 1;
    state.motionStartedAt = null;
    state.endpointDwelling = true;
    state.endpointDwellRemainingMs = Math.max(
      0,
      Number(leg?.playback?.endpointDwellMs) || endpointDwellDurationMs,
    );
    setMotionCameraPhase("arrival");
    renderRouteCard();
    renderPlaybackState();
    updateStreetStyles();
    armEndpointDwell();
  }

  function resetMotionProgress() {
    cancelEndpointDwell({ reset: true });
    state.motionStartedAt = null;
    state.motionElapsedMs = 0;
    state.motionProgress = 0;
    state.motionBearing = null;
    state.motionLastPaintAt = 0;
    state.playbackCompleted = false;
    setMotionCameraPhase("idle");
    elements.routeProgress.style.setProperty("--motion-progress", "0");
  }

  function smoothStep(value) {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
  }

  function buildAdaptivePace(leg, points, cumulative, stops) {
    const pacing = adaptiveMotionPacing[leg.mode];
    if (!pacing || points.length < 2) return null;

    const attentionStops = new Map();
    [...stops.values()].forEach((stop) => {
      if (markerPhotoSource(stop) || stop.photos?.length) {
        attentionStops.set(stop.id, stop);
      }
    });
    [stops.get(leg.from), stops.get(leg.to)].forEach((stop) => {
      if (stop) attentionStops.set(stop.id, stop);
    });
    const attentionPoints = [...attentionStops.values()];
    const cruiseWeight = 1 / pacing.cruiseMultiplier;
    let segmentWeights = points.slice(1).map((point, index) => {
      const previous = points[index];
      const midpoint = window.L.latLng(
        (previous[0] + point[0]) / 2,
        (previous[1] + point[1]) / 2,
      );
      let nearestDistance = Infinity;
      attentionPoints.forEach((stop) => {
        nearestDistance = Math.min(
          nearestDistance,
          midpoint.distanceTo(window.L.latLng(stop.lat, stop.lng)),
        );
      });
      const blend = 1 - smoothStep(
        (nearestDistance - pacing.nearDistance) /
          (pacing.farDistance - pacing.nearDistance),
      );
      return cruiseWeight + (1 - cruiseWeight) * blend;
    });

    for (let pass = 0; pass < 2; pass += 1) {
      segmentWeights = segmentWeights.map((weight, index, weights) =>
        (weights[index - 1] ?? weight) * 0.25 +
        weight * 0.5 +
        (weights[index + 1] ?? weight) * 0.25,
      );
    }

    const paceCumulative = [0];
    segmentWeights.forEach((weight, index) => {
      const segmentLength = cumulative[index + 1] - cumulative[index];
      paceCumulative.push(paceCumulative[index] + segmentLength * weight);
    });
    const paceTotal = paceCumulative.at(-1);
    const total = cumulative.at(-1);
    return paceTotal > 0 && total > 0
      ? {
          paceCumulative,
          paceTotal,
          paceRatio: paceTotal / total,
        }
      : null;
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
    if (total <= 0) return null;
    return {
      points,
      cumulative,
      total,
      ...(buildAdaptivePace(leg, points, cumulative, stops) || {}),
    };
  }

  function sampleMotionRoute(route, progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    const sampleCumulative = route.paceCumulative || route.cumulative;
    const sampleTotal = route.paceTotal || route.total;
    const target = sampleTotal * clamped;
    let low = 1;
    let high = sampleCumulative.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (sampleCumulative[middle] < target) low = middle + 1;
      else high = middle;
    }
    const endIndex = low;
    const startIndex = Math.max(0, endIndex - 1);
    const segmentStartDistance = sampleCumulative[startIndex];
    const segmentLength = Math.max(
      0.0001,
      sampleCumulative[endIndex] - segmentStartDistance,
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
      element.classList.toggle(
        "is-moving",
        state.playing && !state.cameraPreparing && !state.endpointDwelling,
      );
    }
    elements.routeProgress.style.setProperty(
      "--motion-progress",
      String(Math.max(0, Math.min(1, progress))),
    );
  }

  function syncMotionVehicle(leg) {
    if (!state.motionGroup || !leg) {
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
      const configuredTrailOpacity = Number(leg.routeOpacity);
      state.motionTrail = window.L.polyline([start, start], {
        color: leg.routeColor || modeColor(leg.mode),
        weight: 6.5,
        opacity: Number.isFinite(configuredTrailOpacity)
          ? configuredTrailOpacity
          : leg.mode === "plane"
            ? 0.62
            : 0.94,
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
        title: leg.label + " travelling along the active route",
      }).addTo(state.motionGroup);
      window.requestAnimationFrame(() => updateMotionVehicle(state.motionProgress));
    }
    updateMotionVehicle(state.motionProgress);
  }

  function updateStreetStyles() {
    const trip = currentTrip();
    if (!trip || state.streetTripId !== trip.id) return;
    const leg = activeLeg(trip);
    const showingRoute = !state.selectedStopId && !state.mapFocus;

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
    if (showingRoute && leg && state.endpointGroup) {
      const stops = stopMap(trip);
      const coordinates = legCoordinates(leg, stops);
      const endpoints = [
        { role: "Start", stop: stops.get(leg.from), coordinates: coordinates[0] },
        { role: "End", stop: stops.get(leg.to), coordinates: coordinates.at(-1) },
      ];
      endpoints.forEach((endpoint) => {
        const endpointInteractive = !endpoint.stop.routeOnly;
        const marker = window.L.marker(endpoint.coordinates, {
          icon: stopIcon(endpoint.stop, false, true),
          interactive: endpointInteractive,
          keyboard: endpointInteractive,
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
        if (endpointInteractive) {
          marker.on("click", () => selectStop(endpoint.stop.id, marker.getElement()));
        }
        marker.addTo(state.endpointGroup);
      });
    }

    trip.legs.forEach((item, index) => {
      const layer = state.routeLayers.get(item.id);
      if (!layer) return;
      const active = index === state.activeLegIndex && showingRoute;
      layer.setStyle(routeStyle(item, active, Boolean(state.selectedStopId)));
      const path = layer.getElement();
      path?.classList.toggle("is-active", active);
      path?.classList.toggle(
        "is-playing",
        active && state.playing && !state.cameraPreparing && !state.endpointDwelling,
      );
      if (active) layer.bringToFront();
    });
    syncMotionVehicle(showingRoute ? leg : null);
  }

  function mapPadding() {
    const mobile = window.matchMedia("(max-width: 1024px)").matches;
    return mobile
      ? { paddingTopLeft: [22, 64], paddingBottomRight: [22, 165] }
      : { paddingTopLeft: [32, 72], paddingBottomRight: [32, 220] };
  }

  function fitTripBounds(trip, animate = true) {
    if (!state.streetMap) return;
    const overviewPoints = trip.focusAreas?.length
      ? trip.focusAreas
      : trip.stops.filter((stop) => !stop.routeOnly);
    if (!overviewPoints.length) return;
    if (overviewPoints.length === 1) {
      state.streetMap.flyTo(
        [overviewPoints[0].lat, overviewPoints[0].lng],
        13,
        { animate: animate && !reducedMotion, duration: 0.9 },
      );
      return;
    }
    const bounds = window.L.latLngBounds(
      overviewPoints.map((point) => [point.lat, point.lng]),
    );
    state.streetMap.flyToBounds(bounds, {
      ...mapPadding(),
      maxZoom: 12,
      animate: animate && !reducedMotion,
      duration: 1,
    });
  }

  function focusTripEntry(trip, animate = true) {
    if (!state.streetMap || !trip?.entryView) return;
    const center = [trip.entryView.lat, trip.entryView.lng];
    if (animate && !reducedMotion) {
      state.streetMap.flyTo(center, trip.entryView.mapZoom, {
        animate: true,
        duration: 0.8,
      });
      return;
    }
    state.streetMap.setView(center, trip.entryView.mapZoom, { animate: false });
  }

  function routeCameraCoordinates(leg) {
    if (state.motionLegId === leg?.id && state.motionRoute?.points?.length) {
      return state.motionRoute.points;
    }
    return leg ? legCoordinates(leg, stopMap()) : [];
  }

  function routeCloseZoom(leg) {
    return leg?.mode === "plane" ? 11 : 14;
  }

  function alignStreetMapWorld(coordinates) {
    if (!state.streetMap?._loaded || !coordinates.length) return;
    const longitudes = coordinates.map((coordinate) => Number(coordinate[1]));
    const routeCenterLongitude =
      (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
    const current = state.streetMap.getCenter();
    let alignedLongitude = current.lng;
    while (alignedLongitude - routeCenterLongitude > 180) alignedLongitude -= 360;
    while (alignedLongitude - routeCenterLongitude < -180) alignedLongitude += 360;
    if (Math.abs(alignedLongitude - current.lng) < 180) return;
    state.streetMap.setView(
      [current.lat, alignedLongitude],
      state.streetMap.getZoom(),
      { animate: false },
    );
  }

  function routeEndpointView(leg, endpoint = "start") {
    if (!state.streetMap || !leg) return null;
    const coordinates = routeCameraCoordinates(leg);
    alignStreetMapWorld(coordinates);
    const latlng = endpoint === "end" ? coordinates.at(-1) : coordinates[0];
    if (!latlng) return null;
    const zoom = routeCloseZoom(leg);
    const padding = mapPadding();
    const topLeft = window.L.point(padding.paddingTopLeft);
    const bottomRight = window.L.point(padding.paddingBottomRight);
    const centerOffset = bottomRight.subtract(topLeft).divideBy(2);
    const projected = state.streetMap
      .project(window.L.latLng(latlng), zoom)
      .add(centerOffset);
    return {
      center: state.streetMap.unproject(projected, zoom),
      latlng,
      zoom,
    };
  }

  function cameraMatchesEndpoint(leg, endpoint = "start") {
    const view = routeEndpointView(leg, endpoint);
    if (!view || !state.streetMap?._loaded) return false;
    const centerDrift = state.streetMap
      .project(state.streetMap.getCenter(), view.zoom)
      .distanceTo(state.streetMap.project(view.center, view.zoom));
    return (
      centerDrift < 2 &&
      Math.abs(state.streetMap.getZoom() - view.zoom) < 0.01
    );
  }

  function focusRouteEndpoint(
    leg = activeLeg(),
    endpoint = "start",
    animate = true,
    duration = 0.65,
  ) {
    const view = routeEndpointView(leg, endpoint);
    if (!view || !state.streetMap) return;
    if (animate && !reducedMotion) {
      state.streetMap.flyTo(view.center, view.zoom, {
        animate: true,
        duration,
      });
    } else {
      state.streetMap.setView(view.center, view.zoom, { animate: false });
    }
  }

  function focusLeg(leg = activeLeg(), animate = true, duration = 1.05) {
    const trip = currentTrip();
    if (!state.streetMap || !trip || !leg) return;
    const stops = stopMap(trip);
    const coordinates = routeCameraCoordinates(leg);
    alignStreetMapWorld(coordinates);
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
    maxZoom = Math.min(maxZoom, routeCloseZoom(leg) - 1);
    state.streetMap.flyToBounds(bounds, {
      ...mapPadding(),
      maxZoom,
      animate: animate && !reducedMotion,
      duration,
    });
  }

  function setMotionCameraPhase(phase) {
    state.motionCameraPhase = phase;
    elements.mapStage.dataset.routeCamera = phase;
  }

  function focusRouteCameraForProgress(leg = activeLeg(), animate = true) {
    if (!leg || !state.motionRoute) return;
    if (state.motionProgress <= 0.001) {
      setMotionCameraPhase("start");
      focusRouteEndpoint(leg, "start", animate);
    } else if (state.motionProgress >= 1) {
      setMotionCameraPhase("arrival");
      focusRouteEndpoint(leg, "end", animate);
    } else {
      setMotionCameraPhase("overview");
      focusLeg(leg, animate);
    }
  }

  function cancelMotionCameraPreparation() {
    state.motionResumeToken += 1;
    state.cameraPreparing = false;
    if (state.motionCameraWaitCleanup) {
      const cleanup = state.motionCameraWaitCleanup;
      state.motionCameraWaitCleanup = null;
      cleanup();
    }
    if (state.motionResumeTimer !== null) {
      window.clearTimeout(state.motionResumeTimer);
      state.motionResumeTimer = null;
    }
  }

  function runPlaybackCameraTransition(
    token,
    legId,
    moveCamera,
    onSettled,
    fallbackMs,
  ) {
    const map = state.streetMap;
    if (!map || reducedMotion) {
      moveCamera();
      window.requestAnimationFrame(onSettled);
      return;
    }

    const leg = activeLeg();
    if (leg?.id === legId) alignStreetMapWorld(routeCameraCoordinates(leg));

    if (state.motionCameraWaitCleanup) {
      const previousCleanup = state.motionCameraWaitCleanup;
      state.motionCameraWaitCleanup = null;
      previousCleanup();
    }
    if (state.motionResumeTimer !== null) {
      window.clearTimeout(state.motionResumeTimer);
      state.motionResumeTimer = null;
    }

    const tiles = state.streetTiles;
    let finished = false;
    let moveFinished = false;
    let fallbackTimer = null;
    const cleanup = () => {
      map.off("moveend", handleMoveEnd);
      tiles?.off("load", finish);
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      cleanup();
      if (state.motionCameraWaitCleanup === cancel) {
        state.motionCameraWaitCleanup = null;
      }
    };
    const isCurrent = () =>
      token === state.motionResumeToken &&
      state.playing &&
      activeLeg()?.id === legId;
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      if (state.motionCameraWaitCleanup === cancel) {
        state.motionCameraWaitCleanup = null;
      }
      if (!isCurrent()) return;
      window.requestAnimationFrame(() => {
        if (isCurrent()) onSettled();
      });
    };
    const waitForVisibleTiles = () => {
      if (finished) return;
      if (!isCurrent()) {
        finish();
        return;
      }
      if (!tiles?.isLoading?.()) {
        finish();
        return;
      }
      tiles.once("load", finish);
      fallbackTimer = window.setTimeout(
        finish,
        window.innerWidth < 1025 ? 550 : 350,
      );
    };
    function handleMoveEnd() {
      if (moveFinished || finished) return;
      moveFinished = true;
      map.off("moveend", handleMoveEnd);
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      window.requestAnimationFrame(waitForVisibleTiles);
    }

    state.motionCameraWaitCleanup = cancel;
    map.once("moveend", handleMoveEnd);
    fallbackTimer = window.setTimeout(handleMoveEnd, fallbackMs);
    moveCamera();
  }

  function beginArrivalCameraTransition(leg, duration) {
    if (!state.playing || !state.streetMap || !leg || !state.motionRoute) {
      return false;
    }

    cancelMotionCameraPreparation();
    state.streetMap.stop();
    state.motionElapsedMs = duration;
    state.motionProgress = 1;
    state.motionStartedAt = null;
    state.cameraPreparing = true;
    setMotionCameraPhase("arrival");
    updateMotionVehicle(1);
    renderPlaybackState();
    updateStreetStyles();

    const token = state.motionResumeToken;
    const legId = leg.id;
    const transitionDuration = reducedMotion ? 0 : 0.78;
    const finishArrival = () => {
      if (
        token !== state.motionResumeToken ||
        !state.playing ||
        activeLeg()?.id !== legId
      ) return;
      state.cameraPreparing = false;
      beginEndpointDwell(leg, duration);
    };

    // Give the endpoint position one painted frame before the map begins its
    // close-up. This keeps long legs from appearing to jump into place during
    // the destination zoom on slower mobile devices.
    window.requestAnimationFrame(() => {
      if (
        token !== state.motionResumeToken ||
        !state.playing ||
        activeLeg()?.id !== legId
      ) return;
      if (cameraMatchesEndpoint(leg, "end")) {
        focusRouteEndpoint(leg, "end", false);
        window.requestAnimationFrame(finishArrival);
        return;
      }
      runPlaybackCameraTransition(
        token,
        legId,
        () => focusRouteEndpoint(leg, "end", !reducedMotion, transitionDuration),
        finishArrival,
        Math.ceil(transitionDuration * 1000) + 450,
      );
    });
    return true;
  }

  function preparePlaybackCamera() {
    const leg = activeLeg();
    if (!state.playing || !state.streetMap || !leg || !state.motionRoute) return;
    const duration = motionDuration(leg);
    if (state.motionProgress >= 1) {
      beginArrivalCameraTransition(leg, duration);
      return;
    }
    cancelMotionCameraPreparation();
    state.streetMap.stop();
    const token = state.motionResumeToken;
    const legId = leg.id;
    state.cameraPreparing = true;
    renderPlaybackState();
    updateStreetStyles();

    const resumeMotion = () => {
      if (token !== state.motionResumeToken) return;
      state.motionResumeTimer = null;
      if (!state.playing || activeLeg()?.id !== legId) return;
      state.cameraPreparing = false;
      renderPlaybackState();
      updateStreetStyles();
      requestMotionFrame();
    };

    if (state.motionProgress <= 0.001) {
      const alreadyAtStart = cameraMatchesEndpoint(leg, "start");
      setMotionCameraPhase("start");
      const launchCruise = () => {
        if (
          token !== state.motionResumeToken ||
          !state.playing ||
          activeLeg()?.id !== legId
        ) return;
        state.motionResumeTimer = null;
        setMotionCameraPhase("overview");
        runPlaybackCameraTransition(
          token,
          legId,
          () => focusLeg(leg, !reducedMotion, 1.05),
          resumeMotion,
          1300,
        );
      };
      const holdAtStart = () => {
        if (
          token !== state.motionResumeToken ||
          !state.playing ||
          activeLeg()?.id !== legId
        ) return;
        state.motionResumeTimer = window.setTimeout(
          launchCruise,
          routeCameraIntroHoldMs,
        );
      };
      if (alreadyAtStart || reducedMotion) {
        focusRouteEndpoint(leg, "start", false);
        holdAtStart();
      } else {
        runPlaybackCameraTransition(
          token,
          legId,
          () => focusRouteEndpoint(leg, "start", true, 0.62),
          holdAtStart,
          850,
        );
      }
      return;
    }

    setMotionCameraPhase("overview");
    runPlaybackCameraTransition(
      token,
      legId,
      () => focusLeg(leg, !reducedMotion, 0.78),
      resumeMotion,
      1050,
    );
  }

  function updatePlaybackCamera(leg, duration) {
    if (
      !state.playing ||
      state.cameraPreparing ||
      state.motionProgress < 1
    ) return false;
    return beginArrivalCameraTransition(leg, duration);
  }

  function pausePlaybackForMapInteraction() {
    if (!state.playing) return;
    stopPlayback();
  }

  function focusStop(stop) {
    if (!state.streetMap) return;
    const tripId = state.viewId;
    const marker = state.markerLayers.get(stop.id);
    const zoom = stop.kind === "airport" ? 14 : 16;
    const focus = () => {
      if (state.viewId !== tripId || state.selectedStopId !== stop.id) return;
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
    state.selectedAreaId = focus;
    state.storyExpanded = false;
    renderMapFocus();
    renderCityNavigation();
    renderCityStory();
    renderRouteCard();
    renderPlaybackState();
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

  function playFromFocusedArea() {
    const trip = currentTrip();
    const area = trip?.focusAreas?.find((item) => item.id === state.mapFocus);
    const startIndex = area
      ? focusAreaStartLegIndex(area, trip)
      : Math.max(0, trip?.legs.findIndex((leg) => leg.id === trip.defaultLegId));
    if (startIndex < 0) return;
    setActiveLeg(startIndex);
    startPlayback();
  }

  function applyOverviewRotation() {
    if (!state.globe) return;
    state.globe.controls().autoRotate =
      isOverview() && state.overviewRotation && !document.hidden && !reducedMotion;
    state.globe.controls().autoRotateSpeed = 0.32;
  }

  function activateMapView(options = {}) {
    const focusInitial = Boolean(options.focusInitial);
    const revealFromGlobe = Boolean(
      options.fromGlobeTransition &&
      !reducedMotion &&
      !elements.globe.hidden,
    );
    elements.fallback.hidden = true;

    if (isOverview()) {
      elements.app.classList.add("is-overview");
      elements.app.classList.remove("is-trip");
      elements.mapStage.classList.add("is-overview");
      elements.mapStage.classList.remove(
        "is-trip",
        "is-trip-reveal-preparing",
        "is-trip-revealing",
      );
      elements.globe.hidden = false;
      elements.globe.removeAttribute("aria-hidden");
      elements.streetMap.hidden = true;
      elements.streetMap.setAttribute("aria-hidden", "true");
      state.streetMap?.stop();
      if (state.overviewGlobeFailed) {
        stopOverviewFlightPlanes();
        showMapFallback();
        return;
      }
      if (state.globe) state.globe.controls().enabled = true;
      state.globe?.resumeAnimation();
      refreshOverviewGlobe();
      applyOverviewRotation();
      initOverviewFlightPlanes();
      startOverviewFlightPlanes();
      if (focusInitial) focusGlobe(overviewInitialView(), 1250);
      return;
    }

    const trip = currentTrip();
    elements.app.classList.remove("is-overview");
    elements.app.classList.add("is-trip");
    elements.mapStage.classList.remove("is-overview");
    elements.mapStage.classList.add("is-trip");
    elements.mapStage.classList.toggle("is-trip-reveal-preparing", revealFromGlobe);
    elements.mapStage.classList.remove("is-trip-revealing");
    elements.globe.hidden = !revealFromGlobe;
    if (revealFromGlobe) elements.globe.removeAttribute("aria-hidden");
    else elements.globe.setAttribute("aria-hidden", "true");
    elements.streetMap.hidden = false;
    if (revealFromGlobe) elements.streetMap.setAttribute("aria-hidden", "true");
    else elements.streetMap.removeAttribute("aria-hidden");
    if (state.globe) {
      state.globe.controls().enabled = true;
      state.globe.controls().autoRotate = false;
      state.globe.pauseAnimation();
    }
    stopOverviewFlightPlanes();
    if (!initStreetMap()) return;
    renderStreetTrip(trip);
    window.requestAnimationFrame(() => {
      state.streetMap.invalidateSize({ pan: false });
      if (focusInitial) {
        setMotionCameraPhase("idle");
        if (state.mapFocus === "all") fitTripBounds(trip, false);
        else if (trip.entryView) focusTripEntry(trip, false);
        else fitTripBounds(trip, false);
      }
      window.requestAnimationFrame(() => {
        updateMotionVehicle(state.motionProgress);
        if (revealFromGlobe) {
          scheduleTripMapReveal(trip.id, options.transitionToken);
        }
      });
    });
  }

  function commitView(viewId, options = {}) {
    if (viewId !== data.overview.id && !tripsById.has(viewId)) return;
    stopPlayback({ refresh: false });
    resetMotionProgress();
    clearMotionLayers();
    state.viewId = viewId;
    state.selectedStopId = null;
    state.mapFocus = "all";
    state.selectedAreaId = "all";
    state.storyExpanded = false;

    if (isOverview()) {
      state.overviewRotation = true;
    } else {
      const trip = currentTrip();
      state.activeLegIndex = Math.max(
        0,
        trip.legs.findIndex((leg) => leg.id === trip.defaultLegId),
      );
      state.mapFocus = "all";
    }
    renderAll({
      ...options,
      focusInitial: options.focusInitial !== false,
    });
  }

  function selectView(viewId) {
    if (viewId !== data.overview.id && !tripsById.has(viewId)) return;
    if (viewId === data.overview.id) {
      if (isOverview() && !state.pendingViewId) return;
      cancelViewTransition({ restoreOverview: false, refreshTabs: false });
      commitView(viewId, { focusInitial: true });
      return;
    }
    if (state.pendingViewId === viewId) return;
    if (viewId === state.viewId && !state.pendingViewId) return;
    beginTripEntryTransition(viewId);
  }

  function setActiveLeg(index, options = {}) {
    const trip = currentTrip();
    if (!trip?.legs.length) return;
    if (!options.keepPlaying) stopPlayback({ refresh: false });
    cancelMotionCameraPreparation();
    state.activeLegIndex = (index + trip.legs.length) % trip.legs.length;
    resetMotionProgress();
    state.selectedStopId = null;
    state.mapFocus = "";
    state.storyExpanded = false;
    renderMapFocus();
    renderCityNavigation();
    renderCityStory();
    renderRouteCard();
    renderPlaybackState();
    updateStreetStyles();
    if (state.playing) {
      preparePlaybackCamera();
    }
    else {
      setMotionCameraPhase("start");
      focusRouteEndpoint(activeLeg(trip), "start");
    }
  }

  function selectStop(stopId, opener) {
    const trip = currentTrip();
    const stop = stopMap(trip).get(stopId);
    if (!trip || !stop) return;
    let galleryOpener = opener;
    stopPlayback();
    if (state.selectedStopId === stopId && stop.photos.length) {
      openGallery(stop, galleryOpener);
      return;
    }
    state.selectedStopId = stopId;
    state.mapFocus = "";
    state.selectedAreaId = areaForStop(stop, trip)?.id || state.selectedAreaId;
    state.storyExpanded = false;
    renderMapFocus();
    renderCityNavigation();
    renderCityStory();
    renderRouteCard();
    renderPlaybackState();
    updateStreetStyles();
    galleryOpener = state.markerLayers.get(stopId)?.getElement() || galleryOpener;
    focusStop(stop);
    if (markerPhotoSource(stop) && stop.photos.length) openGallery(stop, galleryOpener);
  }

  function requestMotionFrame() {
    if (
      !state.playing ||
      state.endpointDwelling ||
      state.cameraPreparing ||
      state.motionFrame !== null
    ) return;
    state.motionFrame = window.requestAnimationFrame(runMotionFrame);
  }

  function runMotionFrame(timestamp) {
    state.motionFrame = null;
    if (!state.playing || state.endpointDwelling || state.cameraPreparing) return;
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
    const frameInterval = window.innerWidth < 1025 ? 1000 / 30 : 1000 / 60;
    if (
      state.motionProgress >= 1 ||
      timestamp - state.motionLastPaintAt >= frameInterval
    ) {
      state.motionLastPaintAt = timestamp;
      updateMotionVehicle(state.motionProgress);
    }
    if (updatePlaybackCamera(leg, duration)) return;

    if (state.motionProgress >= 1) {
      beginEndpointDwell(leg, duration);
      return;
    }
    requestMotionFrame();
  }

  function startPlayback() {
    const trip = currentTrip();
    if (!trip?.legs.length) return;
    if (state.playbackCompleted) {
      state.playing = true;
      state.playbackCompleted = false;
      setActiveLeg(0, { keepPlaying: true });
      return;
    }
    state.selectedStopId = null;
    state.playing = true;
    if (state.endpointDwelling) {
      renderMapFocus();
      renderRouteCard();
      renderPlaybackState();
      updateStreetStyles();
      armEndpointDwell();
      return;
    }
    renderMapFocus();
    renderRouteCard();
    renderPlaybackState();
    updateStreetStyles();
    preparePlaybackCamera();
  }

  function stopPlayback(options = {}) {
    const wasPlaying = state.playing;
    state.playing = false;
    state.streetMap?.stop();
    if (state.endpointDwelling) {
      cancelEndpointDwell({ preserveRemaining: true });
    }
    if (wasPlaying && state.motionStartedAt !== null) {
      const duration = motionDuration(activeLeg(), state.motionRoute);
      state.motionElapsedMs = Math.min(duration, performance.now() - state.motionStartedAt);
      state.motionProgress = Math.min(1, state.motionElapsedMs / duration);
      updateMotionVehicle(state.motionProgress);
    }
    cancelMotionCameraPreparation();
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

  function focusWithoutScroll(element) {
    if (!element?.focus || !document.contains(element)) return;
    try {
      element.focus({ preventScroll: true });
    } catch (_error) {
      element.focus();
    }
  }

  function openGallery(stop, opener = document.activeElement) {
    if (!stop.photos.length) return;
    stopPlayback();
    state.galleryPhotos = stop.photos;
    state.galleryStopName = stop.name;
    state.galleryReturnFocus = opener?.focus ? opener : document.activeElement;
    elements.galleryKicker.textContent = currentTrip().name + " · " + stop.city;
    elements.galleryTitle.textContent = stop.name;
    elements.galleryGrid.replaceChildren(
      ...stop.photos.map((photo, index) => {
        const dimensions = photoDimensions(photo);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gallery__image-button is-loading";
        button.style.setProperty(
          "--photo-ratio",
          dimensions.width + " / " + dimensions.height,
        );
        button.setAttribute("aria-label", "Open " + stop.name + " photo " + (index + 1));
        button.addEventListener("click", () => openLightbox(index, button));
        const image = document.createElement("img");
        image.alt = photo.alt || stop.name + " photo " + (index + 1);
        image.loading = index === 0 ? "eager" : "lazy";
        image.decoding = "async";
        image.fetchPriority = index === 0 ? "high" : "auto";
        image.width = dimensions.width;
        image.height = dimensions.height;
        image.sizes = "(max-width: 640px) calc(100vw - 32px), min(500px, 44vw)";
        image.srcset =
          photoDisplaySource(photo, 640) + " 640w, " +
          photoDisplaySource(photo, 960) + " 960w";
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
        image.src = photoDisplaySource(photo, 640);
        button.append(image);
        return button;
      }),
    );
    elements.app.inert = true;
    elements.gallery.hidden = false;
    elements.galleryClose.focus();
  }

  function closeGallery() {
    if (!elements.lightbox.hidden) closeLightbox({ restoreFocus: false });
    const returnFocus = state.galleryReturnFocus;
    const markerReturnFocus = state.markerLayers
      .get(state.selectedStopId)
      ?.getElement();
    elements.gallery.hidden = true;
    elements.galleryGrid.replaceChildren();
    elements.app.inert = false;
    state.galleryPhotos = [];
    state.galleryStopName = "";
    state.galleryReturnFocus = null;
    focusWithoutScroll(
      document.contains(returnFocus) ? returnFocus : markerReturnFocus,
    );
  }

  function showLightboxPhoto(index) {
    if (index < 0 || index >= state.galleryPhotos.length) return;
    state.lightboxIndex = index;
    state.lightboxLoadToken += 1;
    const loadToken = state.lightboxLoadToken;
    const photo = state.galleryPhotos[index];
    const count = state.galleryPhotos.length;
    const alt = state.galleryStopName + ", photo " + (index + 1) + " of " + count;

    if (state.lightboxLoader) {
      state.lightboxLoader.onload = null;
      state.lightboxLoader.onerror = null;
    }
    elements.lightbox.classList.add("is-loading");
    elements.lightbox.classList.remove("has-error");
    elements.lightbox.setAttribute("aria-busy", "true");
    elements.lightbox.style.setProperty(
      "--lightbox-preview",
      "url(" + JSON.stringify(photo.preview) + ")",
    );
    elements.lightboxTitle.textContent = state.galleryStopName + " photo viewer";
    elements.lightboxCount.textContent = index + 1 + " of " + count;
    const focusBeforeNavigationUpdate = document.activeElement;
    elements.lightboxPrevious.disabled = index === 0;
    elements.lightboxNext.disabled = index === count - 1;
    elements.lightboxPrevious.hidden = count < 2;
    elements.lightboxNext.hidden = count < 2;
    if (
      focusBeforeNavigationUpdate === elements.lightboxPrevious &&
      elements.lightboxPrevious.disabled
    ) {
      (elements.lightboxNext.disabled
        ? elements.lightboxClose
        : elements.lightboxNext).focus();
    } else if (
      focusBeforeNavigationUpdate === elements.lightboxNext &&
      elements.lightboxNext.disabled
    ) {
      (elements.lightboxPrevious.disabled
        ? elements.lightboxClose
        : elements.lightboxPrevious).focus();
    }
    elements.lightboxImage.alt = alt;
    elements.lightboxImage.removeAttribute("src");

    const loader = new Image();
    state.lightboxLoader = loader;
    loader.decoding = "async";
    loader.onload = () => {
      if (loadToken !== state.lightboxLoadToken || index !== state.lightboxIndex) return;
      elements.lightboxImage.src = photo.full;
      elements.lightbox.classList.remove("is-loading");
      elements.lightbox.setAttribute("aria-busy", "false");
    };
    loader.onerror = () => {
      if (loadToken !== state.lightboxLoadToken || index !== state.lightboxIndex) return;
      elements.lightbox.classList.remove("is-loading");
      elements.lightbox.classList.add("has-error");
      elements.lightbox.setAttribute("aria-busy", "false");
    };
    loader.src = photo.full;
  }

  function navigateLightbox(direction) {
    showLightboxPhoto(state.lightboxIndex + direction);
  }

  function openLightbox(index, opener) {
    state.lightboxReturnFocus = opener?.focus ? opener : document.activeElement;
    state.lightboxSuppressClickUntil = 0;
    elements.gallery.inert = true;
    elements.gallery.setAttribute("aria-hidden", "true");
    elements.lightbox.hidden = false;
    showLightboxPhoto(index);
    elements.lightboxClose.focus();
  }

  function closeLightbox(options = {}) {
    const returnFocus = state.lightboxReturnFocus;
    state.lightboxLoadToken += 1;
    if (state.lightboxLoader) {
      state.lightboxLoader.onload = null;
      state.lightboxLoader.onerror = null;
    }
    state.lightboxLoader = null;
    state.lightboxIndex = -1;
    state.lightboxReturnFocus = null;
    state.lightboxSwipe = null;
    state.lightboxSuppressClickUntil = 0;
    elements.lightbox.hidden = true;
    elements.lightbox.classList.remove("is-loading", "has-error");
    elements.lightbox.removeAttribute("aria-busy");
    elements.lightbox.style.removeProperty("--lightbox-preview");
    elements.lightboxImage.removeAttribute("src");
    elements.lightboxImage.alt = "";
    elements.lightboxCount.textContent = "";
    elements.gallery.inert = false;
    elements.gallery.removeAttribute("aria-hidden");
    if (options.restoreFocus !== false) focusWithoutScroll(returnFocus);
  }

  function beginLightboxSwipe(event) {
    if (event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    if (event.clientX < 24 || event.clientX > window.innerWidth - 24) return;
    state.lightboxSwipe = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    try {
      elements.lightboxStage.setPointerCapture(event.pointerId);
    } catch (_error) {
      // Pointer capture is an enhancement; in-stage gestures still work without it.
    }
  }

  function finishLightboxSwipe(event) {
    const swipe = state.lightboxSwipe;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    state.lightboxSwipe = null;
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const minimumDistance = Math.max(44, elements.lightboxStage.clientWidth * 0.12);
    if (
      Math.abs(deltaX) >= minimumDistance &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.25
    ) {
      state.lightboxSuppressClickUntil = performance.now() + 450;
      navigateLightbox(deltaX < 0 ? 1 : -1);
    }
  }

  function cancelLightboxSwipe(event) {
    if (state.lightboxSwipe?.pointerId === event.pointerId) state.lightboxSwipe = null;
  }

  function isLightboxBackdropClick(event) {
    if (
      event.target === elements.lightbox ||
      event.target === elements.lightboxStage
    ) return true;
    if (event.target !== elements.lightboxImage) return false;

    const naturalWidth = elements.lightboxImage.naturalWidth;
    const naturalHeight = elements.lightboxImage.naturalHeight;
    if (!naturalWidth || !naturalHeight) return false;
    const bounds = elements.lightboxImage.getBoundingClientRect();
    const scale = Math.min(
      bounds.width / naturalWidth,
      bounds.height / naturalHeight,
    );
    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;
    const renderedLeft = bounds.left + (bounds.width - renderedWidth) / 2;
    const renderedTop = bounds.top + (bounds.height - renderedHeight) / 2;
    return (
      event.clientX < renderedLeft ||
      event.clientX > renderedLeft + renderedWidth ||
      event.clientY < renderedTop ||
      event.clientY > renderedTop + renderedHeight
    );
  }

  function trapModalFocus(event, modal) {
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll(
      'button:not([disabled]):not([hidden]), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hidden && element.getClientRects().length);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!focusable.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function renderAll(options = {}) {
    renderTripTabs();
    renderSummary();
    renderCityNavigation();
    renderCityStory();
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
      const globeTextureUrl = "./trip_images/globe/earth-night.jpg";
      let globeReadyScheduled = false;
      const handleGlobeReady = () => {
        if (state.overviewGlobeReady || globeReadyScheduled) return;
        globeReadyScheduled = true;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            globeReadyScheduled = false;
            if (!state.globe || state.overviewGlobeReady) return;
            styleOverviewGlobe(state.globe);
            state.overviewGlobeReady = true;
            focusGlobe(overviewInitialView(), 0);
            initOverviewFlightPlanes();
            startOverviewFlightPlanes();
            applyOverviewRotation();
            scheduleOverviewCityLabels(true);
          });
        });
      };
      const globe = window.Globe()(elements.globe)
        .globeImageUrl(globeTextureUrl)
        .backgroundColor("rgba(0,0,0,0)")
        .showGraticules(false)
        .showAtmosphere(true)
        .atmosphereColor("#a8bea1")
        .atmosphereAltitude(0.1)
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
        .labelSize(() => (elements.globe.clientWidth < 600 ? 1.18 : 0.82))
        .labelIncludeDot(false)
        .labelDotRadius(0)
        .labelAltitude(0.04)
        .labelColor(() => "rgba(232,253,255,0.96)")
        .labelResolution(2)
        .labelLabel(() => "")
        .labelsTransitionDuration(reducedMotion ? 0 : 180)
        .htmlElementsData([])
        .htmlLat("lat")
        .htmlLng("lng")
        .htmlAltitude(0.04)
        .htmlElement(globeCityLabelElement)
        .htmlTransitionDuration(reducedMotion ? 0 : 180)
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
      styleOverviewGlobe(globe);
      let globeTextureCheckAttempts = 0;
      const waitForGlobeTexture = () => {
        if (state.overviewGlobeReady || state.overviewGlobeFailed) return;
        let textureReady = false;
        try {
          const texture = globe.globeMaterial()?.map;
          const image = texture?.image;
          textureReady = Boolean(
            texture && image &&
            (typeof image.complete !== "boolean" || image.complete) &&
            (typeof image.naturalWidth !== "number" || image.naturalWidth > 0),
          );
        } catch {
          textureReady = false;
        }
        if (textureReady) {
          handleGlobeReady();
          return;
        }
        globeTextureCheckAttempts += 1;
        if (globeTextureCheckAttempts < 600) {
          window.requestAnimationFrame(waitForGlobeTexture);
          return;
        }
        state.overviewGlobeFailed = true;
        stopOverviewFlightPlanes();
        if (isOverview()) showMapFallback();
      };
      globe.controls().enableDamping = true;
      globe.controls().dampingFactor = 0.08;
      globe.controls().minDistance = 112;
      globe.controls().maxDistance = 720;
      globe.controls().autoRotateSpeed = 0.32;
      globe.renderer().setPixelRatio(
        Math.min(window.devicePixelRatio || 1, window.innerWidth < 1025 ? 1.25 : 1.5),
      );

      const resize = () => {
        const { width, height } = elements.globe.getBoundingClientRect();
        if (width > 0 && height > 0) {
          globe.width(width).height(height);
          globe.showGraticules(false);
          globe.renderer().setPixelRatio(
            Math.min(window.devicePixelRatio || 1, width < 1025 ? 1.25 : 1.5),
          );
          scheduleOverviewCityLabels(true);
          const layoutKey = width < height ? "portrait" : "landscape";
          const aspect = width / height;
          const layoutChanged =
            state.overviewLayoutKey && state.overviewLayoutKey !== layoutKey;
          const aspectChanged =
            state.overviewAspect && Math.abs(aspect - state.overviewAspect) > 0.04;
          state.overviewLayoutKey = layoutKey;
          if (!state.overviewAspect) state.overviewAspect = aspect;
          if (
            (layoutChanged || aspectChanged) &&
            state.overviewGlobeReady &&
            isOverview() &&
            !state.pendingViewId
          ) {
            state.overviewAspect = aspect;
            const resizeToken = ++state.overviewResizeToken;
            const resizeDuration = layoutChanged ? 450 : 0;
            window.requestAnimationFrame(() => {
              if (
                resizeToken !== state.overviewResizeToken ||
                !state.overviewGlobeReady ||
                !isOverview() ||
                state.pendingViewId
              ) return;
              focusGlobe(overviewInitialView(), resizeDuration);
            });
          } else if (!state.overviewGlobeReady || !isOverview()) {
            state.overviewAspect = aspect;
          }
        }
      };
      const resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(resize));
      resizeObserver.observe(elements.globe);
      resize();

      const canvas = elements.globe.querySelector("canvas");
      canvas?.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        const pendingViewId = state.pendingViewId;
        state.overviewGlobeFailed = true;
        state.overviewGlobeReady = false;
        stopOverviewFlightPlanes();
        if (pendingViewId) {
          cancelViewTransition({ restoreOverview: false, refreshTabs: false });
          commitView(pendingViewId, { focusInitial: true });
          return;
        }
        if (!isOverview()) {
          cancelViewTransition({ restoreOverview: false, refreshTabs: false });
          elements.fallback.hidden = true;
          return;
        }
        stopPlayback();
        showMapFallback();
      });
      canvas?.addEventListener("webglcontextrestored", () => {
        state.overviewGlobeFailed = false;
        if (isOverview()) elements.fallback.hidden = true;
        handleGlobeReady();
      });

      refreshOverviewGlobe();
      initOverviewFlightPlanes();
      applyOverviewRotation();
      focusGlobe(overviewInitialView(), 0);
      window.requestAnimationFrame(waitForGlobeTexture);
    } catch (error) {
      console.error("Travel globe initialization failed", error);
      showMapFallback();
    }
  }

  elements.brandHome.addEventListener("click", () => selectView(data.overview.id));
  elements.routePrev.addEventListener("click", () => setActiveLeg(state.activeLegIndex - 1));
  elements.routeNext.addEventListener("click", () => setActiveLeg(state.activeLegIndex + 1));
  elements.routePlay.addEventListener("click", togglePrimaryAnimation);
  elements.cityPlay.addEventListener("click", playFromFocusedArea);
  elements.cityList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-focus]");
    if (button) focusMapArea(button.dataset.focus);
  });
  elements.cityStoryToggle.addEventListener("click", () => {
    state.storyExpanded = !state.storyExpanded;
    renderCityStory();
  });
  elements.cityStoryMedia.addEventListener("click", () => {
    const trip = currentTrip();
    const stop = stopMap(trip).get(elements.cityStoryMedia.dataset.stopId);
    if (stop?.photos?.length) openGallery(stop, elements.cityStoryMedia);
  });
  elements.cityStoryPlay.addEventListener("click", () => {
    const index = Number(elements.cityStoryPlay.dataset.legIndex);
    if (!Number.isInteger(index) || index < 0) return;
    setActiveLeg(index);
    startPlayback();
  });
  elements.galleryClose.addEventListener("click", closeGallery);
  elements.lightboxClose.addEventListener("click", closeLightbox);
  elements.lightboxPrevious.addEventListener("click", () => navigateLightbox(-1));
  elements.lightboxNext.addEventListener("click", () => navigateLightbox(1));
  elements.lightboxStage.addEventListener("pointerdown", beginLightboxSwipe);
  elements.lightboxStage.addEventListener("pointerup", finishLightboxSwipe);
  elements.lightboxStage.addEventListener("pointercancel", cancelLightboxSwipe);
  elements.lightboxStage.addEventListener("lostpointercapture", cancelLightboxSwipe);
  elements.lightboxImage.addEventListener("dragstart", (event) => event.preventDefault());
  elements.lightbox.addEventListener("click", (event) => {
    if (performance.now() < state.lightboxSuppressClickUntil) {
      event.preventDefault();
      return;
    }
    if (isLightboxBackdropClick(event)) closeLightbox();
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
      if (state.pendingViewId) cancelViewTransition();
      else if (!elements.lightbox.hidden) closeLightbox();
      else if (!elements.gallery.hidden) closeGallery();
      else if (!isOverview() && state.selectedStopId) {
        state.selectedStopId = null;
        state.storyExpanded = false;
        renderCityNavigation();
        renderCityStory();
        renderRouteCard();
        renderPlaybackState();
        updateStreetStyles();
        focusRouteCameraForProgress();
      }
      return;
    }
    if (!elements.lightbox.hidden) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateLightbox(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateLightbox(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        showLightboxPhoto(0);
      } else if (event.key === "End") {
        event.preventDefault();
        showLightboxPhoto(state.galleryPhotos.length - 1);
      } else {
        trapModalFocus(event, elements.lightbox);
      }
      return;
    }
    if (!elements.gallery.hidden) {
      trapModalFocus(event, elements.gallery);
      return;
    }
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.target?.closest?.(
        'button, a, input, select, textarea, summary, [contenteditable="true"], [role="button"]',
      )
    ) return;
    if (!isOverview() && event.key === "ArrowRight") {
      event.preventDefault();
      setActiveLeg(state.activeLegIndex + 1);
    }
    if (!isOverview() && event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveLeg(state.activeLegIndex - 1);
    }
    if (!isOverview() && event.key === " ") {
      event.preventDefault();
      togglePrimaryAnimation();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.pendingViewId) {
        cancelViewTransition({ restoreOverview: false });
        state.overviewRotation = true;
      }
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
