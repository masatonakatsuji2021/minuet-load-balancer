import { LoadBalancerListner } from "minuet-load-balancer";

export default class Listener extends LoadBalancerListner {

    public wsListen(webSocket: any): void {
    
        let ind = 0;
        const ss = setInterval(()=>{
            ind++;
            webSocket.write("hallo websocket....!!");
        },1000);


        webSocket.on("message", (message) => {
            console.log(message);
        });
    }

}