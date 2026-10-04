export interface WorkerHealth {
  readonly status: "ok";
  readonly service: "first-ai-worker";
}

export function getWorkerHealth(): WorkerHealth {
  return {
    status: "ok",
    service: "first-ai-worker",
  };
}
