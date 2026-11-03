# Data sources

| Dataset | Source | Used for |
|---|---|---|
| SAFER Risk Assessment flat file (3,186 systems, snapshot 2026-11-02) | [data.ca.gov](https://data.ca.gov/dataset/safer-failing-and-at-risk-drinking-water-systems) | Status, population, connections, DAC/SDAC, CalEnviroScreen, funding since 2017 |
| 2026 Affordability Assessment | [State Water Board Needs Assessment](https://waterboards.ca.gov/drinking_water/certlic/drinkingwater/needs.html) (`2026affordability.xlsx`) | Affordability thresholds, poverty prevalence, water bills |
| 2024 Cost Assessment | Same page (`2024costassessment.pdf`) | Tables 7 and 9 transcribed to `data/cost_tables.json` |
| Water system service-area boundaries | [State Water Board REST layer](https://gispublic.waterboards.ca.gov/portalserver/rest/services/Drinking_Water/California_Drinking_Water_System_Area_Boundaries/MapServer) | Map polygons, simplified |

The state does not publish per-system remediation costs as data. See `README.md` for how costs are modelled.

Prior-year files (2024, 2025 risk and affordability workbooks, same page) feed the failure forecast. `consol.pdf` is the state's physical-consolidation methodology, the source of the routing unit costs. County outlines: [plotly/datasets](https://github.com/plotly/datasets) (US Census cartographic boundaries). The three large risk workbooks are not committed; `pipeline/fetch_data.py` downloads them.

## Extra public datasets (`pipeline/fetch_extra.py`, listed in `data/extra_sources.json`)

| Source | Owner | Used for |
|---|---|---|
| `sdwis_violation` | US EPA SDWIS (Envirofacts) | Dated drinking-water violations (health-based, monitoring, reporting) for every California system |
| `sdwis_enforcement_action` | US EPA SDWIS (Envirofacts) | Dated enforcement actions against California systems |
| `sdwis_water_system` | US EPA SDWIS (Envirofacts) | System attributes: groundwater vs surface source, owner type, wholesaler, type |
| `sdwis_lcr_sample_result` | US EPA SDWIS (Envirofacts) | Lead and copper sample results |
| `sdwis_service_area` | US EPA SDWIS (Envirofacts) | Service area types (residential, school, mobile home, etc.) |
| `sdwis_geographic_area` | US EPA SDWIS (Envirofacts) | Counties and cities served |
| `ddw_facilities` | CA State Water Board DDW | State Drinking Water Watch facility list: wells, intakes, treatment plants, storage per system |
| `pws_rates` | CA State Water Board | Water rates reported by systems (2014-15 annual report) |
| `school_lead` | CA State Water Board | Lead sampling results at California schools, by water system |
| `water_loss_audits` | CA DWR / State Water Board | Real water loss audits (urban suppliers) |
| `small_system_shortage` | CA DWR | DWR water shortage vulnerability scores for small water systems |
| `small_supplier_risk` | CA DWR | Drought and water shortage risk scores, small suppliers |
| `dry_wells` | CA DWR | Household dry-well and water shortage reports (location, date, well depth, repair cost) |
| `sgma_priority` | CA DWR | SGMA 2019 groundwater basin prioritization scores |
| `sgma_public_wells` | CA DWR | Public supply wells per groundwater basin (SGMA component 3) |
| `b118_basins` | CA DWR | DWR Bulletin 118 groundwater basin polygons |
| `svi_2022` | CDC/ATSDR | CDC/ATSDR Social Vulnerability Index 2022, California tracts (Census ACS: poverty, income, housing, language, age) |
| `census_gazetteer` | US Census Bureau | Census 2023 tract gazetteer (centroids, land area) |
| `calenviroscreen4` | CA OEHHA | CalEnviroScreen 4.0 tract scores: pollution burden, groundwater threats, drinking water contaminants |
| `noaa_pcpncy` | NOAA NCEI nClimDiv | County monthly precipitation |
| `noaa_pdsicy` | NOAA NCEI nClimDiv | County monthly Palmer Drought Severity Index |
| `noaa_tmpccy` | NOAA NCEI nClimDiv | County monthly mean temperature |
| `nifc_fires` | NIFC / CAL FIRE (WFIGS) | Wildfire perimeters (ignition point, date, acres), California |

OpenStreetMap infrastructure (`pipeline/fetch_infrastructure.py`): canals, aqueducts, treatment plants and water towers, ODbL. Terrain: AWS Terrain Tiles (SRTM, GMTED). Imagery on the 3D map: Esri World Imagery and Sentinel-2 cloudless by EOX. Buildings: OpenStreetMap via OpenFreeMap.

Not found: no published dataset of actual drinking-water project costs, so the cost model is still calibrated only to the state's 2024 Cost Assessment tables.
