/**
 * MIT License
 * 
 * Copyright (c) 2024 Masato Nakatsuji
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { Worker, parentPort } from "worker_threads";
import { fork, ChildProcess } from "child_process";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as fs from "fs";
import * as httpProxy from "http-proxy";

/**
 * ### LoadBalancerType
 * Enumerate the load balancing methods.
 */
export enum LoadBalancerType {
    /**
     * Round robin connection
     */
    RoundRobin = "RoundRobin",
    /**
     * Random Connection
     */
    RandomRobin = "RandomRobin",
    /**
     * Cases where the connection destination is specified arbitrarily.  
     * If you select this, you must specify **manualHandle.**
     */
    Manual = "Manual",
}

/**
 * ### LoadBalancerMode
 * Specify the connection method for each map.
 */
export enum LoadBalancerMode {
    /**
     * Using WorkerThreads.
     */
    WorkerThreads = "WorkerThreads",
    /**
     * Using ChildProcess.
     */
    ChildProcess = "ChildProcess",
    /**
     * Connect to another domain via a proxy.
     */
    Proxy = "Proxy",
}

/**
 * ### LoadBalancerMap
 * Load-balancing mapping class.
 */
export interface LoadBalancerMap {
    /**
     * ***mode*** : Specify the connection mode
     */
    mode: LoadBalancerMode,
    /**
     * ***proxy*** : Proxy Destination
     */
    proxy?: string,

    /**
     * ***clone*** : Duplicate the mapping a specified number of times  
     * Select "auto" to automatically replicate based on the number of cores in your hardware.
     */
    clone? : number | "auto",
}

class LoadBalancerMapT {
    public mode : LoadBalancerMode;
    public proxy?: string;
    public threadNo? : number;
    public worker? : Worker;
    public ChildProcess? : ChildProcess;
    public constructor(options : LoadBalancerMap) {
        this.mode = options.mode;
        this.proxy = options.proxy;
    }
}

export interface LoadBalancerServer {
    /**
     * ***type*** : The type of server you are deploying.  
     */
    type: LoadBalancerServerType,
    /**
     * ***port*** : The port number of the server to be deployed.
     */
    port: number,
    /**
     * ***ssl*** : SSL settings for the server you want to deploy.
     */
    ssl? : LoadBalancerSSL,
}

export interface LoadBalancerServerT extends LoadBalancerServer{
    http?: http.Server | https.Server,
    webSocket? : any,   
}

/**
 * ***LoadBalancerServerType``` : Enumerate the types of servers to deploy..
 */
export enum LoadBalancerServerType {
    /**
     * ***http*** : Web server with http protocol (non-SSL).
     */
    http = "http",
    /**
     * ***https*** : Web server with https protocol (SSL connection).
     */
    https = "https",
    /**
     * ***webSocket*** : Non-SSL WebSocket Server.
     */
    webSocket = "webSocket",
    /**
     * ***webSocketSSL*** : WebSocket server for SSL connections.
     */
    webSocketSSL = "webSocketSSL",
}

/**
 * ***LoadBalancerSSL*** : SSL connection setting interface
 */
export interface LoadBalancerSSL {
    /**
     * ***domain*** : SSL connection domain name.
     */
    domain: string,
    /**
     * ***key*** : SSL connection key file path.
     */
    key: string,
    /**
     * ***cert*** : SSL server certificate file path.
     */
    cert: string,
    /**
     * ***ca*** : CA intermediate certificate file paths.
     */
    ca?: Array<string>,
}

/**
 * ### LoadBalancerOption
 * Load balancer option setting interface.
 */
export interface LoadBalancerOption {

    /**
     * Load Balancing Method
     */
    type : LoadBalancerType;

    /**
     * Load Balancing Mapping List
     */
    maps : Array<LoadBalancerMap>;

    /**
     * ***servers*** : Explaining server information  
     * Port number and SSL are set for each domain
     */
    servers: Array<LoadBalancerServer>,

    /**
     * ***workPath*** : 
     */
    workPath?: string,

    /**
     * ***manualHandle*** : 
     */
    manualHandle? : (mapLength : number) => number,
}

/**
 * ### LoadBalancer
 */
export class LoadBalancer {

    private requestBuffer = {};

    private rrIndex : number = 0;

    private options : LoadBalancerOption;

    private proxy;

    private maps : Array<LoadBalancerMapT>;

   private  servers: Array<LoadBalancerServerT>;

