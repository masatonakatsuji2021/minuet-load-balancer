import { LoadBalancerMode, LoadBalancer, LoadBalancerType, LoadBalancerServerType } from "minuet-load-balancer";


// LoadBalancing 
new LoadBalancer({
    type: LoadBalancerType.RoundRobin,
    maps:[
        { mode: LoadBalancerMode.WorkerThreads, clone: 6 },
    ],
    servers: [
        { type:LoadBalancerServerType.webSocket, port: 6222 },
    ],
    workPath : __dirname + "/worker"
});

console.log("Listen http://localhost:6222");
