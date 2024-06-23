"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoadBalancerListner = exports.LoadBalancerThread = exports.HttpResponse = exports.HttpRequest = exports.LoadBalancer = exports.LoadBalancerServerType = exports.LoadBalancerMode = exports.LoadBalancerType = void 0;
const worker_threads_1 = require("worker_threads");
const child_process_1 = require("child_process");
const http = require("http");
const https = require("https");
const os = require("os");
const fs = require("fs");
const httpProxy = require("http-proxy");
/**
 * ### LoadBalancerType
 * Enumerate the load balancing methods.
 */
var LoadBalancerType;
(function (LoadBalancerType) {
    /**
     * Round robin connection
     */
    LoadBalancerType["RoundRobin"] = "RoundRobin";
    /**
     * Random Connection
     */
    LoadBalancerType["RandomRobin"] = "RandomRobin";
    /**
     * Cases where the connection destination is specified arbitrarily.
     * If you select this, you must specify **manualHandle.**
     */
    LoadBalancerType["Manual"] = "Manual";
})(LoadBalancerType || (exports.LoadBalancerType = LoadBalancerType = {}));
/**
 * ### LoadBalancerMode
 * Specify the connection method for each map.
 */
var LoadBalancerMode;
(function (LoadBalancerMode) {
    /**
     * Using WorkerThreads.
     */
    LoadBalancerMode["WorkerThreads"] = "WorkerThreads";
    /**
     * Using ChildProcess.
     */
    LoadBalancerMode["ChildProcess"] = "ChildProcess";
    /**
     * Connect to another domain via a proxy.
     */
    LoadBalancerMode["Proxy"] = "Proxy";
})(LoadBalancerMode || (exports.LoadBalancerMode = LoadBalancerMode = {}));
class LoadBalancerMapT {
    constructor(options) {
        this.mode = options.mode;
        this.proxy = options.proxy;
    }
}
/**
 * ***LoadBalancerServerType``` : Enumerate the types of servers to deploy..
 */
var LoadBalancerServerType;
(function (LoadBalancerServerType) {
    /**
     * ***http*** : Web server with http protocol (non-SSL).
     */
    LoadBalancerServerType["http"] = "http";
    /**
     * ***https*** : Web server with https protocol (SSL connection).
     */
    LoadBalancerServerType["https"] = "https";
    /**
     * ***webSocket*** : Non-SSL WebSocket Server.
     */
    LoadBalancerServerType["webSocket"] = "webSocket";
    /**
     * ***webSocketSSL*** : WebSocket server for SSL connections.
     */
    LoadBalancerServerType["webSocketSSL"] = "webSocketSSL";
})(LoadBalancerServerType || (exports.LoadBalancerServerType = LoadBalancerServerType = {}));
/**
 * ### LoadBalancer
 */
