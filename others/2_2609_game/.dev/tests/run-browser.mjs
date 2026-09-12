import {spawnSync} from 'node:child_process';
for(const file of ['browser','phone','accessibility','audio','auto-return','production']) {
 const result=spawnSync(process.execPath,[`tests/${file}.mjs`],{stdio:'inherit',env:process.env});
 if(result.status!==0)process.exit(result.status??1);
}
