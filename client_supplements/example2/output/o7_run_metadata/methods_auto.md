# Methods (Auto-Draft)

Generated on 2026-09-21.

## Workflow

Illumina paired-end bacterial 16S V3-V4 reads were quality checked with FastQC/MultiQC, primer trimmed with Cutadapt, quality filtered with fastp, denoised with DADA2, and screened for chimeras before feature-level analysis. Taxonomy was assigned with QIIME 2 feature-classifier using the configured SILVA classifier. Representative sequences were aligned with MAFFT and rooted phylogenetic trees were inferred with FastTree through QIIME 2 where applicable. Alpha and beta diversity summaries were generated only for valid community analyses with sufficient sample structure. PICRUSt2 was used for bacterial functional prediction from a singleton-filtered, 97% clustered representative-sequence input, with EC, KO, MetaCyc pathway, and NSTI outputs retained where prediction quality was acceptable. Differential taxonomic and predicted functional abundance was assessed using ALDEx2 when group replication was sufficient.

## Key Run Parameters

- `analysis_group_column`: `group`
- `asv_min_length`: `350`
- `auto_rehydrate_dbs`: `True`
- `blank_enrichment_ratio`: `5.0`
- `blank_min_rel_abundance`: `0.001`
- `cleanup_on_success`: `true`
- `control_sample_types`: `blank,negative_control,ntc`
- `cutadapt_bin`: `/home/pop/miniconda3/envs/env_qiime2-amplicon-2026.1/bin/cutadapt`
- `cutadapt_min_length`: `100`
- `dada2_max_ee_f`: `2.0`
- `dada2_max_ee_r`: `2.0`
- `dada2_n_reads_learn`: `200000`
- `dada2_trim_left_f`: `0`
- `dada2_trim_left_r`: `0`
- `dada2_trunc_len_f`: `240`
- `dada2_trunc_len_r`: `220`
- `dada2_trunc_q`: `2`
- `fastp_bin`: `/home/pop/miniconda3/envs/env_fastp/bin/fastp`
- `fastp_qual`: `20`
- `fastp_unqual_pct`: `30`
- `fastqc_bin`: `/home/pop/miniconda3/envs/env_fastqc/bin/fastqc`
- `feature_backend`: `qiime2_dada2_paired`
- `functional_group_column`: `group`
- `functional_min_samples_per_group`: `2`
- `functional_top_ec_n`: `30`
- `functional_top_ko_n`: `30`
- `functional_top_pathway_n`: `30`
- `git_commit`: `unknown`
- `input_data_root`: ``
- `input_mode`: `paired`
- `keep_local_release_files`: `True`
- `keep_temp`: `false`
- `memory_gb_default`: `32`
- `metadata_tsv`: `/home/pop/ngs/data/clients26/120000001/input_data/metadata.tsv`
- `min_len`: `100`
- `min_taxon_prevalence_rel_abundance`: `0.001`
- `min_taxon_prevalence_samples`: `2`
- `min_taxon_single_sample_rel_abundance`: `0.005`
- `multiqc_bin`: `/home/pop/miniconda3/envs/env_multiqc/bin/multiqc`
- `offtarget_taxa_patterns`: `mitochondria,mitochondrion,chloroplast,eukaryota,archaea,metazoa,viridiplantae`
- `picrust2_cluster_identity`: `0.97`
- `picrust2_epa_chunk_size`: `500`
- `picrust2_hsp_method`: `pic`
- `picrust2_in_traits`: `EC,KO`
- `picrust2_max_nsti`: `2.0`
- `picrust2_min_align`: `0.3`
- `picrust2_min_total_abundance`: `2`
- `picrust2_pipeline_bin`: `/home/pop/miniconda3/envs/env_picrust2/bin/picrust2_pipeline.py`
- `picrust2_python_bin`: `/home/pop/miniconda3/envs/env_qiime2-amplicon-2026.1/bin/python`
- `picrust2_rscript_bin`: `/home/pop/miniconda3/envs/env_picrust2/bin/Rscript`
- `picrust2_threads`: `8`
- `pipeline_name`: `illu_bac16sv34`
- `pipeline_version`: `v1`
- `primer_fwd`: `CCTACGGGNGGCWGCAG`
- `primer_profile`: `illu_bac16s_v34`
- `primer_registry_tsv`: `/home/pop/ngs/pipeline_260731/primers/amplicon_primers.tsv`
- `primer_rev`: `GACTACHVGGGTATCTAATCC`
- `prune_local_after_publish`: `False`
- `publish_to_static_on_success`: `False`
- `python_bin`: `/home/pop/miniconda3/envs/env_qiime2-amplicon-2026.1/bin/python`
- `qiime_bin`: `/home/pop/miniconda3/envs/env_qiime2-amplicon-2026.1/bin/qiime`
- `qiime_classifier_qza`: `/home/pop/ngs/db/classifier/silva-138.2-v3v4-classifier.qza`
- `qiime_classifier_qza_gcs_uri`: ``
- `qiime_n_jobs`: `8`
- `raw_dir`: `/home/pop/ngs/data/clients26/120000001/raw`
- `region`: `v3v4`
- `report_logo_path`: `kb_logo.png`
- `results_dir`: `/home/pop/ngs/data/clients26/120000001/output`
- `run_id`: ``
- `run_multiqc`: `True`
- `run_picrust2`: `True`
- `samples_tsv`: `/home/pop/ngs/data/clients26/120000001/input_data/.autogen/120000001.illu_bac16sv34.samples.tsv`
- `sampling_depth`: `auto`
- `sampling_depth_ladder`: `800,900,1000,1500,2000,3000,5000,10000,15000,20000,30000,50000`
- `silva_version`: `138.2`
- `source_host`: `koda123`
- `static_storage_uri`: `gs://koda123/analysis`
- `taxa_barplot_top_n`: `20`
- `taxa_heatmap_top_n`: `20`
- `taxonomy_database`: `SILVA`
- `threads_default`: `8`
- `vsearch_bin`: `/home/pop/miniconda3/envs/env_qiime2-amplicon-2026.1/bin/vsearch`

## Software Versions

- FastQC: FastQC v0.12.1
- cutadapt: 5.1
- fastp: fastp 1.1.0
- qiime: q2cli version 2026.1.0
- mafft: v7.526 (2024/Apr/26)
- FastTree: FastTree 2.2.0 Double precision:
- multiqc: multiqc, version 1.33
- python: Python 3.10.14
- Rscript: Rscript (R) version 4.5.3 (2026-03-11)
- picrust2_pipeline.py: PICRUSt2 2.6.3
- ALDEx2: 1.42.0

## Summary Statistics

- Median Shannon diversity: `3.8151`
- PERMANOVA p-value: `0.01`

- Median Faith PD: `18.215779870955146`
- Samples below rarefaction depth: `0`
- Taxonomy ALDEx2 status: `FAMILY=ok_pairwise; GENUS=ok_pairwise; SPECIES=ok_pairwise`

## Functional Summary

- Predicted EC features: `3027.0`
- Predicted KO features: `9434.0`
- Predicted pathways: `552.0`
- Median weighted NSTI: `0.0343928535486041`
- PICRUSt2 interpretation: predicted community functional potential from a separate singleton-filtered, 97% clustered 16S input, not measured metagenomic genes or feature-level function.
- ALDEx2 status: `EC=ok_pairwise; KO=ok_pairwise; PATHWAY=ok_pairwise`

## Citations

Citations table: `/home/pop/ngs/data/clients26/120000001/raw/master_group/o_release/citations.tsv`
