# @rickrosten/agent-deterministic-tools-units

Exact unit conversion for AI agents.

```json
{ "value": 100, "from": "km/h", "to": "m/s" }
```

```json
{
  "result": 27.77777777777778,
  "resultDecimal": "27.7777777777777777777777777778",
  "from": { "id": "km/h", "name": "kilometre per hour" },
  "to": { "id": "m/s", "name": "metre per second" },
  "category": "speed"
}
```

Categories: length, mass, temperature, area, volume, speed, time, energy, power, pressure,
data. Call `units.list_units` for every unit and alias.

## Rules

- Factors are exact decimals from SI / NIST SP 811; conversions use 40-digit decimal
  arithmetic through the category's base unit. Temperatures are affine.
- Aliases and spelling variants are normalized (`square feet`, `m^2`, `℃`, `μm`, `kph`,
  `km per h`).
- Symbols are case-sensitive where it matters: `MB` megabyte, `Mb` megabit, `mb` millibar;
  `kB` = 1000 B, `KiB` = 1024 B.
- Ambiguous symbols (`gal`, `pt`, `qt`, `fl oz`, `cup`, `ton`, `KB`, `month`, `year`...) are
  **never** resolved silently: `INVALID_UNIT` lists the exact alternatives (`gal_us`, `gal_imp`).
- Converting across categories returns `INVALID_UNIT`; temperatures below absolute zero
  return `OUT_OF_RANGE`.
