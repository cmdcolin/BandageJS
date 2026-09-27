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

The page binds the reference to an assembly in one of two ways:

- **By name.** The reference's PanSN sample (`GRCh38`) or haplotype
  (`HG00097#1`) is the name or an alias of an assembly in a hub. UCSC's names
  also match the samples they stand for: hg38 is GRCh38, and hs1 is CHM13.
- **By declaration.** You choose the assembly in Display → Reference assembly…,
  or a link or example names it.

A reference with bare contig names (`SN:Z:chr6`), or a sample no hub knows, gets
no genes until you choose its assembly. The Genes item in Display says why.

"Draw x along" moves the reference to another walk, and the binding follows it.
Draw a CHM13 cut along its GRCh38 walk and the page reads hg38's genes. Draw it
back and it reads CHM13's again.

## Hubs

A hub is any JBrowse `config.json`. The page reads each hub's assemblies, their
aliases, their contig name tables (`refNameAliases`) and their gene tracks. It
checks hubs in order and binds to the first assembly that matches:

1. hubs named by the page's link (`?hub=`)
2. hubs you added in Display → Reference assembly…, which the browser remembers
3. the defaults: the
   [HPRC release 2 portal](https://jbrowse.org/pangenome/hprc-grch38/config.json),
   with hg38 and every HPRC haplotype, then
   [UCSC's hs1](https://jbrowse.org/ucsc/hs1/config.json), T2T-CHM13

Any genome on [genomes.jbrowse.org](https://genomes.jbrowse.org) works as a hub.
Each UCSC or GenArk genome has a `config.json` under
`https://jbrowse.org/ucsc/<db>/` or `https://jbrowse.org/hubs/genark/…/`. The E.
coli examples use GenArk's K-12 MG1655 hub.

A hub's gene track is the first of its tabix GFF3 or BED feature tracks on the
assembly. The page prefers the config's default session, then tracks whose name
says genes. Choose another under Genes in the Reference assembly dialog. The
page doesn't read bigBed gene tracks yet.

## Contig names

The page looks a contig up in the gene track under every name the assembly's
alias table gives it. That lets a graph's `chr1` find hs1's `NC_060925.1`.

Where the graph names a contig something the assembly doesn't, such as a pggb
graph's `K12#1#chr`, give the assembly's name under "Sequence names" as
`graph:assembly` pairs: `chr:NC_000913.3`.

## Links

The page's address keeps what you declared, so a shared link opens on the same
assembly:

| Parameter  | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| `hub`      | a JBrowse `config.json` to check first; repeat it for more |
| `assembly` | the assembly the reference is on, by name or alias         |
| `contigs`  | `graph:assembly` contig names, comma separated             |

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
