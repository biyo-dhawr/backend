const cache = new Map();

export function getGovernmentWaterSourcesCache(key) {
  return cache.get(key);
}

export function setGovernmentWaterSourcesCache(key, value) {
  cache.set(key, value);
}

export function clearGovernmentWaterSourcesCache() {
  cache.clear();
}
