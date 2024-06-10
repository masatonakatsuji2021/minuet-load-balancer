import { LoadBalanceThread } from "../";
process.title = "minuet-server-workprocess";
new LoadBalanceThread(false);