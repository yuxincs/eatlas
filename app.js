const MANHATTAN_CENTER = [40.7831, -73.9712];
const MANHATTAN_ZOOM = 14;
const DATA_FILE_PATH = "restaurants.json";
const DEFAULT_GUIDE_TITLE = "Restaurants";
const SIDEBAR_PANEL_ID = "sidebarPanel";
const MAP_OPEN_SIDEBAR_BUTTON_ID = "mapOpenSidebarBtn";
const SIDEBAR_HEADER_TOGGLE_BUTTON_ID = "sidebarHeaderToggleBtn";
const FILTER_DOCK_ID = "categoryFilterDock";
const MOBILE_LAYOUT_BREAKPOINT_PX = 900;
const MOBILE_SHEET_MIN_HEIGHT_PX = 112;
const MOBILE_SHEET_DEFAULT_HEIGHT_RATIO = 0.34;
const MOBILE_SHEET_MAX_HEIGHT_RATIO = 0.5;
const MOBILE_SHEET_DRAG_THRESHOLD_PX = 6;
const MARKER_DOT_DIAMETER_PX = 24;
const MARKER_LABEL_GAP_PX = 6;
const MARKER_LABEL_PADDING_PX = 4;
const WEISZFELD_MAX_ITERATIONS = 100;
const WEISZFELD_EPSILON = 1e-7;
const RESTAURANT_FOCUS_ZOOM = 16;
const CATEGORY_COLOR_PALETTE = [
  "#6f93de", // medium blue
  "#64b0d8", // medium cyan
  "#68b3a0", // medium jade
  "#a6c86d", // medium lime
  "#d3a95b", // medium amber
  "#d58866", // medium coral
  "#cf7f92", // medium rose
  "#b08cd8", // medium violet
  "#8399db", // medium indigo
  "#84abcd" // medium steel blue
];
const CATEGORY_COLOR_BY_NAME = {
  Japanese: "#d76774", // inspired by Japan flag red
  Korean: "#6f92dd", // inspired by Korea flag blue/red balance
  Chinese: "#d89b45", // inspired by China flag red/yellow warmth
  Thai: "#718fdc", // inspired by Thailand flag blue
  "Southeast Asian": "#5ea99a", // region-inspired tropical jade
  Steakhouse: "#b37c50", // warm neutral
  Lebanese: "#5fa473", // inspired by Lebanon cedar green
  Russian: "#8097db", // inspired by Russia tricolor blue tone
  Uncategorized: "#7f8da1"
};

let map;
let zoomControl;
let statusMessageEl;
let mapWrapEl;
let sidebarPanelEl;
let sidebarBodyEl;
let sidebarTitleEl;
let mapOpenSidebarBtnEl;
let sidebarHeaderToggleBtnEl;
let sidebarHeaderIndicatorEl;
let filterDockEl;
let filterDockOriginalParentEl = null;
let filterDockOriginalNextSibling = null;
let mobileLayoutMediaQuery;
let isMobileLayoutActive = false;
let mobileSheetHeightPx = null;
let mobileSheetDragContext = null;
let mobileSheetSuppressNextToggle = false;
let markerLabelLayoutFrameId = null;
let defaultMapCenter = MANHATTAN_CENTER;
let activeRestaurantId = null;
let activeRestaurantButtonEl = null;
let activeRestaurantMarker = null;
let restaurantButtonIndex = new Map();
let allRestaurants = [];
let markerIndex = new Map();
let selectedCategorySet = new Set();
let categoryColorCache = new Map();

document.addEventListener("DOMContentLoaded", () => {
  statusMessageEl = document.getElementById("statusMessage");
  cacheSidebarElements();
  setupResponsiveLayout();
  bindSidebarEvents();
  void initApp();
});

async function initApp() {
  try {
    if (!window.L) {
      throw new Error("Leaflet failed to load. Check network access to the Leaflet CDN.");
    }

    const { title, restaurants } = await loadRestaurantData();
    setGuideTitle(title);
    const optimalCenter = getOptimalRestaurantCenter(restaurants);
    defaultMapCenter = optimalCenter;

    map = L.map("map", {
      zoomControl: false
    }).setView(optimalCenter, MANHATTAN_ZOOM);

    addBaseMapTiles();
    zoomControl = L.control.zoom({ position: "bottomright" }).addTo(map);
    updateMapControlPositions();
    window.requestAnimationFrame(() => {
      updateMapControlPositions();
    });
    map.on("moveend zoomend resize", () => {
      scheduleMarkerLabelLayout();
    });
    map.on("popupclose", (event) => {
      const popupSource = event.popup?._source;
      if (activeRestaurantId !== null && popupSource === activeRestaurantMarker) {
        clearActiveRestaurantSelection(false);
      }
    });

    allRestaurants = restaurants;
    markerIndex = addRestaurantMarkers(restaurants);
    renderCategoryFilters(restaurants);
    applyCategoryFilters();
    scheduleMarkerLabelLayout();

    setStatus("", false);
  } catch (error) {
    console.error(error);
    setStatus(error.message, true);
  }
}

function addBaseMapTiles() {
  // CARTO Positron (clean, light gray style).
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    subdomains: "abcd",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);
}

