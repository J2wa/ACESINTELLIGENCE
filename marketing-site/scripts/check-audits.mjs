import fs from 'node:fs';
for(const name of ['after-mobile.report.json','after-desktop.report.json','inquiry-a11y.json','careers-a11y.json']){
 const report=JSON.parse(fs.readFileSync('reports/'+name,'utf8'));
 if(report.runtimeError)throw Error(`${name}: ${report.runtimeError.message}`);
 console.log(name,Object.fromEntries(Object.entries(report.categories).map(([k,v])=>[k,v.score])));
 if(report.categories.performance&&report.categories.performance.score<.9)throw Error(name+': performance below 90');
 if(report.categories.accessibility.score<1)throw Error(name+': accessibility findings require review');
}
