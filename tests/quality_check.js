// Prints a JSON object of results for the quality-tier logic; tests/test_quality.py checks them.
const Q = require("../app/quality.js");
const out = {};
out.tiers = {
  desktop: Q.pickTier({ cores: 8, memory: 16, dpr: 1.5, coarse: false }),
  laptop4: Q.pickTier({ cores: 4, memory: 8, dpr: 2, coarse: false }),
  phone: Q.pickTier({ cores: 8, memory: 4, dpr: 3, coarse: true }),
  lowphone: Q.pickTier({ cores: 4, memory: 2, dpr: 3, coarse: true }),
  saveData: Q.pickTier({ cores: 16, memory: 16, dpr: 1, coarse: false, saveData: true }),
  userLow: Q.pickTier({ pref: "low", cores: 16, memory: 16, dpr: 1 }),
  unknown: Q.pickTier({}),
};
out.settings = { high: Q.settings("high", 3), balanced: Q.settings("balanced", 3), low: Q.settings("low", 3) };
out.lower = [Q.lower("high"), Q.lower("balanced"), Q.lower("low")];
const g = Q.createGovernor({ window: 10, limitMs: 38 });
let r = []; for (let i = 0; i < 10; i++) r.push(g.push(16));            // smooth 60 fps: never downgrade
out.smooth = r.some(Boolean);
const g3 = Q.createGovernor({ window: 10, limitMs: 38 });
r = []; for (let i = 0; i < 10; i++) r.push(g3.push(60));               // 17 fps from the start: downgrade exactly when the window fills
const g4 = Q.createGovernor({ window: 10, limitMs: 38 }); for (let i = 0; i < 10; i++) g4.push(16);
out.mixedFiresWithinWindow = (() => { for (let i = 0; i < 10; i++) if (g4.push(60)) return true; return false; })();   // smooth, then slow: the rolling mean catches it
out.slowFiresAt = r.indexOf(true);
out.slowFiresOnce = r.filter(Boolean).length;
const g2 = Q.createGovernor({ window: 10 }); r = []; for (let i = 0; i < 30; i++) r.push(g2.push(900));   // stalls (tab switch) are ignored
out.stallsIgnored = !r.some(Boolean);
console.log(JSON.stringify(out));