    public constructor(options : LoadBalancerOption){
        this.options = options;
        this.proxy = httpProxy.createProxyServer({});
        this.maps = [];
        let threadNo : number = 0;

        for (let n = 0 ; n < options.maps.length ; n++) {
            const map : LoadBalancerMap = options.maps[n];
            let clone : number = 1;
            if (map.clone){
                if (map.clone == "auto") {
                    clone = os.cpus().length;
                }
                else {
                    clone = map.clone;
                }
            }
            for (let n2 = 0 ; n2 < clone ; n2++){
                let mapt : LoadBalancerMapT = new LoadBalancerMapT(map);
                mapt.threadNo = threadNo;
                threadNo++;
                this.maps.push(mapt);    
            }
        }

        for (let n = 0 ; n < this.maps.length ; n++) {
            const map : LoadBalancerMapT = this.maps[n];
                if (
                map.mode == LoadBalancerMode.WorkerThreads || 
                map.mode == LoadBalancerMode.ChildProcess
            ) {

                const sendData = {
                    cmd: "listen-start",
                    data: {
                        threadNo: map.threadNo,
                        workPath: this.options.workPath,
                    },
                };

                if (map.mode == LoadBalancerMode.WorkerThreads) {
                    map.worker = new Worker(__dirname + "/src/worker.js");
                }
                else if (map.mode == LoadBalancerMode.ChildProcess){
                    map.ChildProcess = fork(__dirname + "/src/child_process.js");
                }

                this.send(map, sendData);
                this.on(map, "message", (value)=>{
                    this.onMessage(map, value);
                });

            }
        }

        this.servers = options.servers;

        const httpList = this.getServers(LoadBalancerServerType.http);

        for (let n = 0 ; n < httpList.length ; n++){
            // http listen
            const http_ = httpList[n];
            http_.http = http.createServer((req, res)=>{
                this.serverListen(req, res);
            }).listen(http_.port);

            const wsList = this.getServers(LoadBalancerServerType.webSocket);

            for (let n2 = 0 ; n2 < wsList.length ; n2++){
                // websocket listen
                const ws_ = wsList[n2];

                // TODO....
            }
        }
    
        const httpsPortList = this.gethttpsServerPortList();

        for (let n = 0 ; n < httpsPortList.length ;n++){
            const port = httpsPortList[n];

            const httpsList = this.getServers(LoadBalancerServerType.https, port);

            // SNICallback 
            const options : https.ServerOptions = {
                SNICallback: (domain : string, callback : (err: Error, ctx) => void) => {

                    for (let n2 = 0 ; n2 < httpsList.length ; n2++) {
                        // Select a different certificate for each domain
                        const http_ : LoadBalancerServerT = httpsList[n2];

                        if (domain == http_.ssl.domain) {
                            const sslOption = {
                                key: fs.readFileSync(http_.ssl.key),
                                cert: fs.readFileSync(http_.ssl.cert),
                            };
                            // Passing the certificate to the callback.
                            callback(null, sslOption);
                        }
                    }
                }
            };

            const hs = https.createServer(options, (req, res) => {
                this.serverListen(req, res);
            });
            hs.listen(port);

            // TODO.....
        }
    }

    private gethttpsServerPortList() : Array<number> {
        let result : Array<number> = [];

        for (let n = 0 ; n < this.servers.length ; n++){
            const server = this.servers[n];

            if (server.type != LoadBalancerServerType.https) {
                continue;
            }

            if (result.indexOf(server.port) > -1){
                continue;
            }

            result.push(server.port);
        }

        return result;
    }

    private getServers(type: LoadBalancerServerType, port?: number) : Array<LoadBalancerServerT> {
        let result : Array<LoadBalancerServerT> = [];

        for (let n = 0 ; n < this.servers.length ; n++){
            const server = this.servers[n];

            if (server.type != type){
                continue;
            }

            if (port){
                if (server.port != port){
                    continue;
                }
            }

            result.push(server);
        }

        return result;
    }

    private onMessage(map : LoadBalancerMapT, value : any){
        if (!value.qid){ return; }
        if (!value.cmd){ return; }

        const buffer = this.requestBuffer[value.qid];
        if(!buffer){ return; }

        if (value.cmd == "end") {

            const h = Object.keys(value.data.headers);
            for (let n2 = 0 ; n2 < h.length ; n2++ ){
                const hName = h[n2];
                const hValue = value.data.headers[hName];
                buffer.res.setHeader(hName, hValue);
            }

            if (value.data.statusCode){
                buffer.res.statusCode = value.data.statusCode;
            }
            if (value.data.statusMessage){
                buffer.res.statusMessage = value.data.statusMessage;
            }

            buffer.res.write(value.data.body);
            buffer.res.end();
            delete this.requestBuffer[value.qid];
        }
        else if(value.cmd == "settimeout"){
            buffer.res.setTimeout(value.data);
        }        
    }

