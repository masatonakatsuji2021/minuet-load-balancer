import { LoadBalancerMode, LoadBalancer, LoadBalancerType, LoadBalancerServerType } from "minuet-load-balancer";
import * as http from "http";

const h = http.createServer((req, res)=>{
    res.write("8281 server!");
    res.end();
});
h.listen(8281);

const h2 = http.createServer((req, res)=>{
    res.write("8282 server!");
    res.end();
});
h2.listen(8282);

// LoadBalancing 
new LoadBalancer({
    type: LoadBalancerType.RoundRobin,
    maps:[
        { mode: LoadBalancerMode.WorkerThreads, clone: 6 },
        { mode: LoadBalancerMode.ChildProcess,  clone: 2 },
        { mode: LoadBalancerMode.Proxy, proxy: "http://localhost:8281", clone: 2  },
        { mode: LoadBalancerMode.Proxy, proxy: "http://localhost:8282", clone: 2 },
    ],
    servers: [
        { type:LoadBalancerServerType.http, port: 1234 },
        { type:LoadBalancerServerType.http, port: 5678 },
    ],
    workPath : __dirname + "/worker",
    option: {
        data:"aaaaaaaaaaaaaaaaaa....OK",
    }
});

console.log("Listen http://localhost:1234");
console.log("Listen http://localhost:5678");