function getOptimalRestaurantCenter(restaurants) {
  const points = restaurants
    .map((restaurant) => [Number(restaurant.lat), Number(restaurant.lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  if (points.length === 0) {
    return MANHATTAN_CENTER;
  }
  if (points.length === 1) {
    return points[0];
  }

  // Start from arithmetic mean, then refine with Weiszfeld iterations
  // to approximate the geometric median (minimizes sum of distances).
  let currentLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  let currentLng = points.reduce((sum, [, lng]) => sum + lng, 0) / points.length;

  for (let i = 0; i < WEISZFELD_MAX_ITERATIONS; i += 1) {
    let numeratorLat = 0;
    let numeratorLng = 0;
    let denominator = 0;
    let snappedPoint = null;

    for (const [lat, lng] of points) {
      const distance = Math.hypot(currentLat - lat, currentLng - lng);

      if (distance < WEISZFELD_EPSILON) {
        snappedPoint = [lat, lng];
        break;
      }

      const weight = 1 / distance;
      numeratorLat += lat * weight;
      numeratorLng += lng * weight;
      denominator += weight;
    }

    if (snappedPoint) {
      return snappedPoint;
    }

    if (denominator === 0) {
      break;
    }

    const nextLat = numeratorLat / denominator;
    const nextLng = numeratorLng / denominator;

    if (Math.hypot(nextLat - currentLat, nextLng - currentLng) < WEISZFELD_EPSILON) {
      currentLat = nextLat;
      currentLng = nextLng;
      break;
    }

    currentLat = nextLat;
    currentLng = nextLng;
  }

  return [currentLat, currentLng];
}

async function loadRestaurantData() {
  const response = await fetch(DATA_FILE_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load restaurant data from ${DATA_FILE_PATH}`);
  }

  const payload = await response.json();
  const title =
    typeof payload?.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim()
      : DEFAULT_GUIDE_TITLE;
  const restaurants = Array.isArray(payload) ? payload : payload.restaurants;

  if (!Array.isArray(restaurants)) {
    throw new Error("Restaurant data must be an array or an object with a restaurants array.");
  }

  const filteredRestaurants = restaurants.filter((restaurant) => {
    const hasValidPoint = isFiniteNumber(restaurant.lat) && isFiniteNumber(restaurant.lng);
    if (!hasValidPoint) {
      console.warn("Skipping restaurant with invalid lat/lng:", restaurant);
    }
    return hasValidPoint;
  });

  return {
    title,
    restaurants: filteredRestaurants
  };
}

function addRestaurantMarkers(restaurants) {
  const markerIndex = new Map();

  restaurants.forEach((restaurant, i) => {
    const id = getRestaurantId(restaurant, i);
    const categoryColor = getCategoryColor(getRestaurantCategoryKey(restaurant));
    const restaurantName = restaurant.name || "Restaurant";
    const categoryLabel = getRestaurantListCategoryLabel(restaurant);
    const marker = L.marker([Number(restaurant.lat), Number(restaurant.lng)], {
      icon: createNumberedIcon(i + 1, categoryColor, restaurantName, categoryLabel),
      title: restaurantName
    });

    marker.on("click", () => {
      selectRestaurant(id, marker, restaurant, {
        zoomTo: true,
        scrollList: true,
        ensureListVisible: true
      });
    });

    marker.addTo(map);
    marker.on("add", scheduleMarkerLabelLayout);
    marker.on("remove", scheduleMarkerLabelLayout);
    markerIndex.set(id, marker);
  });

  return markerIndex;
}

function renderRestaurantList(restaurants, markerIndex) {
  const countEl = document.getElementById("restaurantCount");
  const listEl = document.getElementById("restaurantList");

  const totalCount = allRestaurants.length || restaurants.length;
  countEl.textContent =
    selectedCategorySet.size === 0
      ? `${restaurants.length} places`
      : `${restaurants.length} of ${totalCount} places`;
  listEl.innerHTML = "";
  restaurantButtonIndex.clear();
  const sortedRestaurants = [...restaurants].sort(compareRestaurantsForList);

  sortedRestaurants.forEach((restaurant, i) => {
    const id = getRestaurantId(restaurant, i);
    const marker = markerIndex.get(id);
    if (!marker) {
      return;
    }

    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "restaurant-button";
    button.type = "button";
    const categoryColor = getCategoryColor(getRestaurantCategoryKey(restaurant));
    button.style.setProperty("--restaurant-accent", categoryColor);
    button.style.setProperty("--restaurant-accent-soft", toRgba(categoryColor, 0.24));
    const categoryLabel = getRestaurantListCategoryLabel(restaurant);
    const ratingValue = getRestaurantRatingValue(restaurant);
    const specialRecommendationLabel = getRestaurantSpecialRecommendationLabel(restaurant);
    const ratingMarkup =
      ratingValue !== null
        ? `<p class="restaurant-rating" aria-label="${ratingValue} out of 5 stars">${buildStarRatingMarkup(ratingValue)}</p>`
        : "";
    const recommendationMarkup = specialRecommendationLabel
      ? `<span class="restaurant-special-ribbon">${escapeHtml(specialRecommendationLabel)}</span>`
      : "";
    if (specialRecommendationLabel) {
      button.classList.add("restaurant-button-has-ribbon");
    }
    button.innerHTML = `
      ${recommendationMarkup}
      <p class="restaurant-name">${escapeHtml(restaurant.name || "Untitled")}</p>
      ${ratingMarkup}
      <p class="restaurant-meta">${escapeHtml(categoryLabel)}</p>
    `;

    button.addEventListener("click", () => {
      selectRestaurant(id, marker, restaurant, {
        zoomTo: true,
        scrollList: false,
        ensureListVisible: false
      });
    });

    restaurantButtonIndex.set(id, button);
    item.appendChild(button);
    listEl.appendChild(item);
  });
}

function renderCategoryFilters(restaurants) {
  if (!filterDockEl) {
    return;
  }

  filterDockEl.innerHTML = "";
  const filterRowEl = document.createElement("div");
  filterRowEl.className = "filter-dock-row";
  filterDockEl.appendChild(filterRowEl);

  const seenCategories = new Set();

  restaurants.forEach((restaurant) => {
    const categoryKey = getRestaurantCategoryKey(restaurant);
    if (seenCategories.has(categoryKey)) {
      return;
    }
    seenCategories.add(categoryKey);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-btn";
    button.dataset.category = categoryKey;
    button.textContent = categoryKey;
    const categoryColor = getCategoryColor(categoryKey);
    button.style.setProperty("--category-color", categoryColor);

    button.addEventListener("click", () => {
      toggleCategoryFilter(categoryKey);
    });

    filterRowEl.appendChild(button);
  });

  updateCategoryFilterButtonStates();

  if (isMobileLayoutActive) {
    window.requestAnimationFrame(() => {
      if (!isMobileLayoutActive) {
        return;
      }
      initializeMobileSheetHeight({ skipMapInvalidate: true });
    });
  }
}

function toggleCategoryFilter(categoryKey) {
  if (selectedCategorySet.has(categoryKey)) {
    selectedCategorySet.delete(categoryKey);
  } else {
    selectedCategorySet.add(categoryKey);
  }

  applyCategoryFilters();
}

function applyCategoryFilters() {
  if (!map || allRestaurants.length === 0) {
    return;
  }

  const visibleIds = new Set();
  const filteredRestaurants = [];

  allRestaurants.forEach((restaurant, index) => {
    const id = getRestaurantId(restaurant, index);
    const isVisible =
      selectedCategorySet.size === 0 ||
      selectedCategorySet.has(getRestaurantCategoryKey(restaurant));
    const marker = markerIndex.get(id);

    if (isVisible) {
      visibleIds.add(id);
      filteredRestaurants.push(restaurant);
      if (marker && !map.hasLayer(marker)) {
        marker.addTo(map);
      }
    } else if (marker && map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  });

  if (activeRestaurantId !== null && !visibleIds.has(activeRestaurantId)) {
    clearActiveRestaurantSelection(false);
  }

  renderRestaurantList(filteredRestaurants, markerIndex);
  updateCategoryFilterButtonStates();
  scheduleMarkerLabelLayout();
}

function updateCategoryFilterButtonStates() {
  if (!filterDockEl) {
    return;
  }

  const buttons = filterDockEl.querySelectorAll(".filter-btn");
  buttons.forEach((button) => {
    const category = button.dataset.category || "";
    const isActive = selectedCategorySet.has(category);
    button.classList.toggle("filter-btn-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function getRestaurantCategoryKey(restaurant) {
  return String(restaurant.category || "Uncategorized").trim();
}

function getRestaurantSubCategoryKey(restaurant) {
  return String(restaurant.subCategory || "").trim();
}

function getRestaurantListCategoryLabel(restaurant) {
  const category = getRestaurantCategoryKey(restaurant);
  const subCategory = getRestaurantSubCategoryKey(restaurant);
  return subCategory ? `${category} · ${subCategory}` : category;
}

function getRestaurantRatingValue(restaurant) {
  const rawRating = Number(restaurant.rating);
  if (!Number.isFinite(rawRating)) {
    return null;
  }
  return Math.max(1, Math.min(5, Math.round(rawRating)));
}

function normalizePriceBound(value) {
  const rawValue = Number(value);
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const normalizedValue = Math.round(rawValue);
  if (normalizedValue <= 0) {
    return null;
  }

  return normalizedValue;
}

function getRestaurantPriceRange(restaurant) {
  const lowerBound = normalizePriceBound(restaurant?.priceLower);
  const upperBound = normalizePriceBound(restaurant?.priceHigher);

  // Backward compatibility for older data files.
  if (lowerBound === null && upperBound === null) {
    const legacyPrice = normalizePriceBound(restaurant?.price);
    if (legacyPrice === null) {
      return null;
    }
    return { lower: legacyPrice, higher: legacyPrice };
  }

  if (lowerBound !== null && upperBound === null) {
    return { lower: lowerBound, higher: lowerBound };
  }

  if (lowerBound === null && upperBound !== null) {
    return { lower: upperBound, higher: upperBound };
  }

  if (lowerBound <= upperBound) {
    return { lower: lowerBound, higher: upperBound };
  }

  return { lower: upperBound, higher: lowerBound };
}

function getRestaurantSpecialRecommendationLabel(restaurant) {
  const recommendation = restaurant?.specialRecommendation;
  if (typeof recommendation === "string") {
    const label = recommendation.trim();
    return label.length > 0 ? label : null;
  }

  if (recommendation === true) {
    return "Recommended";
  }

  return null;
}

function compareRestaurantsForList(leftRestaurant, rightRestaurant) {
  const leftIsRecommended = getRestaurantSpecialRecommendationLabel(leftRestaurant) !== null;
  const rightIsRecommended = getRestaurantSpecialRecommendationLabel(rightRestaurant) !== null;

  if (leftIsRecommended !== rightIsRecommended) {
    return rightIsRecommended ? 1 : -1;
  }

  const leftRating = getRestaurantRatingValue(leftRestaurant) ?? 0;
  const rightRating = getRestaurantRatingValue(rightRestaurant) ?? 0;

  if (rightRating !== leftRating) {
    return rightRating - leftRating;
  }

  const leftCategory = getRestaurantCategoryKey(leftRestaurant);
  const rightCategory = getRestaurantCategoryKey(rightRestaurant);
  const categoryCompare = leftCategory.localeCompare(rightCategory);
  if (categoryCompare !== 0) {
    return categoryCompare;
  }

  const leftSubCategory = getRestaurantSubCategoryKey(leftRestaurant);
  const rightSubCategory = getRestaurantSubCategoryKey(rightRestaurant);
  const subCategoryCompare = leftSubCategory.localeCompare(rightSubCategory);
  if (subCategoryCompare !== 0) {
    return subCategoryCompare;
  }

  return String(leftRestaurant.name || "").localeCompare(String(rightRestaurant.name || ""));
}

function buildStarRatingMarkup(ratingValue) {
  const safeRating = Math.max(1, Math.min(5, Math.round(Number(ratingValue) || 0)));
  const filledStars = "★".repeat(safeRating);
  const emptyStars = "★".repeat(5 - safeRating);
  return `${filledStars}<span class="rating-stars-empty">${emptyStars}</span>`;
}

function selectRestaurant(restaurantId, marker, restaurant, options) {
  const {
    zoomTo,
    scrollList,
    ensureListVisible,
    toggleOnActive
  } = {
    zoomTo: false,
    scrollList: false,
    ensureListVisible: false,
    toggleOnActive: true,
    ...options
  };

  if (toggleOnActive && activeRestaurantId === restaurantId) {
    clearActiveRestaurantSelection(true);
    return;
  }

  if (ensureListVisible && !isMobileLayoutActive) {
    openSidebar();
  }

  const button = restaurantButtonIndex.get(restaurantId);
  if (button) {
    setActiveRestaurantSelection(restaurantId, button, marker);
    if (scrollList) {
      button.scrollIntoView({
        block: isMobileLayoutActive ? "start" : "nearest",
        inline: "nearest",
        behavior: "smooth"
      });
    }
  } else {
    activeRestaurantMarker = marker;
  }

  if (zoomTo) {
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), RESTAURANT_FOCUS_ZOOM), {
      animate: true,
      duration: 0.45
    });
  }

  openRestaurantPopup(restaurant, marker);
}

function openRestaurantPopup(restaurant, marker) {
  if (!marker.getPopup()) {
    marker.bindPopup(buildPopupContent(restaurant), {
      maxWidth: 320,
      autoPan: false
    });
    // Disable Leaflet's default marker->popup click open so all behavior goes through selectRestaurant().
    marker.off("click", marker._openPopup, marker);
  } else {
    marker.setPopupContent(buildPopupContent(restaurant));
  }

  marker.openPopup();
}

function buildPopupContent(restaurant) {
  const container = document.createElement("article");
  container.className = "popup";

  const titleEl = document.createElement("h3");
  titleEl.textContent = restaurant.name || "Restaurant";
  container.appendChild(titleEl);

  const ratingValue = getRestaurantRatingValue(restaurant);
  if (ratingValue !== null) {
    const ratingEl = document.createElement("p");
    ratingEl.className = "popup-rating";
    ratingEl.setAttribute("aria-label", `${ratingValue} out of 5 stars`);
    ratingEl.innerHTML = buildStarRatingMarkup(ratingValue);
    container.appendChild(ratingEl);
  }

  const priceRange = getRestaurantPriceRange(restaurant);
  if (priceRange !== null) {
    const { lower, higher } = priceRange;
    const priceEl = document.createElement("p");
    priceEl.className = "popup-price";
    priceEl.textContent =
      lower === higher ? `Avg $${lower} / person` : `Avg $${lower}-${higher} / person`;
    container.appendChild(priceEl);
  }

  if (restaurant.address) {
    const addressEl = document.createElement("p");
    addressEl.className = "popup-meta";
    addressEl.textContent = restaurant.address;
    container.appendChild(addressEl);
  }

  if (restaurant.comment) {
    const commentEl = document.createElement("p");
    commentEl.className = "popup-comment";
    commentEl.textContent = restaurant.comment;
    container.appendChild(commentEl);
  }

  if (restaurant.mapsUrl) {
    const mapsLink = document.createElement("a");
    mapsLink.href = restaurant.mapsUrl;
    mapsLink.target = "_blank";
    mapsLink.rel = "noopener noreferrer";
    mapsLink.textContent = "Open in Google Maps";
    mapsLink.className = "popup-map-link";
    container.appendChild(mapsLink);
  }

  if (restaurant.reservationUrl) {
    const reservationLink = document.createElement("a");
    reservationLink.href = restaurant.reservationUrl;
    reservationLink.target = "_blank";
    reservationLink.rel = "noopener noreferrer";
    reservationLink.textContent = "Reserve Table";
    reservationLink.className = "popup-reservation-link";
    container.appendChild(reservationLink);
  }

  const photos = Array.isArray(restaurant.photos) ? restaurant.photos : [];
  if (photos.length > 0) {
    container.appendChild(buildPhotoCarousel(photos));
  }

  return container;
}

function buildPhotoCarousel(photoEntries) {
  let currentIndex = 0;
  const photos = photoEntries.map((entry, i) => normalizePhoto(entry, i));

  const wrap = document.createElement("div");
  wrap.className = "photo-wrap";

  const imageEl = document.createElement("img");
  imageEl.loading = "lazy";
  imageEl.alt = photos[0].caption || "Restaurant photo 1";
  imageEl.src = photos[0].url;

  const controls = document.createElement("div");
  controls.className = "photo-controls";

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.textContent = "Prev";

  const counter = document.createElement("span");
  counter.className = "photo-counter";

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.textContent = "Next";

  function renderPhoto(index) {
    const photo = photos[index];
    imageEl.src = photo.url;
    imageEl.alt = photo.caption || `Restaurant photo ${index + 1}`;
    counter.textContent = `${index + 1} / ${photos.length}`;
  }

  prevButton.addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + photos.length) % photos.length;
    renderPhoto(currentIndex);
  });

  nextButton.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % photos.length;
    renderPhoto(currentIndex);
  });

  if (photos.length === 1) {
    prevButton.disabled = true;
    nextButton.disabled = true;
  }

  renderPhoto(currentIndex);
  controls.append(prevButton, counter, nextButton);
  wrap.append(imageEl, controls);
  return wrap;
}

function normalizePhoto(photoEntry, i) {
  if (typeof photoEntry === "string") {
    return { url: photoEntry, caption: `Photo ${i + 1}` };
  }

  if (photoEntry && typeof photoEntry === "object" && photoEntry.url) {
    return {
      url: photoEntry.url,
      caption: photoEntry.caption || `Photo ${i + 1}`
    };
  }

  return {
    url: "https://picsum.photos/seed/fallback/640/360",
    caption: `Photo ${i + 1}`
  };
}

function setStatus(message, isError) {
  const hasMessage = Boolean(message && message.trim().length > 0);
  statusMessageEl.textContent = message;
  statusMessageEl.classList.toggle("is-hidden", !hasMessage);
  statusMessageEl.classList.toggle("error", Boolean(isError));
}

function setActiveRestaurantSelection(restaurantId, buttonEl, marker) {
  if (activeRestaurantButtonEl) {
    activeRestaurantButtonEl.classList.remove("restaurant-button-active");
  }

  activeRestaurantId = restaurantId;
  activeRestaurantButtonEl = buttonEl;
  activeRestaurantMarker = marker;
  activeRestaurantButtonEl.classList.add("restaurant-button-active");
}

function clearActiveRestaurantSelection(resetMap) {
  if (activeRestaurantButtonEl) {
    activeRestaurantButtonEl.classList.remove("restaurant-button-active");
  }

  activeRestaurantId = null;
  activeRestaurantButtonEl = null;
  activeRestaurantMarker = null;
  map?.closePopup();

  if (resetMap && map) {
    map.flyTo(defaultMapCenter, MANHATTAN_ZOOM, {
      animate: true,
      duration: 0.45
    });
  }
}

function bindSidebarEvents() {
  if (!sidebarPanelEl) {
    return;
  }

  mapOpenSidebarBtnEl?.addEventListener("click", toggleSidebar);
  sidebarHeaderToggleBtnEl?.addEventListener("click", toggleSidebar);
  sidebarHeaderToggleBtnEl?.addEventListener("pointerdown", handleMobileSheetResizeStart);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSidebar();
    }
  });

  document.addEventListener("click", (event) => {
    if (isMobileLayoutActive) {
      return;
    }

    if (!isSidebarOpen()) {
      return;
    }

    if (!(event.target instanceof Element)) {
      return;
    }

    const clickedInsideMap = event.target.closest("#map");
    if (clickedInsideMap) {
      return;
    }

    const clickedInsideSidebar = event.target.closest(`#${SIDEBAR_PANEL_ID}`);
    const clickedOpenButton = event.target.closest(`#${MAP_OPEN_SIDEBAR_BUTTON_ID}`);
    const clickedInsideFilterDock = event.target.closest(`#${FILTER_DOCK_ID}`);

    if (!clickedInsideSidebar && !clickedOpenButton && !clickedInsideFilterDock) {
      hideSidebar();
    }
  });

  bindSidebarScrollbarVisibility();
  updateSidebarToggleState(isSidebarOpen());
}

function cacheSidebarElements() {
  mapWrapEl = document.querySelector(".map-wrap");
  sidebarPanelEl = document.getElementById(SIDEBAR_PANEL_ID);
  sidebarBodyEl = sidebarPanelEl?.querySelector(".hover-sidebar-body") || null;
  sidebarTitleEl = document.getElementById("sidebarPanelLabel");
  mapOpenSidebarBtnEl = document.getElementById(MAP_OPEN_SIDEBAR_BUTTON_ID);
  sidebarHeaderToggleBtnEl = document.getElementById(SIDEBAR_HEADER_TOGGLE_BUTTON_ID);
  sidebarHeaderIndicatorEl = sidebarHeaderToggleBtnEl?.querySelector(
    ".hover-sidebar-header-indicator"
  );
  filterDockEl = document.getElementById(FILTER_DOCK_ID);
  if (filterDockEl && !filterDockOriginalParentEl) {
    filterDockOriginalParentEl = filterDockEl.parentElement;
    filterDockOriginalNextSibling = filterDockEl.nextSibling;
  }
}

function setGuideTitle(title) {
  if (!sidebarTitleEl) {
    return;
  }

  const nextTitle =
    typeof title === "string" && title.trim().length > 0 ? title.trim() : DEFAULT_GUIDE_TITLE;
  sidebarTitleEl.textContent = nextTitle;
}

function setupResponsiveLayout() {
  if (!window.matchMedia) {
    return;
  }

  mobileLayoutMediaQuery = window.matchMedia(`(max-width: ${MOBILE_LAYOUT_BREAKPOINT_PX}px)`);
  applyResponsiveLayout(mobileLayoutMediaQuery.matches, { skipMapInvalidate: true });

  const handleLayoutChange = (event) => {
    applyResponsiveLayout(event.matches);
  };
  const handleWindowResize = () => {
    if (!isMobileLayoutActive) {
      return;
    }

    initializeMobileSheetHeight({ skipMapInvalidate: true });
  };

  if (typeof mobileLayoutMediaQuery.addEventListener === "function") {
    mobileLayoutMediaQuery.addEventListener("change", handleLayoutChange);
  } else {
    mobileLayoutMediaQuery.addListener(handleLayoutChange);
  }

  window.addEventListener("resize", handleWindowResize, { passive: true });
}

function applyResponsiveLayout(enableMobileLayout, options = {}) {
  const { skipMapInvalidate = false } = options;
  isMobileLayoutActive = Boolean(enableMobileLayout);
  mapWrapEl?.classList.toggle("mobile-sheet-layout", isMobileLayoutActive);

  if (isMobileLayoutActive) {
    mountFilterDockIntoMobileSheet();
    window.requestAnimationFrame(() => {
      if (!isMobileLayoutActive) {
        return;
      }
      initializeMobileSheetHeight({ skipMapInvalidate: true });
    });
  } else {
    restoreFilterDockToDesktopPosition();
    resetMobileSheetLayout();
    setSidebarState(true);
  }

  updateMapControlPositions();

  if (!skipMapInvalidate && map) {
    window.setTimeout(() => map.invalidateSize(), 260);
  }
}

function updateMapControlPositions() {
  if (!map) {
    return;
  }

  if (zoomControl && typeof zoomControl.setPosition === "function") {
    zoomControl.setPosition(isMobileLayoutActive ? "topright" : "bottomright");
  }

  if (map.attributionControl && typeof map.attributionControl.setPosition === "function") {
    map.attributionControl.setPosition(isMobileLayoutActive ? "topleft" : "bottomright");
  }

  if (!isMobileLayoutActive) {
    ensureDesktopAttributionBelowZoom();
  }
}

function ensureDesktopAttributionBelowZoom() {
  if (!map || !zoomControl || !map.attributionControl) {
    return;
  }

  const zoomContainer = zoomControl.getContainer?.();
  const attributionContainer = map.attributionControl.getContainer?.();
  if (!zoomContainer || !attributionContainer) {
    return;
  }

  const parent = zoomContainer.parentElement;
  if (!parent || attributionContainer.parentElement !== parent) {
    return;
  }

  // Leaflet stacks controls by DOM order in each corner.
  // Keep attribution as the last node so it sits below zoom on desktop.
  parent.appendChild(zoomContainer);
  parent.appendChild(attributionContainer);
}

function mountFilterDockIntoMobileSheet() {
  if (!filterDockEl || !sidebarPanelEl || !sidebarBodyEl) {
    return;
  }

  if (filterDockEl.parentElement !== sidebarPanelEl) {
    sidebarPanelEl.insertBefore(filterDockEl, sidebarBodyEl);
  }
}

function restoreFilterDockToDesktopPosition() {
  if (!filterDockEl || !filterDockOriginalParentEl) {
    return;
  }

  if (filterDockEl.parentElement === filterDockOriginalParentEl) {
    return;
  }

  if (
    filterDockOriginalNextSibling &&
    filterDockOriginalNextSibling.parentNode === filterDockOriginalParentEl
  ) {
    filterDockOriginalParentEl.insertBefore(filterDockEl, filterDockOriginalNextSibling);
    return;
  }

  filterDockOriginalParentEl.appendChild(filterDockEl);
}

function resetMobileSheetLayout() {
  if (!sidebarPanelEl || !mapWrapEl) {
    return;
  }

  sidebarPanelEl.classList.remove("mobile-sheet-dragging");
  sidebarPanelEl.classList.toggle("is-collapsed", false);
  mapWrapEl.style.removeProperty("--mobile-sheet-min-height");
  mapWrapEl.style.removeProperty("--mobile-sheet-max-height");
  mapWrapEl.style.removeProperty("--mobile-sheet-height");
  mobileSheetHeightPx = null;
  mobileSheetDragContext = null;
  mobileSheetSuppressNextToggle = false;
}

function getMobileSheetMinHeightPx() {
  const headerHeight = sidebarHeaderToggleBtnEl?.offsetHeight ?? 0;
  const filterHeight = filterDockEl?.offsetHeight ?? 0;
  const measuredMin = headerHeight > 0 ? headerHeight + Math.min(filterHeight, 76) + 8 : 0;
  return Math.max(MOBILE_SHEET_MIN_HEIGHT_PX, Math.round(measuredMin));
}

function getMobileSheetMaxHeightPx() {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const maxHeight = Math.round(viewportHeight * MOBILE_SHEET_MAX_HEIGHT_RATIO);
  return Math.max(getMobileSheetMinHeightPx(), maxHeight);
}

function clampMobileSheetHeight(heightPx) {
  const minHeight = getMobileSheetMinHeightPx();
  const maxHeight = getMobileSheetMaxHeightPx();
  const normalizedHeight = Math.round(Number(heightPx) || 0);
  return Math.min(maxHeight, Math.max(minHeight, normalizedHeight));
}

function setMobileSheetHeight(heightPx, options = {}) {
  if (!mapWrapEl || !sidebarPanelEl) {
    return;
  }

  const {
    skipMapInvalidate = false,
    updateToggleState = true
  } = options;

  const minHeight = getMobileSheetMinHeightPx();
  const maxHeight = getMobileSheetMaxHeightPx();
  const nextHeight = clampMobileSheetHeight(heightPx);

  mobileSheetHeightPx = nextHeight;
  sidebarPanelEl.classList.toggle("is-collapsed", false);
  sidebarPanelEl.setAttribute("aria-hidden", "false");
  mapWrapEl.style.setProperty("--mobile-sheet-min-height", `${minHeight}px`);
  mapWrapEl.style.setProperty("--mobile-sheet-max-height", `${maxHeight}px`);
  mapWrapEl.style.setProperty("--mobile-sheet-height", `${nextHeight}px`);

  if (updateToggleState) {
    updateSidebarToggleState(nextHeight > minHeight + MOBILE_SHEET_DRAG_THRESHOLD_PX);
  }

  if (!skipMapInvalidate && map) {
    window.setTimeout(() => map.invalidateSize(), 160);
  }
}

function initializeMobileSheetHeight(options = {}) {
  const { skipMapInvalidate = false } = options;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const defaultHeight = Math.round(viewportHeight * MOBILE_SHEET_DEFAULT_HEIGHT_RATIO);
  const targetHeight =
    mobileSheetHeightPx === null ? defaultHeight : mobileSheetHeightPx;
  setMobileSheetHeight(targetHeight, {
    skipMapInvalidate
  });
}

function isMobileSheetExpanded() {
  const minHeight = getMobileSheetMinHeightPx();
  const currentHeight = mobileSheetHeightPx ?? minHeight;
  return currentHeight > minHeight + MOBILE_SHEET_DRAG_THRESHOLD_PX;
}

function handleMobileSheetResizeStart(event) {
  if (!isMobileLayoutActive || !sidebarPanelEl) {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  const initialHeight = mobileSheetHeightPx ?? getMobileSheetMinHeightPx();
  mobileSheetDragContext = {
    startY: event.clientY,
    startHeight: initialHeight,
    hasMoved: false
  };
  sidebarPanelEl.classList.add("mobile-sheet-dragging");

  if (typeof sidebarHeaderToggleBtnEl?.setPointerCapture === "function") {
    try {
      sidebarHeaderToggleBtnEl.setPointerCapture(event.pointerId);
    } catch (_error) {
      // Ignore capture failures on unsupported platforms.
    }
  }

  document.addEventListener("pointermove", handleMobileSheetResizeMove);
  document.addEventListener("pointerup", handleMobileSheetResizeEnd);
  document.addEventListener("pointercancel", handleMobileSheetResizeEnd);
  event.preventDefault();
}

function handleMobileSheetResizeMove(event) {
  if (!mobileSheetDragContext) {
    return;
  }

  const deltaY = mobileSheetDragContext.startY - event.clientY;
  if (Math.abs(deltaY) > MOBILE_SHEET_DRAG_THRESHOLD_PX) {
    mobileSheetDragContext.hasMoved = true;
  }

  const nextHeight = mobileSheetDragContext.startHeight + deltaY;
  setMobileSheetHeight(nextHeight, {
    skipMapInvalidate: true,
    updateToggleState: false
  });
}

function handleMobileSheetResizeEnd() {
  if (!mobileSheetDragContext || !sidebarPanelEl) {
    return;
  }

  if (mobileSheetDragContext.hasMoved) {
    mobileSheetSuppressNextToggle = true;
  }
  mobileSheetDragContext = null;
  sidebarPanelEl.classList.remove("mobile-sheet-dragging");
  updateSidebarToggleState(isMobileSheetExpanded());
  document.removeEventListener("pointermove", handleMobileSheetResizeMove);
  document.removeEventListener("pointerup", handleMobileSheetResizeEnd);
  document.removeEventListener("pointercancel", handleMobileSheetResizeEnd);

  if (map) {
    window.setTimeout(() => map.invalidateSize(), 120);
  }
}

function bindSidebarScrollbarVisibility() {
  if (!sidebarBodyEl) {
    return;
  }

  const showScrollbar = () => {
    sidebarBodyEl.classList.add("scrollbar-visible");
  };

  const hideScrollbar = () => {
    sidebarBodyEl.classList.remove("scrollbar-visible");
  };

  sidebarBodyEl.addEventListener("mouseenter", showScrollbar);
  sidebarBodyEl.addEventListener("mouseleave", hideScrollbar);

  // Keep scrollbar visible for keyboard navigation inside the list.
  sidebarBodyEl.addEventListener("focusin", showScrollbar);
  sidebarBodyEl.addEventListener("focusout", (event) => {
    if (!sidebarBodyEl.contains(event.relatedTarget)) {
      hideScrollbar();
    }
  });

  // Touch fallback: show while interacting, hide right after interaction ends.
  sidebarBodyEl.addEventListener("touchstart", showScrollbar, { passive: true });
  sidebarBodyEl.addEventListener("touchend", hideScrollbar, { passive: true });
  sidebarBodyEl.addEventListener("touchcancel", hideScrollbar, { passive: true });

  hideScrollbar();
}

function hideSidebar() {
  if (isMobileLayoutActive) {
    setMobileSheetHeight(getMobileSheetMinHeightPx());
    return;
  }

  setSidebarState(false);
}

function openSidebar() {
  if (isMobileLayoutActive) {
    setMobileSheetHeight(getMobileSheetMaxHeightPx());
    return;
  }

  setSidebarState(true);
}

function toggleSidebar() {
  if (isMobileLayoutActive) {
    if (mobileSheetSuppressNextToggle) {
      mobileSheetSuppressNextToggle = false;
      return;
    }

    if (isMobileSheetExpanded()) {
      setMobileSheetHeight(getMobileSheetMinHeightPx());
    } else {
      setMobileSheetHeight(getMobileSheetMaxHeightPx());
    }
    return;
  }

  setSidebarState(!isSidebarOpen());
}

function setSidebarState(isOpen) {
  if (!sidebarPanelEl) {
    return;
  }

  if (isMobileLayoutActive) {
    setMobileSheetHeight(isOpen ? getMobileSheetMaxHeightPx() : getMobileSheetMinHeightPx());
    return;
  }

  sidebarPanelEl.classList.toggle("is-collapsed", !isOpen);
  sidebarPanelEl.setAttribute("aria-hidden", String(!isOpen));
  updateSidebarToggleState(isOpen);

  if (map) {
    window.setTimeout(() => map.invalidateSize(), 240);
  }
}

function isSidebarOpen() {
  if (isMobileLayoutActive) {
    return isMobileSheetExpanded();
  }

  return Boolean(sidebarPanelEl && !sidebarPanelEl.classList.contains("is-collapsed"));
}

function updateSidebarToggleState(isOpen) {
  const isMobile = isMobileLayoutActive;
  if (mapOpenSidebarBtnEl) {
    mapOpenSidebarBtnEl.setAttribute("aria-expanded", String(isOpen));
    mapOpenSidebarBtnEl.textContent = isMobile ? (isOpen ? "Collapse" : "Expand") : isOpen ? "Hide" : "List";
  }

  if (sidebarHeaderToggleBtnEl) {
    if (isMobile) {
      sidebarHeaderToggleBtnEl.setAttribute("aria-expanded", String(isOpen));
      sidebarHeaderToggleBtnEl.setAttribute("aria-label", "Drag up or down to resize restaurant list");
    } else {
      sidebarHeaderToggleBtnEl.setAttribute("aria-expanded", String(isOpen));
      sidebarHeaderToggleBtnEl.setAttribute(
        "aria-label",
        isOpen ? "Hide restaurant list" : "Show restaurant list"
      );
    }
  }

  if (sidebarHeaderIndicatorEl) {
    sidebarHeaderIndicatorEl.hidden = isMobile;
    if (!isMobile) {
      sidebarHeaderIndicatorEl.textContent = isOpen ? "Hide" : "Show";
    }
  }
}

function createNumberedIcon(number, markerColor, restaurantName, categoryLabel) {
  const safeName = escapeHtml(restaurantName || "Restaurant");
  const safeCategory = escapeHtml(categoryLabel || "Uncategorized");

  return L.divIcon({
    className: "numbered-marker-wrap",
    html: `
      <span class="numbered-marker-row">
        <span class="numbered-marker" style="--marker-color:${markerColor};">${number}</span>
        <span class="numbered-marker-label">
          <span class="numbered-marker-name">${safeName}</span>
          <span class="numbered-marker-category">${safeCategory}</span>
        </span>
      </span>
    `,
    iconSize: [240, 36],
    iconAnchor: [12, 18],
    popupAnchor: [0, -18]
  });
}

function scheduleMarkerLabelLayout() {
  if (!map) {
    return;
  }

  if (markerLabelLayoutFrameId !== null) {
    return;
  }

  markerLabelLayoutFrameId = window.requestAnimationFrame(() => {
    markerLabelLayoutFrameId = null;
    updateMarkerLabelLayout();
  });
}

function updateMarkerLabelLayout() {
  if (!map) {
    return;
  }

  const mapSize = map.getSize?.();
  if (!mapSize) {
    return;
  }

  const candidates = [];

  markerIndex.forEach((marker) => {
    if (!map.hasLayer(marker)) {
      return;
    }

    const markerEl = marker.getElement?.();
    if (!markerEl) {
      return;
    }

    const labelEl = markerEl.querySelector(".numbered-marker-label");
    if (!labelEl) {
      return;
    }

    const labelRect = labelEl.getBoundingClientRect();
    const labelWidth = Math.max(84, Math.round(labelRect.width || 0));
    const labelHeight = Math.max(22, Math.round(labelRect.height || 0));
    const point = map.latLngToContainerPoint(marker.getLatLng());

    candidates.push({
      markerEl,
      point,
      labelWidth,
      labelHeight
    });
  });

  candidates.sort((left, right) => {
    if (left.point.y !== right.point.y) {
      return left.point.y - right.point.y;
    }
    return left.point.x - right.point.x;
  });

  const occupied = [];

  candidates.forEach((candidate) => {
    const previousSide = candidate.markerEl.dataset.labelSide === "left" ? "left" : "right";
    const rightBox = getMarkerLabelBox(candidate, "right");
    const leftBox = getMarkerLabelBox(candidate, "left");
    const rightCost = getMarkerLabelPlacementCost(rightBox, occupied, mapSize, "right", previousSide);
    const leftCost = getMarkerLabelPlacementCost(leftBox, occupied, mapSize, "left", previousSide);
    const selectedSide = leftCost < rightCost ? "left" : "right";
    const selectedBox = selectedSide === "left" ? leftBox : rightBox;

    candidate.markerEl.dataset.labelSide = selectedSide;
    occupied.push(expandBox(selectedBox, MARKER_LABEL_PADDING_PX));
  });
}

function getMarkerLabelBox(candidate, side) {
  const { point, labelWidth, labelHeight } = candidate;
  const halfDot = MARKER_DOT_DIAMETER_PX / 2;
  const top = point.y - labelHeight / 2;
  const left =
    side === "left"
      ? point.x - halfDot - MARKER_LABEL_GAP_PX - labelWidth
      : point.x + halfDot + MARKER_LABEL_GAP_PX;

  return {
    left,
    top,
    right: left + labelWidth,
    bottom: top + labelHeight
  };
}

function getMarkerLabelPlacementCost(box, occupiedBoxes, mapSize, side, previousSide) {
  const overlapCost = occupiedBoxes.reduce(
    (sum, occupiedBox) => sum + getBoxIntersectionArea(box, occupiedBox),
    0
  );
  const outOfBounds =
    Math.max(0, -box.left) +
    Math.max(0, -box.top) +
    Math.max(0, box.right - mapSize.x) +
    Math.max(0, box.bottom - mapSize.y);
  const switchPenalty = previousSide !== side ? 44 : 0;
  const rightPreferencePenalty = side === "left" ? 6 : 0;

  return overlapCost * 8 + outOfBounds * 64 + switchPenalty + rightPreferencePenalty;
}

function getBoxIntersectionArea(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  return width * height;
}

function expandBox(box, padding) {
  return {
    left: box.left - padding,
    top: box.top - padding,
    right: box.right + padding,
    bottom: box.bottom + padding
  };
}

function getRestaurantId(restaurant, index) {
  if (restaurant?.id) {
    return restaurant.id;
  }

  const stableIndex = allRestaurants.indexOf(restaurant);
  const resolvedIndex = stableIndex >= 0 ? stableIndex : index;
  return `restaurant_${resolvedIndex}`;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function getCategoryColor(categoryKey) {
  const normalizedCategory = String(categoryKey || "Uncategorized").trim() || "Uncategorized";
  const cachedColor = categoryColorCache.get(normalizedCategory);
  if (cachedColor) {
    return cachedColor;
  }

  const namedColor = CATEGORY_COLOR_BY_NAME[normalizedCategory];
  const paletteColor =
    CATEGORY_COLOR_PALETTE[
      Math.abs(hashString(normalizedCategory)) % CATEGORY_COLOR_PALETTE.length
    ];
  const color = namedColor || paletteColor;
  categoryColorCache.set(normalizedCategory, color);
  return color;
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return hash;
}

function toRgba(hexColor, alpha) {
  const normalizedHex = String(hexColor || "").replace("#", "").trim();
  const fullHex =
    normalizedHex.length === 3
      ? normalizedHex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalizedHex;

  if (!/^[\da-fA-F]{6}$/.test(fullHex)) {
    return `rgba(100, 116, 139, ${alpha})`;
  }

  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
