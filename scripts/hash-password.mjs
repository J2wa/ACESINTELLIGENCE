// Pipe a password from a secure prompt on stdin. Outputs only its salted hash.
import { randomBytes, pbkdf2Sync } from 'node:crypto';
const chunks=[];for await(const c of process.stdin)chunks.push(c);
const password=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');
if(password.length<12||password.length>128)throw new Error('Use 12–128 characters.');
const salt=randomBytes(32).toString('hex');
console.log('pbkdf2$100000$'+salt+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'));
