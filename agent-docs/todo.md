improve the jbrowse integration. it should use the graph'display' instead of
view, and show a gene track with it, etc.

bandagejs itself should also allow showing genes, and have more help docs in
docs/ folder

## Reference assemblies: follow-ups

- Let other origins read genomes.jbrowse.org/searchIndex.json (its CloudFront or
  nginx needs `Access-Control-Allow-Origin: *`), then set `genomes.index` in
  `public/config.json` so the dialog finds genomes by common name
- Read bigBed gene tracks (@gmod/bbi in the lazy gene chunk): hs1's default
  RefSeq track and hg38's GENCODE are bigBed
- The recent list reopens a graph without the assembly declared for it
- Draw x along lists a walk's fragments under one name each
