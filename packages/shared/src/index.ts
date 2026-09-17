export function dayKey(date:Date):string {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function daysBefore(now:Date,n:number):Date {const d=new Date(now);d.setDate(d.getDate()-n);return d}
