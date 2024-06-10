"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const __1 = require("../");
process.title = "minuet-server-workprocess";
new __1.LoadBalanceThread(false);
