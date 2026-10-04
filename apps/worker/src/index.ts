import { getWorkerHealth } from "./health.js";

const health = getWorkerHealth();

console.log(`${health.service} started`);
