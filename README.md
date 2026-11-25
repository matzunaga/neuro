# Neuron

Real human neurons, drawn in 3D from open reconstruction data. Style follows the Tide site.

- **Data:** [NeuroMorpho.Org](https://neuromorpho.org) and the [Allen Cell Types Database](https://celltypes.brain-map.org). Every cell shows its source, region, cell type, completeness and publication in the "About this cell" box.
- **Automatic:** a GitHub Action (`.github/workflows/update.yml`) runs every Monday, picks a new set of human neurons, thins the SWC files for the web and commits `data/`. No manual uploads.
- **Accuracy:** only human neurons with dendrites marked complete; lab-grown (iPSC/stem-cell derived) cells are filtered out. Drawings are simplified; lengths are measured from the original tracing. For illustration, not clinical use.
- **Credit:** Ascoli GA, Donohue DE, Halavi M. NeuroMorpho.Org: a central resource for neuronal morphologies. J Neurosci 2007. Allen data © Allen Institute for Brain Science.