class LoadBalancer {
    constructor(options) {
        this.requestBuffer = {};
        this.rrIndex = 0;
        this.options = options;
        this.proxy = httpProxy.createProxyServer({});
        this.maps = [];
        let threadNo = 0;
        for (let n = 0; n < options.maps.length; n++) {
            const map = options.maps[n];
            let clone = 1;
            if (map.clone) {
                if (map.clone == "auto") {
                    clone = os.cpus().length;
                }
                else {
                    clone = map.clone;
                }
            }
            for (let n2 = 0; n2 < clone; n2++) {
                let mapt = new LoadBalancerMapT(map);
                mapt.threadNo = threadNo;
                threadNo++;
                this.maps.push(mapt);
            }
        }
        for (let n = 0; n < this.maps.length; n++) {
            const map = this.maps[n];
            if (map.mode == LoadBalancerMode.WorkerThreads ||
                map.mode == LoadBalancerMode.ChildProcess) {
                const sendData = {
                    cmd: "listen-start",
                    data: {
                        threadNo: map.threadNo,
                        workPath: this.options.workPath,
                        option: this.options.option,
                    },
                };
                if (map.mode == LoadBalancerMode.WorkerThreads) {
                    map.worker = new worker_threads_1.Worker(__dirname + "/src/worker.js");
                }
                else if (map.mode == LoadBalancerMode.ChildProcess) {
                    map.ChildProcess = (0, child_process_1.fork)(__dirname + "/src/child_process.js");
                }
                this.send(map, sendData);
                this.on(map, "message", (value) => {
                    this.onMessage(map, value);
                });
            }
        }
        this.servers = options.servers;
        const httpList = this.getServers(LoadBalancerServerType.http);
        for (let n = 0; n < httpList.length; n++) {
            // http listen
            const http_ = httpList[n];
            http_.http = http.createServer((req, res) => {
                this.serverListen(req, res);
            }).listen(http_.port);
            const wsList = this.getServers(LoadBalancerServerType.webSocket);
            for (let n2 = 0; n2 < wsList.length; n2++) {
                // websocket listen
                const ws_ = wsList[n2];
                // TODO....
            }
        }
        const httpsPortList = this.gethttpsServerPortList();
        for (let n = 0; n < httpsPortList.length; n++) {
            const port = httpsPortList[n];
            const httpsList = this.getServers(LoadBalancerServerType.https, port);
            // SNICallback 
            const options = {
                SNICallback: (domain, callback) => {
                    for (let n2 = 0; n2 < httpsList.length; n2++) {
                        // Select a different certificate for each domain
                        const http_ = httpsList[n2];
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
    gethttpsServerPortList() {
        let result = [];
        for (let n = 0; n < this.servers.length; n++) {
            const server = this.servers[n];
            if (server.type != LoadBalancerServerType.https) {
                continue;
            }
            if (result.indexOf(server.port) > -1) {
                continue;
            }
            result.push(server.port);
        }
        return result;
    }
    getServers(type, port) {
        let result = [];
        for (let n = 0; n < this.servers.length; n++) {
            const server = this.servers[n];
            if (server.type != type) {
                continue;
            }
            if (port) {
                if (server.port != port) {
                    continue;
                }
            }
            result.push(server);
        }
        return result;
    }
    onMessage(map, value) {
        if (!value.qid) {
            return;
        }
        if (!value.cmd) {
            return;
        }
        const buffer = this.requestBuffer[value.qid];
        if (!buffer) {
            return;
        }
        if (value.cmd == "end") {
            const h = Object.keys(value.data.headers);
            for (let n2 = 0; n2 < h.length; n2++) {
                const hName = h[n2];
                const hValue = value.data.headers[hName];
                buffer.res.setHeader(hName, hValue);
            }
            if (value.data.statusCode) {
                buffer.res.statusCode = value.data.statusCode;
            }
            if (value.data.statusMessage) {
                buffer.res.statusMessage = value.data.statusMessage;
            }
            buffer.res.write(value.data.body);
            buffer.res.end();
            delete this.requestBuffer[value.qid];
        }
        else if (value.cmd == "settimeout") {
            buffer.res.setTimeout(value.data);
        }
    }
    serverListen(req, res) {
        const map = this.getMap();
        if (map.mode == LoadBalancerMode.Proxy) {
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
        req.on("end", () => {
            this.send(map, {
                qid: qid,
                cmd: "end",
                data: sendData,
            });
        });
        req.on("data", (value) => {
            this.send(map, {
                qid: qid,
                cmd: "data",
                data: sendData,
                option: value,
            });
        });
        req.on("close", () => {
            this.send(map, {
                qid: qid,
                cmd: "close",
                data: sendData,
            });
        });
        req.on("error", (error) => {
            this.send(map, {
                qid: qid,
                cmd: "error",
                data: sendData,
                option: error,
            });
        });
        req.on("pause", () => {
            this.send(map, {
                qid: qid,
                cmd: "pause",
                data: sendData,
            });
        });
        req.on("resume", () => {
            this.send(map, {
                qid: qid,
                cmd: "resume",
                data: sendData,
            });
        });
    }
    getMap(type) {
        if (!type) {
            type = this.options.type;
        }
        if (type == LoadBalancerType.RoundRobin) {
            // Round Robin Balancing....
            if (this.rrIndex >= this.maps.length) {
                this.rrIndex = 0;
            }
            this.rrIndex++;
            return this.maps[this.rrIndex - 1];
        }
        else if (type == LoadBalancerType.RandomRobin) {
            const index = parseInt((Math.random() * 1000).toString()) % this.maps.length;
            return this.maps[index];
        }
        else if (type == LoadBalancerType.Manual) {
            // Manual Balancing....
            if (!this.options.manualHandle) {
                return this.getMap(LoadBalancerType.RoundRobin);
            }
            const index = this.options.manualHandle(this.maps.length);
            return this.maps[index];
        }
    }
    send(map, sendMessage) {
        if (map.mode == LoadBalancerMode.WorkerThreads) {
            map.worker.postMessage(sendMessage);
        }
        else if (map.mode == LoadBalancerMode.ChildProcess) {
            map.ChildProcess.send(sendMessage);
        }
    }
    on(map, event, callback) {
        if (map.mode == LoadBalancerMode.WorkerThreads) {
            map.worker.on(event, callback);
        }
        else if (map.mode == LoadBalancerMode.ChildProcess) {
            map.ChildProcess.on(event, callback);
        }
    }
}
exports.LoadBalancer = LoadBalancer;
class HttpRequest {
    constructor(qid, data) {
        this.onEventHandle = {};
        this.qid = qid;
        this.url = data.url;
        this.method = data.method;
        this.headers = data.headers;
        this.socket = {
            remoteAddress: data.remoteAddress,
            remotePort: data.remotePort,
            remoteFamily: data.remoteFamily,
        };
    }
    on(event, callback) {
        this.onEventHandle[event] = callback;
    }
}
exports.HttpRequest = HttpRequest;
class HttpResponse {
    constructor(qid, req, pp) {
        this.headers = {};
        this.text = "";
        this.writeEnd = false;
        this.qid = qid;
        if (pp) {
            this.pp = pp;
        }
    }
    write(text) {
        this.text += text;
        return this;
    }
    setHeader(name, value) {
        this.headers[name] = value;
        return this;
    }
    getHeader(name) {
        return this.headers[name];
    }
    end() {
        if (this.writeEnd) {
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
        if (this.pp) {
            this.pp.postMessage(send);
        }
        else {
            process.send(send);
        }
    }
}
exports.HttpResponse = HttpResponse;
class LoadBalancerThread {
    //    private requestBuffer = {};
    constructor(workerFlg) {
        this.workerFlg = false;
        this.workerFlg = workerFlg;
        if (this.workerFlg) {
            worker_threads_1.parentPort.on("message", (value) => {
                this.onMessage(value);
            });
        }
        else {
            process.on("message", (value) => {
                this.onMessage(value);
            });
        }
    }
    onMessage(value) {
        if (!value.cmd) {
            return;
        }
        if (value.cmd == "listen-start") {
            this.threadNo = value.data.threadNo;
            if (this.workerFlg) {
                this.mode = LoadBalancerMode.WorkerThreads;
            }
            else {
                this.mode = LoadBalancerMode.ChildProcess;
            }
            const listenerClass = require(value.data.workPath).default;
            this.Listener = new listenerClass();
            this.Listener.mode = this.mode;
            this.Listener.threadNo = this.threadNo;
            if (value.data.option)
                this.Listener.option = value.data.option;
            if (this.Listener.begin) {
                this.Listener.begin();
            }
            return;
        }
        if (!value.qid) {
            return;
        }
        if (value.cmd == "begin") {
            let req, res;
            if (this.workerFlg) {
                req = new HttpRequest(value.qid, value.data);
                res = new HttpResponse(value.qid, req, worker_threads_1.parentPort);
            }
            else {
                req = new HttpRequest(value.qid, value.data);
                res = new HttpResponse(value.qid, req);
            }
            this.Listener.qids[value.qid] = { req, res };
            if (this.Listener.listen) {
                this.Listener.listen(req, res);
            }
            return;
        }
        if (!this.Listener.qids[value.qid]) {
            return;
        }
        const buffer = this.Listener.qids[value.qid];
        if (value.cmd == "data") {
            if (buffer.req.onEventHandle.data) {
                buffer.req.onEventHandle.data(value.option);
            }
        }
        else if (value.cmd == "end") {
            if (buffer.req.onEventHandle.end) {
                buffer.req.onEventHandle.end();
            }
        }
        else if (value.cmd == "close") {
            if (buffer.req.onEventHandle.close) {
                buffer.req.onEventHandle.close();
            }
            delete this.Listener.qids[value.qid];
        }
        else if (value.cmd == "error") {
            if (buffer.req.onEventHandle.error) {
                buffer.req.onEventHandle.error(value.option);
            }
            delete this.Listener.qids[value.qid];
        }
        else if (value.cmd == "pause") {
            if (buffer.req.onEventHandle.pause) {
                buffer.req.onEventHandle.pause(value.option);
            }
        }
        else if (value.cmd == "resume") {
            if (buffer.req.onEventHandle.resume) {
                buffer.req.onEventHandle.resume(value.option);
            }
        }
    }
}
exports.LoadBalancerThread = LoadBalancerThread;
/**
 * ***LoadBalancerListner*** : Server Listen class.
 * Export the inherited class of this class in the worker file when listening.
 */
class LoadBalancerListner {
    constructor() {
        this.qids = {};
    }
}
exports.LoadBalancerListner = LoadBalancerListner;
