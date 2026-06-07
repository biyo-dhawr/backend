const cache = new Map();

export function getAdminWaterSourcesCache(key) {
  return cache.get(key);
}

export function setAdminWaterSourcesCache(key, value) {
  cache.set(key, value);
}

export function clearAdminWaterSourcesCache() {
  cache.clear();
}
