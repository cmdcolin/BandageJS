---
name: drawing-follow-ups
description: Follow-ups on drawing: whole-gene exon marks in geneFeatures.ts, link ends outside the force layout, sub-pixel exons.
---

# Drawing: follow-ups

- The plugin's `geneFeatures.ts` still marks a whole gene as one exon where its
  window holds none; the core's GFF3 reader no longer does
- Only the force layout records which way it drew each node, so the anchored and
  ordered layouts still pick a link's ends by x-distance
- An exon shorter than a pixel draws nothing at overview zoom
