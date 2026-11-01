import { payrollRows } from './core.mjs';

// Revenue is earned work value, not a record of money collected from clients.
export function companyProfitRows(data, rates) {
 const captured=new Map(rates.map(r=>[r.kind+':'+r.work_id,r.rate_cents]));
 return payrollRows(data).map(line=>{
  const key=line.time_entry_id?'time:'+line.time_entry_id:'task:'+line.task_id;
  const rate=captured.get(key), priced=typeof rate==='number';
  const revenue=priced?Math.round(line.units*rate):null;
  const task=data.tasks.find(t=>t.id===line.task_id);
  return {...line,account_id:task?.account_id??null,task_status:task?.status??line.status,client_rate_cents:priced?rate:null,revenue_cents:revenue,profit_cents:priced?revenue-line.cents:null,approved:!!line.paid_invoice_id||line.status==='APPROVED'};
 });
}
export function profitSummary(rows,filters={}) {
 const selected=rows.filter(r=>(!filters.from||r.date>=filters.from)&&(!filters.to||r.date<=filters.to)&&(!filters.project||r.project_id===filters.project)&&(!filters.employee||r.user_id===filters.employee)&&(!filters.account||r.account_id===filters.account)&&(!filters.status||r.task_status===filters.status)&&r.approved);
 const groups=new Map();
 for(const row of selected) {
  const key=row.project_id+':'+row.pay_basis;
  if(!groups.has(key))groups.set(key,{project_id:row.project_id,pay_basis:row.pay_basis,units:0,revenue_cents:0,employee_cents:0,profit_cents:0,unpriced:0});
  const group=groups.get(key);
  if(row.revenue_cents===null){group.unpriced++;continue;}
  group.units+=row.units;group.revenue_cents+=row.revenue_cents;group.employee_cents+=row.cents;group.profit_cents+=row.profit_cents;
 }
 return [...groups.values()];
}
