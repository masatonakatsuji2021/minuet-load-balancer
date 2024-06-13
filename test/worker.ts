import { LoadBalancerListner } from "../";

export default class Listener extends LoadBalancerListner {

    public request(): void {
        const req = this.req;
        const res = this.res;

        req.on("end", ()=>{
            res.statusMessage = "A, R, E!!";
            res.setHeader("name", "minuet-server.19.0.0");
            res.write("mode = " + this.mode);
            res.write("\nThreadNo = " + this.threadNo);
            res.write("\nprocess PID = " + process.pid);            
            res.write("\n......OK");
            res.end();
        });
    }
}