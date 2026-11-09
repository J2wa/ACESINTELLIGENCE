// Pipe a password from a secure prompt on stdin. Outputs only its salted hash.
import {hashPassword} from '../lib/passwords.mjs';
const chunks=[];for await(const c of process.stdin)chunks.push(c);
const password=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');
if(password.length<12||password.length>128)throw new Error('Use 12–128 characters.');
console.log(await hashPassword(password));
