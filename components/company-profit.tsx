'use client';
import { profitSummary } from '@/lib/profit-core.mjs';
import { PAY_BASES } from '@/lib/core.mjs';
type Row=Record<string,any>;
const money=(cents:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(cents/100);
export default function CompanyProfit({data,filters}:{data:Row;filters:Row}) {
 const groups=profitSummary(data.profit_rows??[],filters);
 const totals=groups.reduce((sum:Row,g:Row)=>({revenue:sum.revenue+g.revenue_cents,pay:sum.pay+g.employee_cents,profit:sum.profit+g.profit_cents,unpriced:sum.unpriced+g.unpriced}),{revenue:0,pay:0,profit:0,unpriced:0});
 return <>
  <div className="stats-grid profit-stats">
   <article className="stat-card"><div className="stat-label">Client revenue</div><div className="stat-value money-value">{money(totals.revenue)}</div><div className="stat-foot">Approved and paid work with a client rate</div></article>
   <article className="stat-card"><div className="stat-label">Employee pay</div><div className="stat-value money-value">{money(totals.pay)}</div><div className="stat-foot">Cost of the same work</div></article>
   <article className="stat-card"><div className="stat-label">Company gross profit</div><div className="stat-value money-value">{money(totals.profit)}</div><div className="stat-foot">Client revenue minus employee pay</div></article>
  </div>
  <p className="earnings-scope">Based on rates captured when work was logged. Revenue is the value of approved work, not client payments received. Gross profit excludes other business expenses.</p>
  {!!totals.unpriced && <div className="notice">{totals.unpriced} work line{totals.unpriced===1?'':'s'} without a captured client rate are excluded from these totals. Set client rates in Projects for future work.</div>}
  <section className="card"><div className="table-scroll"><table><thead><tr><th>Project</th><th>Pay basis</th><th>Priced units</th><th>Client revenue</th><th>Employee pay</th><th>Gross profit</th><th>Unpriced lines</th></tr></thead><tbody>{groups.map((g:Row)=><tr key={g.project_id+g.pay_basis}><td>{data.projects.find((p:Row)=>p.id===g.project_id)?.name??'Project'}</td><td>{PAY_BASES[g.pay_basis as keyof typeof PAY_BASES]}</td><td>{g.units.toLocaleString('en-PH',{maximumFractionDigits:4})}</td><td>{money(g.revenue_cents)}</td><td>{money(g.employee_cents)}</td><td>{money(g.profit_cents)}</td><td>{g.unpriced||'—'}</td></tr>)}</tbody></table></div>{!groups.length&&<div className="empty"><p>No approved or paid work in this selection.</p></div>}</section>
 </>;
}
