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
    type: __1.LoadBalanceSelectType.RoundRobin,
    maps: [
        { mode: __1.LoadBalanceconnectMode.WorkerThreads, clone: 6 }, // 0
        { mode: __1.LoadBalanceconnectMode.Proxy, proxy: "http://localhost:8281", clone: 2 }, // 6
        { mode: __1.LoadBalanceconnectMode.Proxy, proxy: "http://localhost:8282", clone: 2 }, // 7
    ],
    workPath: __dirname + "/worker",
    ports: [1234],
});
