improve the jbrowse integration. it should use the graph'display' instead of
view, and show a gene track with it, etc.

bandagejs itself should also allow showing genes, and have more help docs in
docs/ folder

## Reference assemblies: follow-ups

- Read bigBed gene tracks (@gmod/bbi in the lazy gene chunk): hs1's default
  RefSeq track and hg38's GENCODE are bigBed
- The recent list reopens a graph without the assembly declared for it
- Draw x along lists a walk's fragments under one name each

## Testing

- No e2e test cuts a real GBZ, so `recut()` in `sources.ts` is covered only by
  `test/unit/state.test.ts`. Serving a small gbz-base db and its index (e.g.
  `micb-kir3dl1.gbz.db`, ~410 KB) through the fixtures' range server would let a
  test toggle the strip and check the re-cut.

## Drawing: follow-ups

- Exons draw as caps masked off their node here; the plugin's React GenePins and
  the core's figureSvg still draw a band over the node, and the figure has no
  exon key
- The plugin's `geneFeatures.ts` still marks a whole gene as one exon where its
  window holds none; the core's GFF3 reader no longer does
- Only the force layout records which way it drew each node, so the anchored and
  ordered layouts still pick a link's ends by x-distance
- An exon shorter than a pixel draws nothing at overview zoom
