import { IncomingMessage, ServerResponse } from "http";
import { LoadBalancerListner } from "../";

export default class Listener extends LoadBalancerListner {

    private post = "";

    public request(): void {
        const req = this.req;
        const res = this.res;

        req.on("end", ()=>{
            res.setHeader("name", "minuet-server.19.0.0");
            res.statusMessage = "A, R, E!!";
            res.write("OK.....ThreadNo=" + this.threadNo);
            res.end();
        });
    }
/*
    public onData(data: any) {
        this.post += data.toString();
    }
    
    public onEnd(req: IncomingMessage, res : ServerResponse, threadNo : number){

        if(this.post){
            console.log(this.post.toString());
        }


    }
    */
}