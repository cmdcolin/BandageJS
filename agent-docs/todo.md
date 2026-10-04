improve the jbrowse integration. it should use the graph'display' instead of
view, and show a gene track with it, etc.

bandagejs itself should also allow showing genes, and have more help docs in
docs/ folder

## Reference assemblies: follow-ups

- Read bigBed gene tracks (@gmod/bbi in the lazy gene chunk): hs1's default
  RefSeq track and hg38's GENCODE are bigBed

## Drawing: follow-ups

- The plugin's `geneFeatures.ts` still marks a whole gene as one exon where its
  window holds none; the core's GFF3 reader no longer does
- Only the force layout records which way it drew each node, so the anchored and
  ordered layouts still pick a link's ends by x-distance
- An exon shorter than a pixel draws nothing at overview zoom

## Node details: follow-ups

- Sequence: the core's GFA reader keeps S-line sequence but `makeNode` drops it,
  and L-line overlaps too; carrying them (or the first kb) would let the panel
  show bases, reverse-complemented for a node drawn −, with Copy FASTA
- Walk rows and the tube map draw no ring round the selected node
- A long walk list could filter, and group by sample; a graph cut from gbz
  counts each W-line fragment as a walk
