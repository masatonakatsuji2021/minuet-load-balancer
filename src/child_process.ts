import { LoadBalancerThread } from "../";
process.title = "minuet-server-workprocess";
new LoadBalancerThread(false);