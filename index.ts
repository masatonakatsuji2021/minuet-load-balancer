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
import * as httpProxy from "http-proxy";

/**
 * ### LoadBalanceSelectType
 * Enumerate the load balancing methods.
 */
export enum LoadBalanceSelectType {
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
 * ### LoadBalanceconnectMode
 * Specify the connection method for each map.
 */
export enum LoadBalanceconnectMode {
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
 * ### LoadBalanceMap
 * Load-balancing mapping class.
 */
export interface LoadBalanceMap {
    /**
     * Specify the connection mode
     */
    mode: LoadBalanceconnectMode,
    /**
     * Proxy Destination
     */
    proxy?: string,
}

interface LoadBalanceMapT extends LoadBalanceMap {
    threadNo? : number,
    worker? : Worker,
    ChildProcess? : ChildProcess,
}

/**
 * ### LoadBalanceOption
 * Load balancer option setting interface.
 */
export interface LoadBalanceOption {
    /**
     * Load Balancing Method
     */
    type : LoadBalanceSelectType;
    /**
     * Load Balancing Mapping List
     */
    maps : Array<LoadBalanceMap>;
    /**
     * List of port numbers for non-SSL servers to be load balanced
     */
    ports?: Array<number>,
    /**
     * A list of port numbers for the servers that will be load balanced for SSL connections.
     */
    httpsPorts?: Array<number>,
    workPath?: string,
    manualHandle? : Function,
}

export class LoadBalancer {

    private requestBuffer = {};

    private rrIndex : number = 0;

    private options : LoadBalanceOption;

    private proxy;

    public constructor(options : LoadBalanceOption){
        this.options = options;
        this.proxy = httpProxy.createProxyServer({});
        for (let n = 0 ; n < options.maps.length ; n++) {
            const map : LoadBalanceMapT = options.maps[n];
            map.threadNo = n;
            if (
                map.mode == LoadBalanceconnectMode.WorkerThreads || 
                map.mode == LoadBalanceconnectMode.ChildProcess
            ) {

                const sendData = {
                    cmd: "listen-start",
                    data: {
                        threadNo: map.threadNo,
                        workPath: this.options.workPath,
                    },
                };

                if (map.mode == LoadBalanceconnectMode.WorkerThreads) {
                    map.worker = new Worker(__dirname + "/worker");
                }
                else if (map.mode == LoadBalanceconnectMode.ChildProcess){
                    map.ChildProcess = fork(__dirname + "/child_process");
                }

                this.send(map, sendData);
                this.on(map, "message", (value)=>{
                    this.onMessage(map, value);
                });

            }
        }

        if (options.ports){
            for (let n = 0 ; n < options.ports.length ; n++) {
                const port = options.ports[n];                
                const h = http.createServer((req, res)=>{
                    this.serverListen(req, res);
                });
                h.listen(port);
            }
        }

        if (options.httpsPorts){
            for (let n = 0 ; n < options.httpsPorts.length ; n++) {
                const port = options.httpsPorts[n];                
                const h = https.createServer((req, res)=>{
                    this.serverListen(req, res);
                });
                h.listen(port);
            }
        }
    }

    private onMessage(map : LoadBalanceMapT, value : any){
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
        else if(value.cmd == "on"){
            if (!value.event){ return; }

            buffer.req.on(value.event, (data)=>{
                this.send(map, {
                    qid: value.qid,
                    cmd: "on-receive",
                    data: data,
                });
            });
        }
        else if(value.cmd == "settimeout"){
            buffer.res.setTimeout(value.data);
        }        
    }

