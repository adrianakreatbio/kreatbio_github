# Methods (Auto-Draft)

Generated on 2026-08-10.

## Workflow

ONT long-read amplicon data targeting the approximately 1.5 kb full-length bacterial 16S rRNA gene were processed using forward primer AGAGTTTGATCMTGGCTCAG and reverse primer TACGGYTACCTTGTTACGACTT. Reads were quality-profiled with NanoPlot, primer-trimmed with Cutadapt, and filtered with Chopper to retain reads matching the configured quality and full-length amplicon length thresholds. Filtered reads were screened for chimeras with VSEARCH using full-length dereplication and de novo chimera detection with uchime_denovo. De novo feature inference was performed with FOI NanoPulse without BLAST-based or Kraken2-based taxonomic pre-assignment. Per-sample NanoPulse cluster representatives were pooled and clustered at 99% identity with VSEARCH to generate shared 99% clustered features/OTUs, and chimeric cohort representatives were removed with VSEARCH uchime_denovo. This assay is designed to detect bacteria using full-length 16S primers, but archaeal assignments may appear in the results when classified by the database. Features classified under domain Bacteria or Archaea were retained for feature-level taxonomy, diversity, phylogeny, and PICRUSt2 analysis; domain-unclassified, mitochondrial, chloroplast, eukaryotic, and other configured off-target features were removed. Taxonomy was assigned using QIIME 2 with the configured SILVA full-length 16S classifier on the final feature table. Putative species-level profiling was performed separately using EMU. Representative sequences were aligned with MAFFT and rooted phylogenetic trees were inferred with FastTree through QIIME 2. Alpha diversity was assessed using Shannon, Simpson, Faith phylogenetic diversity, and Pielou evenness with Kruskal-Wallis group testing where applicable. Beta diversity was assessed using Bray-Curtis, weighted UniFrac, and unweighted UniFrac distances with PCoA ordination, PERMANOVA, and PERMDISP. Taxonomic differential abundance at family, genus, and species levels was assessed from the EMU estimated-count column aggregated by rank, rounded to non-negative integers with zeros retained, using ALDEx2 with mc.samples=128, denom=all, and Welch-test FDR correction within each pairwise contrast when group replication was sufficient. EMU reportable taxonomy tables used minimum relative abundance 0.005 and minimum estimated reads 10. PICRUSt2 was used to predict community-level functional potential from a singleton-filtered, 97% clustered representative-sequence input, with EC, KO, and MetaCyc pathway outputs retained with NSTI tracking. Differential abundance was assessed using ALDEx2 in R.

## Key Run Parameters

