# Genes and reference assemblies

BandageJS pins genes along a graph's reference path: each gene's exons are dark
stretches of the reference nodes, with its name beside them. Hover a name for
the gene's span and strand. Genes show in the force-directed, anchored, ordered
and sample-row layouts.

## Which assembly a graph is on

A graph names the sample its reference comes from, not the assembly:
`GRCh38#0#chr6` says sample GRCh38, haplotype 0, contig chr6. The page reads
genes only once it knows the assembly, because contig names alone are ambiguous.
`chr6` exists in hg38, CHM13 and every other human assembly, at coordinates up
to hundreds of kilobases apart.

Most graphs need nothing from you. The page finds the assembly in its hubs, the
JBrowse configs it knows, by the reference's PanSN sample (`GRCh38`) or
haplotype (`HG00097#1`). An assembly matches by its name, by an alias in its
hub, by a name the site's config gives it, or by the sample UCSC's name stands
for: hg38 is GRCh38, and hs1 is CHM13.

When nothing matches, the page narrows the choice down and asks once:

- **Bare contig names** (`SN:Z:chr6`) name no sample. The page offers the
  assemblies whose sequence names include every contig of the reference, hg38
  and hs1 for `chr6`, in a notice and under Display → Reference assembly. One
  click binds this graph.
- **A sample no hub knows** (`Kay12`) gets the assemblies whose names mention
  it, if any, and Display → Reference assembly → Choose the assembly… opens a
  search. Type a name (`coli`), a GenArk accession (`GCF_000005845.2`) or a UCSC
  genome (`mm39`). The page reads that genome's hub from genomes.jbrowse.org.
  Where the graph names a sequence differently from the assembly, the dialog
  asks which sequence it is, and picks the only one where there's one.

A choice for a sample applies to every graph whose reference names that sample,
and the browser remembers it; untick "Use it for every graph" to choose for this
graph alone. Pick Automatic in the dialog to forget a choice.

"Draw x along" moves the reference to another walk, and the binding follows it.
Draw a CHM13 cut along its GRCh38 walk and the page reads hg38's genes. Draw it
back and it reads CHM13's again.

## Hubs

A hub is any JBrowse `config.json`. The page reads each hub's assemblies, their
aliases, their contig name tables (`refNameAliases`) and their gene tracks. It
checks hubs in this order and binds to the first assembly that matches:

1. hubs named by the page's link (`?hub=`)
2. hubs you added or chose a genome from, which the browser remembers
3. the site's, from its `config.json`

A hub's gene track is the first of its tabix GFF3 or BED feature tracks on the
assembly. The page prefers the config's default session, then tracks whose name
says genes. Where a hub has more than one, the dialog lets you choose. The page
doesn't read bigBed gene tracks yet.

## Links

The page's address keeps any choice that the site's names wouldn't find again,
so a shared link opens on the same assembly:

| Parameter  | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| `hub`      | a JBrowse `config.json` to check first; repeat it for more |
| `assembly` | the assembly the reference is on, by name or alias         |
| `contigs`  | `graph:assembly` sequence names, comma separated           |

For example, an Arabidopsis graph whose reference is `Col-0#1#Chr1` reads
TAIR10's genes from its GenArk hub, whose alias table already knows `Chr1`:
`?gfa=https://example.org/at.gfa&hub=https://jbrowse.org/hubs/genark/GCF/000/001/735/GCF_000001735.4/config.json&assembly=GCF_000001735.4`.

The JBrowse menu's links open JBrowse on the bound hub's config, with its gene
track. A hub that loads the graph viewer plugin, as the HPRC portal does, also
opens the graph there.

## Your own genes

Display → Open genes… reads a GFF3 or BED file, plain or gzipped, in place of
the hub's genes. It needs no assembly: it names contigs as the graph does,
`chr6` or `GRCh38#0#chr6`, and applies to the reference drawn when you opened
it. A file that names none of the reference's contigs says so and changes
nothing.

## Setting up a site

Whoever deploys the page sets its hubs in `config.json`, next to `index.html`,
so the site's users get genes without choosing anything:

```json
{
  "jbrowse": "https://jbrowse.org/code/jb2/main/",
  "hubs": [
    "https://jbrowse.org/pangenome/hprc-grch38/config.json",
    "https://jbrowse.org/ucsc/hs1/config.json",
    {
      "url": "https://jbrowse.org/hubs/genark/GCF/000/005/845/GCF_000005845.2/config.json",
      "aliases": { "GCF_000005845.2": ["K12"] },
      "refNameAliases": { "GCF_000005845.2": { "chr": "NC_000913.3" } }
    }
  ],
  "genomes": {
    "ucsc": "https://jbrowse.org/ucsc/",
    "genark": "https://jbrowse.org/hubs/genark/"
  }
}
```

- `jbrowse` is the JBrowse Web that the JBrowse menu's links open. The default
  is `main`, because the HPRC portal's config needs features that `latest`
  lacks.
- `hubs` is the list of JBrowse configs, first to last. An entry is a url, or a
  url with what that config doesn't say itself, keyed by assembly name:
  - `aliases`: the sample names your graphs call the assembly by
  - `refNameAliases`: the assembly's names for sequences your graphs name
    otherwise, as `{ "graph name": "assembly name" }`
  - `genes`: the track id of its gene track, or `""` for none
- `genomes.genark` and `genomes.ucsc` are where the dialog finds a genome typed
  by accession or UCSC name. `genomes.index` is optional: a
  genomes.jbrowse.org-style `searchIndex.json`, which lets the dialog find a
  genome by its common or scientific name. The server has to allow cross-origin
  reads of it.

Where you run your own JBrowse, putting your sample names in its assemblies'
`aliases` and your sequence names in its `refNameAliases` does the same job, for
JBrowse and BandageJS alike.