    private serverListen(req, res){
        const map : LoadBalancerMapT = this.getMap();
        if (map.mode == LoadBalancerMode.Proxy){
            // reverse proxy access...
            this.proxy.web(req, res, { target: map.proxy });
            return;
        }

        const qid = Math.random();
        this.requestBuffer[qid] = { req, res };

        const sendData = {
            url: req.url,
            method: req.method,
            headers: req.headers,
            remoteAddress: req.socket.remoteAddress,
            remortPort: req.socket.remotePort,
            remoteFamily: req.socket.remoteFamily,
        };


        this.send(map, {
            qid: qid,
            cmd: "begin",
            data: sendData,
        });

        req.on("end", ()=>{
            this.send(map, {
                qid: qid,
                cmd: "end",
                data: sendData,
            });
        });

        req.on("data", (value)=>{
            this.send(map, {
                qid: qid,
                cmd: "data",
                data: sendData,
                option: value,
            });
        });

        req.on("close", ()=>{
            this.send(map, {
                qid: qid,
                cmd: "close",
                data: sendData,
            });
        });
        req.on("error", (error : Error)=>{
            this.send(map, {
                qid: qid,
                cmd: "error",
                data: sendData,
                option: error,
            });
        });
        req.on("pause", ()=>{
            this.send(map, {
                qid: qid,
                cmd: "pause",
                data: sendData,
            });
        });
        req.on("resume",()=>{
            this.send(map, {
                qid: qid,
                cmd: "resume",
                data: sendData,
            });
        });
    }

    private getMap(type? : LoadBalancerType){
        if (!type) {
            type = this.options.type;
        }
        if (type ==LoadBalancerType.RoundRobin) {
            // Round Robin Balancing....
            if(this.rrIndex >= this.maps.length){
                this.rrIndex = 0;
            }           
            this.rrIndex++; 
            return this.maps[this.rrIndex - 1];
        }
        else if (type == LoadBalancerType.RandomRobin){
            const index = parseInt((Math.random()*1000).toString()) % this.maps.length;
            return this.maps[index];
        }
        else if (type == LoadBalancerType.Manual){
            // Manual Balancing....
            if (!this.options.manualHandle){
                return this.getMap(LoadBalancerType.RoundRobin);
            }

            const index = this.options.manualHandle(this.maps.length);
            return this.maps[index];
        }
    }

    private send(map, sendMessage){
        if (map.mode == LoadBalancerMode.WorkerThreads){
            map.worker.postMessage(sendMessage);
        }        
        else if (map.mode == LoadBalancerMode.ChildProcess){
            map.ChildProcess.send(sendMessage);
        }
    }

    private on(map: LoadBalancerMapT, event, callback){
        if (map.mode == LoadBalancerMode.WorkerThreads){
            map.worker.on(event, callback);
        }        
        else if (map.mode == LoadBalancerMode.ChildProcess){
            map.ChildProcess.on(event, callback);
        }
    }

}

interface HttpRequestSocket {
    remoteAddress : string,
    remotePort,
    remoteFamily : string,
}

export class HttpRequest {

    private qid;

    /**
     * ***url*** : 
     */
    public url : string;

    /**
     * ***method*** : 
     */
    public method : string;

    /**
     * ***headers*** : 
     */
    public headers; 

    /**
     * ***socket*** : 
     */
    public socket : HttpRequestSocket;

    private onEventHandle = {};

    public constructor(qid, data){
        this.qid = qid;
        this.url = data.url;
        this.method = data.method;
        this.headers = data.headers;
        this.socket = {
            remoteAddress : data.remoteAddress, 
            remotePort : data.remotePort, 
            remoteFamily : data.remoteFamily, 
        };
    }

    public on(event, callback){
        this.onEventHandle[event] = callback;
    }
}

export class HttpResponse {

    private qid;

    private pp;

    private headers = {};

    private text : string = "";

    private writeEnd : boolean = false

    /**
     * ***statusCode*** : 
     */
    public statusCode : number;

    /**
     * ***statusMessage*** : 
     */
    public statusMessage : string;