- `aldex2_denom`: `all`
- `aldex2_mc_samples`: `128`
- `analysis_group_column`: `group`
- `auto_rehydrate_dbs`: `True`
- `basecaller_model`: `Dorado v2.1.1`
- `blank_enrichment_ratio`: `5.0`
- `blank_min_rel_abundance`: `0.001`
- `chopper_bin`: `chopper`
- `cleanup_on_success`: `True`
- `control_sample_types`: `blank,negative_control,ntc`
- `cutadapt_bin`: `cutadapt`
- `cutadapt_min_length`: `1`
- `emu_bin`: `emu`
- `emu_database_build`: `v3.6.2`
- `emu_database_date`: `September 17, 2020`
- `emu_database_name`: `default EMU database`
- `emu_db`: `EMU database`
- `emu_min_abundance`: `0.0001`
- `emu_report_min_reads`: `10`
- `emu_report_min_rel_abundance`: `0.005`
- `emu_threads`: `8`
- `emu_top_species_n`: `30`
- `feature_backend`: `foi_nanopulse`
- `functional_group_column`: `group`
- `functional_min_samples_per_group`: `2`
- `functional_top_ec_n`: `30`
- `functional_top_ko_n`: `30`
- `functional_top_pathway_n`: `30`
- `input_data_root`: `input_data`
- `keep_local_release_files`: `True`
- `keep_temp`: `False`
- `legacy_feature_backend`: `vsearch_otu_legacy`
- `max_read_length`: `1700`
- `memory_gb_default`: `32`
- `metadata_tsv`: `metadata.tsv`
- `min_read_length`: `1300`
- `min_read_qscore`: `15`
- `min_taxon_prevalence_rel_abundance`: `0.001`
- `min_taxon_prevalence_samples`: `2`
- `min_taxon_single_sample_rel_abundance`: `0.005`
- `multiqc_bin`: `multiqc`
- `nanoplot_bin`: `NanoPlot`
- `nanopulse_cmd_template`: `JAVA_CMD=/home/pop/miniconda3/pkgs/openjdk-25.0.2-ha668962_0/lib/jvm/bin/java NXF_HOME={workdir}/.nextflow /home/pop/ngs/tools/nextflow-25.10.0/nextflow run /home/pop/ngs/tools/NanoPulse -profile conda,lowmem_optimized --input {input_csv} --outdir {workdir}/nanopulse_results -work-dir {workdir}/nextflow_work --enable_blast false --enable_kraken2 false --multiqc false --enable_pca false --kmer_size 7 --kmer_output_format tsv --umap_set_size {umap_set_size} --min_read_length {min_read_length} --max_read_length {max_read_length} --avg_amplicon_size 1.5k --genome_size 1.5k --min_cluster_size 10 --min_samples 3 --max_cpus 1 --max_memory 28.GB`
- `nanopulse_consensus_glob`: `consensus/*_all_consensus.fasta,consensus/*.fasta,*_all_consensus.fasta,*consensus*.fasta,*consensus*.fa`
- `nanopulse_table_glob`: `abundances/*_abundances.csv,*_abundances.csv,*abundance*.csv,*abundances*.csv,*abundance*.tsv,*table*.tsv,feature_table.tsv,cluster_abundance.tsv`
- `nanopulse_umap_cap_high`: `10000`
- `nanopulse_umap_cap_low`: `5000`
- `nanopulse_umap_cap_mid`: `7000`
- `nanopulse_umap_high_min_reads`: `10000`
- `nanopulse_umap_mid_min_reads`: `5000`
- `nanostat_bin`: `NanoStat`
- `offtarget_taxa_patterns`: `mitochondria,mitochondrion,chloroplast,eukaryota,metazoa,viridiplantae,bivalvulida,cnidaria,myxozoa`
- `picrust2_cluster_identity`: `0.97`
- `picrust2_coverage`: `False`
- `picrust2_epa_chunk_size`: `500`
- `picrust2_hsp_method`: `pic`
- `picrust2_in_traits`: `EC,KO`
- `picrust2_max_nsti`: `2.0`
- `picrust2_min_align`: `0.8`
- `picrust2_min_total_abundance`: `2`
- `picrust2_per_sequence_contrib`: `False`
- `picrust2_pipeline_bin`: `picrust2_pipeline.py`
- `picrust2_python_bin`: `python`
- `picrust2_reverse_complement_input`: `True`
- `picrust2_rscript_bin`: `Rscript`
- `picrust2_stratified`: `False`
- `picrust2_threads`: `8`
- `pipeline_name`: `pipeline_amp_nano_bac_16sfl_v2`
- `primary_cohort_cluster_identity`: `0.99`
- `primer_fwd`: ``
- `primer_profile`: `nano_fl_bac`
- `primer_registry_tsv`: `amplicon_primers.tsv`
- `primer_rev`: ``
- `prune_local_after_publish`: `False`
- `publish_to_static_on_success`: `False`
- `qiime_bin`: `qiime`
- `qiime_classifier_qza`: `silva-138-2-full-length-classifier.qza`
- `qiime_classifier_qza_gcs_uri`: `silva-138-2-full-length-classifier.qza`
- `qiime_n_jobs`: `8`
- `report_llm_model`: `gpt-4.1-mini`
- `report_llm_timeout_sec`: `45`
- `report_logo_path`: ``
- `report_prompt_file`: ``
- `report_use_openai_api`: `False`
- `results_dir`: `output`
- `run_multiqc`: `True`
- `samples_tsv`: `110000000.pipeline_amp_nano_bac_16sfl_v2.samples.tsv`
- `sampling_depth`: `auto`
- `sampling_depth_ladder`: `800,900,1000,1500,2000,3000,5000,10000,15000,20000,30000,50000`
- `sequencing_flow_cell_chemistry`: `R10.4.1`
- `sequencing_instrument`: `MinION`
- `sequencing_library_kit`: `Ligation Sequencing Kit V14 (SQK-LSK114)`
- `static_storage_uri`: `analysis`
- `taxa_barplot_top_n`: `20`
- `taxa_heatmap_top_n`: `30`
- `threads_default`: `8`
- `vsearch_bin`: `vsearch`

## Software Versions

- NanoPlot: NanoPlot 1.46.2
- cutadapt: 5.1
- chopper: chopper 0.11.0
- vsearch: vsearch v2.22.1_linux_x86_64, 31.4GB RAM, 8 cores
- qiime: q2cli version 2026.1.0
- mafft: v7.526 (2024/Apr/26)
- FastTree: FastTree 2.2.0 Double precision:
- multiqc: multiqc, version 1.33
- python: Python 3.10.14
- Rscript: Rscript (R) version 4.5.3 (2026-03-11)
- picrust2_pipeline.py: PICRUSt2 2.6.3
- ALDEx2: 1.42.0
- emu: emu v3.6.2

## Summary Statistics

- Median Shannon diversity: `2.4822`
- PERMANOVA p-value: `1`

- Median Faith PD: `2.898045556386933`
- Samples below rarefaction depth: `0`
- EMU taxonomy ALDEx2 status: `FAMILY=ok_pairwise; FAMILY=ok_pairwise; FAMILY=ok_pairwise; GENUS=ok_pairwise; GENUS=ok_pairwise; GENUS=ok_pairwise; SPECIES=ok_pairwise; SPECIES=ok_pairwise; SPECIES=ok_pairwise`

## Functional Summary

- Predicted EC features: `2108.0`
- Predicted KO features: `6066.0`
- Predicted pathways: `394.0`
- Median weighted NSTI: `0.0900341840187402`
- PICRUSt2 interpretation: predicted community functional potential from a separate singleton-filtered, 97% clustered 16S input, not measured metagenomic genes or feature-level function.
- ALDEx2 status: `EC=ok_pairwise; EC=ok_pairwise; EC=ok_pairwise; KO=ok_pairwise; KO=ok_pairwise; KO=ok_pairwise; PATHWAY=ok_pairwise; PATHWAY=ok_pairwise; PATHWAY=ok_pairwise`

## Citations

Citations table: `client_supplements/example1/output/o7_run_metadata/citations.tsv`
