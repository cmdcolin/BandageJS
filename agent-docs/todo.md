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
