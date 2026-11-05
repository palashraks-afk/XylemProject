/* Graphics quality tiers for the 3D map. Pure functions (no DOM), so they can be unit-tested in Node.
 * The 3D map is GPU-bound: terrain, imagery, 3D buildings, anti-aliasing and thousands of extruded towers all cost frame time.
 * A device gets a starting tier from what it reports about itself; a frame-time governor then steps down if the map still stutters. */
(function (root) {
  "use strict";
  const TIERS = ["low", "balanced", "high"];

  // Starting tier. `pref` ("auto" or a tier) wins when the user has chosen one.
  function pickTier(env) {
    env = env || {};
    if (TIERS.indexOf(env.pref) >= 0) return env.pref;
    if (env.saveData) return "low";
    let score = 2;
    if (env.coarse) score -= 1;                                   // phone or tablet
    if (env.cores && env.cores <= 4) score -= 1;
    if (env.memory && env.memory <= 4) score -= 1;
    if (env.coarse && env.dpr >= 2.5) score -= 1;                 // very dense screen on a handheld
    return TIERS[Math.max(0, Math.min(2, score))];
  }

  // What each tier switches on or off.
  function settings(tier, dpr) {
    dpr = dpr || 1;
    return {
      pixelRatio: tier === "high" ? Math.min(dpr, 2) : tier === "balanced" ? Math.min(dpr, 1.25) : 1,
      terrain: tier !== "low",
      hillshade: tier === "high",
      buildings: tier === "high" ? 13 : tier === "balanced" ? 14.5 : false,   // minimum zoom, or false for none
      unfundedTowers: tier !== "low",                                          // low draws not-funded systems as dots only
      antialias: tier === "high",
      maxPitch: tier === "low" ? 60 : 82,
    };
  }

  const lower = (tier) => TIERS[Math.max(0, TIERS.indexOf(tier) - 1)];

  // Watches frame times while the camera is moving. push() returns true once when the recent average is too slow.
  function createGovernor(opts) {
    opts = opts || {};
    const N = opts.window || 45, limit = opts.limitMs || 38, stall = opts.ignoreAboveMs || 250;   // ~26 fps; ignore tab-switch stalls
    let win = [];
    return {
      push(ms) {
        if (!(ms > 0) || ms > stall) return false;
        win.push(ms); if (win.length > N) win.shift();
        if (win.length === N && win.reduce((a, b) => a + b, 0) / N > limit) { win = []; return true; }
        return false;
      },
      reset() { win = []; },
    };
  }

  const api = { TIERS, pickTier, settings, lower, createGovernor };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.XylemQuality = api;
})(typeof window !== "undefined" ? window : globalThis);
