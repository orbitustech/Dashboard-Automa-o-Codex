import { publishPendingTasks } from "../lib/platform-publisher.mjs";

const result = await publishPendingTasks();

if (result.warning) {
  console.warn(result.warning);
}

console.log(`Encontradas ${result.tasks} tarefas de distribuicao para APIs oficiais.`);
console.log(JSON.stringify(result.results, null, 2));
