# PULSE · Environment & Hemoglobin

An English teaching research workbench for POD1-anchored hemoglobin trajectories after total knee arthroplasty.

**Open the website: https://yitaozhengacademic-eng.github.io/pulse-hemoglobin-workbench/**

- Browser-local PULSE trajectory inference and a separate logistic risk model.
- City-level PM₂.₅ observations and on-demand ERA5 temperature and humidity.
- A 30-day preadmission window with explicit data-coverage checks.
- A fictional example, JSON/CSV exports, print layout, and responsive English interface.

## Source and verification

The complete project is in [`pulse-site/`](pulse-site/). See its [README](pulse-site/README.md), [model manifest](pulse-site/dist/data/model-manifest.json), and [checkpoint audit](pulse-site/docs/checkpoint-audit.json). Six automated checks include 24 fictional-input comparisons against the original Python models. Inputs are computed locally in the browser and are not uploaded or persistently stored by this site.

## Interpretation

**Teaching simulation only; not for clinical decisions.**

The source records include outcome-directed adjustments. Manuscript and available local checkpoint performance summaries differ; the interface discloses this discrepancy. Trajectories average existing checkpoints. The risk model is a disclosed 131-record teaching deployment refit, not an externally validated clinical probability. No original patient tables are included.

## Hosting and environmental updates

This repository is public with the owner's explicit authorization. [GitHub Actions](https://github.com/yitaozhengacademic-eng/pulse-hemoglobin-workbench/actions/workflows/pulse-pages.yml) tests and deploys only `pulse-site/dist` to GitHub Pages over HTTPS.

Public city observations are scheduled to refresh daily at approximately **06:23 China Standard Time**, followed by deployment. Scheduled runs can be delayed or fail. The interface shows the actual refresh attempt and coverage. ERA5 can also be queried on demand and normally has a publication delay; absent observations remain missing. City-average ambient exposure is not an individual's measured exposure.

The workflow can be run manually with `refresh_environment=true`. No patient input is sent to the environmental sources. City coordinates and the requested date range are used for the weather query.
