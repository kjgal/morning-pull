# Morning Pull research notes

The coach is deterministic and runs locally. Source keys in the rules map to the references below. Shot timing and taste are clues. A measured ratio requires both measured dose and measured beverage weight. Numeric changes are small trial steps, not extraction guarantees. Prefer one controlled change. Honor declared basket and machine capabilities.

- `bed` · [Cameron et al. · Espresso model and experiments](https://doi.org/10.1016/j.matt.2019.12.019). In this study, grinding very fine sometimes reduced extraction and reproducibility. An uneven bed can make a shot both sharp and dry. Check visible unevenness before changing grind.

- `taste` · [Barista Hustle · The Espresso Compass](https://www.baristahustle.com/the-espresso-compass/). Strength and extraction are different. More beverage at the same dose generally dilutes the cup while extracting more. Taste is a clue, especially when paired with actual yield or observed flow.

- `dial` · [La Marzocco Home · How to Make Espresso](https://home.lamarzoccousa.com/how-to-make-espresso/). A roughly 1:2 recipe and about 25–30 seconds are common starting points for traditional espresso. They are not pass/fail limits. Adjust one variable and compare at a consistent timing convention.

- `machine` · [Breville · Barista Express manual](https://www.breville.com/content/dam/breville/us/assets/miscellaneous/instruction-manual/espresso/BES870-instruction-manual.pdf). Basket type changes how the setup behaves. The manual distinguishes single-wall baskets for fresh adjustable grind from dual-wall baskets that accommodate pre-ground coffee. Use your own machine’s manual for available controls and warm-up.

- `heat` · [Schmieder et al. · Espresso extraction kinetics](https://doi.org/10.3390/foods12152871). Temperature and flow interact with grind in espresso extraction. Check the machine’s warm-up and the repeatability of the shot before trialing one available temperature increment.

- `beans` · [Smrke et al. · Storage after opening](https://doi.org/10.1016/j.fpsl.2022.100893). Packaging and storage affected aroma after opening. Roast age, freezing and opening dates give context but cannot establish that a shot is stale or prescribe a change by themselves.

Additional references used for bean storage, brew math, and syrups


## November brewing and troubleshooting audit

- Starting recipe selection and yield calculation are separate. The general starting ratio is 1:2, so a basket-appropriate 18 g dose produces a 36 g target. The old code selected 1:2.25 for either a light roast or the explicit More clarity goal. Now roast stays in bean context and does not select the ratio by itself. Explicit taste goals, user-edited targets, a previously liked shot with matching bean/portion and setup, and accepted troubleshooting adjustments have separate explanations. A recognized label has no measured cup yield.
- The prior dual-wall fast/slow rule treated both a confirmed compatible basket and an unknown basket fit as a reason to clean. The [Breville Infuser manual, care and troubleshooting sections](https://www.breville.com/content/dam/breville/ca/assets/miscellaneous/instruction-manual/espresso/BES840-instruction-manual.pdf) discusses obstruction as one possible reason for poor flow, alongside the grounds, dose, and machine. The coach now requires a visible blockage or restriction isolated to the empty basket before suggesting targeted cleaning. A clean basket advances to dose and pour evidence. Poor flow without the basket points to the machine instructions.
- Observations reflect actual taste and flow, with separate fields for measured dose and beverage yield. Spraying from a single-wall setup supports checking even puck preparation. On a dual-wall setup the visible outlet can shape the stream, so the coach distinguishes outlet behavior from rim leakage before giving preparation advice. Small grind trials apply only to a confirmed adjustable grinder and single-wall setup.
- For an even stream at a known dose and yield, changes to cup yield are small controlled taste trials. Intensity alone triggers a dilution comparison to distinguish concentration from a persistent taste defect. The optional time check uses independently measured seconds only, with matching timing conventions for comparisons. The decorative animation has no connection to evidence, measurements, or shot completion.
