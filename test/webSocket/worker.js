"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const minuet_load_balancer_1 = require("minuet-load-balancer");
class Listener extends minuet_load_balancer_1.LoadBalancerListner {
    wsListen(webSocket) {
        let ind = 0;
        const ss = setInterval(() => {
            ind++;
            webSocket.write("hallo websocket....!!");
        }, 1000);
        webSocket.on("message", (message) => {
            console.log(message);
        });
    }
}
exports.default = Listener;
