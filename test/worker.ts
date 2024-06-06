import { IncomingMessage, ServerResponse } from "http";
import { LoadBalancerListner } from "../";

export default class Listener implements LoadBalancerListner {

    private post = "";

    public onData(data: any) {
        this.post += data.toString();    
    }
    
    public onEnd(req: IncomingMessage, res : ServerResponse, threadNo : number){

        if(this.post){
            console.log(this.post.toString());
        }

        res.setHeader("name", "minuet-server.19.0.0");
        res.statusMessage = "A, R, E!!";
        res.write("OK.....ThreadNo=" + threadNo);
        res.end();
    }
}