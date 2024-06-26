"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const minuet_load_balancer_1 = require("minuet-load-balancer");
// LoadBalancing 
new minuet_load_balancer_1.LoadBalancer({
    type: minuet_load_balancer_1.LoadBalancerType.RoundRobin,
    maps: [
        { mode: minuet_load_balancer_1.LoadBalancerMode.WorkerThreads, clone: 6 },
    ],
    servers: [
        { type: minuet_load_balancer_1.LoadBalancerServerType.webSocket, port: 6222 },
    ],
    workPath: __dirname + "/worker"
});
console.log("Listen http://localhost:6222");
