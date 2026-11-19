# Which water projects should a planner investigate next?

**California drinking-water funding case study | Xylem Global Student Innovation Challenge 2026**

A water system can still need safe drinking water even when construction funding is already in place. This case tests what happens when a planner checks project status before using a modeled shortlist to consider new awards. It follows **East Orosi, Daggett, and San Ardo** across three runs of the same $500M funding scenario.

## How the shortlist changed

| $500M scenario | Systems selected | Small systems | Reported population sum | Modeled cost |
|---|---:|---:|---:|---:|
| Default, 0% small-system priority | 97 | 48 | 476,663 | $487.92M |
| 30% small-system priority | 112 | 70 | 393,742 | $486.06M |
| 30% priority, East Orosi tracked separately | 113 | 71 | 393,369 | $485.90M |

The 30% priority adds **22 small systems** relative to the default. Tracking East Orosi separately from the hypothetical pool for new awards then changes **seven selections**. Three systems leave the simulated shortlist and four enter.

A small system has at most 500 service connections. Population sums are based on selected systems' reported counts and may overlap. Costs are model estimates. The runs measure changes in selection. Actual service improvements and grant awards are outside the scope of the comparison.

## Three systems, three funding questions

### East Orosi CSD · Tulare County · CA5401003

The 30% priority selects East Orosi, a system with **103 connections, a reported population of 423, and a $2.23M modeled cost**. The State Water Board approved construction funding for a consolidation with neighboring Orosi, estimated at **about $15M**. Tulare County reported that construction began in April 2026. The model's generic estimate and the documented construction estimate cover different scopes. **Planning action.** Track the funded consolidation and verify any remaining need separately before considering a new award. [State Water Board consolidation announcement](https://www.waterboards.ca.gov/press_room/press_releases/2026/pr20260227-east-orosi-consolidation-order.html) · [Tulare County construction update](https://tularecounty.ca.gov/rma/news/east-orosi-water-infrastructure-groundbreaking-initiative)

### Daggett CSD · San Bernardino County · CA3600086

Daggett enters with the 30% priority and stays on the shortlist after the East Orosi screen. It has **196 connections, a reported population of 795, and a $4.25M modeled cost**. The State Water Board records **$337,880** in operations and maintenance assistance and separately documents technical assistance with administering a bottled-water grant. **Planning action.** Identify what a permanent project would address and verify its scope, budget, and funding gap. [State Water Board, June 2026, p. 12](https://www.waterboards.ca.gov/board_info/agendas/2026/jun/06022026-7edrpt.pdf) · [State Water Board, November 2026, p. 10](https://www.waterboards.ca.gov/board_info/agendas/2026/nov/11042026-5edrpt.pdf)

### San Ardo Water District · Monterey County · CA2700728

San Ardo enters only in the East Orosi screening run. It has **161 connections, a reported population of 575, and a $3.49M modeled cost**. Drinking Water Watch confirms the system and its reported population. A 2024 Monterey County LAFCO review documents past flood damage, drinking-water repairs, and interest in evaluating less flood-prone sites. **Planning action.** Verify the current drinking-water project, its readiness, and any funding commitments before advancing it. [California Drinking Water Watch](https://sdwis.waterboards.ca.gov/PDWW/JSP/WaterSystemDetail.jsp?tinwsys_is_number=9091&tinwsys_st_code=CA) · [Monterey County LAFCO service review, p. 17](https://www.countyofmonterey.gov/home/showpublisheddocument/137118/638688371005870000)

## What the comparison establishes

**Project status can change who makes the shortlist.** The model gives a budget-constrained starting point. A public-record check distinguishes a funded project still in progress, interim assistance with an unresolved permanent scope, and a candidate that needs project-level verification. The three systems illustrate distinct decisions and were selected for that purpose. The case is a retrospective demonstration, with practitioner review and statewide funding-status verification still pending.

## Reproduce the result

1. Use the November 2, 2026 California snapshot of 1,062 Failing or At-Risk systems. Set the budget ceiling to $500M, equity weight to 1, the exploratory At-Risk weighting horizon to five years, the cost multiplier to 1, and consolidation route costs to off.
2. Compare 0% and 30% small-system priority. The priority uses two sequential allocation passes and may spend a different share than the displayed setting. The five-year At-Risk weight is exploratory.
3. For the offline comparison, keep the 30% setting and treat East Orosi as already tracked for the funded consolidation. Hold all other candidates, objective weights, and costs fixed. Daggett's interim support does not imply a funded permanent project, so the run leaves its eligibility as modeled. Inclusion in any model result identifies a candidate for review. Actual eligibility and funding decisions require project-level checks.

| Change from the 30% plan to the screened plan | Systems |
|---|---|
| Left the shortlist | Shasta CSA No. 6 (Jones Valley), East Orosi CSD, Davis JUSD (Fairfield School) |
| Entered the shortlist | Malaga County Water District, San Ardo Water District, Lakeside School, Rancho San Andreas |

From the repository root, run `node audit/three-system-case-study/reproduce.cjs`. The script checks the hashes of the model inputs and matches both original plans by system ID before printing the scenario metrics and membership changes. [Release verification](../technical-release-2026-11-17/RELEASE_STATUS.md) · [Reproduction script](reproduce.cjs)
