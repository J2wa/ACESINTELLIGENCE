import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const root=new URL('../',import.meta.url).pathname, pub=path.join(root,'public'), origin='https://acesintelligence.xyz';
const header=await readFile(path.join(root,'templates/header.html'),'utf8'),footer=await readFile(path.join(root,'templates/footer.html'),'utf8');
async function files(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat();}
const strip=s=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const urls=[];
for(const file of (await files(pub)).filter(f=>f.endsWith('.html'))){
 let html=await readFile(file,'utf8');const relative=path.relative(pub,file).replaceAll('\\','/');const route=relative==='index.html'?'/':'/'+relative.replace(/\.html$/,'');
 html=html.replace(/<header[\s\S]*?<\/header>/,()=>header).replace(/<footer[\s\S]*?<\/footer>/,()=>footer);
 if(route==='/'){
  html=html.replace(/<title>.*?<\/title>/,'<title>RLHF, AI Evaluation & Data Annotation Philippines | Aces Intelligence</title>');
  html=html.replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="Aces Intelligence: Philippines-based RLHF, model evaluation and multimodal data annotation services. Human expertise. Better AI. Scope a focused pilot.">');
 }
 if(route==='/inquiry')html=html.replace(/<title>.*?<\/title>/,'<title>Get a Quote for AI Data & Evaluation | Aces Intelligence</title>');
 const title=strip(html.match(/<title>(.*?)<\/title>/s)?.[1]||''),description=html.match(/<meta name="description" content="([^"]*)"/)?.[1]||'';
 html=html.replace(/<!-- SEO:start -->[\s\S]*?<!-- SEO:end -->/g,'');
 const privateRoute=route==='/team-login';const canonical=origin+route;
 let tags=`<!-- SEO:start --><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:site_name" content="Aces Intelligence"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${origin}/share-card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Aces Intelligence. Human expertise. Better AI."><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${origin}/share-card.png"><meta name="twitter:image:alt" content="Aces Intelligence. Human expertise. Better AI.">`;
 if(privateRoute)tags+='<meta name="robots" content="noindex,nofollow">';
 const graph=[{'@type':'Organization','@id':origin+'/#organization',name:'Aces Intelligence',url:origin,logo:origin+'/brand.svg',sameAs:['https://www.linkedin.com/company/aces-intelligence']}];
 const faqs=[...html.matchAll(/<details class="faq"><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/gs)].map(m=>({'@type':'Question',name:strip(m[1]),acceptedAnswer:{'@type':'Answer',text:strip(m[2])}}));
 if(faqs.length)graph.push({'@type':'FAQPage','@id':canonical+'#faq',mainEntity:faqs});
 tags+='<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':graph}).replaceAll('<','\\u003c')+'</script>';
 tags+='<link rel="icon" href="/brand.svg" type="image/svg+xml"><script src="/analytics-config.js" defer></script><script src="/analytics.js" defer></script><!-- SEO:end -->';
 html=html.replace('</head>',tags+'</head>');await writeFile(file,html);if(!privateRoute)urls.push(canonical);
}
await writeFile(path.join(pub,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.sort().map(url=>`<url><loc>${url}</loc></url>`).join('')+'</urlset>');
await writeFile(path.join(pub,'robots.txt'),'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /team-login\nSitemap: '+origin+'/sitemap.xml\n');
await writeFile(path.join(pub,'analytics-config.js'),`window.ACES_ANALYTICS_ENABLED=${process.env.ANALYTICS_ENABLED==='true'};\n`);
console.log(`Prepared ${urls.length} indexable pages with canonical, social and structured metadata.`);
