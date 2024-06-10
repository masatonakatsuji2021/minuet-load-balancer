import { LoadBalanceconnectMode, LoadBalancer, LoadBalanceSelectType } from "../";
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
    type: LoadBalanceSelectType.RoundRobin,
    maps:[
        { mode: LoadBalanceconnectMode.WorkerThreads, clone: 6 },        // 0
        { mode: LoadBalanceconnectMode.Proxy, proxy: "http://localhost:8281", clone: 2  }, // 6
        { mode: LoadBalanceconnectMode.Proxy, proxy: "http://localhost:8282", clone: 2 }, // 7
    ],
    workPath : __dirname + "/worker",
    ports: [ 1234 ],
});


