# Xylem

A web-based GIS app that helps direct clean drinking water and sanitation funding to where it does the most good for the most people, per dollar spent, using public California SAFER program data.

## Goal

Maximize equitable access to clean water per unit of budget spent. Xylem combines the State Water Board's SAFER (Safe and Affordable Funding for Equity and Resilience) risk assessment data with California's drinking water cost assessment data in an interactive map, so planners, funders and communities can see which water systems are failing, who they serve, and where an investment reaches the most people.

## The problem

Roughly 40 million Californians are served by about 3,200 public water systems tracked by the State Water Board. The SAFER program labels each system Failing, At-Risk, Potentially At-Risk or Not At-Risk, but the data lives in flat files and dashboards that are hard to rank, filter and compare. Funding decisions need three questions answered together:

1. How many people are affected, and where?
2. Are those people in disadvantaged communities (DAC / SDAC)?
3. What would it cost to fix, and how many people does each dollar reach?

## Approach

- **Population affected:** rank systems and counties by people served by Failing and At-Risk systems.
- **Equity lens:** weight by disadvantaged-community status, median household income, CalEnviroScreen score and affordability risk, so small, poor systems are not drowned out by large utilities.
- **Cost-effectiveness:** join the cost assessment so investments can be compared by people served per dollar.
- **GIS first:** every result is tied to a system location and, later, its service-area boundary, so it can be mapped and filtered.

## Data

| Dataset | Source | Status |
|---|---|---|
| SAFER Risk Assessment flat file (system status, population, DAC/SDAC, risk scores, violations) | California State Water Board, via [data.ca.gov](https://data.ca.gov/dataset/safer-failing-and-at-risk-drinking-water-systems) | In use |
| Drinking water cost assessment | California State Water Board Needs Assessment | Planned |
| Water system service area boundaries | State Water Board / GIS layer | Planned |

See [DataSets.md](DataSets.md) for links.

## What exists so far

An interactive explorer built on the SAFER Risk Assessment file (3,186 systems, snapshot dated 2026-10-31):

- Sortable, filterable table of every system by SAFER status, county, DAC/SDAC and free-text search
- A map of systems sized by population served and colored by status
- A county rollup of people served by Failing and At-Risk systems
- Ranked spreadsheets of all systems and counties

**[Open the explorer](https://claude.ai/artifact/V58ovMEdDeXzRrUXTiTyuF)**

### Early findings from the 2026-10-31 file

- About 1.93M people are served by Failing (about 428K) or At-Risk (about 1.50M) systems, and about 68% of them are in DAC or SDAC areas.
- By people affected, the largest counties are San Bernardino, Los Angeles, Kern, Fresno and Tulare. By share of population, Kings, Imperial, Merced and Tulare are highest.
- The Central Valley dominates the Failing list, mostly from 1,2,3-trichloropropane, nitrate, arsenic and disinfection byproducts.

## Data caveats

- 179 systems have no SAFER status ("Not Assessed"). They are mostly the largest utilities (LADWP, East Bay MUD, San Diego, San Jose Water, SFPUC) and serve about 25M people, so big-city counts and shares are understated.
- "At-Risk" comes from a risk score (affordability, accessibility, capacity, source vulnerability), not a confirmed contaminant. "Failing" is a current violation-based listing.
- About 1,030 systems have a missing or indeterminate economic status, so the DAC/SDAC share is an undercount.
- Population is as reported by each system and county is where the system is registered.

## Roadmap

1. Join the cost assessment data and add a people-served-per-dollar metric
2. Combined need score (people affected, DAC/SDAC, affordability burden)
3. Service-area boundary layer on a real basemap
4. Click-to-filter between the map, tables and county view
5. Scheduled refresh when the State Water Board publishes a new file

## Repository

- `README.md`: this overview
- `DataSets.md`: dataset links
