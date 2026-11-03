# Data sources

| Dataset | Source | Used for |
|---|---|---|
| SAFER Risk Assessment flat file (3,186 systems, snapshot 2026-11-02) | [data.ca.gov](https://data.ca.gov/dataset/safer-failing-and-at-risk-drinking-water-systems) | Status, population, connections, DAC/SDAC, CalEnviroScreen, funding since 2017 |
| 2026 Affordability Assessment | [State Water Board Needs Assessment](https://waterboards.ca.gov/drinking_water/certlic/drinkingwater/needs.html) (`2026affordability.xlsx`) | Affordability thresholds, poverty prevalence, water bills |
| 2024 Cost Assessment | Same page (`2024costassessment.pdf`) | Tables 7 and 9 transcribed to `data/cost_tables.json` |
| Water system service-area boundaries | [State Water Board REST layer](https://gispublic.waterboards.ca.gov/portalserver/rest/services/Drinking_Water/California_Drinking_Water_System_Area_Boundaries/MapServer) | Map polygons, simplified |

The state does not publish per-system remediation costs as data. See `README.md` for how costs are modelled.
