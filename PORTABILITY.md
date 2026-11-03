# Portability: what it would take beyond California

Nothing outside California is built or tested. This lists what the method needs, so a claim of reach can be checked.

| Input | What Xylem uses | Where it comes from in California | What another region needs |
|---|---|---|---|
| A list of water systems with status | SAFER status for 3,186 systems | State Water Board SAFER Risk Assessment | Any compliance or risk list (US: EPA SDWIS violations; elsewhere: a regulator's or utility's list) |
| Population and connections | Per system | Same file | Utility or census counts |
| Location | Latitude and longitude, optional service-area polygons | Same file, State boundary layer | Utility GPS points are enough; polygons improve routing |
| Cost per fix | Average cost per connection by size, plus unit costs for pipe | State 2024 Cost Assessment | A local cost study or quotes; the model needs only a per-connection cost curve and a pipe cost per metre |
| Equity indicators | Disadvantaged-community status, CalEnviroScreen, affordability, poverty | State and CalEPA | Any deprivation index and a water-bill affordability measure |
| History for the forecast | Three annual snapshots of the status list | State annual files | At least two consecutive years of the status list |

Honest reading: the **US** is the nearest port, because SDWIS is national and public, but it has no equivalent of the SAFER risk indicators or the state's cost study, so costs and the forecast would need new inputs. Outside the US the binding constraint is data, not method.
