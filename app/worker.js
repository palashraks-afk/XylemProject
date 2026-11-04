/* Runs the exact knapsack off the main thread so sliders and the map never freeze. */
importScripts("optimizer.js");
self.onmessage = (e) => {
  const { id, costs, ben, conns, pops, failing, budget, reserve } = e.data;
  const chosen = self.XylemOpt.optimize(costs, ben, conns, budget, reserve);
  const base = self.XylemOpt.statusFirst(costs, pops, failing, budget);
  self.postMessage({ id, chosen, base });
};
