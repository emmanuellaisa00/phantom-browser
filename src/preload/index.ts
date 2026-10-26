import {contextBridge,ipcRenderer} from 'electron';import {requestSchema,replySchema,type Request,type PhantomAPI} from '../shared/schema';
const api:PhantomAPI=Object.freeze({request:async (request:Request)=>{const value=requestSchema.parse(request);return replySchema.parse(await ipcRenderer.invoke('phantom:request',value));}});
contextBridge.exposeInMainWorld('phantom',api);
