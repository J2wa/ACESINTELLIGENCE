import {readFileSync} from 'node:fs';
export const RESEARCH_PROMPT=readFileSync(new URL('../prompts/ai1-research.md',import.meta.url),'utf8');
export const COPY_PROMPT=readFileSync(new URL('../prompts/ai2-copy.md',import.meta.url),'utf8');
export const FACT_SHEET=JSON.parse(readFileSync(new URL('../config/fact_sheet.yaml',import.meta.url),'utf8'));
