/* Presentation-only correction. Frozen source and numerical inputs stay unchanged. */
(function (root) {
  const overrides = Object.freeze({
    CA5610029: Object.freeze({
      recordedName: "10/30/2026",
      displayName: "Vineyard Avenue Acres MWC",
      source: "https://sdwis.waterboards.ca.gov/PDWW/JSP/WaterSystemDetail.jsp?tinwsys_is_number=6171&tinwsys_st_code=CA&wsnumber=CA5610029",
      checked: "2026-11-17"
    })
  });
  function apply(systems) {
    const applied = [];
    for (const system of systems) {
      const correction = overrides[system.id];
      if (correction && system.name === correction.recordedName) {
        system.name = correction.displayName;
        applied.push(system.id);
      }
    }
    return applied;
  }
  const api = { apply, overrides };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.XylemLabels = api;
})(typeof window !== "undefined" ? window : globalThis);
