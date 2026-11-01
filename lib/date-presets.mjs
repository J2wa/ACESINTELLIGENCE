import {day,weekStart} from './core.mjs';
export function datePreset(preset, today=day()) {
 switch(preset){
 case 'today':return {from:today,to:today};
 case 'week':return {from:weekStart(today),to:today};
 case 'month':return {from:today.slice(0,7)+'-01',to:today};
 case 'lifetime':return {from:'',to:''};
 default:throw new Error('Unknown date preset');
 }
}
