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
exports.LoadBalancerListner = exports.LoadBalanceThread = exports.HttpResponse = exports.HttpRequest = exports.LoadBalancer = exports.LoadBalanceconnectMode = exports.LoadBalanceSelectType = void 0;
const worker_threads_1 = require("worker_threads");
const child_process_1 = require("child_process");
const http = require("http");
const https = require("https");
const os = require("os");
const httpProxy = require("http-proxy");
/**
 * ### LoadBalanceSelectType
 * Enumerate the load balancing methods.
 */
var LoadBalanceSelectType;
(function (LoadBalanceSelectType) {
    /**
     * Round robin connection
     */
    LoadBalanceSelectType["RoundRobin"] = "RoundRobin";
    /**
     * Random Connection
     */
    LoadBalanceSelectType["RandomRobin"] = "RandomRobin";
    /**
     * Cases where the connection destination is specified arbitrarily.
     * If you select this, you must specify **manualHandle.**
     */
    LoadBalanceSelectType["Manual"] = "Manual";
})(LoadBalanceSelectType || (exports.LoadBalanceSelectType = LoadBalanceSelectType = {}));
/**
 * ### LoadBalanceconnectMode
 * Specify the connection method for each map.
 */
var LoadBalanceconnectMode;
(function (LoadBalanceconnectMode) {
    /**
     * Using WorkerThreads.
     */
    LoadBalanceconnectMode["WorkerThreads"] = "WorkerThreads";
    /**
     * Using ChildProcess.
     */
    LoadBalanceconnectMode["ChildProcess"] = "ChildProcess";
    /**
     * Connect to another domain via a proxy.
     */
    LoadBalanceconnectMode["Proxy"] = "Proxy";
})(LoadBalanceconnectMode || (exports.LoadBalanceconnectMode = LoadBalanceconnectMode = {}));
class LoadBalanceMapT {
    constructor(options) {
        this.mode = options.mode;
        this.proxy = options.proxy;
    }
}
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
                let mapt = new LoadBalanceMapT(map);
                mapt.threadNo = threadNo;
                threadNo++;
                this.maps.push(mapt);
            }
        }
        for (let n = 0; n < this.maps.length; n++) {
            const map = this.maps[n];
            if (map.mode == LoadBalanceconnectMode.WorkerThreads ||
                map.mode == LoadBalanceconnectMode.ChildProcess) {
                const sendData = {
                    cmd: "listen-start",
                    data: {
                        threadNo: map.threadNo,
                        workPath: this.options.workPath,
                    },
                };
                if (map.mode == LoadBalanceconnectMode.WorkerThreads) {
                    map.worker = new worker_threads_1.Worker(__dirname + "/src/worker");
                }
                else if (map.mode == LoadBalanceconnectMode.ChildProcess) {
                    map.ChildProcess = (0, child_process_1.fork)(__dirname + "/src/child_process");
                }
                this.send(map, sendData);
                this.on(map, "message", (value) => {
                    this.onMessage(map, value);
                });
            }
        }
        if (options.ports) {
            for (let n = 0; n < options.ports.length; n++) {
                const port = options.ports[n];
                const h = http.createServer((req, res) => {
                    this.serverListen(req, res);
                });
                h.listen(port);
            }
        }
        if (options.httpsPorts) {
            for (let n = 0; n < options.httpsPorts.length; n++) {
                const port = options.httpsPorts[n];
                const h = https.createServer((req, res) => {
                    this.serverListen(req, res);
                });
                h.listen(port);
            }
        }
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
        /*
        else if(value.cmd == "on"){
            if (!value.event){ return; }
            buffer.req.on(value.event, (data)=>{
                this.send(map, {
                    qid: value.qid,
                    cmd: "on-receive",
                    event: value.event,
                    data: data,
                });
            });
        }
        */
        else if (value.cmd == "settimeout") {
            buffer.res.setTimeout(value.data);
        }
    }
    serverListen(req, res) {
        const map = this.getMap();
        if (map.mode == LoadBalanceconnectMode.Proxy) {
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
        if (type == LoadBalanceSelectType.RoundRobin) {
            // Round Robin Balancing....
            if (this.rrIndex >= this.maps.length) {
                this.rrIndex = 0;
            }
            this.rrIndex++;
            return this.maps[this.rrIndex - 1];
        }
        else if (type == LoadBalanceSelectType.RandomRobin) {
            const index = parseInt((Math.random() * 1000).toString()) % this.maps.length;
            return this.maps[index];
        }
        else if (type == LoadBalanceSelectType.Manual) {
            // Manual Balancing....
            if (!this.options.manualHandle) {
                return this.getMap(LoadBalanceSelectType.RoundRobin);
            }
            const index = this.options.manualHandle(this.maps.length);
            return this.maps[index];
        }
    }
    send(map, sendMessage) {
        if (map.mode == LoadBalanceconnectMode.WorkerThreads) {
            map.worker.postMessage(sendMessage);
        }
        else if (map.mode == LoadBalanceconnectMode.ChildProcess) {
            map.ChildProcess.send(sendMessage);
        }
    }
    on(map, event, callback) {
        if (map.mode == LoadBalanceconnectMode.WorkerThreads) {
            map.worker.on(event, callback);
        }
        else if (map.mode == LoadBalanceconnectMode.ChildProcess) {
            map.ChildProcess.on(event, callback);
        }
    }
}
exports.LoadBalancer = LoadBalancer;
class HttpRequest {
    constructor(qid, data, pp) {
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
        if (pp) {
            this.pp = pp;
        }
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
class LoadBalanceThread {
    constructor(workerFlg) {
        this.workerFlg = false;
        this.requestBuffer = {};
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
            this.Listener = require(value.data.workPath).default;
            return;
        }
        if (!value.qid) {
            return;
        }
        if (value.cmd == "begin") {
            let req, res;
            if (this.workerFlg) {
                req = new HttpRequest(value.qid, value.data, worker_threads_1.parentPort);
                res = new HttpResponse(value.qid, req, worker_threads_1.parentPort);
            }
            else {
                req = new HttpRequest(value.qid, value.data);
                res = new HttpResponse(value.qid, req);
            }
            let listener = new this.Listener();
            listener.threadNo = this.threadNo;
            listener.req = req;
            listener.res = res;
            this.requestBuffer[value.qid] = listener;
            return;
        }
        if (!this.requestBuffer[value.qid]) {
            return;
        }
        const listener = this.requestBuffer[value.qid];
        if (listener.request) {
            listener.request();
        }
        let cmd = value.cmd;
        if (cmd == "data") {
            if (listener.onData) {
                listener.onData(value.option);
            }
            if (listener.req.onEventHandle.data) {
                listener.req.onEventHandle.data(value.option);
            }
        }
        else if (cmd == "end") {
            if (listener.onEnd) {
                listener.onEnd();
            }
            if (listener.req.onEventHandle.end) {
                listener.req.onEventHandle.end();
            }
        }
        else if (cmd == "close") {
            if (listener.onClose) {
                listener.onClose();
            }
            if (listener.req.onEventHandle.close) {
                listener.req.onEventHandle.close();
            }
            delete this.requestBuffer[value.qid];
        }
        else if (cmd == "error") {
            if (listener.onError) {
                listener.onError(value.option);
            }
            if (listener.req.onEventHandle.error) {
                listener.req.onEventHandle.error(value.option);
            }
            delete this.requestBuffer[value.qid];
        }
        else if (cmd == "pause") {
            if (listener.onPause) {
                listener.onPause();
            }
            if (listener.req.onEventHandle.pause) {
                listener.req.onEventHandle.pause(value.option);
            }
        }
        else if (cmd == "resume") {
            if (listener.onResume) {
                listener.onResume();
            }
            if (listener.req.onEventHandle.resume) {
                listener.req.onEventHandle.resume(value.option);
            }
        }
    }
}
exports.LoadBalanceThread = LoadBalanceThread;
class LoadBalancerListner {
}
exports.LoadBalancerListner = LoadBalancerListner;
