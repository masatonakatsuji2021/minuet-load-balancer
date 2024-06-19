"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const __1 = require("../");
const http = require("http");
const h = http.createServer((req, res) => {
    res.write("8281 server!");
    res.end();
});
h.listen(8281);
const h2 = http.createServer((req, res) => {
    res.write("8282 server!");
    res.end();
});
h2.listen(8282);
// LoadBalancing 
new __1.LoadBalancer({
    type: __1.LoadBalancerType.RoundRobin,
    maps: [
        { mode: __1.LoadBalancerMode.WorkerThreads, clone: 6 },
        { mode: __1.LoadBalancerMode.ChildProcess, clone: 2 },
        { mode: __1.LoadBalancerMode.Proxy, proxy: "http://localhost:8281", clone: 2 },
        { mode: __1.LoadBalancerMode.Proxy, proxy: "http://localhost:8282", clone: 2 },
    ],
    servers: [
        { type: __1.LoadBalancerServerType.http, port: 1234 },
        { type: __1.LoadBalancerServerType.http, port: 5678 },
    ],
    workPath: __dirname + "/worker",
    option: {
        data: "aaaaaaaaaaaaaaaaaa....OK",
    }
});
console.log("Listen http://localhost:1234");
console.log("Listen http://localhost:5678");