    private serverListen(req, res){
        const map : LoadBalanceMapT = this.getMap();
        if (map.mode == LoadBalanceconnectMode.Proxy){
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
                postbuffer: value,
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
                error: error,
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

    private getMap(type? : LoadBalanceSelectType){
        if (!type) {
            type = this.options.type;
        }
        if (type ==LoadBalanceSelectType.RoundRobin) {
            // Round Robin Balancing....
            if(this.rrIndex >= this.options.maps.length){
                this.rrIndex = 0;
            }           
            this.rrIndex++; 
            return this.options.maps[this.rrIndex - 1];
        }
        else if (type == LoadBalanceSelectType.RandomRobin){
            const index = parseInt((Math.random()*1000).toString()) % this.options.maps.length;
            return this.options.maps[index];
        }
        else if (type == LoadBalanceSelectType.Manual){
            // Manual Balancing....
            if (!this.options.manualHandle){
                return this.getMap(LoadBalanceSelectType.RoundRobin);
            }

            const index = this.options.manualHandle(this.options.maps.length);
            return this.options.maps[index];
        }
    }

    private send(map, sendMessage){
        if (map.mode == LoadBalanceconnectMode.WorkerThreads){
            map.worker.postMessage(sendMessage);
        }        
        else if (map.mode == LoadBalanceconnectMode.ChildProcess){
            map.ChildProcess.send(sendMessage);
        }
    }

    private on(map: LoadBalanceMapT, event, callback){
        if (map.mode == LoadBalanceconnectMode.WorkerThreads){
            map.worker.on(event, callback);
        }        
        else if (map.mode == LoadBalanceconnectMode.ChildProcess){
            map.ChildProcess.on(event, callback);
        }
    }

}

export class HttpRequest {

    private qid;
    public url : string;
    public method : string;
    public headers; 
    public remoteAddress : string;
    public remotePort;
    public remoteFamily : string;

    private pp;
    private onEventHandle = {};

    public constructor(qid, data, pp?){
        this.qid = qid;
        this.url = data.url;
        this.method = data.method;
        this.headers = data.headers;
        this.remoteAddress = data.remoteAddress;
        this.remotePort = data.remotePort;
        this.remoteFamily = data.remoteFamily;
        if (pp){
            this.pp = pp;
        }
    }

    public on(event, callback){
        const send = {
            qid: this.qid,
            cmd: "on",
            event: event,
        }
        if (this.pp){
            this.pp.postMessage(send);
        }
        else {
            process.send(send);           
        }
    }
}

export class HttpResponse {

    private qid;

    private pp;

    private headers = {};

    public statusCode : number;

    public statusMessage : string;

    private text : string = "";

    private writeEnd : boolean = false

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

export class LoadBalanceThread {

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
            this.Listener = require(value.data.workPath).default;
            return;
        }
    
        if (!value.qid){ return; }
    
        if (value.cmd == "begin"){
            let req, res;
            if (this.workerFlg){
                req = new HttpRequest(value.qid, value.data, parentPort);
                res = new HttpResponse(value.qid, req, parentPort);    
            }
            else {
                req = new HttpRequest(value.qid, value.data);
                res = new HttpResponse(value.qid, req);    
            }
            const listener = new this.Listener();
    
            this.requestBuffer[value.qid] = { listener, req, res };
            return;
        }
    
        if (!this.requestBuffer[value.qid]){ return; }
    
        const listener = this.requestBuffer[value.qid].listener;
        const req = this.requestBuffer[value.qid].req;
        const res = this.requestBuffer[value.qid].res;
    
        if (listener.request){
            listener.request(req, res, this.threadNo);
        }
    
        if (value.md=="data"){
            if (listener.onData){
                listener.onData(value.postbuffer, req, res, this.threadNo);
            }
        }
        else if (value.cmd == "end"){
            if (listener.onEnd){
                listener.onEnd(req, res, this.threadNo);
            }
        }
        else if (value.cmd == "close") {
            if (listener.onClose){
                listener.onClose(req, res, this.threadNo);
            }
            delete this.requestBuffer[value.qid];
        }
        else if (value.cmd == "error") {
            if (listener.onError){
                listener.onError(value.error, req, res, this.threadNo);
            }
            delete this.requestBuffer[value.qid];
        }
        else if (value.cmd == "pause") {
            if (listener.onPause){
                listener.onPause(req, res, this.threadNo);
            }
        }
        else if (value.cmd == "resume") {
            if (listener.onResume){
                listener.onResume(req, res, this.threadNo);
            }
        } 
    }
}

export interface LoadBalancerListner {

    request?(req? : http.IncomingMessage, res?: http.ServerResponse<http.IncomingMessage>, threadNo? : number) : void;

    onData?(data : any, req? : http.IncomingMessage, res?: http.ServerResponse<http.IncomingMessage>, threadNo? : number) : void,

    onEnd?(req? : http.IncomingMessage, res?: http.ServerResponse<http.IncomingMessage>, threadNo? : number) : void,

    onClose?(req? : http.IncomingMessage, res?: http.ServerResponse<http.IncomingMessage>, threadNo? : number) : void,

    onError?(error : any , req? : http.IncomingMessage, res?: http.ServerResponse<http.IncomingMessage>, threadNo? : number) : void,

    onPause?(req? : http.IncomingMessage, res?: http.ServerResponse<http.IncomingMessage>, threadNo? : number) : void,

    onResume?(req? : http.IncomingMessage, res?: http.ServerResponse<http.IncomingMessage>, threadNo? : number) : void,
}