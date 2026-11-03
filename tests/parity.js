// Reads {costs, ben, conns, cases} from stdin, runs the JS optimizer, prints [bool per case] = equals Python's answer.
const { optimize } = require("../app/optimizer.js");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  const { costs, ben, conns, cases } = JSON.parse(buf);
  const out = cases.map((c) => {
    const js = optimize(costs, ben, conns, c.budget, c.reserve);
    return JSON.stringify(js) === JSON.stringify(c.py);
  });
  console.log(JSON.stringify(out));
});