    public constructor(qid, req, pp?){
        this.qid = qid;
        if(pp){
            this.pp = pp;
        }
    }

    public write(text: string){
        this.text += text;
        return this;
    }

    public setHeader(name: string, value : string | number) {
        this.headers[name] = value;
        return this;
    }

    public end(){
        if (this.writeEnd){
            return;
        }
        this.writeEnd = true;
        const send = {
            qid: this.qid,
            cmd: "end",
            data: {
                body: this.text,
                statusCode: this.statusCode,
                headers: this.headers,
                statusMessage: this.statusMessage,
            },
        };
        if(this.pp){
            this.pp.postMessage(send);
        }
        else{
            process.send(send);
        }
    }
}

export class LoadBalancerThread {

    private mode : LoadBalancerMode;
    private workerFlg : boolean = false;
    public threadNo;
    private Listener;
    private requestBuffer = {};
    
    public constructor(workerFlg : boolean){
        this.workerFlg = workerFlg;
        if (this.workerFlg){
            parentPort.on("message", (value)=>{
                this.onMessage(value);
            });
        }
        else {
            process.on("message", (value)=>{
                this.onMessage(value);
            });
        }
    }

    private onMessage(value : any) {

        if (!value.cmd){ return; }
        
        if (value.cmd == "listen-start"){
            this.threadNo = value.data.threadNo;
            if (this.workerFlg){
                this.mode = LoadBalancerMode.WorkerThreads;
            }
            else {
                this.mode = LoadBalancerMode.ChildProcess;
            }
            this.Listener = require(value.data.workPath).default;
            return;
        }
    
        if (!value.qid){ return; }
    
        if (value.cmd == "begin"){
            let req, res;
            if (this.workerFlg){
                req = new HttpRequest(value.qid, value.data);
                res = new HttpResponse(value.qid, req, parentPort);    
            }
            else {
                req = new HttpRequest(value.qid, value.data);
                res = new HttpResponse(value.qid, req);    
            }
            let listener : LoadBalancerListner = new this.Listener();
            listener.mode = this.mode;
            listener.threadNo = this.threadNo;
            listener.req = req;
            listener.res = res;
            this.requestBuffer[value.qid] = listener;
            if (listener.request){
                listener.request();
            }
            return;
        }
    
        if (!this.requestBuffer[value.qid]){ return; }
    
        const listener = this.requestBuffer[value.qid];
    
        if (value.cmd=="data"){
            if (listener.onData){
                listener.onData(value.option);
            }
            if (listener.req.onEventHandle.data){
                listener.req.onEventHandle.data(value.option);
            }
        }
        else if (value.cmd == "end"){
            if (listener.onEnd){
                listener.onEnd();
            }
            if (listener.req.onEventHandle.end){
                listener.req.onEventHandle.end();
            }
        }
        else if (value.cmd == "close") {
            if (listener.onClose){
                listener.onClose();
            }
            if (listener.req.onEventHandle.close){
                listener.req.onEventHandle.close();
            }
            delete this.requestBuffer[value.qid];
        }
        else if (value.cmd == "error") {
            if (listener.onError){
                listener.onError(value.option);
            }
            if (listener.req.onEventHandle.error){
                listener.req.onEventHandle.error(value.option);
            }
            delete this.requestBuffer[value.qid];
        }
        else if (value.cmd == "pause") {
            if (listener.onPause){
                listener.onPause();
            }
            if (listener.req.onEventHandle.pause){
                listener.req.onEventHandle.pause(value.option);
            }
        }
        else if (value.cmd == "resume") {
            if (listener.onResume){
                listener.onResume();
            }
            if (listener.req.onEventHandle.resume){
                listener.req.onEventHandle.resume(value.option);
            }
        } 
    }
}

/**
 * ***LoadBalancerListner*** : Server Listen class.  
 * Export the inherited class of this class in the worker file when listening.
 */
export class LoadBalancerListner {

    /**
     * ***mode*** : Load Balancing Mode
     */
    public mode? : LoadBalancerMode;

    /**
     * ***req*** : Server Request Information.
     */
    public req? : http.IncomingMessage;

    /**
     * ***res*** : Server response information
     */
    public res? : http.ServerResponse;

    /**
     * ***threadNo*** : Thread number for load balancing.
     */
    public threadNo? : number;

    public request?() : void;

    public onData?(data : any) : void;

    public onEnd?() : void;

    public onClose?() : void;

    public onError?(error : any) : void;

    public onPause?() : void;

    public onResume?() : void;
}