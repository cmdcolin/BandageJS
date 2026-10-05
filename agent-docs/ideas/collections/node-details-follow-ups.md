---
name: node-details-follow-ups
description: Follow-ups on the node details panel: sequence with Copy FASTA, a ring round the selected node in walk rows and the tube map, a filterable walk list.
---

# Node details: follow-ups

- Sequence: the core's GFA reader keeps S-line sequence but `makeNode` drops it,
  and L-line overlaps too; carrying them (or the first kb) would let the panel
  show bases, reverse-complemented for a node drawn −, with Copy FASTA
- Walk rows and the tube map draw no ring round the selected node
- A long walk list could filter, and group by sample; a graph cut from gbz
  counts each W-line fragment as a walk
