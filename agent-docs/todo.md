improve the jbrowse integration. it should use the graph'display' instead of
view, and show a gene track with it, etc.

bandagejs itself should also allow showing genes, and have more help docs in
docs/ folder

## Reference assemblies: follow-ups

- Once @jbrowse/bandage-core 0.1.6 is on npm, switch `src/reference.ts` and
  `src/hubConfig.ts` to its `graphBackbone`, `backboneAssembly`,
  `featuresOnBackbone` and well-known sample table, and drop the page's copies
  (`backboneOf`'s body, `assemblyForPrefixes`, `KNOWN_SAMPLES`, `genesOn`)
- Read bigBed gene tracks (@gmod/bbi in the lazy gene chunk): hs1's default
  RefSeq track and hg38's GENCODE are bigBed
- The recent list reopens a graph without the assembly declared for it
- Draw x along lists a walk's fragments under one name each
