"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const minuet_load_balancer_1 = require("minuet-load-balancer");
class Listener extends minuet_load_balancer_1.LoadBalancerListner {
    listen(req, res) {
        req.on("end", () => {
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
exports.default = Listener;
