"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const __1 = require("../");
class Listener extends __1.LoadBalancerListner {
    constructor() {
        super(...arguments);
        this.post = "";
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
    request() {
        const req = this.req;
        const res = this.res;
        req.on("end", () => {
            res.setHeader("name", "minuet-server.19.0.0");
            res.statusMessage = "A, R, E!!";
            res.write("OK.....ThreadNo=" + this.threadNo);
            res.end();
        });
    }
}
exports.default = Listener;
