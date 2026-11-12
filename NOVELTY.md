# Prior work and what is new

Searched 2026-11-02 (web search; two to four queries, so absence of a match is not proof). Closest existing work first.

| Work | What it does | What it does not do |
|---|---|---|
| [State Water Board SAFER Dashboard](https://www.waterboards.ca.gov/drinking_water/certlic/drinkingwater/saferdashboard.html) | Shows Failing / At-Risk status and risk-assessment results | No budget, no cost per person, no optimization |
| [State Needs Assessment and Cost Assessment](https://waterboards.ca.gov/drinking_water/certlic/drinkingwater/needs.html) | Estimates statewide and county costs of solutions | Per-system costs are not published as data; no ranking by reach per dollar |
| [Pacific Institute et al., Cost Assessment and Gap Analysis](https://pacinst.org/publication/drinking-water-cost-assessment-gap-analysis/) | Costs and funding gaps for the SAFER program | Report, not an interactive allocation tool |
| [Wayne State / University of Michigan framework, 2022](https://phys.org/news/2022-07-framework-prioritizing-investment.amp) | Decision framework combining water quality with community attributes | Not California-specific; no budget-constrained optimizer |
| [UCLA Prop 1 equity report](https://www.ioes.ucla.edu/wp-content/uploads/Press-Release-on-UCLA-Prop-1-Implementation-and-Equity-Report.pdf) | Evaluates whether bond funding reached disadvantaged communities | After-the-fact evaluation, not planning |

## What Xylem adds

1. An exact budget-constrained optimizer over the state's own data, so a funder can ask "what does $X buy".
2. A per-system cost model built from the state's published averages and tested against its county totals, with the error reported.
3. A stability layer: how often each system is still funded when costs and weights vary.
4. An explicit "who is left out" view, so the cost-effectiveness trade-off is not hidden.

## What is not new

The SAFER status data, the cost averages, the equity indicators and the service-area boundaries all come from the State Water Board. The knapsack formulation is standard. The contribution is the combination and the honest uncertainty, not any single ingredient.
