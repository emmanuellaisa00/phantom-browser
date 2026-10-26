import initSqlJs,{type Database as SQLDatabase,type SqlValue} from 'sql.js';
import fs from 'node:fs';import path from 'node:path';
export class Database{
 private constructor(private db:SQLDatabase,readonly file:string){}
 static async open(file:string,wasmPath?:string){const SQL=await initSqlJs(wasmPath?{locateFile:()=>wasmPath}:{});fs.mkdirSync(path.dirname(file),{recursive:true});const db=new Database(new SQL.Database(fs.existsSync(file)?fs.readFileSync(file):undefined),file);db.db.run('PRAGMA foreign_keys=ON');const version=Number(db.rows('PRAGMA user_version')[0]?.user_version??0);if(version>1)throw Error('Database was created by a newer application');if(version===0)db.transaction(()=>{db.db.run(`
 CREATE TABLE profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE proxies(id TEXT PRIMARY KEY,data TEXT NOT NULL,secret BLOB);
 CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE profile_tags(profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,tag TEXT NOT NULL,PRIMARY KEY(profile_id,tag));
 CREATE INDEX tag_idx ON profile_tags(tag);
 CREATE TABLE launches(id TEXT PRIMARY KEY,profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,started_at TEXT,ended_at TEXT,outcome TEXT);
 CREATE INDEX launch_profile_idx ON launches(profile_id,started_at);
 CREATE TABLE diagnostics(id TEXT PRIMARY KEY,profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,created_at TEXT,data TEXT);
 CREATE TABLE backups(id TEXT PRIMARY KEY,profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,created_at TEXT,path TEXT,checksum TEXT);
 PRAGMA user_version=1;`);});return db;}
 rows(sql:string,params:SqlValue[]=[]):Record<string,SqlValue>[]{const statement=this.db.prepare(sql);try{statement.bind(params);const rows=[];while(statement.step())rows.push(statement.getAsObject());return rows;}finally{statement.free();}}
 run(sql:string,params:SqlValue[]=[]){this.db.run(sql,params);}
 transaction<T>(fn:()=>T):T{this.db.run('BEGIN IMMEDIATE');try{const result=fn();this.db.run('COMMIT');this.persist();return result;}catch(error){if(this.db.getRowsModified()>=0){try{this.db.run('ROLLBACK');}catch{/* commit may already have completed */}}throw error;}}
 persist(){const temp=this.file+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,Buffer.from(this.db.export()));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,this.file);}
 close(){this.persist();this.db.close();}
}
